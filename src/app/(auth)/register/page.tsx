"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { OrDivider } from "@/components/auth/OrDivider";
import { PasswordInput } from "@/components/ui/PasswordInput";

// useSearchParams() (pour ?plan=&interval=, voir plus bas) doit être encapsulé dans un
// <Suspense> pour ne pas faire basculer toute la page en rendu 100% client côté build —
// voir https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ studioName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Le formulaire email/mot de passe est masqué par défaut (voir le bouton "Créer un
  // compte avec email" ci-dessous) — écran d'authentification "moderne" où le Social
  // Login est mis en avant, le mot de passe restant une option secondaire.
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Plan choisi sur /tarifs (voir PricingGrid) — reporté après la création du compte (Social
  // Login via callbackUrl, ou credentials via router.push ci-dessous) vers /checkout plutôt
  // que directement /dashboard : cette page intermédiaire fait la redirection Stripe côté
  // serveur, sans jamais afficher le panel — voir /checkout/page.tsx pour le détail. Sans
  // plan choisi (inscription directe), on va droit au dashboard comme avant.
  const plan = searchParams.get("plan");
  const interval = searchParams.get("interval") === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  const postAuthUrl = plan ? `/checkout?plan=${encodeURIComponent(plan)}&interval=${interval}` : "/dashboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.formErrors?.[0] || data?.error || "Erreur lors de l'inscription.");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (signInRes?.ok) {
      router.push(postAuthUrl);
    } else {
      router.push("/login");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-serif text-2xl font-semibold">Créer votre studio</h1>
      <p className="mt-1 text-sm text-gray-500">Commencez en quelques secondes.</p>

      <div className="mt-6">
        <SocialLoginButtons callbackUrl={postAuthUrl} intent="register" />
      </div>

      <p className="mt-3 text-center text-xs text-gray-500">
        En continuant, vous acceptez les{" "}
        <Link href="/cgu" target="_blank" className="text-brand-600 hover:underline">
          CGU
        </Link>{" "}
        et la{" "}
        <Link href="/confidentialite" target="_blank" className="text-brand-600 hover:underline">
          politique de confidentialité
        </Link>{" "}
        de pixleh.
      </p>

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
            Créer un compte avec email
          </button>
        </>
      )}

      {showEmailForm && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nom du studio</label>
            <input
              required
              className="input"
              value={form.studioName}
              onChange={(e) => setForm({ ...form, studioName: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Votre nom</label>
            <input
              required
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              required
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Mot de passe</label>
            <PasswordInput
              required
              minLength={8}
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-gray-300"
            />
            <span>
              J&apos;accepte les{" "}
              <Link href="/cgu" target="_blank" className="text-brand-600 hover:underline">
                CGU
              </Link>{" "}
              et la{" "}
              <Link href="/confidentialite" target="_blank" className="text-brand-600 hover:underline">
                politique de confidentialité
              </Link>{" "}
              de pixleh.
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading || !acceptedTerms} className="btn-primary w-full">
            {loading ? "Création..." : "Créer mon studio"}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-gray-600">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-brand-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
