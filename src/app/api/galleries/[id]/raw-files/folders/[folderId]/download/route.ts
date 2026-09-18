import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Téléchargement d'un dossier de l'espace "Fichiers" en ZIP, en conservant l'arborescence
 * interne — 18/09/2026, demande d'Adriel : "la possibilité de telecharger les dossiers".
 * Réservé au studio (requireStudioSession), même logique de privacy que le téléchargement
 * fichier par fichier (voir .../raw-files/[fileId]/file).
 */
export async function GET(_req: Request, { params }: { params: { id: string; folderId: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const rootRows = await prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT "id", "name" FROM "GalleryRawFolder" WHERE "id" = ${params.folderId} AND "galleryId" = ${params.id}
    `;
    const root = rootRows[0];
    if (!root) throw new AccessError("Dossier introuvable", 404);

    // Arborescence récursive avec le chemin (relatif au dossier téléchargé) construit au fur
    // et à mesure de la descente — sert à recréer la structure de sous-dossiers dans le ZIP.
    const tree = await prisma.$queryRaw<{ id: string; path: string }[]>`
      WITH RECURSIVE descendants AS (
        SELECT "id", "name"::text AS "path" FROM "GalleryRawFolder" WHERE "id" = ${params.folderId}
        UNION ALL
        SELECT f."id", d."path" || '/' || f."name"
        FROM "GalleryRawFolder" f
        JOIN descendants d ON f."parentId" = d."id"
      )
      SELECT "id", "path" FROM descendants
    `;
    const pathByFolderId = new Map(tree.map((t) => [t.id, t.path]));
    const folderIds = tree.map((t) => t.id);

    const files = folderIds.length
      ? await prisma.$queryRaw<{ filename: string; storageKey: string; folderId: string }[]>`
          SELECT "filename", "storageKey", "folderId" FROM "GalleryRawFile"
          WHERE "folderId" IN (${Prisma.join(folderIds)})
        `
      : [];

    if (files.length === 0) {
      return NextResponse.json({ error: "Ce dossier ne contient aucun fichier." }, { status: 404 });
    }

    const storage = getStorage();
    const archive = archiver("zip", { zlib: { level: 6 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Noms uniques dans le ZIP : deux fichiers uploadés avec le même nom dans le même
    // dossier doivent coexister sans s'écraser l'un l'autre (même logique que Transfert
    // rapide, voir /api/t/[slug]/download-all).
    const usedNames = new Set<string>();
    (async () => {
      for (const f of files) {
        try {
          const buffer = await storage.get(f.storageKey);
          const dir = pathByFolderId.get(f.folderId) || root.name;
          let name = `${dir}/${f.filename}`;
          let i = 2;
          while (usedNames.has(name)) {
            const dot = f.filename.lastIndexOf(".");
            const uniqueFilename =
              dot > 0 ? `${f.filename.slice(0, dot)} (${i})${f.filename.slice(dot)}` : `${f.filename} (${i})`;
            name = `${dir}/${uniqueFilename}`;
            i++;
          }
          usedNames.add(name);
          archive.append(buffer, { name });
        } catch {
          // fichier manquant sur le storage : on l'ignore et on continue le zip
        }
      }
      await archive.finalize();
    })();

    return new NextResponse(Readable.toWeb(passthrough) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(root.name)}.zip"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
