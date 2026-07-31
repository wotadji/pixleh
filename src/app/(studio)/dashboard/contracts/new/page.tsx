"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";
import { ContractForm, ContractFormValues } from "@/components/studio/ContractForm";
import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contractTemplates";

interface ClientOption {
  id: string;
  name: string;
}

export default function NewContractPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [studioName, setStudioName] = useState("");
  const [studioBrandColor, setStudioBrandColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      // Sert uniquement à pré-remplir l'onglet "Texte" de SignatureField avec le nom du
      // studio (modifiable) et à colorer l'aperçu des templates de PDF — même endpoint que
      // la page Réglages.
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([clientsData, settingsData]) => {
        setClients(clientsData.clients || []);
        setStudioName(settingsData.studio?.name || "");
        setStudioBrandColor(settingsData.studio?.brandColor || null);
      })
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  async function handleSubmit(values: ContractFormValues) {
    setLoading(true);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, clientId: values.clientId || null }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t("common.error"));
      return;
    }
    // Le client a été prévenu par email (voir POST /api/contracts) uniquement si un client
    // était sélectionné — on ne bloque pas la redirection sur un échec d'envoi (SMTP absent,
    // etc.), mais on prévient le studio pour qu'il puisse partager le lien manuellement.
    if (values.clientId && !data.emailSent) {
      alert(
        data.emailError
          ? `Contrat créé, mais l'email n'a pas pu être envoyé : ${data.emailError}`
          : "Contrat créé, mais l'email n'a pas pu être envoyé au client."
      );
    }
    router.push(`/dashboard/contracts`);
  }

  return (
    <div>
      <Link href="/dashboard/contracts" className="text-sm text-gray-500 hover:text-gray-800">
        ← {t("contracts.title")}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{t("contractForm.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("contractForm.subtitle")}</p>

      <ContractForm
        clients={clients}
        studioName={studioName}
        studioBrandColor={studioBrandColor}
        initial={{
          title: "",
          clientId: "",
          bodyHtml: "",
          studioSignatureDataUrl: null,
          place: "",
          template: DEFAULT_CONTRACT_TEMPLATE,
          amountCents: null,
        }}
        submitLabel={t("contractForm.create")}
        submittingLabel={t("common.creating")}
        submitting={loading}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
