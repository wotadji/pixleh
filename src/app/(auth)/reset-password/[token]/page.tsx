"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Une erreur est survenue.");
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-serif text-2xl font-semibold">Nouveau mot de passe</h1>
      <p className="mt-1 text-sm text-gray-500">Choisissez un nouveau mot de passe pour votre compte.</p>

      {success ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Mot de passe mis à jour. Redirection vers la connexion...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nouveau mot de passe</label>
            <PasswordInput
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Confirmer le mot de passe</label>
            <PasswordInput
              required
              minLength={8}
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Mise à jour..." : "Réinitialiser le mot de passe"}
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
