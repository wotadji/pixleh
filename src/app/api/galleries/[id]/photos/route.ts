import { NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getQuotaStatus } from "@/lib/quotas";
import { processAndStoreUpload } from "@/lib/image";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

// Types MIME acceptés pour un original de photo — au-delà de ça (exécutables, HTML,
// archives...) le fichier est refusé. `file.type` est parfois vide selon le navigateur
// (notamment pour le HEIC) : on retombe alors sur l'extension du nom de fichier.
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"]);
// 100 Mo : large pour un JPEG/HEIC issu d'un boîtier grand public, suffisant pour un TIFF
// exporté en haute résolution, sans laisser un envoi illimité saturer le stockage.
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

function rejectReason(file: File): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const mimeOk = file.type ? ALLOWED_MIME_TYPES.has(file.type) : ALLOWED_EXTENSIONS.has(ext);
  if (!mimeOk) return "unsupportedType";
  if (file.size > MAX_FILE_SIZE_BYTES) return "tooLarge";
  return null;
}

/**
 * Upload de photos dans une galerie (multipart/form-data, champ "files").
 * Stocke l'original en HD, une miniature et un aperçu web — les deux TOUJOURS sans
 * filigrane : celui-ci est désormais appliqué à la volée au moment de servir l'image
 * (voir /api/files et les routes de téléchargement), selon la valeur live de
 * gallery.showWatermark. Voir src/lib/image.ts pour le détail.
 *
 * Validation d'entrée : chaque fichier est vérifié (type MIME dans ALLOWED_MIME_TYPES,
 * taille sous MAX_FILE_SIZE_BYTES) AVANT tout traitement — un fichier refusé n'est ni
 * haché, ni stocké, ni ajouté à la galerie ; son nom et la raison sont renvoyés dans
 * `rejected`.
 *
 * Détection de doublons : un hash SHA-256 du fichier original est calculé pour chaque
 * upload (voir Photo.contentHash) et comparé aux photos déjà présentes dans CETTE galerie
 * (le hash, pas le nom de fichier, pour détecter aussi les doublons renommés) ainsi qu'aux
 * autres fichiers du même envoi. Le panel studio interroge d'abord POST .../check-duplicates
 * pour proposer un choix AVANT de lancer l'envoi ; ce choix est transmis ici via le champ
 * `duplicateAction` du formulaire :
 * - "skip" (défaut) : le fichier en doublon est ignoré (ni stocké, ni ajouté), son nom est
 *   renvoyé dans `skipped`.
 * - "replace" : les photos existantes de la galerie ayant le même hash sont supprimées
 *   (fichiers stockés inclus) puis remplacées par le nouvel envoi.
 * - "keep" : le doublon est uploadé normalement, en plus de l'existant (les deux copies
 *   coexistent).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const formData = await req.formData();
    // On évite `instanceof File` : la classe globale `File` n'est pas fiable dans
    // l'environnement d'exécution des Route Handlers Next.js. Une entrée de
    // FormData est soit une chaîne, soit un fichier — exclure les chaînes suffit.
    const files = formData.getAll("files").filter((f) => typeof f !== "string") as File[];
    const collectionId = (formData.get("collectionId") as string | null) || null;
    const duplicateActionRaw = formData.get("duplicateAction") as string | null;
    const duplicateAction: "skip" | "replace" | "keep" =
      duplicateActionRaw === "replace" || duplicateActionRaw === "keep" ? duplicateActionRaw : "skip";

    if (files.length === 0) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    const lastPhoto = await prisma.photo.findFirst({
      where: { galleryId: gallery.id },
      orderBy: { position: "desc" },
    });
    let position = (lastPhoto?.position ?? -1) + 1;

    // [S2] Tâche #127 — quota de stockage du plan (voir src/lib/quotas.ts, s'applique à tous
    // les forfaits, pas seulement au gratuit). Un seul calcul d'usage pour tout le lot (pas
    // une requête par fichier), puis un total roulant au fil du lot (bytesAddedSoFar) : les
    // premiers fichiers d'un envoi peuvent passer et les suivants être refusés dès que la
    // limite est atteinte, plutôt que de rejeter tout le lot d'un coup.
    const quota = await getQuotaStatus(gallery.studioId);
    const storageLimitBytes = quota.storageLimitGB !== null ? quota.storageLimitGB * 1024 ** 3 : null;
    let bytesAddedSoFar = 0;

    // Hashs déjà présents dans la galerie — vérifiés une fois au début plutôt qu'une
    // requête par fichier, puis complétés au fil de l'envoi (voir seenHashes) pour couvrir
    // aussi les doublons internes à ce même lot.
    const existingRows = await prisma.photo.findMany({
      where: { galleryId: gallery.id, contentHash: { not: null } },
      select: { contentHash: true },
    });
    const seenHashes = new Set(existingRows.map((r) => r.contentHash as string));
    // Hashs déjà "traités" côté remplacement pour ce lot, pour ne supprimer les anciens
    // doublons qu'une seule fois même si plusieurs fichiers du lot partagent le même hash.
    const replacedHashes = new Set<string>();
    let coverReplacedBy: string | null = null;

    const created = [];
    const skipped: string[] = [];
    const rejected: { filename: string; reason: string }[] = [];
    for (const file of files) {
      const reason = rejectReason(file);
      if (reason) {
        rejected.push({ filename: file.name, reason });
        continue;
      }

      // file.size (taille de l'original avant traitement) sert d'approximation pour ce
      // pré-check — la miniature/l'aperçu ajoutent un peu plus, mais rejeter sur cette base
      // avant même de traiter le fichier évite un travail inutile pour un envoi qui serait
      // refusé de toute façon.
      if (storageLimitBytes !== null && quota.storageUsedBytes + bytesAddedSoFar + file.size > storageLimitBytes) {
        rejected.push({ filename: file.name, reason: "quotaExceeded" });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = createHash("sha256").update(buffer).digest("hex");
      const isDuplicate = seenHashes.has(hash);

      if (isDuplicate && duplicateAction === "skip") {
        skipped.push(file.name);
        continue;
      }

      if (isDuplicate && duplicateAction === "replace" && !replacedHashes.has(hash)) {
        replacedHashes.add(hash);
        const olds = await prisma.photo.findMany({ where: { galleryId: gallery.id, contentHash: hash } });
        if (olds.length > 0) {
          const storage = getStorage();
          await Promise.allSettled(
            olds.flatMap((p) => [
              storage.delete(p.storageKey),
              p.thumbKey ? storage.delete(p.thumbKey) : Promise.resolve(),
              p.previewKey ? storage.delete(p.previewKey) : Promise.resolve(),
            ])
          );
          await prisma.photo.deleteMany({ where: { id: { in: olds.map((o) => o.id) } } });
          if (gallery.coverPhotoId && olds.some((o) => o.id === gallery.coverPhotoId)) {
            // La photo remplacée sera recréée juste après avec un nouvel id — on la
            // remettra en couverture une fois créée (voir coverReplacedBy plus bas).
            coverReplacedBy = hash;
          }
        }
      }

      seenHashes.add(hash);

      const photoId = randomUUID();
      const processed = await processAndStoreUpload({
        buffer,
        studioId: gallery.studioId,
        galleryId: gallery.id,
        photoId,
        originalFilename: file.name,
      });

      const photo = await prisma.photo.create({
        data: {
          id: photoId,
          galleryId: gallery.id,
          collectionId,
          filename: file.name,
          storageKey: processed.storageKey,
          thumbKey: processed.thumbKey,
          previewKey: processed.previewKey,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.sizeBytes,
          contentHash: hash,
          position: position++,
        },
      });
      created.push(photo);
      bytesAddedSoFar += processed.sizeBytes || 0;

      if (coverReplacedBy === hash) {
        await prisma.gallery.update({ where: { id: gallery.id }, data: { coverPhotoId: photo.id } });
        coverReplacedBy = null;
      }
    }

    if (!gallery.coverPhotoId && created[0]) {
      await prisma.gallery.update({
        where: { id: gallery.id },
        data: { coverPhotoId: created[0].id },
      });
    }

    // Le nombre de photos et potentiellement la couverture affichés dans la liste
    // /dashboard/galleries viennent de changer.
    revalidatePath("/dashboard/galleries");

    return NextResponse.json({ photos: created, skipped, rejected }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
