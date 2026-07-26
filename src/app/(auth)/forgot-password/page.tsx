"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    // Message générique renvoyé par l'API que l'email existe ou non (voir la route) — ne
    // révèle jamais si un compte est associé à cette adresse.
    setMessage(data.message || "Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-serif text-2xl font-semibold">Mot de passe oublié</h1>
      <p className="mt-1 text-sm text-gray-500">
        Indiquez votre email, nous vous enverrons un lien pour en choisir un nouveau.
      </p>

      {message ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Envoi..." : "Envoyer le lien"}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-gray-600">
        <Link href="/login" className="text-brand-600 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
