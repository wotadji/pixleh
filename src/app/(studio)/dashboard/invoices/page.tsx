"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface InvoiceDTO {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  currency: string;
  client: { name: string } | null;
}

export default function InvoicesPage() {
  const { t } = useLanguage();
  const STATUS_LABELS: Record<string, string> = {
    DRAFT: t("invoiceStatus.draft"),
    SENT: t("invoiceStatus.sent"),
    PAID: t("invoiceStatus.paid"),
    OVERDUE: t("invoiceStatus.overdue"),
    CANCELLED: t("invoiceStatus.cancelled"),
  };

  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((d) => setInvoices(d.invoices || []))
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">{t("invoices.title")}</h1>
        <Link href="/dashboard/invoices/new" className="btn-primary">
          {t("invoices.new")}
        </Link>
      </div>
      <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {invoices.length === 0 && <p className="p-6 text-sm text-gray-500">{t("invoices.empty")}</p>}
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{inv.number}</p>
              <p className="text-sm text-gray-500">{inv.client?.name || t("common.noClient")}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-medium">{(inv.totalCents / 100).toFixed(2)} €</p>
              <span className="text-xs text-gray-500">{STATUS_LABELS[inv.status]}</span>
              <Link href={`/i/${inv.id}`} target="_blank" className="text-sm text-brand-600 hover:underline">
                {t("invoices.viewLink")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
