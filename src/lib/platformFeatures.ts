import { prisma } from "@/lib/prisma";

/**
 * Registre des fonctionnalités liées à la grille tarifaire, avec un statut "réellement
 * développée" indépendant de ce que chaque Plan coche. Permet à Adriel de préparer la
 * grille tarifaire à l'avance (cocher une fonctionnalité sur les bons plans avant même
 * qu'elle existe) puis de l'activer d'un coup pour toute la plateforme depuis /admin/features
 * une fois développée — sans avoir à repasser plan par plan.
 *
 * `defaultEnabled` reflète l'état réel du développement au 20/07/2026, utilisé uniquement
 * pour amorcer la table PlatformFeature (voir prisma/seedFeatures.ts) — la valeur qui compte
 * ensuite est celle en base, modifiable depuis /admin/features.
 */
export interface PlatformFeatureDef {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const PLATFORM_FEATURES: PlatformFeatureDef[] = [
  {
    key: "video",
    label: "Support vidéo dans les galeries",
    description: "Upload et lecture de vidéos (auto-hébergées ou Vimeo/YouTube) dans une galerie.",
    defaultEnabled: true,
  },
  {
    key: "hdDownload",
    label: "Téléchargement pleine résolution",
    description: "Téléchargement des photos en résolution originale (pas seulement un aperçu web).",
    defaultEnabled: true,
  },
  {
    key: "storageQuota",
    label: "Application du quota de stockage",
    description: "Blocage de l'upload une fois le quota de stockage du plan atteint.",
    defaultEnabled: false,
  },
  {
    key: "galleryTeamLimits",
    label: "Limites galeries / membres d'équipe",
    description: "Blocage de la création au-delà des limites de galeries actives ou de membres d'équipe du plan.",
    defaultEnabled: false,
  },
  {
    key: "customDomain",
    label: "Domaine personnalisé",
    description: "Connexion d'un nom de domaine propre au studio pour son site et ses galeries.",
    defaultEnabled: false,
  },
  {
    key: "removeBranding",
    label: "Retrait du badge \"Propulsé par pixleh\"",
    description: "Masquage conditionnel du badge pixleh en pied de page selon le plan du studio.",
    defaultEnabled: false,
  },
  {
    key: "storeCommission",
    label: "Commission sur les ventes boutique (plan gratuit)",
    description: "Retenue d'un pourcentage sur les ventes boutique des studios en plan gratuit — nécessite Stripe Connect.",
    defaultEnabled: false,
  },
  {
    key: "contractQuoteLimits",
    label: "Limites contrats / devis",
    description: "Blocage de la création au-delà du nombre de contrats ou devis autorisés par le plan.",
    defaultEnabled: false,
  },
  {
    key: "sessionTypeLimits",
    label: "Limite de types de séance",
    description: "Blocage de la création au-delà du nombre de types de séance (BookingType) autorisés par le plan.",
    defaultEnabled: false,
  },
  {
    key: "paymentReminders",
    label: "Relances automatiques (facture, document)",
    description: "Envoi automatique de relances pour une facture impayée ou un document non signé.",
    defaultEnabled: false,
  },
  {
    key: "tipOnInvoice",
    label: "Pourboire sur facture",
    description: "Possibilité pour le client d'ajouter un pourboire au paiement d'une facture.",
    defaultEnabled: false,
  },
  {
    key: "depositAtBooking",
    label: "Acompte à la réservation",
    description: "Paiement d'un acompte par le client au moment de réserver un créneau.",
    defaultEnabled: false,
  },
  {
    key: "tipAtBooking",
    label: "Pourboire à la réservation",
    description: "Possibilité pour le client d'ajouter un pourboire au moment de réserver un créneau.",
    defaultEnabled: false,
  },
  {
    key: "manualBookingApproval",
    label: "Validation manuelle des réservations",
    description: "Les réservations restent \"en attente\" jusqu'à validation manuelle du studio, au lieu d'être confirmées automatiquement.",
    defaultEnabled: false,
  },
  {
    key: "bookingReminders",
    label: "Relances de réservation",
    description: "Envoi automatique de rappels avant un rendez-vous de réservation.",
    defaultEnabled: false,
  },
];

/** true uniquement si la fonctionnalité existe en base ET y est marquée active. */
export async function isFeatureLive(key: string): Promise<boolean> {
  const feature = await prisma.platformFeature.findUnique({ where: { key } });
  return feature?.enabled ?? false;
}

/** Version "plusieurs à la fois", pratique pour éviter N allers-retours DB. */
export async function getLiveFeatureKeys(): Promise<Set<string>> {
  const rows = await prisma.platformFeature.findMany({ where: { enabled: true }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}
