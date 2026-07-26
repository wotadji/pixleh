"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface ClientOption {
  id: string;
  name: string;
}

type GalleryVisibility = "CLIENT" | "GUEST" | "PORTFOLIO";

export function NewGalleryForm({ existingTags = [] }: { existingTags?: string[] }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState({
    title: "",
    clientId: "",
    password: "",
    categoryTag: "",
    allowDownload: true,
    allowFavorites: true,
    showWatermark: true,
  });
  // "Visible par" : pris en compte tant qu'aucun set n'est créé dans la galerie — dès
  // qu'un set est créé, c'est sa propre visibilité qui prend le relais (voir
  // Gallery.defaultVisibility dans schema.prisma).
  const [visibility, setVisibility] = useState<GalleryVisibility[]>(["CLIENT"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []))
      .catch(() => {});
  }, []);

  function toggleVisibility(v: GalleryVisibility) {
    setVisibility((prev) => {
      const has = prev.includes(v);
      // Toujours garder au moins une catégorie cochée (une galerie doit rester visible
      // quelque part) : le dernier interrupteur ne peut pas se désactiver tout seul.
      if (has && prev.length === 1) return prev;
      return has ? prev.filter((x) => x !== v) : [...prev, v];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/galleries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        clientId: form.clientId || null,
        password: form.password || null,
        categoryTag: form.categoryTag.trim() || null,
        defaultVisibility: visibility,
      }),
    });
    setLoading(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Un quota atteint (voir /lib/quotas.ts) renvoie un message déjà explicite ("Limite de
      // X galerie(s) atteinte...") — on l'affiche tel quel plutôt que le message générique,
      // qui ne serait pas utile ici. Les erreurs de validation (zod) restent génériques.
      setError(typeof data?.error === "string" ? data.error : t("galleryForm.createError"));
      return;
    }
    router.push(`/dashboard/galleries/${data.gallery.id}`);
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-2xl font-semibold">{t("galleryForm.title")}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t("galleryForm.titleLabel")}</label>
          <input
            required
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("galleryForm.clientLabel")}</label>
          <select
            className="input"
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          >
            <option value="">{t("common.noClientOption")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("gs.categoryTag")}</label>
          <input
            type="text"
            className="input"
            placeholder={t("gs.categoryTagPlaceholder")}
            value={form.categoryTag}
            onChange={(e) => setForm({ ...form, categoryTag: e.target.value })}
            list="new-gallery-category-tag-options"
            autoComplete="off"
          />
          {/* Autocomplétion native : suggère les tags déjà utilisés sur les autres
              galeries du studio (ex: "Mariage", "Portrait") ; taper un nom qui n'existe
              pas encore le crée simplement à la création. */}
          <datalist id="new-gallery-category-tag-options">
            {existingTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          {existingTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {existingTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setForm({ ...form, categoryTag: tag })}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    form.categoryTag === tag
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("galleryForm.passwordLabel")}</label>
          <input
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div>
          <p className="mb-1 block text-sm font-medium">{t("gm.setVisibilityLabel")}</p>
          <p className="mb-1.5 text-xs text-gray-500">{t("galleryForm.visibilityHint")}</p>
          <div className="space-y-1.5">
            {(
              [
                { key: "CLIENT", label: t("gm.setVisibilityClient") },
                { key: "GUEST", label: t("gm.setVisibilityGuest") },
                { key: "PORTFOLIO", label: t("gm.setVisibilityPortfolio") },
              ] as { key: GalleryVisibility; label: string }[]
            ).map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={visibility.includes(opt.key)}
                  onChange={() => toggleVisibility(opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allowDownload}
              onChange={(e) => setForm({ ...form, allowDownload: e.target.checked })}
            />
            {t("galleryForm.allowDownload")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allowFavorites}
              onChange={(e) => setForm({ ...form, allowFavorites: e.target.checked })}
            />
            {t("galleryForm.allowFavorites")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.showWatermark}
              onChange={(e) => setForm({ ...form, showWatermark: e.target.checked })}
            />
            {t("galleryForm.showWatermark")}
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t("common.creating") : t("galleryForm.create")}
        </button>
      </form>
    </div>
  );
}
