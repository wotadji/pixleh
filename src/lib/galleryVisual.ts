/**
 * Vignette de secours (initiales sur fond coloré) utilisée partout où une galerie peut ne
 * pas encore avoir de couverture : liste studio (voir GalleriesListView.tsx, d'où ce fichier
 * a été extrait le 30/07/2026) et espace Client (ClientGalleriesView.tsx). Centralisé ici
 * plutôt que dupliqué pour que les deux endroits attribuent toujours la même couleur à une
 * même galerie.
 */

export const GALLERY_INITIALS_COLORS = [
  "bg-rose-100 text-rose-600",
  "bg-amber-100 text-amber-600",
  "bg-emerald-100 text-emerald-600",
  "bg-sky-100 text-sky-600",
  "bg-violet-100 text-violet-600",
  "bg-pink-100 text-pink-600",
  "bg-teal-100 text-teal-600",
  "bg-orange-100 text-orange-600",
];

export function galleryInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Couleur stable par galerie (dérivée du titre) : la même galerie garde toujours la même
// couleur d'un rendu à l'autre, sans avoir besoin de la stocker en base.
export function galleryColorForTitle(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 997;
  return GALLERY_INITIALS_COLORS[Math.abs(hash) % GALLERY_INITIALS_COLORS.length];
}
