import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const booking = await prisma.booking.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!booking) throw new AccessError("Réservation introuvable", 404);

    const body = await req.json();
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: body.status },
    });
    return NextResponse.json({ booking: updated });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
