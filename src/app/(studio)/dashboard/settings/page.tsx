"use client";

import { useEffect, useRef, useState } from "react";
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

type SettingsTab = "profile" | "account" | "password" | "watermark" | "carousel" | "bookingTypes";

export default function SettingsPage() {
  const { t } = useLanguage();
  const { data: authSession } = useSession();
  const [tab, setTab] = useState<SettingsTab>("profile");

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

  const TABS: { key: SettingsTab; label: string }[] = [
    { key: "profile", label: t("settings.profileSection") },
    { key: "account", label: t("settings.accountSection") },
    { key: "password", label: t("settings.passwordSection") },
    { key: "watermark", label: t("settings.watermarkSection") },
    { key: "carousel", label: t("settings.carouselSection") },
    { key: "bookingTypes", label: t("settings.bookingTypesSection") },
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
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold">{t("settings.title")}</h1>

      {/* Sous-menu : une section à la fois, plutôt qu'une longue page à faire défiler. */}
      <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-gray-200">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            onClick={() => setTab(tabDef.key)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              tab === tabDef.key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tabDef.label}
          </button>
        ))}
      </nav>

      <div className="mt-6 space-y-10">
        {tab === "profile" && (
          <form onSubmit={saveProfile} className="card space-y-4">
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

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.studioNameLabel")}</label>
              <input className="input w-full" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
            </div>

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
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.addressLabel")}</label>
                <input className="input w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.instagramLabel")}</label>
                <input
                  className="input w-full"
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.facebookLabel")}</label>
                <input
                  className="input w-full"
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.aboutTitleLabel")}</label>
              <input className="input w-full" value={aboutTitle} onChange={(e) => setAboutTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("settings.aboutBodyLabel")}</label>
              <RichTextEditor value={aboutBody} onChange={setAboutBody} />
            </div>

            <button type="submit" className="btn-primary text-sm">
              {t("common.save")}
            </button>
            {profileSaved && <span className="ml-2 text-sm text-green-600">{t("common.saved")}</span>}
            {profileError && <span className="ml-2 text-sm text-red-600">{profileError}</span>}
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
