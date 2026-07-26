"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/Spinner";

interface StudioUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "TEAM";
  isPlatformAdmin: boolean;
}

interface StudioDetail {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  createdAt: string;
  planId: string | null;
  plan: { id: string; name: string } | null;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  users: StudioUser[];
  _count: {
    galleries: number;
    clients: number;
    orders: number;
    bookings: number;
    contracts: number;
    invoices: number;
  };
}

interface PlanOption {
  id: string;
  name: string;
}

export default function AdminStudioDetailPage({ params }: { params: { id: string } }) {
  const [studio, setStudio] = useState<StudioDetail | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [savingPlan, setSavingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  async function load() {
    const [studioRes, plansRes] = await Promise.all([
      fetch(`/api/admin/studios/${params.id}`),
      fetch("/api/admin/plans"),
    ]);
    if (studioRes.ok) {
      const data = await studioRes.json();
      setStudio(data.studio);
    }
    if (plansRes.ok) {
      const data = await plansRes.json();
      setPlans(data.plans);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function changePlan(planId: string) {
    if (!studio) return;
    setSavingPlan(true);
    setError(null);
    const res = await fetch(`/api/admin/studios/${studio.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: planId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || "Impossible de changer le plan.");
    } else {
      setStudio((prev) => (prev ? { ...prev, planId: data.studio.planId, plan: data.studio.plan } : prev));
    }
    setSavingPlan(false);
  }

  async function toggleAdmin(user: StudioUser) {
    setPendingUserId(user.id);
    setError(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPlatformAdmin: !user.isPlatformAdmin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || "Impossible de modifier cet accès.");
    } else {
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) => (u.id === user.id ? { ...u, isPlatformAdmin: data.user.isPlatformAdmin } : u)),
            }
          : prev
      );
    }
    setPendingUserId(null);
  }

  if (!studio) return <PageSpinner />;

  const stats = [
    { label: "Galeries", value: studio._count.galleries },
    { label: "Clients", value: studio._count.clients },
    { label: "Commandes", value: studio._count.orders },
    { label: "Réservations", value: studio._count.bookings },
    { label: "Contrats", value: studio._count.contracts },
    { label: "Factures", value: studio._count.invoices },
  ];

  return (
    <div>
      <Link href="/admin/studios" className="text-sm text-brand-600 hover:underline">
        ← Tous les studios
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{studio.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Inscrit le {new Date(studio.createdAt).toLocaleDateString("fr-FR")}
            {studio.subscriptionStatus && ` · Abonnement ${studio.subscriptionStatus}`}
          </p>
        </div>
        <a href={`/s/${studio.slug}`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
          Voir le site public
        </a>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <p className="text-xl font-semibold">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 card">
        <h2 className="font-medium">Plan tarifaire</h2>
        <p className="mt-1 text-sm text-gray-500">
          Affectation manuelle, ne touche pas à Stripe (ne crée ni n'annule d'abonnement).
        </p>
        <select
          className="input mt-3 max-w-xs"
          value={studio.planId || ""}
          disabled={savingPlan}
          onChange={(e) => changePlan(e.target.value)}
        >
          <option value="">Aucun plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 card">
        <h2 className="font-medium">Utilisateurs</h2>
        <div className="mt-3 space-y-2">
          {studio.users.map((user) => (
            <div key={user.id} className="flex items-center justify-between border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
              <div>
                <p className="text-sm font-medium">
                  {user.name} <span className="font-normal text-gray-400">· {user.role}</span>
                </p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={user.isPlatformAdmin}
                  disabled={pendingUserId === user.id}
                  onChange={() => toggleAdmin(user)}
                />
                Accès admin plateforme
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
