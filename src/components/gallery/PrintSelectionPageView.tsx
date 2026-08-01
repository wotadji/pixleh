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
  /** Options Prodigi choisies par le client pour CETTE photo (ex: {"wrap":"White"}) — chantier
   * "sélection d'attribut au moment de l'achat" (02/08/2026, demande d'Adriel : "je veux
   * construire une vraie UI de sélection d'attribut au moment de l'achat"). null si le produit
   * assigné n'a aucun attribut sélectionnable, ou si aucun choix n'a encore été fait. */
  selectedAttributes: Record<string, string> | null;
}

interface PrintProductDTO {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
  /** Attributs sélectionnables pour ce produit (ex: {"wrap": ["Black","White",...]}) — chargés
   * côté admin via "Resynchroniser" (voir getProdigiProductDetails). Objet vide = aucun
   * attribut : le produit s'assigne directement, sans étape de choix intermédiaire. */
  attributeOptions: Record<string, string[]>;
  /** Chantier "groupe de produits" (02/08/2026, demande d'Adriel : "peux tu ajouter la
   * possibilité de creer un groupe de produit et a l'intérieur ajouter les SKU adéquat ?") —
   * non-vide UNIQUEMENT sur un produit-GROUPE (ex: "Toile photo") : ses tailles/SKU réels
   * (12x16, 20x30...), chacun un vrai produit achetable avec son propre prix/attributs. Un
   * groupe n'est JAMAIS assigné tel quel à une photo — choisir un groupe dans un sélecteur
   * ouvre VariantSelectionModal pour d'abord choisir la taille ; c'est l'id de la VARIANTE
   * choisie qui finit dans Selection.productId, pas celui du groupe. */
  variants?: PrintProductDTO[];
}

/** Libellés FR des noms d'attributs Prodigi les plus courants (voir doc Product Details) —
 * dégrade proprement sur le nom brut (mis en forme) pour tout attribut moins fréquent. */
const ATTRIBUTE_LABELS: Record<string, string> = {
  wrap: "Bordure de la toile",
  colour: "Couleur",
  color: "Couleur",
  frame: "Cadre",
  mount: "Passe-partout",
  mountColour: "Couleur du passe-partout",
  finish: "Finition",
  glaze: "Verre",
  paperType: "Type de papier",
  substrateWeight: "Grammage",
};

function attributeLabel(name: string) {
  return ATTRIBUTE_LABELS[name] || name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, " $1");
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

// Nombre de photos affichées par groupe avant le bouton "Afficher plus" (chantier 01/08/2026,
// demande d'Adriel : sélections à 200 photos, il faut éviter de tout charger d'un coup —
// "avec le design que nous avons cela ne sera pas pratique a utiliser"). Un groupe de 90 photos
// n'affiche donc que les 24 premières au départ, ce qui garde la page rapide à parcourir tout en
// laissant le total exact visible dans l'en-tête du groupe.
const GROUP_PAGE_SIZE = 24;

function matchesSearch(photo: PhotoDTO, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return photo.filename.toLowerCase().includes(q);
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
  // Liste "à plat" incluant les variantes de chaque groupe (chantier "groupe de produits",
  // 02/08/2026) — utilisée partout où on doit RETROUVER le produit réellement assigné à une
  // photo (Selection.productId pointe toujours vers une variante ou un produit autonome, jamais
  // vers un groupe) : groupByProduct, calcul du total, etc. `printProducts` (la liste top-level
  // reçue en prop) reste, elle, la liste proposée dans les sélecteurs "Assigner à".
  const flatProducts: PrintProductDTO[] = printProducts.flatMap((p) =>
    p.variants && p.variants.length > 0 ? p.variants : [p]
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"list" | "grid">("list");
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  // Groupes repliés (accordéon par service, demande d'Adriel du 01/08/2026 : "a chaque
  // assignation mettre un accordeon avec les images assigné au produits") — clé = id produit,
  // ou "unassigned" pour les photos sans service. TOUS repliés au chargement/à l'actualisation de
  // la page (demande d'Adriel, 01/08/2026 : "quand on actualise page le accordeon est toujours
  // ouvert, je veux que le accordeon soit fermé") — calculé une seule fois à partir de la
  // sélection initiale plutôt que de démarrer vide (= tout ouvert). Un groupe se replie aussi
  // automatiquement dès qu'on vient d'y assigner des photos (voir applyProductToPhotos plus bas —
  // demande d'Adriel : "quand je fini d'assigner les images a un produit, l'accordeon doit etre
  // fermé [pas] ouvert"), sinon seul un clic du visiteur change son état.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const initialFlatProducts = printProducts.flatMap((p) => (p.variants && p.variants.length > 0 ? p.variants : [p]));
    const initialGroups = groupByProduct(initialPhotos, initialFlatProducts);
    return new Set(initialGroups.map((g) => g.product?.id ?? "unassigned"));
  });

  // Filtre + recherche (chantier 01/08/2026, gestion de sélections à 200 photos, demande
  // d'Adriel : "le design ne sera pas pratique a utiliser") — permettent de sauter directement
  // aux photos qui restent à traiter plutôt que de parcourir toute la liste. N'affectent que
  // l'affichage (displayGroups) : le récapitulatif de prix et le contrôle avant commande restent
  // basés sur la sélection complète (groups, plus bas).
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "unassigned">("all");
  // Nombre de photos révélées par groupe (pagination, voir GROUP_PAGE_SIZE) — clé = id produit ou
  // "unassigned", valeur = combien de photos du groupe sont affichées. Absent de la map tant que
  // le visiteur n'a pas cliqué "Afficher plus" : on retombe alors sur GROUP_PAGE_SIZE.
  const [revealedGroups, setRevealedGroups] = useState<Record<string, number>>({});

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function revealGroup(key: string, total: number) {
    setRevealedGroups((prev) => ({ ...prev, [key]: total }));
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

  // Flèches de défilement du bandeau produits (demande d'Adriel, 02/08/2026 : "peux tu mettre
  // les fleches aux extrémité") — masquées dès qu'il n'y a plus rien à faire défiler de ce
  // côté (début/fin de liste), plutôt que toujours visibles même quand inutiles.
  const productStripRef = useRef<HTMLDivElement | null>(null);
  const [canScrollProductsLeft, setCanScrollProductsLeft] = useState(false);
  const [canScrollProductsRight, setCanScrollProductsRight] = useState(false);

  function updateProductStripArrows() {
    const el = productStripRef.current;
    if (!el) return;
    setCanScrollProductsLeft(el.scrollLeft > 4);
    setCanScrollProductsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateProductStripArrows();
  }, [printProducts]);

  function scrollProductStrip(direction: -1 | 1) {
    const el = productStripRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

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
  const someChecked = validChecked.size > 0;

  // Groupes calculés sur la sélection COMPLÈTE (jamais filtrée) : le récapitulatif de prix, le
  // total et le contrôle avant commande doivent toujours porter sur toutes les photos, même si le
  // visiteur a filtré/recherché pour naviguer plus facilement dans une grosse sélection.
  const groups = groupByProduct(photos, flatProducts);
  const unassignedPhotos = groups.find((g) => g.product === null)?.photos ?? [];
  const hasUnassigned = unassignedPhotos.length > 0;
  const flatOrder = groups.flatMap((g) => g.photos);
  const totalCents = groups.reduce((sum, g) => sum + (g.product ? g.product.priceCents * g.photos.length : 0), 0);
  const currency = printProducts[0]?.currency || "EUR";
  const assignedCount = photos.filter((p) => p.productId).length;

  // Filtre + recherche (voir state plus haut) : n'affectent que ce qui est affiché/sélectionnable
  // via "Tout sélectionner", jamais le récapitulatif ni la commande.
  const filteredPhotos = photos.filter((p) => {
    if (filterMode === "unassigned" && p.productId) return false;
    return matchesSearch(p, searchQuery);
  });
  const displayGroups = groupByProduct(filteredPhotos, flatProducts);
  const filteredIds = filteredPhotos.map((p) => p.id);
  const filteredCheckedCount = filteredIds.filter((id) => validChecked.has(id)).length;
  const allFilteredChecked = filteredIds.length > 0 && filteredCheckedCount === filteredIds.length;
  const someFilteredChecked = filteredCheckedCount > 0;

  function toggleOne(photoId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  // "Tout sélectionner" ne porte que sur les photos actuellement affichées (filtre/recherche
  // appliqués) — merge avec le reste de la sélection au lieu de l'écraser, pour ne pas perdre des
  // photos cochées en dehors du filtre courant.
  function toggleAll() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allFilteredChecked) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // Sélectionne/désélectionne toutes les photos d'un groupe en un clic (chantier 01/08/2026,
  // sélections à 200 photos : cocher une par une un groupe de 90 photos n'est pas praticable).
  function toggleGroupCheck(ids: string[]) {
    const allOn = ids.every((id) => validChecked.has(id));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
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

  // Logique d'assignation partagée entre "Assigner à" (photos cochées, barre d'action) et
  // "Réassigner à" (toutes les photos d'un groupe en un clic, en-tête d'accordéon) — voir
  // assignToProduct et reassignGroup ci-dessous. Reçoit `ids` en paramètre plutôt que de relire
  // un state React pour éviter tout décalage avec une mise à jour pas encore appliquée.
  //
  // `productId: null` désassigne les photos (demande d'Adriel, 01/08/2026 : "je veux la
  // possibilité pour une image assigné de le rendre non-assigné") — les deux sélecteurs
  // proposent une option "Non assigné" en tête de liste (voir emptyOptionLabel) qui appelle
  // cette fonction avec null plutôt que de forcer un choix parmi les produits existants.
  async function applyProductToPhotos(
    ids: string[],
    productId: string | null,
    attributes?: Record<string, string> | null
  ) {
    if (ids.length === 0) return;
    setPhotos((prev) =>
      prev.map((p) => (ids.includes(p.id) ? { ...p, productId, selectedAttributes: attributes ?? null } : p))
    );
    setChecked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    // Referme l'accordéon de destination (produit choisi, ou "unassigned" en cas de
    // désassignation) une fois l'action faite (demande d'Adriel, 01/08/2026 : "quand je fini
    // d'assigner les images a un produit, l'accordeon doit etre fermé [pas] ouvert") — signale
    // visuellement que ce lot est traité et dégage la place pour repérer/sélectionner d'autres
    // photos dans les groupes encore ouverts.
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.add(productId ?? "unassigned");
      return next;
    });
    await fetch("/api/selections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ galleryId, photoIds: ids, productId, attributes: attributes ?? null }),
    });
  }

  // Sélection d'attribut Prodigi au moment de l'achat (chantier 02/08/2026, demande d'Adriel :
  // "je veux construire une vraie UI de sélection d'attribut au moment de l'achat") — quand le
  // produit choisi a des options (ex: couleur de cadre), on n'assigne PAS tout de suite : on
  // ouvre d'abord AttributeSelectionModal pour recueillir le choix, qui appelle lui-même
  // applyProductToPhotos une fois validé. Un produit sans attribut (attributeOptions vide)
  // s'assigne toujours immédiatement, comme avant.
  const [attributePrompt, setAttributePrompt] = useState<{
    ids: string[];
    product: PrintProductDTO;
    initial?: Record<string, string>;
  } | null>(null);

  // Choix de taille/SKU (chantier "groupe de produits", 02/08/2026, demande d'Adriel : "peux tu
  // ajouter la possibilité de creer un groupe de produit et a l'intérieur ajouter les SKU
  // adéquat ?") — s'ouvre AVANT le choix d'attribut quand le produit sélectionné est un groupe :
  // Prodigi encode la taille dans le SKU, pas dans un attribut choisissable (voir schema.prisma,
  // doc de Product.isProductGroup), donc ce choix ne peut pas passer par AttributeSelectionModal.
  const [variantPrompt, setVariantPrompt] = useState<{ ids: string[]; group: PrintProductDTO } | null>(null);

  // Aperçu en lecture seule des tailles/SKU d'un groupe (demande d'Adriel, 01/08/2026 : "j'ai
  // ajouté les produits dans un groupe, sauf que j'ai pas la possibilité de voir les produits.
  // peux tu mettre un bouton et avec un modal on peux lister les produits du groupe ?") —
  // distinct de variantPrompt : celui-ci s'ouvre depuis le catalogue en haut de page, AVANT
  // toute sélection de photo, juste pour consulter ce que propose un groupe (image, nom,
  // description, prix de chaque taille), sans assigner quoi que ce soit.
  const [previewGroup, setPreviewGroup] = useState<PrintProductDTO | null>(null);

  // Une fois la variante (taille/SKU réel) choisie, on enchaîne sur le choix d'attribut si cette
  // variante en a (ex: une toile 12x16 qui propose aussi la couleur de bordure), sinon on assigne
  // directement — c'est TOUJOURS l'id de la variante, jamais celui du groupe, qui finit dans
  // Selection.productId (voir applyProductToPhotos).
  function chooseVariant(ids: string[], variant: PrintProductDTO, initial?: Record<string, string>) {
    setVariantPrompt(null);
    if (Object.keys(variant.attributeOptions).length > 0) {
      setAttributePrompt({ ids, product: variant, initial });
      return;
    }
    applyProductToPhotos(ids, variant.id, null);
  }

  function promptOrApply(ids: string[], value: string, initial?: Record<string, string>) {
    if (value === "") {
      applyProductToPhotos(ids, null, null);
      return;
    }
    const product = printProducts.find((p) => p.id === value);
    if (product?.variants && product.variants.length > 0) {
      setVariantPrompt({ ids, group: product });
      return;
    }
    if (product && Object.keys(product.attributeOptions).length > 0) {
      setAttributePrompt({ ids, product, initial });
      return;
    }
    applyProductToPhotos(ids, value, null);
  }

  // Choisir un produit dans le sélecteur de la barre d'action assigne IMMÉDIATEMENT les photos
  // cochées à ce produit (demande d'Adriel, 01/08/2026 : "quand je choisis un produit et quand on
  // selectionne une ou plusieurs photo, je veux que le choix d'un produit cree un accordeon et
  // assigne les photos au produit") — SAUF si ce produit a des attributs sélectionnables, auquel
  // cas promptOrApply ouvre d'abord le sélecteur d'options. `value === ""` = "Non assigné".
  async function assignToProduct(value: string) {
    promptOrApply([...validChecked], value);
  }

  // Réassigne TOUTES les photos d'un groupe (pas seulement celles cochées) — sélecteur intégré
  // à l'en-tête de chaque accordéon (chantier 01/08/2026, sélections à 200 photos : déplacer un
  // groupe de 90 photos déjà assignées vers un autre produit ne doit pas obliger à toutes les
  // décocher/recocher une par une). `value === ""` correspond à l'option "Non assigné".
  async function reassignGroup(ids: string[], value: string) {
    promptOrApply(ids, value);
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
    // attributes transmis au panier — chantier "sélection d'attribut au moment de l'achat"
    // (02/08/2026, demande d'Adriel), propagé jusqu'à OrderItem.attributes par /api/cart/checkout
    // puis lu en priorité par submitProdigiOrder (voir src/lib/prodigiOrder.ts).
    const items = photos.map((p) => ({
      productId: p.productId as string,
      quantity: 1,
      photoId: p.id,
      attributes: p.selectedAttributes,
    }));
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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-900">
            Sélection impression{photos.length > 0 ? ` (${photos.length})` : ""}
          </h1>
          {/* Indicateur de progression (chantier 01/08/2026, sélections à 200 photos) — permet de
              voir en un coup d'œil où on en est sans dérouler toute la liste. */}
          {photos.length > 0 && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                assignedCount === photos.length ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {assignedCount} / {photos.length} assignées
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Vérifiez vos tirages, indiquez vos coordonnées et votre adresse de livraison pour commander.
        </p>

        {/* Catalogue des produits d'impression disponibles (demande d'Adriel, 01/08/2026 :
            "mettre apres [le titre] la liste des produits (photo description et prix)") —
            permet de voir d'un coup d'œil ce qui est proposé (visuel, description, tarif) avant
            d'assigner les photos, plutôt que de découvrir les produits un par un dans chaque
            sélecteur "Assigner à". */}
        {printProducts.length > 0 && (
          <div className="relative mt-4">
            {canScrollProductsLeft && (
              <button
                type="button"
                onClick={() => scrollProductStrip(-1)}
                aria-label="Produits précédents"
                className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md hover:bg-gray-50"
              >
                <IconChevronLeft />
              </button>
            )}
            <div
              ref={productStripRef}
              onScroll={updateProductStripArrows}
              className="flex gap-3 overflow-x-auto scroll-smooth pb-1"
            >
              {printProducts.map((p) => (
              <div
                key={p.id}
                className="flex w-48 shrink-0 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-md bg-gray-50">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-gray-300">
                      <IconPrinterEmpty />
                    </span>
                  )}
                </div>
                <p className="truncate text-sm font-semibold text-gray-900">
                  {p.name}
                  {/* "Groupe" = plusieurs tailles/SKU au choix (chantier "groupe de produits",
                      02/08/2026) — le prix affiché est celui de la variante la moins chère. */}
                  {p.variants && p.variants.length > 0 && (
                    <span className="ml-1.5 align-middle text-[10px] font-normal uppercase tracking-wide text-brand-600">
                      {p.variants.length} tailles
                    </span>
                  )}
                </p>
                {p.description && (
                  <p className="line-clamp-2 text-xs text-gray-500">{p.description}</p>
                )}
                <p className="mt-auto text-sm font-medium text-gray-800">
                  {p.variants && p.variants.length > 0 ? (
                    <>
                      dès {formatMoney(Math.min(...p.variants.map((v) => v.priceCents)), p.currency)}
                    </>
                  ) : (
                    formatMoney(p.priceCents, p.currency)
                  )}
                  <span className="ml-1 text-xs font-normal text-gray-400">/ photo</span>
                </p>
                {/* Bouton "voir les produits du groupe" (demande d'Adriel, 01/08/2026 : "j'ai
                    ajouté les produits dans un groupe, sauf que j'ai pas la possibilité de voir
                    les produits [...] mettre un bouton et avec un modal on peux lister les
                    produits du groupe") — aperçu en lecture seule, indépendant de l'assignation
                    d'une photo (voir previewGroup/GroupProductsPreviewModal plus bas). */}
                {p.variants && p.variants.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPreviewGroup(p)}
                    className="mt-1 flex items-center justify-center gap-1 rounded-md border border-gray-200 py-1 text-xs font-medium text-gray-600 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"
                  >
                    <IconEye />
                    Voir les {p.variants.length} produit{p.variants.length > 1 ? "s" : ""}
                  </button>
                )}
              </div>
              ))}
            </div>
            {canScrollProductsRight && (
              <button
                type="button"
                onClick={() => scrollProductStrip(1)}
                aria-label="Produits suivants"
                className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md hover:bg-gray-50"
              >
                <IconChevronRight />
              </button>
            )}
          </div>
        )}

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
          <div className={`mt-6 grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start ${someChecked ? "pb-16" : ""}`}>
            {/* Colonne principale : photos regroupées par service, actions groupées, zoom. */}
            <div className="rounded-xl border border-gray-200 bg-white">
              {/* Recherche + filtres rapides (chantier 01/08/2026, sélections à 200 photos,
                  demande d'Adriel : "le design ne sera pas pratique a utiliser") — permettent de
                  sauter directement aux photos qui restent à traiter plutôt que de tout parcourir. */}
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
                <div className="relative min-w-[180px] flex-1">
                  <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher une photo (nom de fichier)"
                    className="input py-1.5 pl-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterMode("all")}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      filterMode === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Toutes ({photos.length})
                  </button>
                  {unassignedPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode("unassigned")}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        filterMode === "unassigned"
                          ? "bg-gray-800 text-white"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      Non assignées ({unassignedPhotos.length})
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={allFilteredChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredChecked && !allFilteredChecked;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-gray-800"
                  />
                  Tout sélectionner{filterMode !== "all" || searchQuery ? " (filtré)" : ""}
                </label>
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

              {displayGroups.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune photo ne correspond à ce filtre.</p>
              )}

              <div className="divide-y divide-gray-100 px-2 py-2">
                {displayGroups.map((g) => {
                  const key = g.product?.id ?? "unassigned";
                  const isOpen = !collapsedGroups.has(key);
                  const groupIds = g.photos.map((p) => p.id);
                  const groupCheckedCount = groupIds.filter((id) => validChecked.has(id)).length;
                  const groupAllChecked = groupIds.length > 0 && groupCheckedCount === groupIds.length;
                  const groupSomeChecked = groupCheckedCount > 0 && !groupAllChecked;
                  const revealedCount = revealedGroups[key] ?? GROUP_PAGE_SIZE;
                  const visiblePhotos = g.photos.slice(0, revealedCount);
                  const hasMore = g.photos.length > visiblePhotos.length;
                  // Sélection d'attribut Prodigi (chantier 02/08/2026, demande d'Adriel : "je
                  // veux construire une vraie UI de sélection d'attribut au moment de l'achat")
                  // — un groupe dont le produit a des options affiche un bouton pour les
                  // (re)choisir pour TOUT le groupe. "Uniforme" = toutes les photos du groupe
                  // partagent le même choix (cas normal, un groupe = un lot assigné ensemble) ;
                  // sinon (mélange possible via des ajustements photo par photo futurs) on
                  // n'affiche pas de résumé trompeur, juste "Options".
                  const groupAttributeOptions = g.product?.attributeOptions ?? {};
                  const hasAttributeOptions = Object.keys(groupAttributeOptions).length > 0;
                  const groupAttributesSample = g.photos[0]?.selectedAttributes ?? null;
                  const groupAttributesUniform =
                    hasAttributeOptions &&
                    g.photos.every(
                      (p) => JSON.stringify(p.selectedAttributes) === JSON.stringify(groupAttributesSample)
                    );
                  return (
                    <div key={key} className="py-2">
                      {/* Accordéon par service (demande d'Adriel, 01/08/2026 : "a chaque
                          assignation mettre un accordeon avec les images assigné au produits")
                          — replié/déplié indépendamment des autres groupes, ouvert par défaut. */}
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                        {/* Case du groupe (chantier 01/08/2026, sélections à 200 photos, demande
                            d'Adriel : "avec le design que nous avons cela ne sera pas pratique a
                            utiliser") — sélectionne/désélectionne les photos DU GROUPE ENTIER
                            (pas seulement celles affichées si une pagination est active), pour ne
                            pas avoir à cocher 90 photos une par une. */}
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner tout le groupe ${g.product ? g.product.name : "non assigné"}`}
                          checked={groupAllChecked}
                          ref={(el) => {
                            if (el) el.indeterminate = groupSomeChecked;
                          }}
                          onChange={() => toggleGroupCheck(groupIds)}
                          className="h-4 w-4 shrink-0 accent-gray-800"
                        />
                        <button
                          type="button"
                          onClick={() => toggleGroup(key)}
                          className="flex flex-1 items-center justify-between gap-2 rounded-md py-1 text-left hover:bg-gray-50"
                        >
                          <span className="flex items-center gap-2">
                            <IconChevronDown className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                            <h3
                              className={`text-xs font-semibold uppercase tracking-wide ${
                                g.product ? "text-gray-700" : "text-amber-700"
                              }`}
                            >
                              {g.product ? g.product.name : "Service non assigné"}
                              {/* Prix à l'unité à côté du nom du produit (demande d'Adriel,
                                  01/08/2026 : "au niveau de la checklist a coté du nom de la
                                  liste mettre le prix à l'unité") — distinct du total du groupe
                                  déjà affiché à droite (nombre de photos × prix). */}
                              {g.product && (
                                <span className="ml-1.5 font-normal normal-case text-gray-400">
                                  · {formatMoney(g.product.priceCents, g.product.currency)}/photo
                                </span>
                              )}
                            </h3>
                          </span>
                          <span className="shrink-0 text-xs text-gray-400">
                            {g.photos.length} photo{g.photos.length > 1 ? "s" : ""}
                            {g.product ? ` · ${formatMoney(g.product.priceCents * g.photos.length, g.product.currency)}` : ""}
                          </span>
                        </button>
                        {/* Réassigne TOUT le groupe (voir reassignGroup) sans avoir à cocher les
                            photos au préalable — le sélecteur revient au placeholder après chaque
                            usage, c'est une action ponctuelle plutôt qu'une valeur mémorisée.
                            Désactivé en cas de sélection PARTIELLE du groupe (bug remonté par
                            Adriel, 01/08/2026 : coché 3 photos sur 14 puis utilisé ce sélecteur —
                            les 14 ont été déplacées, pas seulement les 3 cochées, car ce contrôle
                            porte volontairement sur le groupe entier, pas sur la sélection). Sans
                            ce garde-fou, rien ne distingue visuellement "déplacer tout le groupe"
                            de "déplacer les photos cochées" alors que ce sont deux actions
                            différentes assises l'une à côté de l'autre. Avec une sélection
                            partielle, le visiteur doit soit utiliser "Assigner à" en bas de page
                            (les photos cochées uniquement), soit cocher tout le groupe d'abord. */}
                        {printProducts.length > 0 && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="hidden text-xs text-gray-400 sm:inline">
                              {g.product ? "Réassigner à" : "Assigner à"}
                            </span>
                            <div
                              className="w-40"
                              title={
                                groupSomeChecked
                                  ? "Sélection partielle dans ce groupe : utilisez \"Assigner à\" en bas de page pour ne déplacer que les photos cochées, ou cochez tout le groupe pour le déplacer en entier."
                                  : undefined
                              }
                            >
                              <SearchableSelect
                                value=""
                                onChange={(value) => reassignGroup(groupIds, value)}
                                options={printProducts
                                  .filter((p) => p.id !== g.product?.id)
                                  .map((p) => ({ value: p.id, label: p.name }))}
                                placeholder={groupSomeChecked ? "Sélection partielle" : "Choisir..."}
                                searchPlaceholder="Rechercher un produit..."
                                disabled={groupSomeChecked}
                                // "Non assigné" n'a de sens que pour désassigner un groupe déjà
                                // assigné (g.product non nul) — le groupe "unassigned" l'est
                                // déjà, inutile de proposer de s'y réassigner lui-même (demande
                                // d'Adriel, 01/08/2026 : "je veux la possibilité pour une image
                                // assigné de le rendre non-assigné").
                                emptyOptionLabel={g.product ? "Non assigné" : undefined}
                              />
                            </div>
                          </div>
                        )}
                        {/* Choisir/modifier les attributs Prodigi du groupe (couleur de cadre,
                            bordure de toile...) — visible dès que le produit assigné a des
                            options (voir attributeOptions), même après assignation initiale, le
                            client peut revenir changer son choix. */}
                        {hasAttributeOptions && g.product && (
                          <button
                            type="button"
                            onClick={() =>
                              setAttributePrompt({
                                ids: groupIds,
                                product: g.product!,
                                initial: groupAttributesUniform ? (groupAttributesSample ?? undefined) : undefined,
                              })
                            }
                            title="Choisir les options (couleur, cadre...) de ce groupe"
                            className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                          >
                            {groupAttributesUniform && groupAttributesSample
                              ? Object.values(groupAttributesSample).join(" · ")
                              : "Choisir les options"}
                          </button>
                        )}
                      </div>

                      {isOpen &&
                        (view === "list" ? (
                          <ul className="divide-y divide-gray-100 px-3">
                            {visiblePhotos.map((p) => (
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
                                    loading="lazy"
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
                            {visiblePhotos.map((p) => (
                              <div key={p.id} className="group relative aspect-square overflow-hidden rounded bg-gray-50">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.thumbUrl}
                                  alt={p.filename}
                                  loading="lazy"
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

                      {/* Pagination par groupe (chantier 01/08/2026, sélections à 200 photos,
                          demande d'Adriel : "cela ne sera pas pratique a utiliser") — n'affiche
                          que GROUP_PAGE_SIZE photos au départ pour garder la page rapide et
                          scannable, quel que soit le nombre réel de photos du groupe. */}
                      {isOpen && hasMore && (
                        <button
                          type="button"
                          onClick={() => revealGroup(key, g.photos.length)}
                          className="mx-3 mt-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Afficher les {g.photos.length - visiblePhotos.length} photos restantes
                        </button>
                      )}
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
                          filtrez sur &laquo;&nbsp;Non assignées&nbsp;&raquo; pour les retrouver, puis cochez-les ou
                          choisissez un produit directement dans l&apos;en-tête du groupe.
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

      {/* Barre d'action persistante (chantier 01/08/2026, sélections à 200 photos, demande
          d'Adriel : "avec le design que nous avons cela ne sera pas pratique a utiliser") — fixée
          en bas de l'écran dès qu'au moins une photo est cochée, pour ne plus avoir à remonter en
          haut de page après avoir coché des photos loin dans une grosse sélection. */}
      {someChecked && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <span className="text-sm font-medium text-gray-800">
              {validChecked.size} photo{validChecked.size > 1 ? "s" : ""} sélectionnée{validChecked.size > 1 ? "s" : ""}
            </span>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              {printProducts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="hidden text-xs text-gray-500 sm:inline">Assigner à :</span>
                  <div className="w-44">
                    {/* value="" en permanence (jamais l'id du dernier produit choisi) — bug
                        remonté par Adriel (01/08/2026) : "au footer il assigne deja sans que je
                        face le choix [...] toutes les photos sont assigné". Cause : ce sélecteur
                        mémorisait le dernier produit choisi (state assignTarget) ET l'affichait
                        comme "déjà sélectionné" ; rouvrir le menu et recliquer cette même option
                        déjà en surbrillance redéclenchait l'assignation, cette fois sur TOUTES les
                        photos si "Tout sélectionner" avait entre-temps été coché. Comme les
                        sélecteurs "Réassigner à" des en-têtes de groupe, c'est désormais une
                        action ponctuelle sans valeur mémorisée : le bouton affiche toujours le
                        placeholder, jamais un produit "déjà choisi".

                        openUpward : ce contrôle est collé au bord bas de l'écran (barre fixe),
                        donc le panneau qui s'ouvre par défaut vers le BAS se retrouvait rendu
                        hors de l'écran — invisible bien qu'ouvert (bug remonté par Adriel,
                        01/08/2026 : "la barre du bas reste utilisable avec 'Choisir un produit'
                        [mais] n'affiche pas la liste de produit"). Voir SearchableSelect.tsx. */}
                    <SearchableSelect
                      value=""
                      onChange={(value) => assignToProduct(value)}
                      options={printProducts.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="Choisir un produit"
                      searchPlaceholder="Rechercher un produit..."
                      openUpward
                      // Permet de désassigner les photos cochées, y compris déjà assignées
                      // (demande d'Adriel, 01/08/2026 : "je veux la possibilité pour une image
                      // assigné de le rendre non-assigné") — cocher une photo dans un groupe puis
                      // choisir "Non assigné" ici la fait ressortir vers "Service non assigné".
                      emptyOptionLabel="Non assigné"
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleBulkDelete}
                className="text-xs font-medium uppercase tracking-wide text-red-600 hover:text-red-800"
              >
                Supprimer ({validChecked.size})
              </button>
              <button
                onClick={() => setChecked(new Set())}
                className="text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-gray-700"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomIndex !== null && flatOrder[zoomIndex] && (
        <PrintZoomModal
          photos={flatOrder}
          index={zoomIndex}
          onNavigate={setZoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}

      {/* Sélection d'attribut Prodigi au moment de l'achat (chantier 02/08/2026, demande
          d'Adriel : "je veux construire une vraie UI de sélection d'attribut au moment de
          l'achat") — s'ouvre avant d'assigner un produit qui a des options (couleur de cadre,
          bordure de toile...), ou pour modifier le choix d'un groupe déjà assigné. */}
      {attributePrompt && (
        <AttributeSelectionModal
          product={attributePrompt.product}
          count={attributePrompt.ids.length}
          initial={attributePrompt.initial}
          onCancel={() => setAttributePrompt(null)}
          onConfirm={(values) => {
            applyProductToPhotos(attributePrompt.ids, attributePrompt.product.id, values);
            setAttributePrompt(null);
          }}
        />
      )}

      {/* Choix de taille/SKU (chantier "groupe de produits", 02/08/2026, demande d'Adriel : "peux
          tu ajouter la possibilité de creer un groupe de produit et a l'intérieur ajouter les
          SKU adéquat ?") — s'ouvre avant toute autre étape quand le produit choisi est un
          groupe : la taille encode un SKU Prodigi différent, ce n'est pas un simple attribut. */}
      {variantPrompt && (
        <VariantSelectionModal
          group={variantPrompt.group}
          count={variantPrompt.ids.length}
          onCancel={() => setVariantPrompt(null)}
          onConfirm={(variant) => chooseVariant(variantPrompt.ids, variant)}
        />
      )}

      {/* Aperçu en lecture seule des tailles/SKU d'un groupe, ouvert depuis le catalogue en haut
          de page (voir bouton "Voir les X produits" ci-dessus) — demande d'Adriel, 01/08/2026. */}
      {previewGroup && (
        <GroupProductsPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />
      )}
    </div>
  );
}

/**
 * Modale de sélection d'attribut(s) Prodigi (couleur de cadre, bordure de toile, finition...) —
 * chantier 02/08/2026, demande d'Adriel : "je veux construire une vraie UI de sélection
 * d'attribut au moment de l'achat". Un menu déroulant par attribut du produit (product.
 * attributeOptions), pré-rempli avec le choix déjà fait pour ce groupe (`initial`) si disponible
 * et toujours valide, sinon la première valeur proposée par Prodigi.
 */
function AttributeSelectionModal({
  product,
  count,
  initial,
  onCancel,
  onConfirm,
}: {
  product: PrintProductDTO;
  count: number;
  initial?: Record<string, string>;
  onCancel: () => void;
  onConfirm: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const [name, options] of Object.entries(product.attributeOptions)) {
      v[name] = initial?.[name] && options.includes(initial[name]) ? initial[name] : options[0];
    }
    return v;
  });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Options pour ${product.name}`}
      >
        <h3 className="text-sm font-semibold text-gray-900">Options — {product.name}</h3>
        <p className="mt-1 text-xs text-gray-500">
          Choisissez les options avant d&apos;assigner {count > 1 ? `ces ${count} photos` : "cette photo"}.
        </p>

        <div className="mt-4 space-y-3">
          {Object.entries(product.attributeOptions).map(([name, options]) => (
            <div key={name}>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                {attributeLabel(name)}
              </label>
              <select
                className="input"
                value={values[name]}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn-primary text-sm" onClick={() => onConfirm(values)}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modale de choix de taille/SKU sous un produit-GROUPE (ex: "Toile photo" → 12x16, 20x30...) —
 * chantier "groupe de produits" (02/08/2026, demande d'Adriel : "peux tu ajouter la possibilité
 * de creer un groupe de produit et a l'intérieur ajouter les SKU adéquat ?"). Contrairement à
 * AttributeSelectionModal (des `<select>` pour des attributs Prodigi), ici chaque taille EST un
 * produit distinct avec son propre prix — rendu en cartes cliquables façon "choix de forfait"
 * plutôt qu'un menu déroulant, le prix étant l'information la plus importante à comparer.
 */
function VariantSelectionModal({
  group,
  count,
  onCancel,
  onConfirm,
}: {
  group: PrintProductDTO;
  count: number;
  onCancel: () => void;
  onConfirm: (variant: PrintProductDTO) => void;
}) {
  const variants = group.variants ?? [];
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
      role="presentation"
    >
      {/* Agrandi (02/08/2026, demande d'Adriel : "agrandir ce modal") — même traitement que
          GroupProductsPreviewModal juste avant : largeur et paddings augmentés, description en
          line-clamp-2 au lieu de "truncate" 1 ligne (coupait au milieu d'un mot). */}
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Choisir une taille pour ${group.name}`}
      >
        <div className="border-b border-gray-100 px-8 py-6">
          <h3 className="text-lg font-semibold text-gray-900">Choisir une taille — {group.name}</h3>
          <p className="mt-1 text-sm text-gray-500">
            Sélectionnez le format avant d&apos;assigner {count > 1 ? `ces ${count} photos` : "cette photo"}.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-8 py-6">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => onConfirm(variant)}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-gray-200 px-5 py-4 text-left hover:border-brand-400 hover:bg-brand-50/40"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug text-gray-900">{variant.name}</span>
                {variant.description && (
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-gray-500">
                    {variant.description}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-base font-semibold text-gray-800">
                {formatMoney(variant.priceCents, variant.currency)}
              </span>
            </button>
          ))}
          {variants.length === 0 && (
            <p className="text-sm text-gray-400">Aucune taille disponible pour ce groupe pour le moment.</p>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 bg-gray-50/60 px-8 py-5">
          <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Aperçu en LECTURE SEULE des tailles/SKU d'un groupe — demande d'Adriel (01/08/2026) : "j'ai
 * ajouté les produits dans un groupe, sauf que j'ai pas la possibilité de voir les produits.
 * peux tu mettre un bouton et avec un modal on peux lister les produits du groupe ?". Ouvert
 * depuis le bouton "Voir les X produits" du catalogue en haut de page (voir previewGroup),
 * AVANT toute sélection de photo — contrairement à VariantSelectionModal (ci-dessus), qui sert à
 * CHOISIR une taille pour l'assigner, celui-ci se contente de lister image/nom/description/prix
 * de chaque variante, sans action d'assignation.
 */
function GroupProductsPreviewModal({ group, onClose }: { group: PrintProductDTO; onClose: () => void }) {
  const variants = group.variants ?? [];
  const prices = variants.map((v) => v.priceCents);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 backdrop-blur-[1px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Produits du groupe ${group.name}`}
      >
        {/* En-tête — redesign "pro" (01/08/2026, demande d'Adriel : "tu es expert en ux, ui et
            expert en web design, je veux que tu me proposes un design pro de ce modal" puis
            "agrandir le modal et le padding [top, right, bottom, left]") : pictogramme dossier
            (même code visuel que le badge "Groupe" du catalogue), fourchette de prix affichée dès
            l'en-tête plutôt que noyée dans la liste, bouton fermer circulaire au survol au lieu
            d'une simple croix flottante, modale et espacements agrandis pour plus de confort. */}
        <div className="flex items-start gap-4 border-b border-gray-100 px-8 py-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <IconFolder />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-gray-900">{group.name}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {variants.length} produit{variants.length > 1 ? "s" : ""} disponible{variants.length > 1 ? "s" : ""}
              {minPrice != null && maxPrice != null && (
                <>
                  {" "}
                  ·{" "}
                  {minPrice === maxPrice
                    ? formatMoney(minPrice, variants[0].currency)
                    : `${formatMoney(minPrice, variants[0].currency)} – ${formatMoney(maxPrice, variants[0].currency)}`}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <IconClose />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {variants.length === 0 ? (
            <p className="px-8 py-10 text-center text-sm text-gray-400">
              Aucun produit disponible dans ce groupe pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {variants.map((variant) => (
                <li key={variant.id} className="flex items-center gap-4 px-8 py-4 hover:bg-gray-50/70">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                    {variant.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={variant.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-gray-300">
                        <IconPrinterEmpty />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-gray-900">{variant.name}</p>
                    {/* line-clamp-2 plutôt que "truncate" (1 ligne, coupait la description au
                        milieu d'un mot avec "...") — laisse la description respirer sur deux
                        lignes complètes avant de tronquer proprement. */}
                    {variant.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-snug text-gray-500">
                        {variant.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatMoney(variant.priceCents, variant.currency)}
                    </p>
                    <p className="text-[11px] text-gray-400">/ photo</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-8 py-5">
          <p className="text-xs text-gray-400">Le format se choisit au moment d&apos;assigner une photo.</p>
          <button type="button" className="btn-secondary shrink-0 text-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
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

function IconSearch({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
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

/** Flèches du bandeau produits (demande d'Adriel, 02/08/2026 : "peux tu mettre les fleches aux
 * extrémité"). */
function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
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

/** Icône dossier — représente un GROUPE de produits dans GroupProductsPreviewModal, même code
 * visuel que le badge "Groupe" du catalogue admin (voir /admin/print-catalog/page.tsx). */
function IconFolder() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icône "œil" — bouton "Voir les produits du groupe" (demande d'Adriel, 01/08/2026). */
function IconEye() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
