import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";

/** Liste publique des types de séance d'un studio (utilisée par la page de réservation). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const studioSlug = searchParams.get("studioSlug");
  if (!studioSlug) {
    try {
      const session = await requireStudioSession();
      const types = await prisma.bookingType.findMany({ where: { studioId: session.user.studioId } });
      return NextResponse.json({ bookingTypes: types });
    } catch (e) {
      return handleError(e);
    }
  }

  const studio = await prisma.studio.findUnique({ where: { slug: studioSlug } });
  if (!studio) return NextResponse.json({ error: "Studio introuvable" }, { status: 404 });
  const types = await prisma.bookingType.findMany({ where: { studioId: studio.id, active: true } });
  return NextResponse.json({ bookingTypes: types });
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    const bookingType = await prisma.bookingType.create({
      data: {
        studioId: session.user.studioId,
        name: body.name,
        durationMinutes: body.durationMinutes,
        priceCents: body.priceCents || null,
        description: body.description || null,
      },
    });
    return NextResponse.json({ bookingType }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
