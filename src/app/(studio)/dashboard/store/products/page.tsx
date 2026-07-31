"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface ProductDTO {
  id: string;
  type: string;
  name: string;
  priceCents: number;
  active: boolean;
}

export default function ProductsPage() {
  const { t } = useLanguage();
  // "PRINT" retiré des types sélectionnables (31/07/2026, demande d'Adriel : "je veux que
  // Boutique — Produits soit géré dans le panel Administrateur [...] c'est un service de
  // pixleh pas du studio") — géré désormais uniquement dans /admin/print-catalog. On garde
  // le libellé dans TYPE_LABELS pour continuer d'afficher correctement d'éventuels produits
  // PRINT créés par le studio avant ce changement (voir le filtre ci-dessous).
  const TYPE_LABELS: Record<string, string> = {
    DIGITAL_DOWNLOAD: t("productType.digital"),
    PRINT: t("productType.print"),
    ALBUM: t("productType.album"),
    PACKAGE: t("productType.package"),
  };
  const CREATABLE_TYPES = ["DIGITAL_DOWNLOAD", "ALBUM", "PACKAGE"] as const;

  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [form, setForm] = useState({ type: "DIGITAL_DOWNLOAD", name: "", priceCents: 0 });
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  function load() {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .finally(() => setPageLoading(false));
  }
  useEffect(load, []);

  if (pageLoading) return <PageSpinner />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ type: "DIGITAL_DOWNLOAD", name: "", priceCents: 0 });
    setLoading(false);
    load();
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("products.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("products.printMovedToAdminNote")}</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("products.typeLabel")}</label>
          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {CREATABLE_TYPES.map((k) => (
              <option key={k} value={k}>
                {TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("products.nameLabel")}</label>
          <input
            required
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("products.priceLabel")}</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            className="input w-28"
            value={form.priceCents / 100}
            onChange={(e) => setForm({ ...form, priceCents: Math.round(Number(e.target.value) * 100) })}
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {t("common.add")}
        </button>
      </form>

      <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {products.length === 0 && <p className="p-6 text-sm text-gray-500">{t("products.empty")}</p>}
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-gray-500">{TYPE_LABELS[p.type]}</p>
            </div>
            <p className="font-medium">{(p.priceCents / 100).toFixed(2)} €</p>
          </div>
        ))}
      </div>
    </div>
  );
}
