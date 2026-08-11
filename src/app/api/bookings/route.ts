import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { bookingRequestSchema } from "@/lib/validators";
import { sendStudioNewBookingEmail, sendClientBookingConfirmationEmail } from "@/lib/notifications";
import { parseBookingHours } from "@/lib/bookingHours";
import { isSlotAvailable } from "@/lib/bookingAvailability";

/** Liste des réservations du studio connecté. */
export async function GET() {
  try {
    const session = await requireStudioSession();
    const bookings = await prisma.booking.findMany({
      where: { studioId: session.user.studioId },
      include: { bookingType: true },
      orderBy: { startsAt: "asc" },
    });
    return NextResponse.json({ bookings });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Création publique d'une demande de réservation depuis la page /s/[slug]/book.
 * Le studio confirme ensuite manuellement la réservation (statut PENDING -> CONFIRMED).
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { studioSlug, ...rest } = body;
  const parsed = bookingRequestSchema.safeParse(rest);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const studio = await prisma.studio.findUnique({ where: { slug: studioSlug } });
  if (!studio) return NextResponse.json({ error: "Studio introuvable" }, { status: 404 });

  const data = parsed.data;
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }

  // Re-vérification côté serveur, indispensable : la grille de créneaux affichée au client
  // (voir GET /api/bookings/availability) a pu devenir obsolète entre l'affichage et la
  // soumission — un autre visiteur a pu prendre le même créneau entre-temps (condition de
  // course classique). Sans ce contrôle, deux clients pourraient réserver le même horaire.
  const dayStart = new Date(startsAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);
  const [hoursRow] = await prisma.$queryRaw<{ bookingHours: unknown }[]>`
    SELECT "bookingHours" FROM "StudioSettings" WHERE "studioId" = ${studio.id}
  `;
  const hours = parseBookingHours(hoursRow?.bookingHours ?? null);
  const occupied = await prisma.booking.findMany({
    where: {
      studioId: studio.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
    },
    select: { startsAt: true, endsAt: true },
  });
  if (!isSlotAvailable({ startsAt, endsAt, hours, occupied })) {
    return NextResponse.json(
      { error: "Ce créneau vient d'être pris ou n'est plus disponible. Merci d'en choisir un autre." },
      { status: 409 }
    );
  }

  const booking = await prisma.booking.create({
    data: {
      studioId: studio.id,
      bookingTypeId: data.bookingTypeId || null,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone || null,
      startsAt,
      endsAt,
      notes: data.notes || null,
      status: "PENDING",
    },
  });

  // Best-effort : prévient le studio par email d'une nouvelle demande, sans jamais faire
  // échouer la réservation elle-même pour un souci d'envoi (voir sendMail, qui logge déjà
  // l'échec sans lever d'exception).
  sendStudioNewBookingEmail({
    studioId: studio.id,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    startsAt: booking.startsAt,
    notes: booking.notes,
  }).catch((e) => console.error("Échec de la notification de réservation :", e));

  // Best-effort : confirme au client que sa demande a bien été reçue, sans jamais faire
  // échouer la réservation elle-même pour un souci d'envoi (même patron que ci-dessus).
  sendClientBookingConfirmationEmail({
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    studioName: studio.name,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
  }).catch((e) => console.error("Échec de la confirmation de réservation au client :", e));

  return NextResponse.json({ booking }, { status: 201 });
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
