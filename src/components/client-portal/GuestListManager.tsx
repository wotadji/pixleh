"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type GuestStatus = "PENDING" | "APPROVED" | "REJECTED";

interface GuestRow {
  id: string;
  email: string;
  status: GuestStatus;
  approvalToken: string | null;
}

/**
 * Liste des invités d'une galerie côté espace Client : recherche par email + bascule
 * marche/arrêt de l'accès pour les invités déjà traités (APPROVED <-> REJECTED). Les demandes
 * encore PENDING gardent leur lien "Traiter" (choix des sets), qui reste le seul chemin pour
 * une première approbation — voir /approve-guest/[token]. Demandé par Adriel le 30/07/2026 :
 * avant ça, un invité approuvé ne pouvait plus jamais être désactivé depuis l'espace client.
 */
export function GuestListManager({
  galleryId,
  initialGuests,
}: {
  galleryId: string;
  initialGuests: GuestRow[];
}) {
  const { t } = useLanguage();
  const [guests, setGuests] = useState(initialGuests);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const STATUS_LABELS: Record<GuestStatus, string> = {
    PENDING: t("client.guests.statusPending"),
    APPROVED: t("client.guests.statusApproved"),
    REJECTED: t("client.guests.statusRejected"),
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => g.email.toLowerCase().includes(q));
  }, [guests, query]);

  async function toggleAccess(guest: GuestRow) {
    const nextStatus: GuestStatus = guest.status === "APPROVED" ? "REJECTED" : "APPROVED";
    setSavingId(guest.id);
    setError(null);
    const res = await fetch(`/api/client-portal/galleries/${galleryId}/guests/${guest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setSavingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || t("client.guests.error"));
      return;
    }
    setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, status: nextStatus } : g)));
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("client.guests.searchPlaceholder")}
        className="input w-full text-sm"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {guests.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{t("client.guests.emptyAll")}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{t("client.guests.emptySearch")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
          {filtered.map((g) => (
            <li key={g.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{g.email}</span>
              <span className="flex items-center gap-3">
                <span
                  className={
                    g.status === "APPROVED"
                      ? "text-green-700"
                      : g.status === "REJECTED"
                        ? "text-gray-500"
                        : "text-amber-700"
                  }
                >
                  {STATUS_LABELS[g.status]}
                </span>
                {g.status === "PENDING" && g.approvalToken && (
                  <Link
                    href={`/approve-guest/${g.approvalToken}`}
                    className="text-xs text-purple-700 underline"
                  >
                    {t("client.guests.process")}
                  </Link>
                )}
                {g.status !== "PENDING" && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={g.status === "APPROVED"}
                    disabled={savingId === g.id}
                    onClick={() => toggleAccess(g)}
                    title={g.status === "APPROVED" ? t("client.guests.disable") : t("client.guests.enable")}
                    className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
                      g.status === "APPROVED" ? "bg-green-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        g.status === "APPROVED" ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
