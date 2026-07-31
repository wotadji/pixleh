"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";
import { ContractForm, ContractFormValues } from "@/components/studio/ContractForm";
import { DEFAULT_CONTRACT_TEMPLATE, isContractTemplateId } from "@/lib/contractTemplates";

interface ClientOption {
  id: string;
  name: string;
}

interface ContractDTO {
  title: string;
  status: string;
  bodyHtml: string;
  client: { id: string } | null;
  studioSignatureDataUrl: string | null;
  place: string | null;
  template: string | null;
  amountCents: number | null;
  createdAt: string;
}

export default function EditContractPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { t, locale } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [studioName, setStudioName] = useState("");
  const [studioBrandColor, setStudioBrandColor] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch(`/api/contracts/${params.id}`).then((r) => r.json()),
    ])
      .then(([clientsData, settingsData, contractData]) => {
        setClients(clientsData.clients || []);
        setStudioName(settingsData.studio?.name || "");
        setStudioBrandColor(settingsData.studio?.brandColor || null);
        if (contractData.contract) setContract(contractData.contract);
        else setNotFound(true);
      })
      .finally(() => setPageLoading(false));
  }, [params.id]);

  if (pageLoading) return <PageSpinner />;
  if (notFound || !contract) return <p className="text-sm text-gray-500">{t("contractForm.notFound")}</p>;

  async function handleSubmit(values: ContractFormValues) {
    setLoading(true);
    const res = await fetch(`/api/contracts/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, clientId: values.clientId || null }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t("common.error"));
      return;
    }
    router.push(`/dashboard/contracts`);
  }

  return (
    <div>
      <Link href="/dashboard/contracts" className="text-sm text-gray-500 hover:text-gray-800">
        ← {t("contracts.title")}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{t("contractForm.editTitle")}</h1>

      {contract.status === "SIGNED" ? (
        <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
          {t("contractForm.alreadySigned")}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">{t("contractForm.editSubtitle")}</p>
          <ContractForm
            clients={clients}
            studioName={studioName}
            studioBrandColor={studioBrandColor}
            initial={{
              title: contract.title,
              clientId: contract.client?.id || "",
              bodyHtml: contract.bodyHtml,
              studioSignatureDataUrl: contract.studioSignatureDataUrl,
              place: contract.place || "",
              template: isContractTemplateId(contract.template) ? contract.template : DEFAULT_CONTRACT_TEMPLATE,
              amountCents: contract.amountCents ?? null,
            }}
            submitLabel={t("contractForm.save")}
            submittingLabel={t("contractForm.saving")}
            submitting={loading}
            onSubmit={handleSubmit}
            createdAtDisplay={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(contract.createdAt))}
          />
        </>
      )}
    </div>
  );
}
