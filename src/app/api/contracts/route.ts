import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { contractSchema } from "@/lib/validators";
import { sendContractSignEmail } from "@/lib/notifications";

export async function GET() {
  try {
    const session = await requireStudioSession();
    const contracts = await prisma.contract.findMany({
      where: { studioId: session.user.studioId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ contracts });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    const parsed = contractSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const contract = await prisma.contract.create({
      data: { studioId: session.user.studioId, status: "SENT", ...parsed.data },
    });
    // studioSignatureDataUrl n'existe pas encore dans le Prisma Client généré du sandbox
    // (voir commentaire sur ce champ dans schema.prisma) — écrit à part via $executeRaw,
    // même workaround que Gallery.publishedAt.
    if (body.studioSignatureDataUrl) {
      await prisma.$executeRaw`UPDATE "Contract" SET "studioSignatureDataUrl" = ${body.studioSignatureDataUrl} WHERE id = ${contract.id}`;
    }

    // Si le studio a choisi un client, on lui envoie directement le lien de signature par
    // email (demande d'Adriel : "le bouton créer et générer un lien envoie aussi le mail au
    // client") — pas d'échec bloquant si l'envoi rate (SMTP absent, etc.), le contrat est de
    // toute façon créé et le lien reste consultable/partageable manuellement ; on remonte
    // juste l'info à l'UI pour qu'elle prévienne le studio.
    let emailSent = false;
    let emailError: string | undefined;
    if (parsed.data.clientId) {
      const [client, studio] = await Promise.all([
        prisma.client.findUnique({ where: { id: parsed.data.clientId } }),
        prisma.studio.findUnique({ where: { id: session.user.studioId }, include: { settings: true } }),
      ]);
      if (client?.email && studio) {
        const result = await sendContractSignEmail({
          clientName: client.name,
          clientEmail: client.email,
          contractTitle: contract.title,
          contractId: contract.id,
          studio: { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor },
          settings: studio.settings
            ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
            : null,
        });
        emailSent = result.ok;
        emailError = result.error;
      }
    }

    return NextResponse.json({ contract, emailSent, emailError }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
