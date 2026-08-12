"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";

type Step = "email" | "password" | "create-password" | "check-inbox";

function ClientLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verify = searchParams.get("verify");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotFound(false);
    const res = await fetch("/api/client-portal/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Une erreur est survenue");
      return;
    }
    if (!data.exists) {
      setNotFound(true);
      return;
    }
    setStep(data.hasPassword ? "password" : "create-password");
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/client-portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Une erreur est survenue");
      return;
    }
    router.push("/client");
    router.refresh();
  }

  async function handleCreatePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("8 caractères minimum");
      return;
    }
    if (password !== password2) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/client-portal/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Une erreur est survenue");
      return;
    }
    setStep("check-inbox");
  }

  return (
    <div className="relative min-h-screen">
      {/* Lien retour à l'accueil, ancré en haut de l'écran (indépendant du centrage vertical
          du formulaire ci-dessous) — demande d'Adriel, 12/08/2026 ("mettre le bouton de
          revenir a la page d'accueil en haut"). */}
      <Link href="/" className="absolute left-6 top-6 inline-flex w-fit items-center">
        <PixlehLogo size={24} />
      </Link>

      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <h1 className="font-serif text-2xl font-semibold">Mon espace</h1>
      <p className="mt-2 text-sm text-gray-600">
        Retrouvez toutes vos galeries, quel que soit le studio qui vous les a partagées.
      </p>

      {verify === "success" && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Email confirmé — vous pouvez maintenant vous connecter.
        </p>
      )}
      {verify === "expired" && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ce lien de confirmation a expiré. Recommencez la création de votre mot de passe.
        </p>
      )}

      {step === "email" && (
        <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            autoFocus
            className="input"
            placeholder="Votre email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {notFound && (
            <p className="text-sm text-gray-600">
              Aucun espace trouvé pour cet email. Il doit d&apos;abord vous être partagé par un
              photographe.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Vérification..." : "Continuer"}
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
          <p className="text-sm text-gray-600">{email}</p>
          <PasswordInput
            required
            autoFocus
            className="input"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Connexion..." : "Se connecter"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
            className="w-full text-center text-xs text-gray-500 underline"
          >
            Changer d&apos;email
          </button>
        </form>
      )}

      {step === "create-password" && (
        <form onSubmit={handleCreatePasswordSubmit} className="mt-6 space-y-4">
          <p className="text-sm text-gray-600">
            Première connexion pour {email} — créez un mot de passe pour votre espace.
          </p>
          <PasswordInput
            required
            autoFocus
            className="input"
            placeholder="Nouveau mot de passe (8 caractères min.)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordInput
            required
            className="input"
            placeholder="Confirmer le mot de passe"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Envoi..." : "Créer mon mot de passe"}
          </button>
        </form>
      )}

      {step === "check-inbox" && (
        <div className="mt-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Vérifiez votre boîte email : un lien de confirmation vient de vous être envoyé.
          Cliquez dessus pour activer votre mot de passe et vous connecter.
        </div>
      )}
      </div>
    </div>
  );
}

export default function ClientLoginPage() {
  return (
    <Suspense fallback={null}>
      <ClientLoginInner />
    </Suspense>
  );
}
