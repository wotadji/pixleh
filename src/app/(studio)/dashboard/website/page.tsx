"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface StudioSettingsForm {
  heroTitle: string;
  heroSubtitle: string;
  aboutTitle: string;
  aboutBody: string;
  contactEmail: string;
  contactPhone: string;
  instagramUrl: string;
  facebookUrl: string;
}

export default function WebsiteSettingsPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState<StudioSettingsForm>({
    heroTitle: "",
    heroSubtitle: "",
    aboutTitle: "",
    aboutBody: "",
    contactEmail: "",
    contactPhone: "",
    instagramUrl: "",
    facebookUrl: "",
  });
  const [studioSlug, setStudioSlug] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const studio = d.studio;
        if (!studio) return;
        setStudioSlug(studio.slug);
        const hero = studio.pages?.[0]?.sections?.find((s: { type: string }) => s.type === "hero");
        setForm({
          heroTitle: hero?.title || "",
          heroSubtitle: hero?.subtitle || "",
          aboutTitle: studio.settings?.aboutTitle || "",
          aboutBody: studio.settings?.aboutBody || "",
          contactEmail: studio.settings?.contactEmail || "",
          contactPhone: studio.settings?.contactPhone || "",
          instagramUrl: studio.settings?.instagramUrl || "",
          facebookUrl: studio.settings?.facebookUrl || "",
        });
      })
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold">{t("website.title")}</h1>
      {studioSlug && (
        <p className="mt-1 text-sm text-gray-500">
          {t("website.publicUrl")} : <span className="font-mono">/s/{studioSlug}</span>
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <fieldset className="space-y-3">
          <legend className="font-medium">{t("website.homeSection")}</legend>
          <input
            placeholder={t("website.heroTitle")}
            className="input"
            value={form.heroTitle}
            onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
          />
          <input
            placeholder={t("website.heroSubtitle")}
            className="input"
            value={form.heroSubtitle}
            onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-medium">{t("website.aboutSection")}</legend>
          <input
            placeholder={t("website.aboutTitle")}
            className="input"
            value={form.aboutTitle}
            onChange={(e) => setForm({ ...form, aboutTitle: e.target.value })}
          />
          <textarea
            placeholder={t("website.aboutBody")}
            rows={5}
            className="input"
            value={form.aboutBody}
            onChange={(e) => setForm({ ...form, aboutBody: e.target.value })}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-medium">{t("website.contactSection")}</legend>
          <input
            placeholder={t("website.contactEmail")}
            className="input"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
          <input
            placeholder={t("website.contactPhone")}
            className="input"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
          <input
            placeholder={t("website.instagram")}
            className="input"
            value={form.instagramUrl}
            onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
          />
          <input
            placeholder={t("website.facebook")}
            className="input"
            value={form.facebookUrl}
            onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })}
          />
        </fieldset>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t("common.saving") : t("common.save")}
        </button>
        {saved && <span className="ml-3 text-sm text-green-600">{t("common.saved")}</span>}
      </form>
    </div>
  );
}
