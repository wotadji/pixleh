"use client";

import { useCallback, useEffect, useState } from "react";

interface BookingTypeDTO {
  id: string;
  name: string;
  durationMinutes: number;
}

/** Date locale du jour au format "YYYY-MM-DD" (pas `toISOString()` seul, qui bascule en UTC
 * et peut donner la mauvaise date en soirée pour un fuseau à l'ouest de Greenwich). */
function todayStr(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Formulaire de réservation public (/s/[slug]/book) — refonte du 11/08/2026 (demande
 * d'Adriel : "je veux un systeme de resefvation professionnel et bien designé comme des
 * pro"). Remplace l'ancien champ heure en texte libre par une vraie grille de créneaux
 * calculée dynamiquement (voir GET /api/bookings/availability) à partir des horaires
 * d'ouverture configurés par le studio (Réglages > Réservations) et des réservations déjà
 * PENDING/CONFIRMED ce jour-là — un créneau déjà pris ou hors horaires n'apparaît tout
 * simplement plus dans la liste, plutôt que de laisser le visiteur saisir n'importe quelle
 * heure et découvrir le conflit après coup.
 */
export function BookingForm({
  studioSlug,
  bookingTypes,
}: {
  studioSlug: string;
  bookingTypes: BookingTypeDTO[];
}) {
  const [bookingTypeId, setBookingTypeId] = useState(bookingTypes[0]?.id || "");
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [contact, setContact] = useState({ customerName: "", customerEmail: "", customerPhone: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSlots = useCallback(
    (forDate: string, forTypeId: string) => {
      if (!forDate) {
        setSlots([]);
        return;
      }
      setSlotsLoading(true);
      setSlotsError(null);
      const params = new URLSearchParams({ studioSlug, date: forDate });
      if (forTypeId) params.set("bookingTypeId", forTypeId);
      fetch(`/api/bookings/availability?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => setSlots(Array.isArray(d.slots) ? d.slots : []))
        .catch(() => setSlotsError("Impossible de charger les créneaux disponibles."))
        .finally(() => setSlotsLoading(false));
    },
    [studioSlug]
  );

  useEffect(() => {
    setSelectedSlot(null);
    loadSlots(date, bookingTypeId);
  }, [date, bookingTypeId, loadSlots]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);

    const duration = bookingTypes.find((t) => t.id === bookingTypeId)?.durationMinutes || 60;
    const startsAt = new Date(`${date}T${selectedSlot}`);
    const endsAt = new Date(startsAt.getTime() + duration * 60000);

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studioSlug,
        bookingTypeId: bookingTypeId || null,
        customerName: contact.customerName,
        customerEmail: contact.customerEmail,
        customerPhone: contact.customerPhone,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: contact.notes,
      }),
    });
    setLoading(false);

    if (res.status === 409) {
      // Le créneau a été pris entre l'affichage de la grille et la soumission (condition de
      // course classique sur un système de réservation) — on avertit clairement et on
      // rafraîchit la liste plutôt que de laisser croire que ça a marché.
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data?.error === "string"
          ? data.error
          : "Ce créneau vient d'être pris. Merci d'en choisir un autre ci-dessous."
      );
      setSelectedSlot(null);
      loadSlots(date, bookingTypeId);
      return;
    }
    if (!res.ok) {
      setError("Impossible d'envoyer la demande. Vérifiez les champs.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-green-100 bg-green-50 p-6 text-center">
        <p className="text-lg font-medium text-green-800">Demande envoyée !</p>
        <p className="mt-1 text-sm text-green-700">
          Le studio va examiner votre demande et vous confirmera par email.
        </p>
      </div>
    );
  }

  const canSubmit = Boolean(date && selectedSlot && contact.customerName && contact.customerEmail);

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-8">
      {bookingTypes.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">1. Type de séance</p>
          <div className="flex flex-wrap gap-2">
            {bookingTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBookingTypeId(t.id)}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  bookingTypeId === t.id
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                {t.name} <span className="opacity-70">· {t.durationMinutes} min</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-900">
          {bookingTypes.length > 1 ? "2. " : ""}Choisissez une date
        </p>
        <input
          type="date"
          required
          min={todayStr()}
          className="input max-w-xs"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {date && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">
            {bookingTypes.length > 1 ? "3. " : "2. "}Choisissez un créneau
          </p>
          {slotsLoading ? (
            <p className="text-sm text-gray-500">Chargement des créneaux…</p>
          ) : slotsError ? (
            <p className="text-sm text-red-600">{slotsError}</p>
          ) : slots.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
              Aucun créneau disponible ce jour-là. Essayez une autre date.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    selectedSlot === slot
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedSlot && (
        <div className="space-y-4 border-t border-gray-100 pt-6">
          <p className="text-sm font-semibold text-gray-900">
            {bookingTypes.length > 1 ? "4. " : "3. "}Vos coordonnées
          </p>
          <input
            placeholder="Votre nom"
            required
            className="input"
            value={contact.customerName}
            onChange={(e) => setContact({ ...contact, customerName: e.target.value })}
          />
          <input
            placeholder="Votre email"
            type="email"
            required
            className="input"
            value={contact.customerEmail}
            onChange={(e) => setContact({ ...contact, customerEmail: e.target.value })}
          />
          <input
            placeholder="Téléphone (optionnel)"
            className="input"
            value={contact.customerPhone}
            onChange={(e) => setContact({ ...contact, customerPhone: e.target.value })}
          />
          <textarea
            placeholder="Message (optionnel)"
            className="input"
            rows={3}
            value={contact.notes}
            onChange={(e) => setContact({ ...contact, notes: e.target.value })}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading || !canSubmit} className="btn-primary w-full disabled:opacity-50">
        {loading ? "Envoi…" : "Envoyer la demande"}
      </button>
    </form>
  );
}
