"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

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
  const { t } = useLanguage();

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
        setError(data?.error?.formErrors?.[0] || data?.error || t("admin.plans.errorSave"));
        setSaving(false);
        return;
      }
      if (data.stripeSync && data.stripeSync.synced === false) {
        setStripeConfigured(false);
      }
      setModalOpen(false);
      await loadPlans();
    } catch {
      setError(t("admin.plans.errorNetwork"));
    }
    setSaving(false);
  }

  async function remove(plan: PlanDTO) {
    if (!confirm(`${t("admin.plans.confirmDeletePrefix")} "${plan.name}" ${t("admin.plans.confirmDeleteSuffix")}`)) return;
    const res = await fetch(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.error || t("admin.plans.errorDelete"));
      return;
    }
    await loadPlans();
  }

  if (!plans) return <PageSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">{t("admin.plans.title")}</h1>
        <button type="button" className="btn-primary" onClick={openCreate}>
          {t("admin.plans.newPlan")}
        </button>
      </div>

      {!stripeConfigured && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("admin.plans.stripeWarning")}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        {t("admin.plans.featuresHintPrefix")}{" "}
        <a href="/admin/features" className="text-brand-600 hover:underline">
          {t("admin.plans.featuresHintLink")}
        </a>
        {t("admin.plans.featuresHintSuffix")}
      </div>

      <div className="mt-6 space-y-3">
        {plans.length === 0 && (
          <p className="text-sm text-gray-500">{t("admin.plans.empty")}</p>
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
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t("admin.plans.badgeFree")}</span>
                )}
                {!plan.active && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t("admin.plans.badgeDisabled")}</span>
                )}
                {!plan.stripeProductId && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    {t("admin.plans.badgeNotSynced")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {fromCents(plan.priceMonthlyCents)}€{t("admin.plans.perMonth")} — {t("admin.plans.orAnnual")} {fromCents(plan.priceAnnualCents)}€{t("admin.plans.perMonth")} ·{" "}
                {plan.storageLimitGB ? `${plan.storageLimitGB} ${t("admin.plans.gbUnit")}` : t("admin.plans.storageUnlimited")} ·{" "}
                {plan.galleryLimit ? `${plan.galleryLimit} ${t("admin.plans.galleriesUnit")}` : t("admin.plans.galleriesUnlimited")} ·{" "}
                {plan.teamMemberLimit ? `${plan.teamMemberLimit} ${t("admin.plans.memberUnit")}` : t("admin.plans.teamUnlimited")}
                {plan.storeCommissionPercent > 0 && ` · ${plan.storeCommissionPercent}% ${t("admin.plans.storeCommissionSuffix")}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => openEdit(plan)}>
                {t("admin.plans.edit")}
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                onClick={() => remove(plan)}
              >
                {t("admin.plans.delete")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? t("admin.plans.modalEditTitle") : t("admin.plans.modalNewTitle")}
        widthClassName="max-w-4xl"
        footer={
          <>
            <button type="button" className="btn-secondary text-sm" onClick={() => setModalOpen(false)}>
              {t("admin.plans.cancel")}
            </button>
            <button type="button" className="btn-primary text-sm" disabled={saving} onClick={save}>
              {saving ? t("admin.plans.saving") : t("admin.plans.save")}
            </button>
          </>
        }
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin.plans.fieldName")}</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin.plans.fieldSlug")}</label>
              <input
                className="input"
                placeholder="ex: starter"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("admin.plans.fieldDescription")}</label>
            <input
              className="input"
              placeholder="Pour bien démarrer, seul(e)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin.plans.fieldPriceMonthly")}</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={form.priceMonthly}
                onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin.plans.fieldPriceAnnual")}</label>
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
            <p className="mb-2 text-sm font-medium text-gray-700">{t("admin.plans.sectionQuotas")}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  {t("admin.plans.fieldStorage")}
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.storageUnlimited}
                      onChange={(e) => setForm({ ...form, storageUnlimited: e.target.checked })}
                    />
                    {t("admin.plans.unlimited")}
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
                  {t("admin.plans.fieldGalleries")}
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.galleryUnlimited}
                      onChange={(e) => setForm({ ...form, galleryUnlimited: e.target.checked })}
                    />
                    {t("admin.plans.unlimited")}
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
                  {t("admin.plans.fieldTeam")}
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.teamUnlimited}
                      onChange={(e) => setForm({ ...form, teamUnlimited: e.target.checked })}
                    />
                    {t("admin.plans.unlimited")}
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
            <p className="mb-2 text-sm font-medium text-gray-700">{t("admin.plans.sectionStore")}</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("admin.plans.fieldCommission")}</label>
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
                  {t("admin.plans.fieldContracts")}
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.contractUnlimited}
                      onChange={(e) => setForm({ ...form, contractUnlimited: e.target.checked })}
                    />
                    {t("admin.plans.unlimited")}
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
                  {t("admin.plans.fieldQuotes")}
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.quoteUnlimited}
                      onChange={(e) => setForm({ ...form, quoteUnlimited: e.target.checked })}
                    />
                    {t("admin.plans.unlimited")}
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
                  {t("admin.plans.fieldSessionTypes")}
                  <label className="flex items-center gap-1 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={form.sessionTypeUnlimited}
                      onChange={(e) => setForm({ ...form, sessionTypeUnlimited: e.target.checked })}
                    />
                    {t("admin.plans.unlimited")}
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
              {t("admin.plans.checkCustomDomain")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.removeBranding}
                onChange={(e) => setForm({ ...form, removeBranding: e.target.checked })}
              />
              {t("admin.plans.checkRemoveBranding")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.paymentReminders}
                onChange={(e) => setForm({ ...form, paymentReminders: e.target.checked })}
              />
              {t("admin.plans.checkPaymentReminders")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.tipOnInvoice}
                onChange={(e) => setForm({ ...form, tipOnInvoice: e.target.checked })}
              />
              {t("admin.plans.checkTipOnInvoice")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.depositAtBooking}
                onChange={(e) => setForm({ ...form, depositAtBooking: e.target.checked })}
              />
              {t("admin.plans.checkDepositAtBooking")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.tipAtBooking}
                onChange={(e) => setForm({ ...form, tipAtBooking: e.target.checked })}
              />
              {t("admin.plans.checkTipAtBooking")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.manualBookingApproval}
                onChange={(e) => setForm({ ...form, manualBookingApproval: e.target.checked })}
              />
              {t("admin.plans.checkManualApproval")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.bookingReminders}
                onChange={(e) => setForm({ ...form, bookingReminders: e.target.checked })}
              />
              {t("admin.plans.checkBookingReminders")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFree}
                onChange={(e) => setForm({ ...form, isFree: e.target.checked })}
              />
              {t("admin.plans.checkFreeDefault")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              {t("admin.plans.checkActive")}
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("admin.plans.fieldSortOrder")}</label>
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
