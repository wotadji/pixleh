"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";

interface PlanDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  currency: string;
  storageLimitGB: number | null;
  galleryLimit: number | null;
  teamMemberLimit: number | null;
  customDomainAllowed: boolean;
  removeBranding: boolean;
  storeCommissionPercent: number;
  contractLimit: number | null;
  quoteLimit: number | null;
  sessionTypeLimit: number | null;
  paymentReminders: boolean;
  tipOnInvoice: boolean;
  depositAtBooking: boolean;
  tipAtBooking: boolean;
  manualBookingApproval: boolean;
  bookingReminders: boolean;
  isFree: boolean;
  active: boolean;
  sortOrder: number;
  stripeProductId: string | null;
}

// Formulaire en euros (pas en centimes) pour éviter à Adriel de faire le calcul —
// converti en centimes juste avant l'envoi à l'API (voir toCents/fromCents).
interface PlanFormState {
  id?: string;
  slug: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceAnnual: string;
  storageLimitGB: string;
  storageUnlimited: boolean;
  galleryLimit: string;
  galleryUnlimited: boolean;
  teamMemberLimit: string;
  teamUnlimited: boolean;
  customDomainAllowed: boolean;
  removeBranding: boolean;
  storeCommissionPercent: string;
  contractLimit: string;
  contractUnlimited: boolean;
  quoteLimit: string;
  quoteUnlimited: boolean;
  sessionTypeLimit: string;
  sessionTypeUnlimited: boolean;
  paymentReminders: boolean;
  tipOnInvoice: boolean;
  depositAtBooking: boolean;
  tipAtBooking: boolean;
  manualBookingApproval: boolean;
  bookingReminders: boolean;
  isFree: boolean;
  active: boolean;
  sortOrder: string;
}

const EMPTY_FORM: PlanFormState = {
  slug: "",
  name: "",
  description: "",
  priceMonthly: "0",
  priceAnnual: "0",
  storageLimitGB: "10",
  storageUnlimited: false,
  galleryLimit: "",
  galleryUnlimited: true,
  teamMemberLimit: "1",
  teamUnlimited: false,
  customDomainAllowed: false,
  removeBranding: false,
  storeCommissionPercent: "0",
  contractLimit: "",
  contractUnlimited: true,
  quoteLimit: "",
  quoteUnlimited: true,
  sessionTypeLimit: "1",
  sessionTypeUnlimited: false,
  paymentReminders: false,
  tipOnInvoice: false,
  depositAtBooking: false,
  tipAtBooking: false,
  manualBookingApproval: false,
  bookingReminders: false,
  isFree: false,
  active: true,
  sortOrder: "0",
};

function toCents(euros: string) {
  return Math.round(parseFloat(euros.replace(",", ".") || "0") * 100);
}

function fromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function planToForm(plan: PlanDTO): PlanFormState {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description || "",
    priceMonthly: fromCents(plan.priceMonthlyCents),
    priceAnnual: fromCents(plan.priceAnnualCents),
    storageLimitGB: plan.storageLimitGB ? String(plan.storageLimitGB) : "",
    storageUnlimited: plan.storageLimitGB === null,
    galleryLimit: plan.galleryLimit ? String(plan.galleryLimit) : "",
    galleryUnlimited: plan.galleryLimit === null,
    teamMemberLimit: plan.teamMemberLimit ? String(plan.teamMemberLimit) : "",
    teamUnlimited: plan.teamMemberLimit === null,
    customDomainAllowed: plan.customDomainAllowed,
    removeBranding: plan.removeBranding,
    storeCommissionPercent: String(plan.storeCommissionPercent),
    contractLimit: plan.contractLimit ? String(plan.contractLimit) : "",
    contractUnlimited: plan.contractLimit === null,
    quoteLimit: plan.quoteLimit ? String(plan.quoteLimit) : "",
    quoteUnlimited: plan.quoteLimit === null,
    sessionTypeLimit: plan.sessionTypeLimit ? String(plan.sessionTypeLimit) : "",
    sessionTypeUnlimited: plan.sessionTypeLimit === null,
    paymentReminders: plan.paymentReminders,
    tipOnInvoice: plan.tipOnInvoice,
    depositAtBooking: plan.depositAtBooking,
    tipAtBooking: plan.tipAtBooking,
    manualBookingApproval: plan.manualBookingApproval,
    bookingReminders: plan.bookingReminders,
    isFree: plan.isFree,
    active: plan.active,
    sortOrder: String(plan.sortOrder),
  };
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);

  async function loadPlans() {
    const res = await fetch("/api/admin/plans");
    if (res.ok) {
      const data = await res.json();
      setPlans(data.plans);
    }
  }

  useEffect(() => {
    loadPlans();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(plan: PlanDTO) {
    setForm(planToForm(plan));
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      priceMonthlyCents: toCents(form.priceMonthly),
      priceAnnualCents: toCents(form.priceAnnual),
      currency: "eur",
      storageLimitGB: form.storageUnlimited ? null : parseInt(form.storageLimitGB, 10) || null,
      galleryLimit: form.galleryUnlimited ? null : parseInt(form.galleryLimit, 10) || null,
      teamMemberLimit: form.teamUnlimited ? null : parseInt(form.teamMemberLimit, 10) || null,
      customDomainAllowed: form.customDomainAllowed,
      removeBranding: form.removeBranding,
      storeCommissionPercent: parseInt(form.storeCommissionPercent, 10) || 0,
      contractLimit: form.contractUnlimited ? null : parseInt(form.contractLimit, 10) || null,
      quoteLimit: form.quoteUnlimited ? null : parseInt(form.quoteLimit, 10) || null,
      sessionTypeLimit: form.sessionTypeUnlimited ? null : parseInt(form.sessionTypeLimit, 10) || null,
      paymentReminders: form.paymentReminders,
      tipOnInvoice: form.tipOnInvoice,
      depositAtBooking: form.depositAtBooking,
      tipAtBooking: form.tipAtBooking,
      manualBookingApproval: form.manualBookingApproval,
      bookingReminders: form.bookingReminders,
      isFree: form.isFree,
      active: form.active,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    };

    try {
      const res = await fetch(form.id ? `/api/admin/plans/${form.id}` : "/api/admin/plans", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.formErrors?.[0] || data?.error || "Erreur lors de l'enregistrement.");
        setSaving(false);
        return;
      }
      if (data.stripeSync && data.stripeSync.synced === false) {
        setStripeConfigured(false);
      }
      setModalOpen(false);
      await loadPlans();
    } catch {
      setError("Erreur réseau.");
    }
    setSaving(false);
  }

  async function remove(plan: PlanDTO) {
    if (!confirm(`Supprimer le plan "${plan.name}" ? Cette action est irréversible.`)) return;
    const res = await fetch(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.error || "Suppression impossible.");
      return;
    }
    await loadPlans();
  }

  if (!plans) return <PageSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">Plans tarifaires</h1>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Nouveau plan
        </button>
      </div>

      {!stripeConfigured && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Les clés Stripe (STRIPE_SECRET_KEY) ne sont pas encore configurées dans .env — les plans sont
          enregistrés côté pixleh, mais pas encore synchronisés avec Stripe. Ils ne pourront pas être
          souscrits par carte tant que ça n'est pas fait.
        </div>
      )}

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Certaines options ci-dessous (relances, acompte/pourboire réservation, validation manuelle,
        domaine personnalisé...) décrivent une intention de grille tarifaire mais ne sont pas encore
        appliquées côté produit. Active-les une par une, une fois développées, depuis{" "}
        <a href="/admin/features" className="text-brand-600 hover:underline">
          Fonctionnalités
        </a>
        .
      </div>

      <div className="mt-6 space-y-3">
        {plans.length === 0 && (
          <p className="text-sm text-gray-500">Aucun plan pour le moment — crée le premier.</p>
        )}
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`card flex items-center justify-between ${!plan.active ? "opacity-50" : ""}`}
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{plan.name}</p>
                {plan.isFree && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Gratuit</span>
                )}
                {!plan.active && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Désactivé</span>
                )}
                {!plan.stripeProductId && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    Non synchronisé Stripe
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {fromCents(plan.priceMonthlyCents)}€/mois — ou {fromCents(plan.priceAnnualCents)}€/mois en
                annuel · {plan.storageLimitGB ? `${plan.storageLimitGB} Go` : "Stockage illimité"} ·{" "}
                {plan.galleryLimit ? `${plan.galleryLimit} galeries` : "Galeries illimitées"} ·{" "}
                {plan.teamMemberLimit ? `${plan.teamMemberLimit} membre(s)` : "Équipe illimitée"}
                {plan.storeCommissionPercent > 0 && ` · ${plan.storeCommissionPercent}% commission boutique`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => openEdit(plan)}>
                Modifier
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                onClick={() => remove(plan)}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Modifier le plan" : "Nouveau plan"}
        widthClassName="max-w-4xl"
        footer={
          <>
            <button type="button" className="btn-secondary text-sm" onClick={() => setModalOpen(false)}>
              Annuler
            </button>
            <button type="button" className="btn-primary text-sm" disabled={saving} onClick={save}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </>
        }
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nom affiché</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Slug (identifiant)</label>
              <input
                className="input"
                placeholder="ex: starter"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Description courte</label>
            <input
              className="input"
              placeholder="Pour bien démarrer, seul(e)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Prix mensuel (€)</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={form.priceMonthly}
                onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Prix mensuel si annuel (€)</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={form.priceAnnual}
                onChange={(e) => setForm({ ...form, priceAnnual: e.target.value })}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Stockage / galeries / équipe</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  Stockage (Go)
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.storageUnlimited}
                      onChange={(e) => setForm({ ...form, storageUnlimited: e.target.checked })}
                    />
                    illimité
                  </label>
                </label>
                <input
                  type="number"
                  className="input"
                  disabled={form.storageUnlimited}
                  value={form.storageLimitGB}
                  onChange={(e) => setForm({ ...form, storageLimitGB: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  Galeries
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.galleryUnlimited}
                      onChange={(e) => setForm({ ...form, galleryUnlimited: e.target.checked })}
                    />
                    illimité
                  </label>
                </label>
                <input
                  type="number"
                  className="input"
                  disabled={form.galleryUnlimited}
                  value={form.galleryLimit}
                  onChange={(e) => setForm({ ...form, galleryLimit: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  Équipe
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.teamUnlimited}
                      onChange={(e) => setForm({ ...form, teamUnlimited: e.target.checked })}
                    />
                    illimité
                  </label>
                </label>
                <input
                  type="number"
                  className="input"
                  disabled={form.teamUnlimited}
                  value={form.teamMemberLimit}
                  onChange={(e) => setForm({ ...form, teamMemberLimit: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Boutique / contrats / réservation</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Commission boutique (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input"
                  value={form.storeCommissionPercent}
                  onChange={(e) => setForm({ ...form, storeCommissionPercent: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  Contrats
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.contractUnlimited}
                      onChange={(e) => setForm({ ...form, contractUnlimited: e.target.checked })}
                    />
                    illimité
                  </label>
                </label>
                <input
                  type="number"
                  className="input"
                  disabled={form.contractUnlimited}
                  value={form.contractLimit}
                  onChange={(e) => setForm({ ...form, contractLimit: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  Devis
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.quoteUnlimited}
                      onChange={(e) => setForm({ ...form, quoteUnlimited: e.target.checked })}
                    />
                    illimité
                  </label>
                </label>
                <input
                  type="number"
                  className="input"
                  disabled={form.quoteUnlimited}
                  value={form.quoteLimit}
                  onChange={(e) => setForm({ ...form, quoteLimit: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  Types de séance
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.sessionTypeUnlimited}
                      onChange={(e) => setForm({ ...form, sessionTypeUnlimited: e.target.checked })}
                    />
                    illimité
                  </label>
                </label>
                <input
                  type="number"
                  className="input"
                  disabled={form.sessionTypeUnlimited}
                  value={form.sessionTypeLimit}
                  onChange={(e) => setForm({ ...form, sessionTypeLimit: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.customDomainAllowed}
                onChange={(e) => setForm({ ...form, customDomainAllowed: e.target.checked })}
              />
              Domaine personnalisé autorisé
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.removeBranding}
                onChange={(e) => setForm({ ...form, removeBranding: e.target.checked })}
              />
              Retire "Propulsé par pixleh"
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.paymentReminders}
                onChange={(e) => setForm({ ...form, paymentReminders: e.target.checked })}
              />
              Relances automatiques (facture, document)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.tipOnInvoice}
                onChange={(e) => setForm({ ...form, tipOnInvoice: e.target.checked })}
              />
              Pourboire sur facture
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.depositAtBooking}
                onChange={(e) => setForm({ ...form, depositAtBooking: e.target.checked })}
              />
              Acompte à la réservation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.tipAtBooking}
                onChange={(e) => setForm({ ...form, tipAtBooking: e.target.checked })}
              />
              Pourboire à la réservation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.manualBookingApproval}
                onChange={(e) => setForm({ ...form, manualBookingApproval: e.target.checked })}
              />
              Validation manuelle des réservations
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.bookingReminders}
                onChange={(e) => setForm({ ...form, bookingReminders: e.target.checked })}
              />
              Relances de réservation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFree}
                onChange={(e) => setForm({ ...form, isFree: e.target.checked })}
              />
              Plan gratuit par défaut (attribué à l'inscription)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Actif (visible sur la page tarifs)
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Ordre d'affichage</label>
            <input
              type="number"
              className="input w-24"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
