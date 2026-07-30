"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type SetVisibility = "CLIENT" | "GUEST" | "PORTFOLIO";

interface CollectionRow {
  id: string;
  title: string;
  visibility: SetVisibility[];
  isPortfolioDefault: boolean;
}

export function SetVisibilityManager({
  galleryId,
  initialCollections,
}: {
  galleryId: string;
  initialCollections: CollectionRow[];
}) {
  const { t } = useLanguage();
  const [collections, setCollections] = useState(initialCollections);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le set "Portfolio" n'apparaît jamais ici (voir client/galleries/[id]/page.tsx, qui le
  // filtre avant de passer initialCollections) et PORTFOLIO n'est donc volontairement pas
  // proposé comme option : la visibilité publique du profil studio reste une décision du
  // studio, jamais du client — demandé par Adriel le 29/07/2026.
  const OPTIONS: { key: SetVisibility; label: string }[] = [
    { key: "CLIENT", label: t("client.visibility.optionClient") },
    { key: "GUEST", label: t("client.visibility.optionGuest") },
  ];

  async function toggle(collectionId: string, key: SetVisibility) {
    const current = collections.find((c) => c.id === collectionId);
    if (!current) return;
    const has = current.visibility.includes(key);
    const nextVisibility = has
      ? current.visibility.filter((v) => v !== key)
      : [...current.visibility, key];

    setSavingId(collectionId);
    setError(null);
    const res = await fetch(`/api/client-portal/galleries/${galleryId}/collections/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: nextVisibility }),
    });
    setSavingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || t("client.visibility.error"));
      return;
    }
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? { ...c, visibility: nextVisibility } : c))
    );
  }

  if (collections.length === 0) {
    return <p className="text-sm text-gray-500">{t("client.visibility.empty")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {collections.map((c) => (
        <div key={c.id} className="rounded-lg border border-gray-100 p-3">
          <p className="text-sm font-medium text-gray-900">
            {c.title}
            {c.isPortfolioDefault && (
              <span className="ml-2 rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                {t("client.visibility.portfolioBadge")}
              </span>
            )}
          </p>
          <div className="mt-2 space-y-1.5">
            {OPTIONS.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  disabled={savingId === c.id}
                  checked={c.visibility.includes(opt.key)}
                  onChange={() => toggle(c.id, opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
