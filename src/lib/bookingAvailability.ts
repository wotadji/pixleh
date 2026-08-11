import { type BookingHours, weekdayKeyForDate } from "@/lib/bookingHours";

/** Fenêtre occupée par une réservation existante — seuls les statuts PENDING et CONFIRMED
 * doivent bloquer un créneau (demande d'Adriel, 11/08/2026 : "une reservation validé [ou] en
 * attente [...] ne dois plus etre disponible"). CANCELLED libère le créneau, COMPLETED est
 * nécessairement dans le passé et ne peut de toute façon plus entrer en conflit. */
export interface OccupiedRange {
  startsAt: Date;
  endsAt: Date;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Calcule les créneaux de début disponibles (au format "HH:mm") pour une journée donnée, à
 * partir des horaires d'ouverture configurés par le studio (voir bookingHours.ts) et des
 * réservations déjà prises ce jour-là.
 *
 * - Un jour désactivé dans `hours` ne propose aucun créneau.
 * - Chaque créneau candidat doit pouvoir accueillir toute la durée `durationMinutes` avant la
 *   fermeture (pas de créneau qui déborderait sur l'heure de fin).
 * - Un créneau qui chevauche une réservation PENDING/CONFIRMED existante est exclu.
 * - Si `date` est aujourd'hui, les créneaux déjà passés (par rapport à `now`) sont exclus.
 */
export function computeAvailableSlots(params: {
  date: Date;
  hours: BookingHours;
  durationMinutes: number;
  occupied: OccupiedRange[];
  now?: Date;
  /** Pas entre deux créneaux candidats, en minutes — 30 min par défaut, un standard courant
   * pour ce type d'outil (Calendly, Cal.com...) qui reste lisible sans surcharger l'UI. */
  stepMinutes?: number;
}): string[] {
  const { date, hours, durationMinutes, occupied, now = new Date(), stepMinutes = 30 } = params;
  const schedule = hours[weekdayKeyForDate(date)];
  if (!schedule.enabled || durationMinutes <= 0) return [];

  const openMinutes = timeToMinutes(schedule.start);
  const closeMinutes = timeToMinutes(schedule.end);
  const slots: string[] = [];

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  for (let cursor = openMinutes; cursor + durationMinutes <= closeMinutes; cursor += stepMinutes) {
    const slotStart = new Date(dayStart.getTime() + cursor * 60000);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

    if (slotStart < now) continue;

    const overlaps = occupied.some((o) => o.startsAt < slotEnd && o.endsAt > slotStart);
    if (overlaps) continue;

    slots.push(minutesToTime(cursor));
  }

  return slots;
}

/** Vérifie qu'un créneau [startsAt, endsAt) précis (déjà choisi par le client) est bien
 * disponible — utilisé côté serveur à la création réelle de la réservation (voir POST
 * /api/bookings) pour re-valider juste avant d'écrire en base : le calcul ci-dessus ne
 * suffit pas seul, un autre visiteur a pu prendre le même créneau entre l'affichage de la
 * grille et la soumission du formulaire (condition de course classique sur un système de
 * réservation). */
export function isSlotAvailable(params: {
  startsAt: Date;
  endsAt: Date;
  hours: BookingHours;
  occupied: OccupiedRange[];
  now?: Date;
}): boolean {
  const { startsAt, endsAt, hours, occupied, now = new Date() } = params;
  if (startsAt < now) return false;
  if (endsAt <= startsAt) return false;

  const schedule = hours[weekdayKeyForDate(startsAt)];
  if (!schedule.enabled) return false;

  const dayStart = new Date(startsAt);
  dayStart.setHours(0, 0, 0, 0);
  const openMinutes = timeToMinutes(schedule.start);
  const closeMinutes = timeToMinutes(schedule.end);
  const startMinutesOfDay = Math.round((startsAt.getTime() - dayStart.getTime()) / 60000);
  const endMinutesOfDay = Math.round((endsAt.getTime() - dayStart.getTime()) / 60000);
  if (startMinutesOfDay < openMinutes || endMinutesOfDay > closeMinutes) return false;

  return !occupied.some((o) => o.startsAt < endsAt && o.endsAt > startsAt);
}
