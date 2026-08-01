"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface PhotoDTO {
  id: string;
  filename: string;
  thumbUrl: string;
  previewUrl: string;
  productId: string | null;
}

interface PrintProductDTO {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
}

interface ProductGroup {
  product: PrintProductDTO | null;
  photos: PhotoDTO[];
}

// Sélection courte de pays (code ISO 3166-1 alpha-2 attendu par Prodigi) — France en premier
// (marché ciblé en priorité par pixleh, seul pays où l'autocomplétion d'adresse fonctionne, voir
// searchFrenchAddress), suivie des pays limitrophes/francophones les plus probables pour un
// studio photo français. Liste volontairement restreinte plutôt qu'exhaustive.
const SHIPPING_COUNTRY_OPTIONS = [
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgique" },
  { code: "CH", label: "Suisse" },
  { code: "LU", label: "Luxembourg" },
  { code: "DE", label: "Allemagne" },
  { code: "ES", label: "Espagne" },
  { code: "IT", label: "Italie" },
  { code: "GB", label: "Royaume-Uni" },
  { code: "US", label: "États-Unis" },
  { code: "CA", label: "Canada" },
];

interface AddressSuggestion {
  label: string;
  line1: string;
  postalCode: string;
  city: string;
}

/**
 * Autocomplétion d'adresse française via la Base Adresse Nationale (api-adresse.data.gouv.fr) —
 * service public gratuit, sans clé API, propose l'adresse au fur et à mesure de la frappe et
 * renvoie code postal + ville associés. Demande d'Adriel (01/08/2026) : "doit permettre de
 * proposer la bonne adresse et completer le reste de champs (code postal et ville)".
 * Volontairement limité à la France (voir countryCode === "FR" dans l'appelant) : cette API ne
 * couvre pas les autres pays proposés dans SHIPPING_COUNTRY_OPTIONS, qui restent en saisie
 * manuelle. Dégrade silencieusement (retourne []) si l'API est indisponible ou la requête
 * annulée — l'adresse reste saisissable à la main dans tous les cas.
 */
async function searchFrenchAddress(query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  const res = await fetch(
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`,
    { signal }
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const features = Array.isArray(data?.features) ? data.features : [];
  return features
    .map((f: any) => {
      const props = f?.properties ?? {};
      const label: string | undefined = props.label;
      if (!label) return null;
      return {
        label,
        line1: props.name || label,
        postalCode: props.postcode || "",
        city: props.city || "",
      } as AddressSuggestion;
    })
    .filter((s: AddressSuggestion | null): s is AddressSuggestion => Boolean(s));
}

function groupByProduct(photos: PhotoDTO[], printProducts: PrintProductDTO[]): ProductGroup[] {
  const assignedIds = new Set<string>();
  const groups: ProductGroup[] = printProducts
    .map((product) => {
      const groupPhotos = photos.filter((p) => p.productId === product.id);
      groupPhotos.forEach((p) => assignedIds.add(p.id));
      return { product, photos: groupPhotos };
    })
    .filter((g) => g.photos.length > 0);
  const unassignedPhotos = photos.filter((p) => !assignedIds.has(p.id));
  if (unassignedPhotos.length > 0) {
    groups.push({ product: null, photos: unassignedPhotos });
  }
  return groups;
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

/**
 * Page dédiée "Sélection impression" (chantier 01/08/2026, demande d'Adriel — voir la page
 * serveur pour le contexte complet). Remplace l'ancienne modale PrintSelectionPanel par une
 * mise en page façon checkout e-commerce : photos à regrouper/vérifier à gauche, récapitulatif +
 * coordonnées + adresse de livraison dans une carte sticky à droite — plutôt qu'un panneau
 * centré et contraint en hauteur, pour laisser respirer une étape qui engage un vrai paiement.
 */
export function PrintSelectionPageView({
  gallerySlug,
  galleryId,
  galleryTitle,
  studioName,
  studioLogoUrl,
  photos: initialPhotos,
  printProducts,
}: {
  gallerySlug: string;
  galleryId: string;
  galleryTitle: string;
  studioName: string;
  studioLogoUrl: string | null;
  photos: PhotoDTO[];
  printProducts: PrintProductDTO[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"list" | "grid">("list");
  const [assignTarget, setAssignTarget] = useState(printProducts[0]?.id || "");
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  // Groupes repliés (accordéon par service, demande d'Adriel du 01/08/2026 : "a chaque
  // assignation mettre un accordeon avec les images assigné au produits") — clé = id produit,
  // ou "unassigned" pour les photos sans service. Ouverts par défaut : un groupe ne se replie
  // que si le visiteur clique dessus, jamais automatiquement.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const [customer, setCustomer] = useState({ name: "", email: "" });
  const [shipping, setShipping] = useState({
    line1: "",
    line2: "",
    city: "",
    postalCode: "",
    countryCode: "FR",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const addressBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (addressBoxRef.current && !addressBoxRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function onLine1Change(value: string) {
    setShipping((s) => ({ ...s, line1: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (shipping.countryCode !== "FR" || value.trim().length < 4) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const results = await searchFrenchAddress(value, controller.signal);
        setSuggestions(results);
        setSuggestOpen(results.length > 0);
      } catch {
        // Requête annulée (nouvelle frappe) ou API indisponible : sans conséquence, l'adresse
        // reste saisissable à la main.
      }
    }, 300);
  }

  function selectSuggestion(s: AddressSuggestion) {
    setShipping((prev) => ({ ...prev, line1: s.line1, postalCode: s.postalCode, city: s.city }));
    setSuggestions([]);
    setSuggestOpen(false);
  }

  const validChecked = new Set([...checked].filter((id) => photos.some((p) => p.id === id)));
  const allChecked = photos.length > 0 && validChecked.size === photos.length;
  const someChecked = validChecked.size > 0;

  const groups = groupByProduct(photos, printProducts);
  const unassignedPhotos = groups.find((g) => g.product === null)?.photos ?? [];
  const hasUnassigned = unassignedPhotos.length > 0;
  const flatOrder = groups.flatMap((g) => g.photos);
  const totalCents = groups.reduce((sum, g) => sum + (g.product ? g.product.priceCents * g.photos.length : 0), 0);
  const currency = printProducts[0]?.currency || "EUR";

  function toggleOne(photoId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(photos.map((p) => p.id)));
  }

  async function removeOne(photoId: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
    await fetch(`/api/selections?galleryId=${galleryId}&photoId=${photoId}&type=PRINT`, { method: "DELETE" });
  }

  async function handleBulkDelete() {
    const ids = [...validChecked];
    setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)));
    setChecked(new Set());
    await Promise.all(
      ids.map((photoId) =>
        fetch(`/api/selections?galleryId=${galleryId}&photoId=${photoId}&type=PRINT`, { method: "DELETE" })
      )
    );
  }

  async function handleBulkAssign() {
    if (!assignTarget) return;
    const ids = [...validChecked];
    setPhotos((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, productId: assignTarget } : p)));
    setChecked(new Set());
    await fetch("/api/selections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ galleryId, photoIds: ids, productId: assignTarget }),
    });
  }

  async function handleOrder() {
    setError(null);
    if (printProducts.length === 0) {
      setError("Aucun tarif d'impression n'a été configuré par le photographe.");
      return;
    }
    if (photos.length === 0) {
      setError("Votre sélection est vide.");
      return;
    }
    if (hasUnassigned) {
      setError("Assignez un service d'impression à chaque photo avant de commander.");
      return;
    }
    if (!customer.name || !customer.email) {
      setError("Merci de renseigner votre nom et votre email.");
      return;
    }
    if (!shipping.line1 || !shipping.city || !shipping.postalCode || !shipping.countryCode || !shipping.phone) {
      setError("Merci de renseigner votre adresse de livraison complète, téléphone inclus.");
      return;
    }
    const items = photos.map((p) => ({ productId: p.productId as string, quantity: 1, photoId: p.id }));
    setLoading(true);
    const res = await fetch("/api/cart/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryId,
        items,
        customerName: customer.name,
        customerEmail: customer.email,
        shippingAddress: { name: customer.name, ...shipping },
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Erreur lors de la commande.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={`/g/${gallerySlug}`}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <IconArrowLeft />
            Retour à la galerie
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-right">
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-gray-900">{galleryTitle}</p>
              {studioName && <p className="truncate text-xs text-gray-500">{studioName}</p>}
            </div>
            {studioLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studioLogoUrl} alt={studioName} className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white">
                {studioName?.[0]?.toUpperCase() || "?"}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900">
          Sélection impression{photos.length > 0 ? ` (${photos.length})` : ""}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Vérifiez vos tirages, indiquez vos coordonnées et votre adresse de livraison pour commander.
        </p>

        {photos.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
              <IconPrinterEmpty />
            </div>
            <p className="text-sm text-gray-500">
              Votre sélection est vide. Retournez à la galerie et cliquez sur l&apos;icône imprimante d&apos;une
              photo pour l&apos;ajouter ici.
            </p>
            <Link href={`/g/${gallerySlug}`} className="btn-primary mt-1">
              Retour à la galerie
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
            {/* Colonne principale : photos regroupées par service, actions groupées, zoom. */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked && !allChecked;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-gray-800"
                  />
                  Tout sélectionner
                </label>
                <div className="flex items-center gap-3">
                  {someChecked && (
                    <div className="flex flex-wrap items-center gap-2">
                      {printProducts.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {/* Ancien <select> natif remplacé par SearchableSelect (déjà utilisé
                              ailleurs dans l'app) — demande d'Adriel (01/08/2026) : "la liste des
                              produits ne sont pas bien dans la liste (mettre une bare de
                              recherche au dessus de <li>)", le <select> natif s'affichait mal
                              avec le style compact précédent. */}
                          <div className="w-44">
                            <SearchableSelect
                              value={assignTarget}
                              onChange={setAssignTarget}
                              options={printProducts.map((p) => ({ value: p.id, label: p.name }))}
                              placeholder="Choisir un produit"
                              searchPlaceholder="Rechercher un produit..."
                            />
                          </div>
                          <button
                            onClick={handleBulkAssign}
                            className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-600 hover:text-gray-900"
                          >
                            Assigner ({validChecked.size})
                          </button>
                        </div>
                      )}
                      <button
                        onClick={handleBulkDelete}
                        className="text-xs font-medium uppercase tracking-wide text-red-600 hover:text-red-800"
                      >
                        Supprimer ({validChecked.size})
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-0.5 rounded-md border border-gray-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => setView("list")}
                      aria-label="Vue liste"
                      className={`flex h-6 w-6 items-center justify-center rounded ${
                        view === "list" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      <IconListView />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("grid")}
                      aria-label="Vue grille"
                      className={`flex h-6 w-6 items-center justify-center rounded ${
                        view === "grid" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      <IconGridView />
                    </button>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-100 px-2 py-2">
                {groups.map((g) => {
                  const key = g.product?.id ?? "unassigned";
                  const isOpen = !collapsedGroups.has(key);
                  return (
                    <div key={key} className="py-2">
                      {/* Accordéon par service (demande d'Adriel, 01/08/2026 : "a chaque
                          assignation mettre un accordeon avec les images assigné au produits")
                          — replié/déplié indépendamment des autres groupes, ouvert par défaut. */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(key)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-2">
                          <IconChevronDown className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                          <h3
                            className={`text-xs font-semibold uppercase tracking-wide ${
                              g.product ? "text-gray-700" : "text-amber-700"
                            }`}
                          >
                            {g.product ? g.product.name : "Service non assigné"}
                          </h3>
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {g.photos.length} photo{g.photos.length > 1 ? "s" : ""}
                          {g.product ? ` · ${formatMoney(g.product.priceCents * g.photos.length, g.product.currency)}` : ""}
                        </span>
                      </button>

                      {isOpen &&
                        (view === "list" ? (
                          <ul className="divide-y divide-gray-100 px-3">
                            {g.photos.map((p) => (
                              <li key={p.id} className="flex items-center gap-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={validChecked.has(p.id)}
                                  onChange={() => toggleOne(p.id)}
                                  className="h-4 w-4 shrink-0 accent-gray-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => setZoomIndex(flatOrder.findIndex((x) => x.id === p.id))}
                                  className="shrink-0"
                                  aria-label="Agrandir"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={p.thumbUrl}
                                    alt={p.filename}
                                    className="h-12 w-12 cursor-zoom-in rounded object-cover"
                                  />
                                </button>
                                <span className="flex-1" />
                                <button
                                  onClick={() => removeOne(p.id)}
                                  className="shrink-0 text-xs uppercase tracking-wide text-gray-400 hover:text-gray-700"
                                >
                                  Retirer
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5 px-3 pt-2 sm:grid-cols-6">
                            {g.photos.map((p) => (
                              <div key={p.id} className="group relative aspect-square overflow-hidden rounded bg-gray-50">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.thumbUrl}
                                  alt={p.filename}
                                  onClick={() => setZoomIndex(flatOrder.findIndex((x) => x.id === p.id))}
                                  className="h-full w-full cursor-zoom-in object-cover"
                                />
                                <input
                                  type="checkbox"
                                  checked={validChecked.has(p.id)}
                                  onChange={() => toggleOne(p.id)}
                                  className="absolute left-1 top-1 h-3.5 w-3.5 accent-gray-800"
                                />
                                <button
                                  onClick={() => removeOne(p.id)}
                                  aria-label="Retirer"
                                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"
                                >
                                  <IconClose />
                                </button>
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Carte sticky : récapitulatif + coordonnées + adresse de livraison + CTA. */}
            <div className="lg:sticky lg:top-20">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">Récapitulatif</h2>

                {printProducts.length === 0 ? (
                  <div className="mt-3 flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                    <IconAlert className="mt-0.5 shrink-0 text-amber-500" />
                    <p>Aucun tarif d&apos;impression n&apos;a été configuré par le photographe pour le moment.</p>
                  </div>
                ) : (
                  <>
                    {hasUnassigned && (
                      <div className="mt-3 flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                        <IconAlert className="mt-0.5 shrink-0 text-amber-500" />
                        <p>
                          {unassignedPhotos.length} photo{unassignedPhotos.length > 1 ? "s" : ""} sans service assigné —
                          sélectionnez-les puis choisissez &laquo;&nbsp;Assigner&nbsp;&raquo; ci-dessus.
                        </p>
                      </div>
                    )}

                    <div className="mt-3 space-y-1.5">
                      {groups
                        .filter((g) => g.product)
                        .map((g) => (
                          <div key={g.product!.id} className="flex items-center justify-between text-sm text-gray-600">
                            <span className="truncate">
                              {g.photos.length} × {g.product!.name}
                            </span>
                            <span className="shrink-0 font-medium text-gray-800">
                              {formatMoney(g.product!.priceCents * g.photos.length, g.product!.currency)}
                            </span>
                          </div>
                        ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="text-sm font-medium text-gray-600">Total</span>
                      <span className="text-lg font-semibold text-gray-900">{formatMoney(totalCents, currency)}</span>
                    </div>

                    <div className="mt-5 space-y-2 border-t border-gray-100 pt-5">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Vos coordonnées</p>
                      <input
                        placeholder="Votre nom"
                        className="input"
                        value={customer.name}
                        onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                      />
                      <input
                        placeholder="Votre email"
                        type="email"
                        className="input"
                        value={customer.email}
                        onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                      />
                    </div>

                    <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Adresse de livraison des tirages
                      </p>

                      <div ref={addressBoxRef} className="relative">
                        <input
                          placeholder="Adresse (numéro et rue)"
                          className="input"
                          value={shipping.line1}
                          onChange={(e) => onLine1Change(e.target.value)}
                          onFocus={() => suggestions.length > 0 && setSuggestOpen(true)}
                          autoComplete="off"
                        />
                        {suggestOpen && suggestions.length > 0 && (
                          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                            {suggestions.map((s) => (
                              <li key={s.label}>
                                <button
                                  type="button"
                                  onClick={() => selectSuggestion(s)}
                                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  <IconMapPin className="mt-0.5 shrink-0 text-gray-400" />
                                  <span>{s.label}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <input
                        placeholder="Complément d'adresse (optionnel)"
                        className="input"
                        value={shipping.line2}
                        onChange={(e) => setShipping({ ...shipping, line2: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          placeholder="Code postal"
                          className="input"
                          value={shipping.postalCode}
                          onChange={(e) => setShipping({ ...shipping, postalCode: e.target.value })}
                        />
                        <input
                          placeholder="Ville"
                          className="input"
                          value={shipping.city}
                          onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          className="input"
                          value={shipping.countryCode}
                          onChange={(e) => {
                            setShipping({ ...shipping, countryCode: e.target.value });
                            setSuggestOpen(false);
                          }}
                        >
                          {SHIPPING_COUNTRY_OPTIONS.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="Téléphone *"
                          required
                          className="input"
                          value={shipping.phone}
                          onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400">* Téléphone requis pour faciliter la livraison.</p>
                    </div>

                    {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

                    <button onClick={handleOrder} disabled={loading} className="btn-primary mt-4 w-full">
                      {loading ? "Redirection..." : `Commander · ${formatMoney(totalCents, currency)}`}
                    </button>
                    <p className="mt-2 text-center text-[11px] text-gray-400">
                      Paiement sécurisé par carte bancaire (Stripe). Vos tirages sont imprimés et expédiés par notre
                      partenaire d&apos;impression.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {zoomIndex !== null && flatOrder[zoomIndex] && (
        <PrintZoomModal
          photos={flatOrder}
          index={zoomIndex}
          onNavigate={setZoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  );
}

/** Zoom plein écran d'une photo de la sélection, avec navigation précédent/suivant. */
function PrintZoomModal({
  photos,
  index,
  onNavigate,
  onClose,
}: {
  photos: { id: string; filename: string; previewUrl: string }[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onNavigate((index - 1 + photos.length) % photos.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, photos.length, onNavigate, onClose]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 px-4" onClick={onClose}>
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <IconClose />
      </button>
      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index - 1 + photos.length) % photos.length);
            }}
            aria-label="Photo précédente"
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-5"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index + 1) % photos.length);
            }}
            aria-label="Photo suivante"
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-5"
          >
            ›
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.previewUrl}
        alt={photo.filename}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded object-contain shadow-2xl"
      />
    </div>
  );
}

function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconAlert({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 9v4" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z" strokeLinejoin="round" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconListView() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconGridView() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconMapPin({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 21s-7-6.1-7-11a7 7 0 1114 0c0 4.9-7 11-7 11z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

function IconPrinterEmpty() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 9V4h12v5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14h12v6H6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
