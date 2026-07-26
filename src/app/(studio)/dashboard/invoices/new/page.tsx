"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface ClientOption {
  id: string;
  name: string;
}
interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPriceCents: 0 }]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []))
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clientId || null,
        dueDate: dueDate || null,
        lineItems: items.filter((i) => i.description),
      }),
    });
    setLoading(false);
    if (res.ok) router.push("/dashboard/invoices");
    else alert(t("invoiceForm.createError"));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold">{t("invoiceForm.title")}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">{t("common.noClient")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          placeholder={t("invoiceForm.dueDate")}
        />

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder={t("invoiceForm.description")}
                className="input flex-1"
                value={item.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
              />
              <input
                type="number"
                min={1}
                className="input w-20"
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
              />
              <input
                type="number"
                step="0.01"
                min={0}
                className="input w-28"
                value={item.unitPriceCents / 100}
                onChange={(e) =>
                  updateItem(i, { unitPriceCents: Math.round(Number(e.target.value) * 100) })
                }
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems([...items, { description: "", quantity: 1, unitPriceCents: 0 }])}
            className="btn-secondary text-sm"
          >
            {t("invoiceForm.addLine")}
          </button>
        </div>

        <p className="text-right font-medium">
          {t("invoiceForm.total")} : {(total / 100).toFixed(2)} €
        </p>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t("common.creating") : t("invoiceForm.create")}
        </button>
      </form>
    </div>
  );
}
