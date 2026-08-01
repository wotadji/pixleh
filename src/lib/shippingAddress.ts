/**
 * Adresse de livraison saisie par le client dans PrintSelectionPanel avant paiement (chantier
 * "impression pixleh Phase 2", 01/08/2026) — stockée en JSON dans Order.shippingAddress
 * (colonne texte déjà existante, réutilisée telle quelle pour éviter une nouvelle migration).
 * Partagé entre le composant client (formulaire), /api/cart/checkout (validation + écriture) et
 * src/lib/prodigiOrder.ts (lecture pour construire le destinataire Prodigi) — aucune dépendance
 * serveur ici (pas de Prisma), donc importable sans risque depuis un composant "use client".
 */
export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, ex "FR" — voir le sélecteur de pays dans PrintSelectionPageView. */
  countryCode: string;
  /** Obligatoire depuis le 01/08/2026 (demande d'Adriel : "le telephone est obligatoire pour
   * aider la livraison") — le transporteur de Prodigi peut en avoir besoin pour organiser la
   * livraison (colis, code d'accès...), contrairement au nom/email déjà collectés par ailleurs. */
  phone: string;
}

/** Les 5 champs sans lesquels Prodigi refuse une commande (le téléphone est requis côté pixleh
 * pour la livraison, pas seulement recommandé). */
export function isShippingAddressComplete(addr: Partial<ShippingAddress> | null | undefined): addr is ShippingAddress {
  return Boolean(addr && addr.line1 && addr.city && addr.postalCode && addr.countryCode && addr.phone);
}

export function parseShippingAddress(raw: string | null | undefined): ShippingAddress | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!isShippingAddressComplete(data)) return null;
    return data as ShippingAddress;
  } catch {
    return null;
  }
}
