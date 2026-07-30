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
  gridSpacing: z.enum(["regular", "large"]).optional(),
  navigationStyle: z.enum(["icon", "iconText"]).optional(),
  columnsPerRow: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(),
  coverFocalX: z.number().min(0).max(1).optional(),
  coverFocalY: z.number().min(0).max(1).optional(),
});

export const gallerySchema = z.object({
  title: z.string().min(1),
  clientId: z.string().optional().nullable(),
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
});

export const invoiceSchema = z.object({
  clientId: z.string().optional().nullable(),
  // Rattachement optionnel à un contrat (31/07/2026, refonte facturation demandée par Adriel :
  // "une qui nous permet de créer une facture à la demande et l'autre lié au contrat") — sert
  // au suivi facturé/payé affiché sur le contrat (voir Contract.amountCents) et permet le
  // schéma acompte + solde (plusieurs factures liées à un même contrat).
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
