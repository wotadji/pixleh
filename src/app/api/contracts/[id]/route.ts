import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { contractSchema } from "@/lib/validators";

/**
 * Consultation d'un contrat côté studio (pré-remplissage du formulaire d'édition, voir
 * contracts/[id]/edit) — authentifiée et limitée aux contrats du studio connecté. La page
 * publique de signature (/c/[id]) ne passe pas par cette route : elle lit directement Prisma
 * côté serveur (Server Component), sans avoir besoin d'exposer un endpoint non authentifié.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const contract = await prisma.contract.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { client: true },
    });
    if (!contract) throw new AccessError("Contrat introuvable", 404);

    // studioSignatureDataUrl et place n'existent pas encore dans le Prisma Client généré du
    // sandbox (voir commentaires sur ces champs dans schema.prisma) — lus à part via
    // $queryRaw, même workaround que Gallery.publishedAt.
    const [row] = await prisma.$queryRaw<{ studioSignatureDataUrl: string | null; place: string | null }[]>`
      SELECT "studioSignatureDataUrl", "place" FROM "Contract" WHERE id = ${contract.id}
    `;

    return NextResponse.json({
      contract: { ...contract, studioSignatureDataUrl: row?.studioSignatureDataUrl || null, place: row?.place || null },
    });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Modification d'un contrat après création (demande d'Adriel, 30/07/2026) — bloquée une fois
 * SIGNED : le contrat signé et son PDF font foi tels quels, les modifier après coup viderait
 * la signature de son sens juridique. Tant qu'il est DRAFT/SENT, tout est modifiable (titre,
 * client, contenu, signature du studio).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const existing = await prisma.contract.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!existing) throw new AccessError("Contrat introuvable", 404);
    if (existing.status === "SIGNED") {
      throw new AccessError("Ce contrat a déjà été signé, il ne peut plus être modifié.", 409);
    }

    const body = await req.json();
    const parsed = contractSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const contract = await prisma.contract.update({
      where: { id: existing.id },
      data: parsed.data,
    });

    // studioSignatureDataUrl n'existe pas encore dans le Prisma Client généré du sandbox
    // (voir commentaire sur ce champ dans schema.prisma) — écrit à part via $executeRaw,
    // même workaround que Gallery.publishedAt. `!== undefined` (et pas juste "truthy") pour
    // permettre explicitement de retirer une signature existante (valeur null envoyée).
    if (body.studioSignatureDataUrl !== undefined) {
      await prisma.$executeRaw`UPDATE "Contract" SET "studioSignatureDataUrl" = ${body.studioSignatureDataUrl} WHERE id = ${contract.id}`;
    }
    if (body.place !== undefined) {
      await prisma.$executeRaw`UPDATE "Contract" SET "place" = ${body.place} WHERE id = ${contract.id}`;
    }

    return NextResponse.json({ contract });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
