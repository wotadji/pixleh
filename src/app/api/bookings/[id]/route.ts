import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import {
  sendBookingConfirmedEmail,
  sendBookingDeclinedEmail,
  sendBookingCancelledEmail,
} from "@/lib/notifications";

const VALID_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"] as const;
type BookingStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const booking = await prisma.booking.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!booking) throw new AccessError("Réservation introuvable", 404);

    const body = await req.json();
    const nextStatus = body.status as string | undefined;
    if (!nextStatus || !VALID_STATUSES.includes(nextStatus as BookingStatus)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    const previousStatus = booking.status;
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: nextStatus as BookingStatus },
    });

    // Notifie le client par email sur les transitions qui ont un sens pour lui — demande
    // d'Adriel (11/08/2026) : "apres validation ou acceptation par le studio, la personne aui
    // a reservé dois avoir le message (soit de validation ou alors de refus)". Une réservation
    // déjà CONFIRMÉE puis annulée reçoit un message distinct d'un simple refus initial (voir
    // sendBookingCancelledEmail) — le client pensait sa séance acquise. Le retour en PENDING
    // (demande d'Adriel : "une reservation validé peux etre [...] mise en attente apres") est
    // une correction interne du studio, sans email : rien de nouveau à annoncer au client tant
    // que le studio n'a pas re-décidé.
    if (previousStatus !== nextStatus) {
      const studio = await prisma.studio.findUnique({ where: { id: session.user.studioId } });
      const studioName = studio?.name ?? "";

      if (previousStatus === "PENDING" && nextStatus === "CONFIRMED") {
        sendBookingConfirmedEmail({
          customerName: updated.customerName,
          customerEmail: updated.customerEmail,
          studioName,
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
        }).catch((e) => console.error("Échec de l'email de confirmation de réservation :", e));
      } else if (previousStatus === "PENDING" && nextStatus === "CANCELLED") {
        sendBookingDeclinedEmail({
          customerName: updated.customerName,
          customerEmail: updated.customerEmail,
          studioName,
          startsAt: updated.startsAt,
        }).catch((e) => console.error("Échec de l'email de refus de réservation :", e));
      } else if (previousStatus === "CONFIRMED" && nextStatus === "CANCELLED") {
        sendBookingCancelledEmail({
          customerName: updated.customerName,
          customerEmail: updated.customerEmail,
          studioName,
          startsAt: updated.startsAt,
        }).catch((e) => console.error("Échec de l'email d'annulation de réservation :", e));
      }
    }

    return NextResponse.json({ booking: updated });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
