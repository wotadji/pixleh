/**
 * Code d'accès galerie aléatoire (bouton "Générer" à côté du champ "Code", à la création
 * comme dans Réglages > Général) — alphabet réduit aux caractères non ambigus (pas de 0/O ni
 * 1/l/I) puisque ce code est destiné à être lu et retapé à la main par le client, pas
 * mémorisé comme un mot de passe de compte. Ne remplace le champ qu'au clic, jamais
 * automatiquement : le studio garde la main pour saisir son propre code s'il préfère.
 * Extrait de GalleryManager.tsx (05/08/2026) pour être partagé avec NewGalleryForm.tsx.
 */
export function generateGalleryCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
