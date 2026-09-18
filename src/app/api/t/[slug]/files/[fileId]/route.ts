import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Téléchargement PUBLIC d'un fichier de Transfert rapide — AUCUNE session requise (le `slug`
 * de l'URL fait office de secret, voir le commentaire du modèle QuickTransfer). Refuse le
 * téléchargement si le transfert est gelé, même si l'appelant a gardé un lien direct vers ce
 * fichier précis.
 */
export async function GET(_req: Request, { params }: { params: { slug: string; fileId: string } }) {
  const rows = await prisma.$queryRaw<{ id: string; status: string; expiresAt: Date }[]>`
    SELECT id, status, "expiresAt" FROM "QuickTransfer" WHERE slug = ${params.slug}
  `;
  const transfer = rows[0];
  if (!transfer) return NextResponse.json({ error: "Transfert introuvable" }, { status: 404 });
  if (transfer.status === "FROZEN" || transfer.expiresAt < new Date()) {
    return NextResponse.json({ error: "Ce transfert n'est plus disponible." }, { status: 410 });
  }

  const files = await prisma.$queryRaw<{ filename: string; storageKey: string; mimeType: string | null }[]>`
    SELECT filename, "storageKey", "mimeType" FROM "QuickTransferFile"
    WHERE id = ${params.fileId} AND "transferId" = ${transfer.id}
  `;
  const file = files[0];
  if (!file) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  const buffer = await getStorage().get(file.storageKey);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
