"use client";

import { useState } from "react";

interface BookingTypeDTO {
  id: string;
  name: string;
  durationMinutes: number;
}

export function BookingForm({
  studioSlug,
  bookingTypes,
}: {
  studioSlug: string;
  bookingTypes: BookingTypeDTO[];
}) {
  const [form, setForm] = useState({
    bookingTypeId: bookingTypes[0]?.id || "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    date: "",
    time: "",
    notes: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const duration = bookingTypes.find((t) => t.id === form.bookingTypeId)?.durationMinutes || 60;
    const startsAt = new Date(`${form.date}T${form.time}`);
    const endsAt = new Date(startsAt.getTime() + duration * 60000);

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studioSlug,
        bookingTypeId: form.bookingTypeId || null,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: form.notes,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Impossible d'envoyer la demande. Vérifiez les champs.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="mt-8 rounded-lg bg-green-50 p-4 text-green-700">
        Votre demande de réservation a été envoyée ! Le studio vous confirmera par email.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      {bookingTypes.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium">Type de séance</label>
          <select
            className="input"
            value={form.bookingTypeId}
            onChange={(e) => setForm({ ...form, bookingTypeId: e.target.value })}
          >
            {bookingTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.durationMinutes} min)
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="date"
          required
          className="input"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <input
          type="time"
          required
          className="input"
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
        />
      </div>
      <input
        placeholder="Votre nom"
        required
        className="input"
        value={form.customerName}
        onChange={(e) => setForm({ ...form, customerName: e.target.value })}
      />
      <input
        placeholder="Votre email"
        type="email"
        required
        className="input"
        value={form.customerEmail}
        onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
      />
      <input
        placeholder="Téléphone (optionnel)"
        className="input"
        value={form.customerPhone}
        onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
      />
      <textarea
        placeholder="Message (optionnel)"
        className="input"
        rows={3}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Envoi..." : "Envoyer la demande"}
      </button>
    </form>
  );
}
