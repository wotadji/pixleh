"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface ContractDTO {
  id: string;
  title: string;
  status: string;
  client: { name: string } | null;
}

export default function ContractsPage() {
  const { t } = useLanguage();
  const STATUS_LABELS: Record<string, string> = {
    DRAFT: t("contractStatus.draft"),
    SENT: t("contractStatus.sent"),
    SIGNED: t("contractStatus.signed"),
    DECLINED: t("contractStatus.declined"),
  };

  const [contracts, setContracts] = useState<ContractDTO[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contracts")
      .then((r) => r.json())
      .then((d) => setContracts(d.contracts || []))
      .finally(() => setPageLoading(false));
  }, []);

  if (pageLoading) return <PageSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">{t("contracts.title")}</h1>
        <Link href="/dashboard/contracts/new" className="btn-primary">
          {t("contracts.new")}
        </Link>
      </div>
      <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {contracts.length === 0 && <p className="p-6 text-sm text-gray-500">{t("contracts.empty")}</p>}
        {contracts.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{c.title}</p>
              <p className="text-sm text-gray-500">{c.client?.name || t("common.noClient")}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{STATUS_LABELS[c.status]}</span>
              <Link href={`/c/${c.id}`} target="_blank" className="text-sm text-brand-600 hover:underline">
                {t("contracts.viewLink")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
