import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBookingHours } from "@/lib/bookingHours";
import { computeAvailableSlots } from "@/lib/bookingAvailability";

export const runtime = "nodejs";

/**
 * Créneaux disponibles pour une journée donnée, calculés à partir des horaires d'ouverture
 * du studio (voir StudioSettings.bookingHours / Réglages > Réservations) et des réservations
 * déjà PENDING/CONFIRMED ce jour-là — consommé par le sélecteur de créneau de la page
 * publique /s/[slug]/book (voir BookingForm.tsx). Public, sans session (comme POST
 * /api/bookings) : n'importe quel visiteur doit pouvoir consulter les disponibilités avant
 * de soumettre une demande.
 *
 * Query params : studioSlug (requis), date="YYYY-MM-DD" (requis), bookingTypeId (optionnel —
 * détermine la durée du créneau ; 60 min par défaut si absent, même valeur de repli que
 * BookingForm.tsx avant ce chantier).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const studioSlug = url.searchParams.get("studioSlug");
  const dateParam = url.searchParams.get("date");
  const bookingTypeId = url.searchParams.get("bookingTypeId");

  if (!studioSlug || !dateParam) {
    return NextResponse.json({ error: "studioSlug et date requis" }, { status: 400 });
  }
  const date = new Date(`${dateParam}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }

  const studio = await prisma.studio.findUnique({ where: { slug: studioSlug } });
  if (!studio) return NextResponse.json({ error: "Studio introuvable" }, { status: 404 });

  let durationMinutes = 60;
  if (bookingTypeId) {
    const bookingType = await prisma.bookingType.findFirst({
      where: { id: bookingTypeId, studioId: studio.id },
    });
    if (bookingType) durationMinutes = bookingType.durationMinutes;
  }

  // bookingHours n'existe pas encore dans le Prisma Client généré du sandbox (voir le
  // commentaire sur StudioSettings dans schema.prisma) — $queryRaw, même workaround que les
  // autres champs récents de ce modèle.
  const [hoursRow] = await prisma.$queryRaw<{ bookingHours: unknown }[]>`
    SELECT "bookingHours" FROM "StudioSettings" WHERE "studioId" = ${studio.id}
  `;
  const hours = parseBookingHours(hoursRow?.bookingHours ?? null);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);

  // PENDING et CONFIRMED bloquent tous les deux le créneau (demande d'Adriel, 11/08/2026) —
  // seul CANCELLED le libère, COMPLETED est nécessairement dans le passé.
  const existing = await prisma.booking.findMany({
    where: {
      studioId: studio.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
    },
    select: { startsAt: true, endsAt: true },
  });

  const slots = computeAvailableSlots({
    date,
    hours,
    durationMinutes,
    occupied: existing,
  });

  return NextResponse.json({ slots, durationMinutes });
}
