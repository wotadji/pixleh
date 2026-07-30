import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { renderContractPdf } from "@/lib/pdf";
import { isContractTemplateId } from "@/lib/contractTemplates";

export const runtime = "nodejs";

/**
 * Aperçu PDF d'un contrat en cours de rédaction (bouton "Aperçu du PDF" dans la sidebar du
 * formulaire, voir ContractForm.tsx) — ne persiste rien : génère le PDF à la volée à partir
 * des valeurs actuelles du formulaire (titre, corps, lieu, template, signature du studio),
 * avant même l'enregistrement du contrat. Demandé par Adriel, 31/07/2026 : "un bouton pour
 * l'aperçu de son contrat". La date de rédaction affichée ("Fait à ..., le ...") utilise la
 * date du jour puisque le contrat n'est pas encore enregistré.
 */
export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();

    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { settings: true },
    });
    if (!studio) throw new AccessError("Studio introuvable", 404);

    const pdfBuffer = await renderContractPdf({
      studioName: studio.name,
      title: typeof body.title === "string" ? body.title : "",
      bodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : "",
      studioSignatureDataUrl: body.studioSignatureDataUrl || null,
      studioLogoUrl: studio.logoUrl || null,
      brandColor: studio.brandColor || null,
      studioAddress: studio.settings?.address || null,
      studioContactEmail: studio.settings?.contactEmail || null,
      studioContactPhone: studio.settings?.contactPhone || null,
      place: typeof body.place === "string" ? body.place : null,
      createdAt: new Date(),
      template: isContractTemplateId(body.template) ? body.template : undefined,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="apercu-contrat.pdf"',
      },
    });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
