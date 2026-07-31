"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";
import { InvoiceForm, InvoiceFormValues } from "@/components/studio/InvoiceForm";
import { DEFAULT_INVOICE_TEMPLATE, isInvoiceTemplateId } from "@/lib/invoiceTemplates";

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
interface InvoiceDTO {
  status: string;
  client: { id: string } | null;
  guestClientName: string | null;
  contractId: string | null;
  dueDate: string | null;
  lineItems: { description: string; quantity: number; unitPriceCents: number }[];
  notes: string | null;
  template: string | null;
  vatRate: number | null;
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [studioBrandColor, setStudioBrandColor] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/contracts").then((r) => r.json()),
      fetch(`/api/invoices/${params.id}`).then((r) => r.json()),
    ])
      .then(([clientsData, settingsData, contractsData, invoiceData]) => {
        setClients(clientsData.clients || []);
        setStudioBrandColor(settingsData.studio?.brandColor || null);
        setContracts(
          (contractsData.contracts || []).map((c: { id: string; title: string; client: { id: string } | null; amountCents: number | null }) => ({
            id: c.id,
            title: c.title,
            clientId: c.client?.id || null,
            amountCents: c.amountCents,
          }))
        );
        if (invoiceData.invoice) setInvoice(invoiceData.invoice);
        else setNotFound(true);
      })
      .finally(() => setPageLoading(false));
  }, [params.id]);

  if (pageLoading) return <PageSpinner />;
  if (notFound || !invoice) return <p className="text-sm text-gray-500">{t("invoiceForm.notFound")}</p>;

  async function handleSubmit(values: InvoiceFormValues) {
    setLoading(true);
    const res = await fetch(`/api/invoices/${params.id}`, {
      method: "PATCH",
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
    router.push("/dashboard/invoices");
  }

  return (
    <div>
      <Link href="/dashboard/invoices" className="text-sm text-gray-500 hover:text-gray-800">
        ← {t("invoices.title")}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{t("invoiceForm.editTitle")}</h1>

      {invoice.status === "PAID" ? (
        <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
          {t("invoiceForm.alreadyPaid")}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">{t("invoiceForm.editSubtitle")}</p>
          <InvoiceForm
            clients={clients}
            contracts={contracts}
            studioBrandColor={studioBrandColor}
            initial={{
              clientId: invoice.client?.id || "",
              guestClientName: invoice.guestClientName || "",
              contractId: invoice.contractId || "",
              dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : "",
              lineItems: invoice.lineItems?.length ? invoice.lineItems : [{ description: "", quantity: 1, unitPriceCents: 0 }],
              notes: invoice.notes || "",
              template: isInvoiceTemplateId(invoice.template) ? invoice.template : DEFAULT_INVOICE_TEMPLATE,
              applyVat: invoice.vatRate != null,
              vatRate: invoice.vatRate ?? 20,
            }}
            submitLabel={t("invoiceForm.save")}
            submittingLabel={t("invoiceForm.saving")}
            submitting={loading}
            onSubmit={handleSubmit}
          />
        </>
      )}
    </div>
  );
}
