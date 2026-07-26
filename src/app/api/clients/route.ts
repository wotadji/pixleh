import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { clientSchema } from "@/lib/validators";

export async function GET() {
  try {
    const session = await requireStudioSession();
    const clients = await prisma.client.findMany({
      where: { studioId: session.user.studioId },
      orderBy: { createdAt: "desc" },
      // Le dernier message (un seul, le plus récent) sert d'aperçu dans la liste — même
      // logique qu'une messagerie type Messenger/LinkedIn, sans charger tout le fil pour
      // chaque client (voir GET /api/clients/[id] pour le fil complet, chargé à la demande).
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    const parsed = clientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const client = await prisma.client.create({
      data: { studioId: session.user.studioId, ...parsed.data },
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
