"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface ClientOption {
  id: string;
  name: string;
}

export default function NewContractPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState({ title: "", clientId: "", bodyHtml: "" });
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []))
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, clientId: form.clientId || null }),
    });
    setLoading(false);
    const data = await res.json();
    if (res.ok) router.push(`/dashboard/contracts`);
    else alert(data?.error || t("common.error"));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold">{t("contractForm.title")}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          required
          placeholder={t("contractForm.titlePlaceholder")}
          className="input"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
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
        <textarea
          required
          rows={12}
          placeholder={t("contractForm.bodyPlaceholder")}
          className="input"
          value={form.bodyHtml}
          onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
        />
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t("common.creating") : t("contractForm.create")}
        </button>
      </form>
    </div>
  );
}
