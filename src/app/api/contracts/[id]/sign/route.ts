import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderContractPdf } from "@/lib/pdf";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Signature électronique d'un contrat par le client (page publique /c/[id]).
 * Génère un PDF final incluant l'image de signature et le stocke sur le storage.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { signedByName, signatureDataUrl } = await req.json();
  if (!signedByName || !signatureDataUrl) {
    return NextResponse.json({ error: "Nom et signature requis" }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { studio: true },
  });
  if (!contract) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 });
  if (contract.status === "SIGNED") {
    return NextResponse.json({ error: "Ce contrat a déjà été signé" }, { status: 409 });
  }

  const signedAt = new Date();
  const clientIp = req.headers.get("x-forwarded-for") || "inconnu";
  const bodyText = contract.bodyHtml.replace(/<[^>]+>/g, "");

  // studioSignatureDataUrl n'existe pas encore dans le Prisma Client généré du sandbox (voir
  // commentaire sur ce champ dans schema.prisma) — lu à part via $queryRaw, même workaround
  // que Gallery.publishedAt.
  const [studioSignatureRow] = await prisma.$queryRaw<{ studioSignatureDataUrl: string | null }[]>`
    SELECT "studioSignatureDataUrl" FROM "Contract" WHERE id = ${contract.id}
  `;

  const pdfBuffer = await renderContractPdf({
    studioName: contract.studio.name,
    title: contract.title,
    bodyText,
    signedByName,
    signedAt,
    signatureDataUrl,
    studioSignatureDataUrl: studioSignatureRow?.studioSignatureDataUrl || null,
  });

  const pdfKey = `studios/${contract.studioId}/contracts/${contract.id}.pdf`;
  await getStorage().put(pdfKey, pdfBuffer);

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      status: "SIGNED",
      signatureDataUrl,
      signedByName,
      signedAt,
      signedIp: Array.isArray(clientIp) ? clientIp[0] : clientIp,
      pdfKey,
    },
  });

  return NextResponse.json({ contract: updated });
}
