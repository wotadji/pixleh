"use client";

import { useState } from "react";

export function ContactForm({ studioSlug }: { studioSlug: string }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studioSlug, ...form }),
    });
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return <p className="mt-8 rounded-lg bg-green-50 p-4 text-green-700">Message envoyé, merci !</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <input
        placeholder="Votre nom"
        required
        className="input"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        placeholder="Votre email"
        type="email"
        required
        className="input"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <input
        placeholder="Votre téléphone (optionnel)"
        type="tel"
        className="input"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <textarea
        placeholder="Votre message"
        required
        rows={5}
        className="input"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
      />
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Envoi..." : "Envoyer"}
      </button>
    </form>
  );
}
