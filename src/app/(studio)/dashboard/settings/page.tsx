"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LogoCropModal } from "@/components/studio/LogoCropModal";
import { BannerCropModal } from "@/components/studio/BannerCropModal";
import { RichTextEditor } from "@/components/studio/RichTextEditor";
import { PageSpinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";

interface BookingTypeDTO {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
}

interface CarouselSlideDTO {
  id: string;
  text: string;
  imageUrl: string | null;
}

function makeSlideId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type SettingsTab = "profile" | "account" | "password" | "watermark" | "carousel" | "bookingTypes" | "billing";

export default function SettingsPage() {
  const { t } = useLanguage();
  const { data: authSession } = useSession();
  const searchParams = useSearchParams();
  // Permet un lien direct vers un onglet précis (ex: /dashboard/settings?tab=billing depuis
  // l'astuce IBAN de InvoiceForm.tsx, 31/07/2026) — même patron que ?contractId= sur
  // /dashboard/invoices/new.
  const initialTab = (searchParams.get("tab") as SettingsTab | null) || "profile";
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  // Suppression de compte (droit à l'effacement RGPD) — réservée au rôle OWNER, voir
  // POST /api/account/delete. Double confirmation volontaire (mot de passe + saisie du mot
  // "SUPPRIMER") avant l'appel réel, vu l'irréversibilité de l'action.
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteAccount() {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data?.error || t("gm.httpError"));
        setDeleteLoading(false);
        return;
      }
      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleteError(t("gm.networkError"));
      setDeleteLoading(false);
    }
  }

  const TABS: { key: SettingsTab; label: string; icon: JSX.Element }[] = [
    { key: "profile", label: t("settings.profileSection"), icon: <TabIconUser /> },
    { key: "account", label: t("settings.accountSection"), icon: <TabIconAt /> },
    { key: "password", label: t("settings.passwordSection"), icon: <TabIconLock /> },
    { key: "watermark", label: t("settings.watermarkSection"), icon: <TabIconDroplet /> },
    { key: "carousel", label: t("settings.carouselSection"), icon: <TabIconImages /> },
    { key: "bookingTypes", label: t("settings.bookingTypesSection"), icon: <TabIconCalendar /> },
    { key: "billing", label: t("settings.billingSection"), icon: <TabIconCard /> },
  ];

  // Profil studio (affiché aux clients : couvertures de galerie, site public...)
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [studioName, setStudioName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [aboutTitle, setAboutTitle] = useState("");
  const [aboutBody, setAboutBody] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compte connecté (distinct du studio : voir /api/settings)
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Mot de passe
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkText, setWatermarkText] = useState("");

  // Carrousel (site public, affiché juste sous le header de la page d'accueil du studio)
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlideDTO[]>([]);
  const [carouselUploadingId, setCarouselUploadingId] = useState<string | null>(null);
  const [carouselSaving, setCarouselSaving] = useState(false);
  const [carouselSaved, setCarouselSaved] = useState(false);
  const [carouselError, setCarouselError] = useState<string | null>(null);
  // Fichier en attente de recadrage (glisser/zoomer) avant l'upload effectif de la slide.
  const [carouselCropTarget, setCarouselCropTarget] = useState<{ slideId: string; file: File } | null>(
    null
  );

  // Facturation (31/07/2026, demande d'Adriel : refonte pro de la facturation) — mentions
  // légales/bancaires affichées sur le PDF des factures, voir StudioSettings dans
  // schema.prisma et src/lib/pdf.tsx (renderInvoicePdf).
  const [legalForm, setLegalForm] = useState("");
  const [siret, setSiret] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [vatExempt, setVatExempt] = useState(true);
  // Taux de TVA par défaut (31/07/2026, demande d'Adriel) — appliqué automatiquement à chaque
  // facture/contrat sans ressaisie, voir src/lib/studioVat.ts.
  const [vatRate, setVatRate] = useState(20);
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  // Nom de la banque (31/07/2026, demande d'Adriel) — renseigné une fois ici, réutilisé
  // automatiquement dans l'email de facture et sur /i/[id] (voir sendInvoiceEmail).
  const [bankName, setBankName] = useState("");
  const [invoiceLegalMentions, setInvoiceLegalMentions] = useState("");
  const [invoiceNumberPrefix, setInvoiceNumberPrefix] = useState("");
  const [billingSaved, setBillingSaved] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSaving, setBillingSaving] = useState(false);

  const [bookingTypes, setBookingTypes] = useState<BookingTypeDTO[]>([]);
  const [newType, setNewType] = useState({ name: "", durationMinutes: 60, priceCents: 0 });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  function loadSettings() {
    return fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setWatermarkEnabled(d.studio?.settings?.watermarkEnabled ?? true);
        setWatermarkText(d.studio?.settings?.watermarkText || "");
        setLogoUrl(d.studio?.logoUrl || null);
        setStudioName(d.studio?.name || "");
        setContactEmail(d.studio?.settings?.contactEmail || "");
        setContactPhone(d.studio?.settings?.contactPhone || "");
        setAddress(d.studio?.settings?.address || "");
        setInstagramUrl(d.studio?.settings?.instagramUrl || "");
        setFacebookUrl(d.studio?.settings?.facebookUrl || "");
        setAboutTitle(d.studio?.settings?.aboutTitle || "");
        setAboutBody(d.studio?.settings?.aboutBody || "");
        setAccountName(d.user?.name || "");
        setAccountEmail(d.user?.email || "");
        setLegalForm(d.studio?.settings?.legalForm || "");
        setSiret(d.studio?.settings?.siret || "");
        setVatNumber(d.studio?.settings?.vatNumber || "");
        setVatExempt(d.studio?.settings?.vatExempt ?? true);
        setVatRate(d.studio?.settings?.vatRate ?? 20);
        setIban(d.studio?.settings?.iban || "");
        setBic(d.studio?.settings?.bic || "");
        setBankName(d.studio?.settings?.bankName || "");
        setInvoiceLegalMentions(d.studio?.settings?.invoiceLegalMentions || "");
        setInvoiceNumberPrefix(d.studio?.settings?.invoiceNumberPrefix || "");
        setCarouselSlides(
          Array.isArray(d.studio?.settings?.carouselSlides) ? d.studio.settings.carouselSlides : []
        );
      });
  }
  function loadTypes() {
    return fetch("/api/booking-types")
      .then((r) => r.json())
      .then((d) => setBookingTypes(d.bookingTypes || []));
  }
  useEffect(() => {
    Promise.all([loadSettings(), loadTypes()]).finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: studioName,
          contactEmail,
          contactPhone,
          address,
          instagramUrl,
          facebookUrl,
          aboutTitle,
          aboutBody,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProfileError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      loadSettings();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {
      setProfileError(t("settings.serverUnreachable"));
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
    // Autorise de resélectionner le même fichier ensuite (ex: après avoir annulé).
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadLogoBlob(blob: Blob) {
    setCropFile(null);
    setLogoUploading(true);
    setProfileError(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "logo.jpg");
      const res = await fetch("/api/settings/logo", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      setLogoUrl(data.logoUrl);
    } catch {
      setProfileError(t("settings.serverUnreachable"));
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    setLogoUploading(true);
    try {
      await fetch("/api/settings/logo", { method: "DELETE" });
      setLogoUrl(null);
    } finally {
      setLogoUploading(false);
    }
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccountError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: accountName, userEmail: accountEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAccountError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch {
      setAccountError(t("settings.serverUnreachable"));
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError(t("settings.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t("settings.passwordTooShort"));
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      setPasswordLoading(false);
      if (!res.ok) {
        setPasswordError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch {
      setPasswordLoading(false);
      setPasswordError(t("settings.serverUnreachable"));
    }
  }

  async function saveWatermark(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watermarkEnabled, watermarkText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      // Recharge depuis le serveur pour être sûr d'afficher ce qui est réellement
      // enregistré en base, plutôt que de faire confiance à l'état local optimiste.
      loadSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError(t("settings.serverUnreachable"));
    }
  }

  function addCarouselSlide() {
    setCarouselSlides((slides) => [...slides, { id: makeSlideId(), text: "", imageUrl: null }]);
  }

  function updateCarouselSlideText(id: string, text: string) {
    setCarouselSlides((slides) => slides.map((s) => (s.id === id ? { ...s, text } : s)));
  }

  function removeCarouselSlide(id: string) {
    setCarouselSlides((slides) => slides.filter((s) => s.id !== id));
    // Best effort : libère le fichier stocké, sans bloquer l'UI sur le résultat.
    fetch(`/api/settings/carousel-image/${id}`, { method: "DELETE" }).catch(() => {});
  }

  function moveCarouselSlide(id: string, direction: -1 | 1) {
    setCarouselSlides((slides) => {
      const index = slides.findIndex((s) => s.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= slides.length) return slides;
      const next = [...slides];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function uploadCarouselSlideImage(id: string, file: Blob) {
    setCarouselUploadingId(id);
    setCarouselError(null);
    try {
      const formData = new FormData();
      formData.append("file", file, "slide.jpg");
      const res = await fetch(`/api/settings/carousel-image/${id}`, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCarouselError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      setCarouselSlides((slides) => slides.map((s) => (s.id === id ? { ...s, imageUrl: data.imageUrl } : s)));
    } catch {
      setCarouselError(t("settings.serverUnreachable"));
    } finally {
      setCarouselUploadingId(null);
    }
  }

  async function saveCarousel(e: React.FormEvent) {
    e.preventDefault();
    setCarouselError(null);
    setCarouselSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carouselSlides }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCarouselError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      setCarouselSaved(true);
      setTimeout(() => setCarouselSaved(false), 2000);
    } catch {
      setCarouselError(t("settings.serverUnreachable"));
    } finally {
      setCarouselSaving(false);
    }
  }

  async function saveBilling(e: React.FormEvent) {
    e.preventDefault();
    setBillingError(null);
    setBillingSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalForm,
          siret,
          vatNumber,
          vatExempt,
          vatRate,
          iban,
          bic,
          bankName,
          invoiceLegalMentions,
          invoiceNumberPrefix,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBillingError(data?.error ? String(data.error) : `${t("common.error")} ${res.status}`);
        return;
      }
      setBillingSaved(true);
      setTimeout(() => setBillingSaved(false), 2000);
    } catch {
      setBillingError(t("settings.serverUnreachable"));
    } finally {
      setBillingSaving(false);
    }
  }

  async function addBookingType(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/booking-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newType),
    });
    setNewType({ name: "", durationMinutes: 60, priceCents: 0 });
    loadTypes();
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("settings.title")}</h1>

      {/* Sous-menu : une section à la fois, plutôt qu'une longue page à faire défiler.
          Redesign du 03-04/08/2026 (demande d'Adriel, 6 passes) : (1) pastilles icône +
          libellé au lieu du soulignement texte qui wrappait ; (2) tentative de scroll
          horizontal ; (3) 7 pastilles à largeur égale (flex-1) avec libellé masqué sous `sm` ;
          (4) libellés raccourcis + icône masquée sous `sm` au lieu du texte ; (5) nav sortie
          du `max-w-2xl` pour utiliser toute la largeur, mais scroll horizontal encore en
          secours (`overflow-x-auto`) ; (6) "je ne veux pas qu'on scrolle de gauche à droite"
          → le scroll horizontal N'EST PLUS ACCEPTABLE, même en dernier recours. Solution
          finale : `flex-wrap` — les pastilles gardent leur largeur naturelle (texte jamais
          tronqué) et RETOMBENT sur une deuxième ligne si la largeur du panneau ne suffit pas,
          au lieu de déborder ou de scroller. Contrairement à la version 1 (soulignement texte
          qui wrappait "de façon désordonnée"), des pastilles de même hauteur avec un fond
          commun s'alignent proprement même sur 2 lignes. */}
      <nav className="mt-6 flex flex-wrap gap-1.5 rounded-xl bg-gray-100 p-1.5">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            onClick={() => setTab(tabDef.key)}
            aria-current={tab === tabDef.key ? "page" : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === tabDef.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className={`shrink-0 ${tab === tabDef.key ? "text-brand-600" : "text-gray-400"}`}>
              {tabDef.icon}
            </span>
            <span>{tabDef.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-6 max-w-2xl space-y-10">
        {tab === "profile" && (
          <form onSubmit={saveProfile} className="space-y-6">
            {/* Identité — logo + nom, la partie la plus visible aux clients (avatar sidebar,
                couvertures de galerie, site public). Section à part pour que ce soit la
                première chose vue en arrivant sur l'onglet (redesign du 03/08/2026, demande
                d'Adriel : "plus pro et sectionné" plutôt qu'un unique long formulaire). */}
            <section className="card space-y-4">
              <h2 className="font-serif text-base font-semibold text-gray-900">
                {t("settings.profile.identitySection")}
              </h2>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={studioName} className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-600">
                    {studioName?.trim()?.[0]?.toUpperCase() || "?"}
                  </span>
                )}
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-600">{t("settings.logoLabel")}</p>
                  <div className="flex items-center gap-3">
                    <label className="btn-secondary cursor-pointer text-xs">
                      {logoUploading ? t("settings.logoUploading") : t("settings.logoUpload")}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={logoUploading}
                        onChange={handleFileSelected}
                      />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={removeLogo}
                        disabled={logoUploading}
                        className="rounded border border-red-500 px-2.5 py-1 text-xs uppercase tracking-wide text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {t("settings.logoRemove")}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="max-w-sm">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.studioNameLabel")}
                </label>
                <input className="input w-full" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
              </div>
            </section>

            {/* Coordonnées — visibles sur le site public et utilisées côté système (email de
                contact = destinataire des messages du formulaire de contact, voir
                POST /api/contact). */}
            <section className="card space-y-4">
              <h2 className="font-serif text-base font-semibold text-gray-900">
                {t("settings.profile.contactSection")}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("settings.contactEmailLabel")}
                  </label>
                  <input
                    type="email"
                    className="input w-full"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("settings.contactPhoneLabel")}
                  </label>
                  <input
                    className="input w-full"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("settings.addressLabel")}
                  </label>
                  <input className="input w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              </div>
            </section>

            {/* Réseaux sociaux — section propre plutôt que mélangée aux coordonnées, pour
                bien distinguer "comment un client vous contacte" de "où vous suivre". */}
            <section className="card space-y-4">
              <h2 className="font-serif text-base font-semibold text-gray-900">
                {t("settings.profile.socialSection")}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("settings.instagramLabel")}
                  </label>
                  <input
                    className="input w-full"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("settings.facebookLabel")}
                  </label>
                  <input
                    className="input w-full"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* À propos — texte affiché sur la page publique du studio, section la plus
                longue (éditeur riche) donc placée en dernier. */}
            <section className="card space-y-4">
              <h2 className="font-serif text-base font-semibold text-gray-900">
                {t("settings.profile.aboutSection")}
              </h2>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.aboutTitleLabel")}
                </label>
                <input className="input w-full" value={aboutTitle} onChange={(e) => setAboutTitle(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.aboutBodyLabel")}
                </label>
                <RichTextEditor value={aboutBody} onChange={setAboutBody} />
              </div>
            </section>

            <div>
              <button type="submit" className="btn-primary text-sm">
                {t("common.save")}
              </button>
              {profileSaved && <span className="ml-2 text-sm text-green-600">{t("common.saved")}</span>}
              {profileError && <span className="ml-2 text-sm text-red-600">{profileError}</span>}
            </div>
          </form>
        )}

        {tab === "account" && (
          <form onSubmit={saveAccount} className="card space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.accountNameLabel")}
                </label>
                <input
                  className="input w-full"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.accountEmailLabel")}
                </label>
                <input
                  type="email"
                  className="input w-full"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary text-sm">
              {t("common.save")}
            </button>
            {accountSaved && <span className="ml-2 text-sm text-green-600">{t("common.saved")}</span>}
            {accountError && <span className="ml-2 text-sm text-red-600">{accountError}</span>}
          </form>
        )}

        {tab === "account" && (authSession?.user as { role?: string } | undefined)?.role === "OWNER" && (
          <div className="card mt-4 border-red-200 bg-red-50/50 space-y-2">
            <h3 className="text-sm font-semibold text-red-700">{t("settings.dangerZoneTitle")}</h3>
            <p className="text-xs text-red-600">{t("settings.deleteAccountHint")}</p>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              {t("settings.deleteAccountButton")}
            </button>
          </div>
        )}

        {tab === "password" && (
          <form onSubmit={changePassword} className="card space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {t("settings.currentPasswordLabel")}
              </label>
              <input
                type="password"
                required
                className="input w-full"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.newPasswordLabel")}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="input w-full"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.confirmPasswordLabel")}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="input w-full"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" disabled={passwordLoading} className="btn-primary text-sm">
              {t("settings.changePasswordButton")}
            </button>
            {passwordSaved && <span className="ml-2 text-sm text-green-600">{t("settings.passwordChanged")}</span>}
            {passwordError && <span className="ml-2 text-sm text-red-600">{passwordError}</span>}
          </form>
        )}

        {tab === "watermark" && (
          <form onSubmit={saveWatermark} className="card space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={watermarkEnabled}
                onChange={(e) => setWatermarkEnabled(e.target.checked)}
              />
              {t("settings.enableWatermark")}
            </label>
            <input
              placeholder={t("settings.watermarkText")}
              className="input"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
            />
            <button type="submit" className="btn-primary text-sm">
              {t("common.save")}
            </button>
            {saved && <span className="ml-2 text-sm text-green-600">{t("common.saved")}</span>}
            {saveError && <span className="ml-2 text-sm text-red-600">{saveError}</span>}
          </form>
        )}

        {tab === "carousel" && (
          <form onSubmit={saveCarousel} className="card space-y-4">
            {carouselSlides.length === 0 && (
              <p className="text-sm text-gray-500">{t("settings.carouselEmpty")}</p>
            )}
            <div className="space-y-4">
              {carouselSlides.map((slide, index) => (
                <div key={slide.id} className="flex gap-4 rounded-lg border border-gray-200 p-3">
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded bg-gray-100">
                    {slide.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                        {t("settings.carouselBackgroundLabel")}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      className="input w-full"
                      placeholder={t("settings.carouselTextPlaceholder")}
                      value={slide.text}
                      onChange={(e) => updateCarouselSlideText(slide.id, e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="btn-secondary cursor-pointer text-xs">
                        {carouselUploadingId === slide.id
                          ? t("settings.carouselUploading")
                          : t("settings.carouselUpload")}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={carouselUploadingId === slide.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setCarouselCropTarget({ slideId: slide.id, file });
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => moveCarouselSlide(slide.id, -1)}
                        disabled={index === 0}
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                        aria-label="Monter"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCarouselSlide(slide.id, 1)}
                        disabled={index === carouselSlides.length - 1}
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCarouselSlide(slide.id)}
                        className="ml-auto rounded border border-red-500 px-2.5 py-1 text-xs uppercase tracking-wide text-red-600 hover:bg-red-50"
                      >
                        {t("settings.carouselRemoveSlide")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addCarouselSlide} className="btn-secondary text-sm">
              {t("settings.carouselAddSlide")}
            </button>
            <div>
              <button type="submit" disabled={carouselSaving} className="btn-primary text-sm">
                {t("common.save")}
              </button>
              {carouselSaved && <span className="ml-2 text-sm text-green-600">{t("common.saved")}</span>}
              {carouselError && <span className="ml-2 text-sm text-red-600">{carouselError}</span>}
            </div>
          </form>
        )}

        {tab === "bookingTypes" && (
          <div className="card space-y-3">
            <form onSubmit={addBookingType} className="flex flex-wrap items-end gap-3">
              <input
                placeholder={t("settings.bookingTypeName")}
                required
                className="input"
                value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
              />
              <div>
                <label className="mb-1 block text-xs text-gray-600">{t("settings.duration")}</label>
                <input
                  type="number"
                  className="input w-24"
                  value={newType.durationMinutes}
                  onChange={(e) => setNewType({ ...newType, durationMinutes: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600">{t("settings.price")}</label>
                <input
                  type="number"
                  step="0.01"
                  className="input w-24"
                  value={newType.priceCents / 100}
                  onChange={(e) =>
                    setNewType({ ...newType, priceCents: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </div>
              <button type="submit" className="btn-secondary text-sm">
                {t("common.add")}
              </button>
            </form>
            <ul className="mt-2 divide-y divide-gray-100">
              {bookingTypes.map((bt) => (
                <li key={bt.id} className="flex justify-between py-2 text-sm">
                  <span>
                    {bt.name} — {bt.durationMinutes} min
                  </span>
                  {bt.priceCents && <span>{(bt.priceCents / 100).toFixed(2)} €</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "billing" && (
          <form onSubmit={saveBilling} className="card space-y-4">
            <p className="text-xs text-gray-500">{t("settings.billingHint")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.legalFormLabel")}
                </label>
                <input
                  className="input w-full"
                  placeholder={t("settings.legalFormPlaceholder")}
                  value={legalForm}
                  onChange={(e) => setLegalForm(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.siretLabel")}</label>
                <input className="input w-full" value={siret} onChange={(e) => setSiret(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {t("settings.invoicePrefixLabel")}
                </label>
                <input
                  className="input w-full"
                  placeholder="FAC"
                  value={invoiceNumberPrefix}
                  onChange={(e) => setInvoiceNumberPrefix(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vatExempt} onChange={(e) => setVatExempt(e.target.checked)} />
              {t("settings.vatExemptLabel")}
            </label>
            {!vatExempt && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("settings.vatNumberLabel")}
                  </label>
                  <input className="input w-full" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("settings.vatRateLabel")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    className="input w-full"
                    value={vatRate}
                    onChange={(e) => setVatRate(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  />
                  <p className="mt-1 text-xs text-gray-400">{t("settings.vatRateHint")}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.ibanLabel")}</label>
                <input className="input w-full" value={iban} onChange={(e) => setIban(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.bicLabel")}</label>
                <input className="input w-full" value={bic} onChange={(e) => setBic(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.bankNameLabel")}</label>
                <input className="input w-full" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
            </div>
            {iban && (
              <p className="text-xs text-gray-400">{t("settings.ibanAutoHint")}</p>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {t("settings.invoiceLegalMentionsLabel")}
              </label>
              <textarea
                className="input min-h-[90px] w-full"
                placeholder={t("settings.invoiceLegalMentionsPlaceholder")}
                value={invoiceLegalMentions}
                onChange={(e) => setInvoiceLegalMentions(e.target.value)}
              />
            </div>

            <button type="submit" disabled={billingSaving} className="btn-primary text-sm">
              {t("common.save")}
            </button>
            {billingSaved && <span className="ml-2 text-sm text-green-600">{t("common.saved")}</span>}
            {billingError && <span className="ml-2 text-sm text-red-600">{billingError}</span>}
          </form>
        )}
      </div>

      {cropFile && (
        <LogoCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={uploadLogoBlob} t={t} />
      )}
      {carouselCropTarget && (
        <BannerCropModal
          file={carouselCropTarget.file}
          onCancel={() => setCarouselCropTarget(null)}
          onConfirm={(blob) => {
            const { slideId } = carouselCropTarget;
            setCarouselCropTarget(null);
            uploadCarouselSlideImage(slideId, blob);
          }}
          t={t}
        />
      )}
      <Modal
        open={deleteModalOpen}
        onClose={() => {
          if (deleteLoading) return;
          setDeleteModalOpen(false);
          setDeletePassword("");
          setDeleteConfirmText("");
          setDeleteError(null);
        }}
        title={t("settings.deleteModalTitle")}
        widthClassName="max-w-md"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={deleteLoading}
              onClick={() => {
                setDeleteModalOpen(false);
                setDeletePassword("");
                setDeleteConfirmText("");
                setDeleteError(null);
              }}
            >
              {t("settings.cancel")}
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              disabled={
                deleteLoading ||
                !deletePassword ||
                deleteConfirmText !== t("settings.deleteModalConfirmWord")
              }
              onClick={deleteAccount}
            >
              {deleteLoading ? t("settings.deleteModalDeleting") : t("settings.deleteModalConfirmButton")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t("settings.deleteModalBody")}</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("settings.deleteModalPasswordLabel")}</label>
            <input
              type="password"
              className="input"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("settings.deleteModalConfirmLabel")}{" "}
              <span className="font-mono font-semibold">{t("settings.deleteModalConfirmWord")}</span>
            </label>
            <input
              type="text"
              className="input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
          </div>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        </div>
      </Modal>
    </div>
  );
}

// Icônes des onglets Paramètres — même style que DashboardSidebar.tsx (stroke 1.8, viewBox 24)
// pour rester visuellement cohérent entre la nav principale et ce sous-menu.
function TabIconUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5" strokeLinecap="round" />
    </svg>
  );
}

function TabIconAt() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TabIconLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" strokeLinecap="round" />
    </svg>
  );
}

function TabIconDroplet() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5S6 10 6 14.5a6 6 0 0 0 12 0C18 10 12 3.5 12 3.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function TabIconImages() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="14" height="12" rx="2" />
      <path d="M7 21h14V9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="9.5" r="1.3" />
      <path d="M4 15l3.5-3.5L11 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TabIconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

function TabIconCard() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" strokeLinecap="round" />
      <path d="M6 14.5h4" strokeLinecap="round" />
    </svg>
  );
}
