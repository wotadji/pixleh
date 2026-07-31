"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSpinner } from "@/components/ui/Spinner";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

type OrderStatus = "PENDING" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED";

interface OrderItemDTO {
  id: string;
  quantity: number;
  productName: string;
}

interface OrderDTO {
  id: string;
  studioId: string;
  studioName: string;
  customerName: string;
  customerEmail: string;
  galleryTitle: string | null;
  createdAt: string;
  totalCents: number;
  currency: string;
  status: OrderStatus;
  items: OrderItemDTO[];
}

interface StudioOption {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "En attente",
  PAID: "Payée",
  FULFILLED: "Traitée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
  FULFILLED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-gray-100 text-gray-500",
};

const PAGE_SIZE = 10;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

/**
 * Commandes plateforme — vue transverse à tous les studios, demandée par Adriel le 01/08/2026 :
 * "mettre les commandes dans les panels d'administrateur, on peut voir toutes les commandes
 * de tous les studios et des filtres aussi par studio". Complète /dashboard/orders (vue d'UN
 * studio sur ses propres commandes), ne la remplace pas — utile notamment parce qu'une partie
 * de ces commandes (les articles du catalogue impression, /admin/print-catalog) est un revenu
 * pixleh, pas studio.
 */
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [studios, setStudios] = useState<StudioOption[] | null>(null);
  const [studioFilter, setStudioFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/admin/studios")
      .then((r) => r.json())
      .then((data) => setStudios((data.studios || []).map((s: any) => ({ id: s.id, name: s.name }))));
  }, []);

  useEffect(() => {
    setOrders(null);
    const url = studioFilter === "ALL" ? "/api/admin/orders" : `/api/admin/orders?studioId=${studioFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []));
  }, [studioFilter]);

  const stats = useMemo(() => {
    if (!orders) return null;
    const revenue = orders
      .filter((o) => o.status === "PAID" || o.status === "FULFILLED")
      .reduce((sum, o) => sum + o.totalCents, 0);
    const pending = orders.filter((o) => o.status === "PENDING").length;
    const studioIds = new Set(orders.map((o) => o.studioId));
    return {
      total: orders.length,
      revenue,
      currency: orders[0]?.currency || "EUR",
      pending,
      studioCount: studioIds.size,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesSearch =
        !q ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q) ||
        o.studioName.toLowerCase().includes(q) ||
        (o.galleryTitle || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, studioFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!orders || !studios || !stats) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Commandes</h1>
      <p className="mt-1 text-sm text-gray-500">
        Toutes les commandes de tous les studios, y compris les commandes d&apos;impression
        (catalogue plateforme, voir Catalogue impression) — filtrable par studio.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Commandes" value={String(stats.total)} />
        <StatCard label="CA payé / traité" value={formatMoney(stats.revenue, stats.currency)} />
        <StatCard label="En attente" value={String(stats.pending)} tone={stats.pending > 0 ? "amber" : undefined} />
        <StatCard label="Studios concernés" value={String(stats.studioCount)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="w-56 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (client, studio, galerie)"
            className="input"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-52 shrink-0">
            <SearchableSelect
              value={studioFilter}
              onChange={setStudioFilter}
              placeholder="Tous les studios"
              searchPlaceholder="Rechercher un studio..."
              options={[
                { value: "ALL", label: "Tous les studios" },
                ...studios.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
          <div className="w-44 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "ALL")}
              className="input"
            >
              <option value="ALL">Tous les statuts</option>
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
              <IconBag />
            </div>
            <p className="text-sm text-gray-500">
              {orders.length === 0 ? "Aucune commande pour le moment." : "Aucune commande ne correspond à ta recherche."}
            </p>
          </div>
        )}
        {paginated.map((o) => (
          <div key={o.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                {initials(o.customerName)}
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 truncate font-medium text-gray-900">
                  {o.customerName}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {o.studioName}
                  </span>
                </p>
                <p className="truncate text-sm text-gray-500">
                  {o.customerEmail} · {o.galleryTitle || "—"}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">{formatDate(o.createdAt)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.items.map((item) => (
                    <span key={item.id} className="rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                      {item.quantity} × {item.productName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-medium text-gray-900">{formatMoney(o.totalCents, o.currency)}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[o.status]}`}>
                {STATUS_LABELS[o.status]}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-gray-500">
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "amber" ? "text-amber-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function IconBag() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 8h12l1 12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20.5L6 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}
