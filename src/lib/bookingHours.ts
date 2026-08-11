/**
 * Horaires d'ouverture d'un studio pour les réservations (site public /s/[slug]/book) —
 * demande d'Adriel (11/08/2026) : "le studio dois valider ces horaire de travail (par
 * exemple de 8h a 22h en semaine et 2h le week-end). comme ca les horaire ou selection des
 * horaires se feront [dans ces limites]". Configuré dans Réglages > Réservations (voir
 * settings/page.tsx), consommé par src/lib/bookingAvailability.ts pour calculer les créneaux
 * réellement proposés côté public.
 *
 * Persisté dans StudioSettings.bookingHours (Json, voir schema.prisma) — lu/écrit via
 * $queryRaw/$executeRaw tant qu'Adriel n'a pas relancé `prisma generate && prisma db push`
 * (même limitation que les autres champs récents de ce modèle).
 */

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface DaySchedule {
  enabled: boolean;
  /** Format "HH:mm", toujours en heure locale du studio (pas d'UTC ici). */
  start: string;
  /** Format "HH:mm" — doit être strictement après `start`. */
  end: string;
}

export type BookingHours = Record<WeekdayKey, DaySchedule>;

/**
 * Défaut raisonnable pour un studio qui n'a encore rien configuré : ouvert en semaine
 * (8h-22h), fermé le week-end. Le studio ajuste ensuite librement depuis Réglages >
 * Réservations — rien n'est réservable tant qu'aucun jour n'est activé nulle part.
 */
export const DEFAULT_BOOKING_HOURS: BookingHours = {
  mon: { enabled: true, start: "08:00", end: "22:00" },
  tue: { enabled: true, start: "08:00", end: "22:00" },
  wed: { enabled: true, start: "08:00", end: "22:00" },
  thu: { enabled: true, start: "08:00", end: "22:00" },
  fri: { enabled: true, start: "08:00", end: "22:00" },
  sat: { enabled: false, start: "09:00", end: "18:00" },
  sun: { enabled: false, start: "09:00", end: "18:00" },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDaySchedule(v: unknown): v is DaySchedule {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.enabled === "boolean" &&
    typeof d.start === "string" &&
    typeof d.end === "string" &&
    TIME_RE.test(d.start) &&
    TIME_RE.test(d.end) &&
    d.start < d.end
  );
}

/**
 * Valide/normalise une valeur quelconque (venant de la base ou d'une requête entrante) en
 * BookingHours utilisable — un jour manquant ou invalide retombe sur le défaut de ce jour
 * plutôt que de faire échouer tout le planning, pour rester tolérant à des données
 * partiellement corrompues ou anciennes.
 */
export function parseBookingHours(value: unknown): BookingHours {
  if (!value || typeof value !== "object") return DEFAULT_BOOKING_HOURS;
  const raw = value as Record<string, unknown>;
  const result = {} as BookingHours;
  for (const key of WEEKDAY_KEYS) {
    result[key] = isValidDaySchedule(raw[key]) ? (raw[key] as DaySchedule) : DEFAULT_BOOKING_HOURS[key];
  }
  return result;
}

/** JS `Date.getDay()` : 0 = dimanche ... 6 = samedi — converti vers nos clés "mon".."sun". */
export function weekdayKeyForDate(date: Date): WeekdayKey {
  const jsDay = date.getDay();
  return WEEKDAY_KEYS[(jsDay + 6) % 7];
}
