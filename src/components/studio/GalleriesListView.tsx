"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Modal } from "@/components/ui/Modal";
import { galleryInitials, galleryColorForTitle } from "@/lib/galleryVisual";

interface GalleryRow {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  clientName: string | null;
  photoCount: number;
  createdAt: string;
  eventDate: string | null;
  expiresAt: string | null;
  categoryTag: string | null;
  starred: boolean;
  featuredHome: boolean;
  coverPhotoId: string | null;
  coverUpdatedAt: string | null;
  /** Date de la dernière transition vers PUBLISHED (Gallery.publishedAt, 30/07/2026) — null
   * pour une galerie jamais publiée (toujours en DRAFT). */
  publishedAt: string | null;
}

// "mostLiked" viendra plus tard, une fois qu'un système de likes visiteurs existera
// (actuellement seuls les favoris côté client existent, pas de compteur public de likes).
type SortOrder = "newest" | "oldest" | "mostPhotos";
type ViewMode = "grid" | "list";
interface DateRange {
  from: number;
  to: number;
}

const VIEW_STORAGE_KEY = "pixistudio.galleries.view";

function coverUrl(studioId: string, galleryId: string, g: GalleryRow): string | null {
  if (!g.coverPhotoId) return null;
  const v = g.coverUpdatedAt ? new Date(g.coverUpdatedAt).getTime() : 0;
  return `/api/files/studios/${studioId}/galleries/${galleryId}/${g.coverPhotoId}/thumb.jpg?v=${v}`;
}

// Tant qu'une galerie n'a aucune photo (donc aucune couverture possible), on affiche ses
// initiales sur un fond de couleur plutôt qu'un carré vide ou une icône générique — plus
// lisible pour repérer une galerie d'un coup d'œil dans la liste (voir lib/galleryVisual.ts,
// partagé avec la même vignette de secours côté espace Client).
function GalleryPlaceholder({ title, className }: { title: string; className: string }) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center font-serif font-semibold ${galleryColorForTitle(title)} ${className}`}
    >
      {galleryInitials(title)}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6M5.5 6l.6 9.4A1.5 1.5 0 0 0 7.6 17h4.8a1.5 1.5 0 0 0 1.5-1.6L14.5 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"}>
      <path
        d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.5l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76L10 2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icône "mise en avant sur l'accueil du site public" — distincte de l'étoile (`starred`,
 * qui n'est qu'un repère de tri dans ce dashboard) pour éviter toute confusion entre les
 * deux réglages. */
function HomeIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z"
        />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 9.5L10 3l7 6.5M5 8.25V16a1 1 0 001 1h3v-4.5h2V17h3a1 1 0 001-1V8.25"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17 17l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Icône "pile de photos" pour l'état vide de la liste des galeries — distincte des icônes
 * fonctionnelles (recherche, corbeille...) plus haut, purement illustrative. */
function EmptyGalleriesIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6.5" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.5 3.5H21v12.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="10.5" r="1.4" fill="currentColor" />
      <path
        d="M3 16.5l4-3.8a1.4 1.4 0 011.9 0l2.6 2.5 2.2-2a1.4 1.4 0 011.9.03L18 15.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="none"
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Point de couleur (comme les statuts Pixieset : vert=publiée, jaune=brouillon, gris=archivée)
// affiché dans la ligne méta de chaque carte, au lieu d'un badge séparé.
function statusDotColor(status: GalleryRow["status"]): string {
  if (status === "PUBLISHED") return "bg-green-500";
  if (status === "ARCHIVED") return "bg-gray-400";
  return "bg-yellow-500";
}

function statusLabel(status: GalleryRow["status"], t: (k: string) => string): string {
  return status === "PUBLISHED" ? t("status.published") : status === "ARCHIVED" ? t("status.archived") : t("status.draft");
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/** Date seule (sans libellé "Publiée le", demande d'Adriel du 30/07/2026) — null si la galerie
 * n'a jamais été publiée (toujours en DRAFT) — voir Gallery.publishedAt. */
function publishedLabel(publishedAt: string | null, locale: string): string | null {
  if (!publishedAt) return null;
  return formatDate(publishedAt, locale);
}

function pillClass(active: boolean): string {
  return `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${
    active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
  }`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayRange(d: Date): DateRange {
  const from = new Date(d);
  from.setHours(0, 0, 0, 0);
  const to = new Date(d);
  to.setHours(23, 59, 59, 999);
  return { from: from.getTime(), to: to.getTime() };
}

const QUICK_RANGES: { key: string; labelKey: string; days: number; direction: "past" | "future" }[] = [
  { key: "lastWeek", labelKey: "galleries.qLastWeek", days: 7, direction: "past" },
  { key: "last2Weeks", labelKey: "galleries.qLast2Weeks", days: 14, direction: "past" },
  { key: "lastMonth", labelKey: "galleries.qLastMonth", days: 30, direction: "past" },
  { key: "last6Months", labelKey: "galleries.qLast6Months", days: 182, direction: "past" },
  { key: "lastYear", labelKey: "galleries.qLastYear", days: 365, direction: "past" },
  { key: "nextWeek", labelKey: "galleries.qNextWeek", days: 7, direction: "future" },
  { key: "next2Weeks", labelKey: "galleries.qNext2Weeks", days: 14, direction: "future" },
  { key: "nextMonth", labelKey: "galleries.qNextMonth", days: 30, direction: "future" },
  { key: "next6Months", labelKey: "galleries.qNext6Months", days: 182, direction: "future" },
  { key: "nextYear", labelKey: "galleries.qNextYear", days: 365, direction: "future" },
];

function computeQuickRange(q: { days: number; direction: "past" | "future" }): DateRange {
  const now = Date.now();
  const ms = q.days * 24 * 60 * 60 * 1000;
  return q.direction === "past" ? { from: now - ms, to: now } : { from: now, to: now + ms };
}

/** Puce de filtre générique : déclencheur en pilule + panneau positionné dessous, visible
 * uniquement quand `openId === id` (exclusivité gérée par le parent, voir `openFilter`). */
function FilterChip({
  id,
  label,
  active,
  openId,
  onToggle,
  children,
  panelClassName,
}: {
  id: string;
  label: string;
  active: boolean;
  openId: string | null;
  onToggle: (id: string) => void;
  children: React.ReactNode;
  panelClassName?: string;
}) {
  const isOpen = openId === id;
  return (
    <div className="relative">
      <button type="button" onClick={() => onToggle(id)} className={pillClass(active)}>
        {label}
        <ChevronIcon open={isOpen} />
      </button>
      {isOpen && (
        <div
          className={`absolute left-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ${
            panelClassName || "w-56"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ListOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-4 py-2 text-left text-sm ${
        selected ? "bg-gray-50 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

/** Mini-calendrier navigable (mois précédent/suivant), avec sélection d'un jour précis. */
function MiniCalendar({
  value,
  onSelectDay,
  locale,
}: {
  value: Date | null;
  onSelectDay: (d: Date) => void;
  locale: string;
}) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(() => new Date(value || today));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const numDays = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: { day: number; current: boolean; date: Date }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, current: false, date: new Date(year, month - 1, prevMonthDays - i) });
  }
  for (let d = 1; d <= numDays; d++) cells.push({ day: d, current: true, date: new Date(year, month, d) });
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ day: nextDay, current: false, date: new Date(year, month + 1, nextDay) });
    nextDay++;
  }

  const monthLabel = viewDate.toLocaleDateString(locale, { month: "short" });
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: "narrow" })
  );

  return (
    <div className="w-72 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-base capitalize">{monthLabel}</span>
          <span className="font-serif text-base font-semibold">{year}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {weekdayLabels.map((w, i) => (
          <span key={i} className="text-gray-400">
            {w}
          </span>
        ))}
        {cells.map((c, i) => {
          const selected = value && isSameDay(c.date, value);
          const isToday = isSameDay(c.date, today);
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelectDay(c.date)}
              className={`rounded-full py-1 text-sm ${
                !c.current
                  ? "text-gray-300"
                  : selected
                  ? "bg-gray-900 text-white"
                  : isToday
                  ? "font-semibold text-brand-600"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Calendrier + raccourcis "Recherche rapide" (Semaine dernière, Mois prochain...), utilisé
 * pour les deux filtres de date (événement, expiration) — même widget, même logique. */
function DateFilterPanel({
  range,
  onSetRange,
  locale,
  t,
}: {
  range: DateRange | null;
  onSetRange: (r: DateRange) => void;
  locale: string;
  t: (k: string) => string;
}) {
  const selectedDay = range ? new Date(range.from) : null;
  return (
    <div className="flex">
      <MiniCalendar value={selectedDay} onSelectDay={(d) => onSetRange(dayRange(d))} locale={locale} />
      <div className="w-48 border-l border-gray-100 p-3">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {t("galleries.quickSearch")}
        </p>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {QUICK_RANGES.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => onSetRange(computeQuickRange(q))}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              {t(q.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GalleriesListView({
  galleries,
  studioId,
}: {
  galleries: GalleryRow[];
  studioId: string;
}) {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [localGalleries, setLocalGalleries] = useState(galleries);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"any" | GalleryRow["status"]>("any");
  const [categoryFilter, setCategoryFilter] = useState<string>("any");
  const [starredFilter, setStarredFilter] = useState<"any" | "yes" | "no">("any");
  const [eventDateFilter, setEventDateFilter] = useState<DateRange | null>(null);
  const [expiryDateFilter, setExpiryDateFilter] = useState<DateRange | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const filtersRowRef = useRef<HTMLDivElement>(null);

  // Un seul menu de filtre ouvert à la fois : cliquer une puce ferme celle qui était
  // ouverte (même état `openFilter`) ; cliquer en dehors de toute la ligne de filtres
  // referme aussi le menu actif.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filtersRowRef.current && !filtersRowRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleFilter(id: string) {
    setOpenFilter((cur) => (cur === id ? null : id));
  }

  // Reflète les changements venant du serveur (ex: après router.refresh() suite à une
  // création ailleurs) tout en permettant un retrait optimiste immédiat après suppression.
  useEffect(() => {
    setLocalGalleries(galleries);
  }, [galleries]);

  // Se souvient du dernier mode d'affichage choisi (grille/liste) d'une visite à l'autre.
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  useEffect(() => {
    if (!featuredError) return;
    const timer = setTimeout(() => setFeaturedError(null), 5000);
    return () => clearTimeout(timer);
  }, [featuredError]);

  function askDelete(e: React.MouseEvent, g: GalleryRow) {
    // Empêche le clic sur le bouton de supprimer de déclencher aussi la navigation du
    // <Link> qui enveloppe toute la carte/ligne.
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget({ id: g.id, title: g.title });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/galleries/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        // Retrait immédiat de l'affichage sans attendre un aller-retour serveur, pour que
        // la suppression soit visible tout de suite.
        setLocalGalleries((list) => list.filter((g) => g.id !== deleteTarget.id));
        setDeleteTarget(null);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function toggleFeatured(e: React.MouseEvent, g: GalleryRow) {
    e.preventDefault();
    e.stopPropagation();
    const nextFeatured = !g.featuredHome;
    setFeaturedError(null);
    // Optimiste comme pour l'étoile, mais avec un vrai retour arrière + message si le
    // plafond de 3 galeries mises en avant sur l'accueil est déjà atteint (voir PATCH
    // /api/galleries/[id], qui refuse le passage false → true au-delà de 3).
    setLocalGalleries((list) =>
      list.map((row) => (row.id === g.id ? { ...row, featuredHome: nextFeatured } : row))
    );
    try {
      const res = await fetch(`/api/galleries/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featuredHome: nextFeatured }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLocalGalleries((list) =>
          list.map((row) => (row.id === g.id ? { ...row, featuredHome: g.featuredHome } : row))
        );
        setFeaturedError(
          typeof data?.error === "string" ? data.error : t("galleries.featuredMaxError")
        );
      } else {
        router.refresh();
      }
    } catch {
      setLocalGalleries((list) =>
        list.map((row) => (row.id === g.id ? { ...row, featuredHome: g.featuredHome } : row))
      );
      setFeaturedError(t("galleries.featuredMaxError"));
    }
  }

  async function toggleStar(e: React.MouseEvent, g: GalleryRow) {
    e.preventDefault();
    e.stopPropagation();
    const nextStarred = !g.starred;
    // Optimiste : l'étoile réagit tout de suite, sans attendre la réponse serveur.
    setLocalGalleries((list) => list.map((row) => (row.id === g.id ? { ...row, starred: nextStarred } : row)));
    try {
      const res = await fetch(`/api/galleries/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: nextStarred }),
      });
      if (!res.ok) {
        // Échec : on annule l'effet optimiste plutôt que de laisser l'interface mentir sur
        // l'état réellement enregistré en base.
        setLocalGalleries((list) => list.map((row) => (row.id === g.id ? { ...row, starred: g.starred } : row)));
      } else {
        router.refresh();
      }
    } catch {
      setLocalGalleries((list) => list.map((row) => (row.id === g.id ? { ...row, starred: g.starred } : row)));
    }
  }

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of localGalleries) if (g.categoryTag) set.add(g.categoryTag);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [localGalleries]);

  const filtersActive =
    search.trim() !== "" ||
    statusFilter !== "any" ||
    categoryFilter !== "any" ||
    starredFilter !== "any" ||
    eventDateFilter !== null ||
    expiryDateFilter !== null;

  function resetFilters() {
    setSearch("");
    setStatusFilter("any");
    setCategoryFilter("any");
    setStarredFilter("any");
    setEventDateFilter(null);
    setExpiryDateFilter(null);
    setOpenFilter(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localGalleries.filter((g) => {
      if (q && !g.title.toLowerCase().includes(q) && !(g.clientName || "").toLowerCase().includes(q)) return false;
      if (statusFilter !== "any" && g.status !== statusFilter) return false;
      if (categoryFilter !== "any" && g.categoryTag !== categoryFilter) return false;
      if (starredFilter === "yes" && !g.starred) return false;
      if (starredFilter === "no" && g.starred) return false;
      if (eventDateFilter) {
        if (!g.eventDate) return false;
        const t = new Date(g.eventDate).getTime();
        if (t < eventDateFilter.from || t > eventDateFilter.to) return false;
      }
      if (expiryDateFilter) {
        if (!g.expiresAt) return false;
        const t = new Date(g.expiresAt).getTime();
        if (t < expiryDateFilter.from || t > expiryDateFilter.to) return false;
      }
      return true;
    });
  }, [localGalleries, search, statusFilter, categoryFilter, starredFilter, eventDateFilter, expiryDateFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortOrder === "mostPhotos") return b.photoCount - a.photoCount;
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return copy;
  }, [filtered, sortOrder]);

  return (
    <div>
      {/* Barre d'outils (titre + recherche + tri + vue + bouton Nouvelle galerie) — était en
          `flex-nowrap overflow-x-auto`, ce qui coupait le bouton "Nouvelle galerie" hors champ
          sur mobile et forçait un scroll horizontal (capture d'Adriel, 04/08/2026, même
          défaut que la nav Paramètres) : passe en colonne sur petit écran, et les actions
          s'enroulent (`flex-wrap`) plutôt que de déborder — plus aucun bouton n'est jamais
          coupé ni accessible seulement par un scroll latéral.
          Refonte du 03/08/2026 (retour d'Adriel : les outils secondaires flottaient sans lien
          visuel avec le titre ni entre eux) : les actions secondaires (recherche, tri, bascule
          grille/liste) sont regroupées dans un même conteneur `bg-gray-50` avec séparateurs
          fins, pour se lire comme un seul bloc "outils" — bien distinct du bouton primaire
          "Nouvelle galerie", qui reste seul et contrasté à droite. Un sous-titre sous le
          titre affiche maintenant le nombre de galeries. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="shrink-0">
          <h1 className="font-serif text-2xl font-semibold">{t("galleries.title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {localGalleries.length === 0
              ? t("galleries.subtitleEmpty")
              : t("galleries.subtitle").replace("{count}", String(localGalleries.length))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {searchOpen ? (
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <SearchIcon />
                </span>
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => {
                    if (!search.trim()) setSearchOpen(false);
                  }}
                  placeholder={t("galleries.searchPlaceholder")}
                  className="h-8 w-44 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title={t("galleries.searchPlaceholder")}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-white hover:text-gray-700"
              >
                <SearchIcon />
              </button>
            )}

            <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />

            <select
              className="h-8 rounded-lg border-0 bg-transparent px-2 text-sm text-gray-700 hover:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            >
              <option value="newest">{t("galleries.sortNewest")}</option>
              <option value="oldest">{t("galleries.sortOldest")}</option>
              <option value="mostPhotos">{t("galleries.sortMostPhotos")}</option>
            </select>

            <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => changeView("grid")}
                title={t("galleries.viewGrid")}
                className={`rounded-lg p-1.5 ${viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-white"}`}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="11" y="2" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="2" y="11" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="11" y="11" width="7" height="7" rx="1" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => changeView("list")}
                title={t("galleries.viewList")}
                className={`rounded-lg p-1.5 ${viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-white"}`}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="3" width="16" height="3" rx="1" fill="currentColor" />
                  <rect x="2" y="8.5" width="16" height="3" rx="1" fill="currentColor" />
                  <rect x="2" y="14" width="16" height="3" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          <Link href="/dashboard/galleries/new" className="btn-primary gap-1.5 whitespace-nowrap">
            <PlusIcon />
            {t("galleries.new")}
          </Link>
        </div>
      </div>

      {featuredError && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {featuredError}
        </p>
      )}

      {/* Barre de filtres, sous le titre — chaque puce ouvre son propre menu déroulant
          (liste, calendrier...), un seul ouvert à la fois. */}
      <div ref={filtersRowRef} className="mt-4 flex flex-wrap items-center gap-2">
        <FilterChip
          id="status"
          label={t("galleries.filterStatus")}
          active={statusFilter !== "any"}
          openId={openFilter}
          onToggle={toggleFilter}
        >
          <div className="py-1">
            <ListOption
              label={t("galleries.allStatuses")}
              selected={statusFilter === "any"}
              onClick={() => {
                setStatusFilter("any");
                setOpenFilter(null);
              }}
            />
            {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
              <ListOption
                key={s}
                label={statusLabel(s, t)}
                selected={statusFilter === s}
                onClick={() => {
                  setStatusFilter(s);
                  setOpenFilter(null);
                }}
              />
            ))}
          </div>
        </FilterChip>

        <FilterChip
          id="category"
          label={t("galleries.filterCategory")}
          active={categoryFilter !== "any"}
          openId={openFilter}
          onToggle={toggleFilter}
        >
          {categoryOptions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">{t("galleries.noCategoryTagsYet")}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              <ListOption
                label={t("galleries.allCategories")}
                selected={categoryFilter === "any"}
                onClick={() => {
                  setCategoryFilter("any");
                  setOpenFilter(null);
                }}
              />
              {categoryOptions.map((c) => (
                <ListOption
                  key={c}
                  label={c}
                  selected={categoryFilter === c}
                  onClick={() => {
                    setCategoryFilter(c);
                    setOpenFilter(null);
                  }}
                />
              ))}
            </div>
          )}
        </FilterChip>

        <FilterChip
          id="eventDate"
          label={t("galleries.filterEventDate")}
          active={!!eventDateFilter}
          openId={openFilter}
          onToggle={toggleFilter}
          panelClassName="w-auto"
        >
          <DateFilterPanel
            range={eventDateFilter}
            onSetRange={(r) => {
              setEventDateFilter(r);
              setOpenFilter(null);
            }}
            locale={locale}
            t={t}
          />
        </FilterChip>

        <FilterChip
          id="expiryDate"
          label={t("galleries.filterExpiry")}
          active={!!expiryDateFilter}
          openId={openFilter}
          onToggle={toggleFilter}
          panelClassName="w-auto"
        >
          <DateFilterPanel
            range={expiryDateFilter}
            onSetRange={(r) => {
              setExpiryDateFilter(r);
              setOpenFilter(null);
            }}
            locale={locale}
            t={t}
          />
        </FilterChip>

        <FilterChip
          id="starred"
          label={t("galleries.filterStarred")}
          active={starredFilter !== "any"}
          openId={openFilter}
          onToggle={toggleFilter}
          panelClassName="w-36"
        >
          <div className="py-1">
            <ListOption
              label={t("common.yes")}
              selected={starredFilter === "yes"}
              onClick={() => {
                setStarredFilter("yes");
                setOpenFilter(null);
              }}
            />
            <ListOption
              label={t("common.no")}
              selected={starredFilter === "no"}
              onClick={() => {
                setStarredFilter("no");
                setOpenFilter(null);
              }}
            />
          </div>
        </FilterChip>

        {filtersActive && (
          <button type="button" onClick={resetFilters} className="text-sm text-gray-500 underline-offset-2 hover:underline">
            {t("galleries.resetFilters")}
          </button>
        )}
      </div>

      {/* État vide redessiné (retour d'Adriel, 03/08/2026) : distingue le cas "aucune galerie
          créée" (icône + CTA pour démarrer vite) du cas "filtres trop restrictifs" (pas de
          CTA de création — le bouton "Réinitialiser" de la ligne de filtres au-dessus suffit
          à corriger ce cas, inutile de le dupliquer ici). */}
      {sorted.length === 0 && (
        <div className="mt-9 flex flex-col items-center rounded-xl border border-gray-200 px-6 py-16 text-center">
          <span className="text-gray-300">
            <EmptyGalleriesIcon />
          </span>
          <p className="mt-4 text-base font-semibold text-gray-800">
            {localGalleries.length === 0 ? t("galleries.empty") : t("galleries.noResults")}
          </p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            {localGalleries.length === 0 ? t("galleries.emptyHint") : t("galleries.noResultsHint")}
          </p>
          {localGalleries.length === 0 && (
            <Link href="/dashboard/galleries/new" className="btn-primary mt-5 gap-1.5">
              <PlusIcon />
              {t("galleries.new")}
            </Link>
          )}
        </div>
      )}

      {sorted.length > 0 && viewMode === "grid" && (
        <div className="mt-9 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((g) => {
            const src = coverUrl(studioId, g.id, g);
            const dateLabel = formatDate(g.eventDate || g.createdAt, locale);
            return (
              <Link key={g.id} href={`/dashboard/galleries/${g.id}`} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-50">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={g.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <GalleryPlaceholder title={g.title} className="text-2xl" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => askDelete(e, g)}
                    title={t("gm.delete")}
                    className="absolute left-2 top-2 rounded-full bg-white/90 p-1.5 text-gray-500 opacity-0 shadow transition-opacity hover:bg-white hover:text-red-600 group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                  <div className="absolute right-2 top-2 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => toggleStar(e, g)}
                      title={t("galleries.filterStarred")}
                      className={`rounded-full bg-white/90 p-1.5 shadow transition-opacity hover:bg-white ${
                        g.starred ? "text-amber-500 opacity-100" : "text-gray-500 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <StarIcon filled={g.starred} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => toggleFeatured(e, g)}
                      title={t("galleries.featureOnHome")}
                      className={`rounded-full bg-white/90 p-1.5 shadow transition-opacity hover:bg-white ${
                        g.featuredHome
                          ? "text-brand-600 opacity-100"
                          : "text-gray-500 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <HomeIcon filled={g.featuredHome} />
                    </button>
                  </div>
                </div>
                <div className="pt-2.5">
                  <p className="truncate font-medium">{g.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-gray-500">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(g.status)}`} />
                    {g.photoCount} {t("galleries.photoCount")} · {dateLabel}
                  </p>
                  {g.publishedAt && (
                    <p className="mt-0.5 truncate text-[9px] text-gray-400">
                      {publishedLabel(g.publishedAt, locale)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {sorted.length > 0 && viewMode === "list" && (
        <div className="mt-9 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {sorted.map((g) => {
            const src = coverUrl(studioId, g.id, g);
            const dateLabel = formatDate(g.eventDate || g.createdAt, locale);
            return (
              <Link
                key={g.id}
                href={`/dashboard/galleries/${g.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={g.title} className="h-full w-full object-cover" />
                    ) : (
                      <GalleryPlaceholder title={g.title} className="text-sm" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-gray-500">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(g.status)}`} />
                      {statusLabel(g.status, t)} · {g.photoCount} {t("galleries.photoCount")} · {dateLabel}
                    </p>
                    {g.publishedAt && (
                      <p className="mt-0.5 truncate text-[9px] text-gray-400">
                        {publishedLabel(g.publishedAt, locale)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => toggleStar(e, g)}
                    title={t("galleries.filterStarred")}
                    className={`rounded-full p-1.5 hover:bg-amber-50 ${g.starred ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}`}
                  >
                    <StarIcon filled={g.starred} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => toggleFeatured(e, g)}
                    title={t("galleries.featureOnHome")}
                    className={`rounded-full p-1.5 hover:bg-brand-50 ${
                      g.featuredHome ? "text-brand-600" : "text-gray-300 hover:text-brand-500"
                    }`}
                  >
                    <HomeIcon filled={g.featuredHome} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => askDelete(e, g)}
                    title={t("gm.delete")}
                    className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("galleries.deleteTitle")}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary text-sm">
              {t("gm.cancel")}
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? t("common.saving") : t("gm.delete")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {deleteTarget && <span className="font-medium text-gray-900">« {deleteTarget.title} » </span>}
          {t("galleries.confirmDelete")}
        </p>
      </Modal>
    </div>
  );
}
