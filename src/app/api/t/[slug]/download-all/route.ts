import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Téléchargement PUBLIC de tous les fichiers d'un Transfert rapide en un ZIP — même schéma
 * d'accès (public, protégé uniquement par l'entropie du slug) que le téléchargement fichier
 * par fichier, voir /api/t/[slug]/files/[fileId]. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const rows = await prisma.$queryRaw<{ id: string; status: string; expiresAt: Date }[]>`
    SELECT id, status, "expiresAt" FROM "QuickTransfer" WHERE slug = ${params.slug}
  `;
  const transfer = rows[0];
  if (!transfer) return NextResponse.json({ error: "Transfert introuvable" }, { status: 404 });
  if (transfer.status === "FROZEN" || transfer.expiresAt < new Date()) {
    return NextResponse.json({ error: "Ce transfert n'est plus disponible." }, { status: 410 });
  }

  const files = await prisma.$queryRaw<{ filename: string; storageKey: string }[]>`
    SELECT filename, "storageKey" FROM "QuickTransferFile" WHERE "transferId" = ${transfer.id} ORDER BY "createdAt" ASC
  `;
  if (files.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 404 });

  const storage = getStorage();
  const archive = archiver("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  // Noms uniques dans le ZIP : deux fichiers uploadés avec le même nom original doivent
  // coexister sans s'écraser l'un l'autre.
  const usedNames = new Set<string>();
  (async () => {
    for (const f of files) {
      try {
        const buffer = await storage.get(f.storageKey);
        let name = f.filename;
        let i = 2;
        while (usedNames.has(name)) {
          const dot = f.filename.lastIndexOf(".");
          name = dot > 0 ? `${f.filename.slice(0, dot)} (${i})${f.filename.slice(dot)}` : `${f.filename} (${i})`;
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
      "Content-Disposition": `attachment; filename="transfert.zip"`,
    },
  });
}
