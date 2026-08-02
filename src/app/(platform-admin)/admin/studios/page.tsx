"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface StudioListItem {
  id: string;
  name: string;
  slug: string;
  ownerName: string | null;
  ownerEmail: string | null;
  plan: { id: string; name: string; isFree: boolean } | null;
  subscriptionStatus: string | null;
  galleryCount: number;
  clientCount: number;
  createdAt: string;
}

export default function AdminStudiosPage() {
  const [studios, setStudios] = useState<StudioListItem[] | null>(null);
  const { t, locale } = useLanguage();

  useEffect(() => {
    fetch("/api/admin/studios")
      .then((res) => res.json())
      .then((data) => setStudios(data.studios));
  }, []);

  if (!studios) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Studios</h1>
      <p className="mt-1 text-sm text-gray-500">{t("admin.studios.subtitle")}</p>

      <div className="mt-6 space-y-2">
        {studios.length === 0 && <p className="text-sm text-gray-500">{t("admin.studios.empty")}</p>}
        {studios.map((studio) => (
          <Link
            key={studio.id}
            href={`/admin/studios/${studio.id}`}
            className="card flex items-center justify-between hover:border-brand-600"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{studio.name}</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {studio.plan ? studio.plan.name : t("admin.studios.noPlan")}
                </span>
                {studio.subscriptionStatus && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {studio.subscriptionStatus}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {studio.ownerName || "—"} · {studio.ownerEmail || "—"} · {studio.galleryCount}{" "}
                {t("admin.studios.galleryUnit")} · {studio.clientCount} {t("admin.studios.clientUnit")}
              </p>
            </div>
            <p className="shrink-0 text-xs text-gray-400">
              {t("admin.studios.registeredOn")} {new Date(studio.createdAt).toLocaleDateString(locale)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
