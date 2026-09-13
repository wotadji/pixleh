import { z } from "zod";
import { PHOTO_SORT_KEYS } from "./photoSort";

export const registerSchema = z.object({
  studioName: z.string().min(2, "Nom du studio trop court"),
  name: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "8 caractères minimum"),
});

export const galleryDesignSchema = z.object({
  coverStyle: z
    .enum(["center", "left", "right", "frame", "stripe", "divider", "outline", "minimal", "editorial"])
    .optional(),
  font: z.enum(["sans", "serif", "modern", "timeless", "bold", "subtle"]).optional(),
  color: z
    .enum(["light", "gold", "rose", "terracotta", "sand", "agave", "sea", "dark"])
    .optional(),
  gridStyle: z.enum(["vertical", "horizontal"]).optional(),
  thumbnailSize: z.enum(["regular", "large"]).optional(),
  gridSpacing: z.enum(["regular", "large", "xlarge"]).optional(),
  navigationStyle: z.enum(["icon", "iconText"]).optional(),
  columnsPerRow: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(),
  coverFocalX: z.number().min(0).max(1).optional(),
  coverFocalY: z.number().min(0).max(1).optional(),

  // ---- Nouveaux champs "Présentation" (chantier refonte Réglages, 12/09/2026) — voir
  // src/lib/galleryDesign.ts (GalleryDesign) pour le détail de chaque champ. Sans ces clés
  // ici, zod les aurait silencieusement retirées du JSON envoyé par updateDesign() côté
  // GalleryManager (un objet z.object() ignore par défaut les clés non déclarées).
  coverMode: z.enum(["hero", "bandeau", "none"]).optional(),
  // Composition dédiée au mode "bandeau" (13/09/2026, retour PicStudio) — voir
  // BandeauComposition dans galleryDesign.ts.
  bandeauComposition: z.enum(["editorial", "centered", "sideBySide", "journal"]).optional(),
  showCoverTitle: z.boolean().optional(),
  coverTitleScale: z.enum(["sm", "md", "lg"]).optional(),
  coverTitleCase: z.enum(["uppercase", "normal"]).optional(),
  coverVideoUrl: z.string().optional().nullable(),
  layoutStyle: z.enum(["masonry", "grid", "editorial", "slideshow", "contactSheet"]).optional(),
  sectionsNavMode: z.enum(["overview", "sectionsFirst", "sectionsOnly"]).optional(),
  slideshowTransition: z.enum(["fade", "kenburns", "slide"]).optional(),
  videoDisplayMode: z.enum(["standard", "cinema", "immersive"]).optional(),
  backgroundTheme: z
    .enum([
      "light",
      "ivory",
      "sand",
      "powdered",
      "dark",
      "anthracite",
      "espresso",
      "olive",
      "brandLight",
      "brandDark",
    ])
    .optional(),
  backgroundCustomHex: z.string().optional().nullable(),
  backgroundCustomTextHex: z.string().optional().nullable(),
  accentTheme: z
    .enum(["blue", "custom", "black", "brown", "rust", "amber", "burgundy", "olive"])
    .optional(),
  accentCustomHex: z.string().optional().nullable(),
  musicUrl: z.string().optional().nullable(),
});

export const gallerySchema = z.object({
  title: z.string().min(1),
  clientId: z.string().optional().nullable(),
  // Clients additionnels (accès secondaire en lecture seule, voir modèle GalleryClientAccess) —
  // le client principal (clientId ci-dessus) reste seul à piloter facturation/devis/notifications.
  additionalClientIds: z.array(z.string()).optional(),
  eventDate: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  allowDownload: z.boolean().optional(),
  downloadLimit: z.number().int().positive().optional().nullable(),
  allowGuestDownload: z.boolean().optional(),
  requireGuestApproval: z.boolean().optional(),
  allowFavorites: z.boolean().optional(),
  showWatermark: z.boolean().optional(),
  expiresAt: z.string().optional().nullable(),
  coverPhotoId: z.string().optional().nullable(),
  design: galleryDesignSchema.optional(),
  categoryTag: z.string().optional().nullable(),
  starred: z.boolean().optional(),
  featuredHome: z.boolean().optional(),
  photoSortOrder: z.enum(PHOTO_SORT_KEYS).optional(),
  // "Visible par" : pris en compte tant qu'aucun set n'est créé dans la galerie (voir
  // Gallery.defaultVisibility) — au moins une catégorie requise si le champ est fourni,
  // pour ne jamais rendre une galerie invisible partout par erreur.
  defaultVisibility: z.array(z.enum(["CLIENT", "GUEST", "PORTFOLIO"])).min(1).optional(),

  // ---- Nouveaux champs Gallery du chantier refonte Réglages (12/09/2026) — voir
  // schema.prisma pour le commentaire complet sur chacun (persistés via $executeRaw côté
  // PATCH /api/galleries/[id], trop récents pour le Prisma Client généré du sandbox).
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  projectName: z.string().optional().nullable(),
  allowComments: z.boolean().optional(),
  containsPortraits: z.boolean().optional(),
  selectionLimit: z.number().int().positive().optional().nullable(),
  showMetadata: z.boolean().optional(),
  downloadWebOptimized: z.boolean().optional(),
  downloadSocialFormats: z.boolean().optional(),
});

export const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const productSchema = z.object({
  type: z.enum(["DIGITAL_DOWNLOAD", "PRINT", "ALBUM", "PACKAGE"]),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  priceCents: z.number().int().nonnegative(),
  sku: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

/** Catalogue impression plateforme (/admin/print-catalog) — voir src/lib/printCatalog.ts.
 * `sku` porte ici le SKU Prodigi (ex: "GLOBAL-CAN-10x10"), utilisé pour la synchro du coût de
 * revient (voir prodigiSync.ts) et, plus tard, la soumission de commande. */
export const printCatalogItemSchema = z.object({
  /** Optionnel, généré côté client à l'ouverture du formulaire "Nouveau produit" (demande
   * d'Adriel, 01/08/2026 : "pourquoi ne pas mettre l'upload sur la creation d'un nouveau
   * produit ?") — permet d'uploader l'image AVANT le premier enregistrement du produit (la clé
   * de stockage est indexée par cet id), en lui donnant explicitement l'id qui sera utilisé à
   * la création plutôt que d'en laisser générer un nouveau côté serveur (voir
   * createPrintCatalogItem). Ignoré par la route PATCH (l'id du produit existant, dans l'URL,
   * prime toujours).
   */
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).default("eur"),
  sku: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  active: z.boolean().optional(),
  wholesaleCostCents: z.number().int().nonnegative().optional().nullable(),
  /** Chantier "groupe de produits" (02/08/2026, demande d'Adriel : "peux tu ajouter la
   * possibilité de creer un groupe de produit et a l'intérieur ajouter les SKU adéquat ?") —
   * true = ce produit EST un groupe (conteneur de tailles/SKU), voir isProductGroup dans
   * schema.prisma. Mutuellement exclusif avec groupId (validé dans la route, pas ici : zod ne
   * connaît pas facilement cette règle croisée sur un schema partiel côté PATCH). */
  isProductGroup: z.boolean().optional(),
  /** Id du groupe parent si ce produit est une VARIANTE créée à l'intérieur d'un groupe
   * existant — null/absent pour un produit autonome ou un groupe. */
  groupId: z.string().optional().nullable(),
  /** Propose au client un choix "Photo pleine page"/"Bordure blanche" à l'assignation
   * (02/08/2026, demande d'Adriel : "On dois ajouter dans panel admin type de bordure [...]
   * meme si nous ne mettons pas cela dans le visuel [transmis à Prodigi], juste pour la
   * représentation visuel") — Prodigi ne supporte pas ce choix comme attribut API, voir
   * Product.borderOptionEnabled dans schema.prisma : purement local/informatif. */
  borderOptionEnabled: z.boolean().optional(),
  /** Checkbox admin "Cadre" (02/08/2026, demande d'Adriel : "ajouter un checkbox [...] pour
   * valider si on dois mettre un Cadre sur la photo [...] pour le moment toute les produits on
   * un cadre avec couleur grise") — voir doc Product.hasFrame dans schema.prisma. */
  hasFrame: z.boolean().optional(),
  /** Traductions du nom/de la description par langue (02/08/2026, demande d'Adriel : "je veux la
   * possibilité de traduire par les différents langues que nous avons dans notre saas") — clés =
   * codes de src/lib/i18n/locales.ts (hors "fr", qui reste dans name/description ci-dessus).
   * Reçu ici comme objet (pas encore sérialisé) : l'API route le JSON.stringify avant de le
   * transmettre à createPrintCatalogItem/updatePrintCatalogItem, voir doc Product.translations
   * dans schema.prisma. */
  translations: z.record(z.string(), z.object({ name: z.string().optional(), description: z.string().optional().nullable() })).optional(),
});

export const bookingRequestSchema = z.object({
  bookingTypeId: z.string().optional().nullable(),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  notes: z.string().optional().nullable(),
});

export const contractSchema = z.object({
  clientId: z.string().optional().nullable(),
  title: z.string().min(1),
  bodyHtml: z.string().min(1),
  // Montant total convenu du contrat, en centimes (31/07/2026, demande d'Adriel : sert de
  // référence au suivi facturé/payé via les factures liées, voir Contract.amountCents dans
  // schema.prisma). Nullable : un contrat n'a pas toujours un prix figé à la rédaction.
  amountCents: z.number().int().nonnegative().optional().nullable(),
});

export const invoiceSchema = z
  .object({
    clientId: z.string().optional().nullable(),
    // Nom saisi librement quand aucun Client du CRM n'est sélectionné (31/07/2026, demande
    // d'Adriel) — obligatoire dans ce cas précis, voir superRefine ci-dessous.
    guestClientName: z.string().optional().nullable(),
    // Rattachement optionnel à un contrat (31/07/2026, refonte facturation demandée par Adriel :
    // "une qui nous permet de créer une facture à la demande et l'autre lié au contrat") — sert
    // au suivi facturé/payé affiché sur le contrat (voir Contract.amountCents) et permet le
    // schéma acompte + solde (plusieurs factures liées à un même contrat). Un contrat ne peut
    // être lié qu'à une facture ayant un clientId défini (voir superRefine ci-dessous : sans
    // Client identifié, il n'y a pas de "propriétaire" cohérent auquel rattacher le contrat).
    contractId: z.string().optional().nullable(),
    lineItems: z
      .array(
        z.object({
          description: z.string().min(1),
          quantity: z.number().int().positive(),
          unitPriceCents: z.number().int().nonnegative(),
        })
      )
      .min(1),
    dueDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    template: z.string().optional().nullable(),
    // Taux de TVA optionnel (31/07/2026, demande d'Adriel : case à cocher "Appliquer la TVA")
    // — en pourcentage (ex: 20 pour 20%), null/absent = pas de TVA sur cette facture.
    vatRate: z.number().min(0).max(100).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.clientId) {
      if (!data.guestClientName || !data.guestClientName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["guestClientName"],
          message: "Le nom du client est requis si aucun client du CRM n'est sélectionné.",
        });
      }
      if (data.contractId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contractId"],
          message: "Un contrat ne peut être lié qu'à une facture rattachée à un client.",
        });
      }
    }
  });

/// Grille tarifaire (panel admin plateforme /admin/plans) — voir modèle Plan dans le
/// schéma Prisma. `slug` sert d'identifiant stable (ex: dans l'URL de /tarifs, ou pour
/// retrouver le plan gratuit par défaut), distinct du `name` affiché qu'on peut renommer
/// librement sans casser de lien.
export const planSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Lettres minuscules, chiffres et tirets uniquement"),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  priceMonthlyCents: z.number().int().nonnegative(),
  priceAnnualCents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).default("eur"),
  storageLimitGB: z.number().int().positive().optional().nullable(),
  galleryLimit: z.number().int().positive().optional().nullable(),
  teamMemberLimit: z.number().int().positive().optional().nullable(),
  customDomainAllowed: z.boolean().optional(),
  removeBranding: z.boolean().optional(),
  storeCommissionPercent: z.number().int().min(0).max(100).optional(),
  contractLimit: z.number().int().positive().optional().nullable(),
  quoteLimit: z.number().int().positive().optional().nullable(),
  sessionTypeLimit: z.number().int().positive().optional().nullable(),
  paymentReminders: z.boolean().optional(),
  tipOnInvoice: z.boolean().optional(),
  depositAtBooking: z.boolean().optional(),
  tipAtBooking: z.boolean().optional(),
  manualBookingApproval: z.boolean().optional(),
  bookingReminders: z.boolean().optional(),
  isFree: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/// Bascule globale d'une fonctionnalité (indépendante des plans) — voir PlatformFeature
/// dans le schéma Prisma et src/lib/platformFeatures.ts.
export const platformFeatureToggleSchema = z.object({
  enabled: z.boolean(),
});

/// Bloc de contenu du site marketing pixleh (voir modèle MarketingBlock). `data` reste
/// volontairement libre (z.record) — sa forme dépend de `type` et est validée côté
/// formulaire admin (src/app/(platform-admin)/admin/site/page.tsx), pas ici : un schéma
/// union stricte par type serait beaucoup plus lourd à maintenir pour un gain limité, vu
/// que ce contenu n'est modifiable que par isPlatformAdmin (pas une entrée utilisateur
/// non fiable).
export const marketingBlockSchema = z.object({
  page: z.enum(["HOME", "EXEMPLES", "TARIFS", "A_PROPOS"]),
  type: z.enum(["HERO", "FEATURES", "CATEGORIES", "RICH_TEXT", "CTA"]),
  active: z.boolean().optional(),
  data: z.record(z.any()),
});

export const marketingBlockMoveSchema = z.object({
  direction: z.enum(["up", "down"]),
});
