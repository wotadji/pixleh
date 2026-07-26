"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface BookingDTO {
  id: string;
  customerName: string;
  customerEmail: string;
  startsAt: string;
  endsAt: string;
  status: string;
  bookingType: { name: string } | null;
}

export default function BookingsPage() {
  const { t, locale } = useLanguage();
  const STATUS_LABELS: Record<string, string> = {
    PENDING: t("bookingStatus.pending"),
    CONFIRMED: t("bookingStatus.confirmed"),
    CANCELLED: t("bookingStatus.cancelled"),
    COMPLETED: t("bookingStatus.completed"),
  };

  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  function load() {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings || []))
      .finally(() => setPageLoading(false));
  }
  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (pageLoading) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("bookings.title")}</h1>
      <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {bookings.length === 0 && <p className="p-6 text-sm text-gray-500">{t("bookings.empty")}</p>}
        {bookings.map((b) => (
          <div key={b.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">
                {b.customerName} {b.bookingType ? `— ${b.bookingType.name}` : ""}
              </p>
              <p className="text-sm text-gray-500">
                {new Date(b.startsAt).toLocaleString(locale)} · {b.customerEmail}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{STATUS_LABELS[b.status]}</span>
              {b.status === "PENDING" && (
                <>
                  <button onClick={() => updateStatus(b.id, "CONFIRMED")} className="btn-secondary text-xs">
                    {t("bookings.confirm")}
                  </button>
                  <button onClick={() => updateStatus(b.id, "CANCELLED")} className="btn-secondary text-xs">
                    {t("bookings.decline")}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
