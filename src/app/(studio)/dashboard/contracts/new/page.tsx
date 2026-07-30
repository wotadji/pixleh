"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";
import { RichTextEditor } from "@/components/studio/RichTextEditor";
import { SignatureField } from "@/components/studio/SignatureField";

interface ClientOption {
  id: string;
  name: string;
}

export default function NewContractPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [studioName, setStudioName] = useState("");
  const [form, setForm] = useState({ title: "", clientId: "", bodyHtml: "" });
  const [studioSignatureDataUrl, setStudioSignatureDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      // Sert uniquement à pré-remplir l'onglet "Texte" de SignatureField avec le nom du
      // studio (modifiable) — même endpoint que la page Réglages.
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([clientsData, settingsData]) => {
        setClients(clientsData.clients || []);
        setStudioName(settingsData.studio?.name || "");
      })
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Le textContent (pas innerHTML) sert à vérifier qu'il y a bien du contenu saisi — un
    // éditeur "vide" peut contenir un <br> ou une balise <p></p> résiduelle qui passerait
    // le required du textarea natif, d'où cette vérification manuelle avant l'envoi.
    if (!form.bodyHtml.replace(/<[^>]+>/g, "").trim()) {
      alert(t("contractForm.bodyRequired"));
      return;
    }
    setLoading(true);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, clientId: form.clientId || null, studioSignatureDataUrl }),
    });
    setLoading(false);
    const data = await res.json();
    if (res.ok) router.push(`/dashboard/contracts`);
    else alert(data?.error || t("common.error"));
  }

  return (
    <div>
      <Link href="/dashboard/contracts" className="text-sm text-gray-500 hover:text-gray-800">
        ← {t("contracts.title")}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{t("contractForm.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("contractForm.subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("contractForm.titleLabel")}
              </label>
              <input
                required
                placeholder={t("contractForm.titlePlaceholder")}
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("contractForm.clientLabel")}
              </label>
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
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t("contractForm.bodyLabel")}
            </label>
            <RichTextEditor
              value={form.bodyHtml}
              onChange={(html) => setForm({ ...form, bodyHtml: html })}
              placeholder={t("contractForm.bodyPlaceholder")}
              minHeightClassName="min-h-[380px]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t("contractForm.studioSignatureLabel")}
            </label>
            <SignatureField defaultText={studioName} onChange={setStudioSignatureDataUrl} />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <Link href="/dashboard/contracts" className="text-sm text-gray-600 hover:text-gray-900">
              {t("contractForm.cancel")}
            </Link>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? t("common.creating") : t("contractForm.create")}
            </button>
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("contractForm.howItWorksTitle")}</h2>
          <ol className="mt-4 space-y-4">
            {[t("contractForm.step1"), t("contractForm.step2"), t("contractForm.step3")].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-gray-600">{step}</p>
              </li>
            ))}
          </ol>
        </aside>
      </form>
    </div>
  );
}
