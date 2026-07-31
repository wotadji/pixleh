import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getQuotaStatus } from "@/lib/quotas";
import { processAndStoreUpload } from "@/lib/image";
import { getStorage } from "@/lib/storage";
import { rejectPhotoReason } from "@/lib/photoUpload";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Remplace le FICHIER d'une photo déjà présente dans la galerie, en conservant le même
 * `Photo.id` — demandé par Adriel, 31/07/2026, à propos de l'onglet "Remarques du client" :
 * "je veux un bouton upload qui donne la possibilité de changer la photo (changer la photo
 * en fait cela veut dire que le studio ou photographe ou vidéaste a traité la photo et après
 * doit uploader la nouvelle photo)". Contrairement à un nouvel upload (POST
 * /api/galleries/[id]/photos, qui crée une NOUVELLE photo), on garde ici le même id pour
 * que tout ce qui pointe déjà dessus reste valide sans rien recréer : la remarque du client
 * (PhotoRemark.photoId), les favoris/sélections impression (Selection.photoId), l'historique
 * de téléchargement (DownloadEvent.photoId), une éventuelle position de couverture de galerie
 * (Gallery.coverPhotoId) et sa place dans le tri (Photo.position/collectionId).
 *
 * `remarkId` (optionnel, dans le formData) : si fourni, la remarque correspondante est
 * marquée traitée (resolved=true) dans la foulée — le remplacement de la photo EST l'action
 * de traitement demandée par le client, pas la peine de cliquer "Marquer comme traitée" en plus.
 */
export async function PUT(req: Request, { params }: { params: { id: string; photoId: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const photo = await prisma.photo.findFirst({
      where: { id: params.photoId, galleryId: gallery.id },
    });
    if (!photo) throw new AccessError("Photo introuvable", 404);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }
    const remarkId = (formData.get("remarkId") as string | null) || null;

    const reason = rejectPhotoReason(file);
    if (reason) {
      return NextResponse.json({ error: reason }, { status: 400 });
    }

    // Quota de stockage du plan (voir src/lib/quotas.ts) : on retire la taille de l'ancien
    // fichier de l'usage courant avant de vérifier, puisqu'il va être supprimé — sinon un
    // studio pile au maximum ne pourrait jamais remplacer une photo par une autre de taille
    // équivalente ou légèrement supérieure.
    const quota = await getQuotaStatus(gallery.studioId);
    const storageLimitBytes = quota.storageLimitGB !== null ? quota.storageLimitGB * 1024 ** 3 : null;
    const usageWithoutOldFile = quota.storageUsedBytes - (photo.sizeBytes ?? 0);
    if (storageLimitBytes !== null && usageWithoutOldFile + file.size > storageLimitBytes) {
      return NextResponse.json({ error: "quotaExceeded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = createHash("sha256").update(buffer).digest("hex");

    const processed = await processAndStoreUpload({
      buffer,
      studioId: gallery.studioId,
      galleryId: gallery.id,
      photoId: photo.id,
      originalFilename: file.name,
    });

    // Supprime les anciens fichiers stockés APRÈS que les nouveaux ont été écrits avec
    // succès : si processAndStoreUpload échoue, l'ancienne photo reste intacte plutôt que
    // perdue. `thumb.jpg`/`preview.jpg` gardent TOUJOURS le même chemin (buildPhotoKey fixe
    // leur extension à "jpg" quel que soit le format d'origine) — seul `storageKey` (l'original)
    // peut changer de chemin si l'extension change (ex: PNG → JPEG). Bug corrigé le 31/07/2026
    // (constaté par Adriel : miniature en 404 juste après un remplacement) : supprimer
    // aveuglément les 3 anciennes clés effaçait en réalité le thumb/preview flambant neufs,
    // qui avaient été écrits AU MÊME CHEMIN par storage.put juste au-dessus. On ne supprime
    // donc que les clés qui ont réellement changé de chemin.
    const storage = getStorage();
    const oldKeys = [photo.storageKey, photo.thumbKey, photo.previewKey];
    const newKeys = new Set([processed.storageKey, processed.thumbKey, processed.previewKey]);
    const staleKeys = oldKeys.filter((k): k is string => !!k && !newKeys.has(k));
    await Promise.allSettled(staleKeys.map((k) => storage.delete(k)));

    const updated = await prisma.photo.update({
      where: { id: photo.id },
      data: {
        filename: file.name,
        storageKey: processed.storageKey,
        thumbKey: processed.thumbKey,
        previewKey: processed.previewKey,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.sizeBytes,
        contentHash: hash,
        // updatedAt est réévalué automatiquement (@updatedAt) — c'est ce qui force le
        // rechargement des miniatures/aperçus côté navigateur (voir thumbUrl côté client),
        // exactement comme pour une régénération de filigrane.
      },
    });

    let updatedRemark = null;
    if (remarkId) {
      const remark = await prisma.photoRemark.findFirst({
        where: { id: remarkId, photoId: photo.id, galleryId: gallery.id },
      });
      if (remark) {
        updatedRemark = await prisma.photoRemark.update({
          where: { id: remark.id },
          data: { resolved: true },
        });
      }
    }

    revalidatePath("/dashboard/galleries");
    return NextResponse.json({ photo: updated, remark: updatedRemark });
  } catch (e) {
    return handleApiError(e);
  }
}
