"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";
import { InvoiceForm, InvoiceFormValues } from "@/components/studio/InvoiceForm";
import { DEFAULT_INVOICE_TEMPLATE } from "@/lib/invoiceTemplates";

interface ClientOption {
  id: string;
  name: string;
}
interface ContractOption {
  id: string;
  title: string;
  clientId: string | null;
  amountCents: number | null;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deuxième point d'entrée demandé par Adriel : /dashboard/invoices/new?contractId=... —
  // pré-remplit le contrat (et son client) depuis le bouton "Facturer" sur /dashboard/contracts.
  const prefillContractId = searchParams.get("contractId") || "";
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [studioBrandColor, setStudioBrandColor] = useState<string | null>(null);
  // Pré-cochage de la TVA sur une nouvelle facture (31/07/2026, demande d'Adriel : "j'ai
  // appliqué dans paramètre la TVA, sauf que j'ai encore le choix de la TVA dans new facture")
  // — le studio ne devrait pas avoir à recocher "Appliquer la TVA" à chaque facture s'il a déjà
  // indiqué dans Réglages > Facturation qu'il y est assujetti (vatExempt décoché). Reste
  // modifiable par facture (voir InvoiceForm) pour les cas particuliers, seule la valeur par
  // défaut change.
  const [defaultApplyVat, setDefaultApplyVat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/contracts").then((r) => r.json()),
    ])
      .then(([clientsData, settingsData, contractsData]) => {
        setClients(clientsData.clients || []);
        setStudioBrandColor(settingsData.studio?.brandColor || null);
        setDefaultApplyVat(settingsData.studio?.settings?.vatExempt === false);
        // Seuls les contrats signés (par le studio ET le client) peuvent être liés à une
        // facture — demande d'Adriel, 31/07/2026 : avant signature, les conditions/le montant
        // peuvent encore changer. Même règle appliquée côté serveur (voir invoiceSchema /
        // POST /api/invoices).
        setContracts(
          (contractsData.contracts || [])
            .filter((c: { status: string }) => c.status === "SIGNED")
            .map((c: { id: string; title: string; client: { id: string } | null; amountCents: number | null }) => ({
              id: c.id,
              title: c.title,
              clientId: c.client?.id || null,
              amountCents: c.amountCents,
            }))
        );
      })
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  const prefillContract = contracts.find((c) => c.id === prefillContractId);

  async function handleSubmit(values: InvoiceFormValues) {
    setLoading(true);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: values.clientId || null,
        guestClientName: !values.clientId ? values.guestClientName || null : null,
        contractId: values.clientId ? values.contractId || null : null,
        dueDate: values.dueDate || null,
        lineItems: values.lineItems,
        notes: values.notes || null,
        template: values.template,
        vatRate: values.applyVat ? values.vatRate : null,
      }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t("common.error"));
      return;
    }
    if (values.clientId && !data.emailSent) {
      alert(
        data.emailError
          ? `${t("invoiceForm.createdEmailFailed")} ${data.emailError}`
          : t("invoiceForm.createdEmailFailedGeneric")
      );
    }
    router.push("/dashboard/invoices");
  }

  return (
    <div>
      <Link href="/dashboard/invoices" className="text-sm text-gray-500 hover:text-gray-800">
        ← {t("invoices.title")}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{t("invoiceForm.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("invoiceForm.subtitle")}</p>

      <InvoiceForm
        clients={clients}
        contracts={contracts}
        studioBrandColor={studioBrandColor}
        initial={{
          clientId: prefillContract?.clientId || "",
          guestClientName: "",
          contractId: prefillContractId,
          dueDate: "",
          lineItems: [{ description: "", quantity: 1, unitPriceCents: 0 }],
          notes: "",
          template: DEFAULT_INVOICE_TEMPLATE,
          applyVat: defaultApplyVat,
          vatRate: 20,
        }}
        submitLabel={t("invoiceForm.create")}
        submittingLabel={t("common.creating")}
        submitting={loading}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
