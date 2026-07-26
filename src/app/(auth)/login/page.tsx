"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { OrDivider } from "@/components/auth/OrDivider";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Formulaire email/mot de passe masqué par défaut, comme sur /register — le Social
  // Login est mis en avant, le mot de passe reste une option accessible en un clic.
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Erreur remontée par NextAuth après une redirection OAuth ratée (utilisateur qui refuse
  // l'autorisation côté Google/GitHub, callback signIn() qui renvoie false, etc.) — voir
  // signIn() dans src/lib/auth.ts. Message volontairement générique dans le cas général,
  // pour ne pas révéler de détail exploitable — sauf "NoAccount" (voir SocialLoginButtons,
  // intent="login") qui a un message dédié et actionnable, puisqu'il ne révèle rien de
  // sensible : juste qu'aucun compte n'est associé à CET email, dans CETTE tentative.
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get("error");
    if (err === "NoAccount") {
      setError("Aucun compte associé à cet email. Créez d'abord un compte.");
    } else if (err) {
      setError("Connexion impossible. Réessayez ou utilisez un autre moyen de connexion.");
    }

    // Retour de /api/auth/verify-email (voir la route) — pas d'erreur, juste une confirmation
    // informative avant de se (re)connecter.
    const verify = params.get("verify");
    if (verify === "success") {
      setNotice("Votre adresse email est confirmée. Vous pouvez vous connecter.");
    } else if (verify === "expired") {
      setNotice("Ce lien de confirmation a expiré. Vous pourrez en redemander un depuis votre tableau de bord.");
    } else if (verify === "invalid") {
      setNotice("Lien de confirmation invalide.");
    }
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push(params.get("callbackUrl") || "/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-serif text-2xl font-semibold">Connexion</h1>
      <p className="mt-1 text-sm text-gray-500">Ravi de vous revoir.</p>

      {notice && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      <div className="mt-6">
        <SocialLoginButtons callbackUrl={params.get("callbackUrl") || "/dashboard"} intent="login" />
      </div>

      {!showEmailForm && (
        <>
          <div className="my-4">
            <OrDivider />
          </div>
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Se connecter avec email
          </button>
        </>
      )}

      {showEmailForm && (
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
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium">Mot de passe</label>
              <Link href="/forgot-password" className="text-xs text-brand-600 hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      )}
      {!showEmailForm && error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-4 text-sm text-gray-600">
        Pas encore de compte ?{" "}
        {/* Passe d'abord par /tarifs (choix d'un plan) plutôt que /register directement —
            même logique que le bouton "Créer mon studio" du header marketing (voir
            MarketingHeader.tsx) : on veut que le studio choisisse un forfait avant de créer
            son compte, pas après coup. */}
        <Link href="/tarifs" className="text-brand-600 hover:underline">
          Créer un studio
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
