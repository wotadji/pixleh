import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { contractSchema } from "@/lib/validators";

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
    return NextResponse.json({ contract }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
