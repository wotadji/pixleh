import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderContractPdf } from "@/lib/pdf";
import { getStorage } from "@/lib/storage";
import { sendStudioContractSignedEmail } from "@/lib/notifications";

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
    include: { studio: { include: { settings: true } } },
  });
  if (!contract) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 });
  if (contract.status === "SIGNED") {
    return NextResponse.json({ error: "Ce contrat a déjà été signé" }, { status: 409 });
  }

  const signedAt = new Date();
  const clientIp = req.headers.get("x-forwarded-for") || "inconnu";

  // studioSignatureDataUrl, place et template n'existent pas encore dans le Prisma Client
  // généré du sandbox (voir commentaires sur ces champs dans schema.prisma) — lus à part via
  // $queryRaw, même workaround que Gallery.publishedAt.
  const [row] = await prisma.$queryRaw<
    { studioSignatureDataUrl: string | null; place: string | null; template: string | null }[]
  >`
    SELECT "studioSignatureDataUrl", "place", "template" FROM "Contract" WHERE id = ${contract.id}
  `;

  const pdfBuffer = await renderContractPdf({
    studioName: contract.studio.name,
    title: contract.title,
    bodyHtml: contract.bodyHtml,
    signedByName,
    signedAt,
    signatureDataUrl,
    studioSignatureDataUrl: row?.studioSignatureDataUrl || null,
    studioLogoUrl: contract.studio.logoUrl || null,
    brandColor: contract.studio.brandColor || null,
    studioAddress: contract.studio.settings?.address || null,
    studioContactEmail: contract.studio.settings?.contactEmail || null,
    studioContactPhone: contract.studio.settings?.contactPhone || null,
    place: row?.place || null,
    createdAt: contract.createdAt,
    template: row?.template || null,
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

  // Notification interne au studio — fire-and-forget (comme sendStudioOrderPaidEmail/
  // sendStudioInvoicePaidEmail) : un échec d'envoi ne doit pas faire échouer la signature,
  // qui est déjà actée en base et dans le PDF à ce stade. `sendMail` ne rejette jamais (voir
  // mailer.ts, il renvoie { ok:false, error } en cas d'échec) : on vérifie donc explicitement
  // le résultat en plus du .catch(), sinon un échec SMTP silencieux ne laisse aucune trace.
  sendStudioContractSignedEmail({
    studioId: contract.studioId,
    contractId: contract.id,
    contractTitle: contract.title,
    signedByName,
  })
    .then((result) => {
      if (!result.ok) {
        console.error("Échec de l'email de notification studio (contrat signé) :", result.error);
      }
    })
    .catch((e) => console.error("Échec de l'email de notification studio (contrat signé) :", e));

  return NextResponse.json({ contract: updated });
}
