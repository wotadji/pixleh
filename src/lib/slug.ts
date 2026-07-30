/**
 * Segments d'URL déjà utilisés à la racine du site (routes système) — un Studio ne doit
 * jamais pouvoir obtenir un de ces slugs, sinon sa page publique deviendrait inatteignable
 * (la route statique gagne toujours face à la route dynamique [studioSlug]) ou, pire,
 * masquerait une vraie route système pour tout le monde tant que le slug est pris.
 *
 * Nécessaire depuis l'introduction de la page portfolio d'une galerie individuelle à la
 * racine (/[studioSlug]/[gallerySlug], voir src/app/[studioSlug]/[gallerySlug]/page.tsx) —
 * avant ça, tout vivait sous /s/[studioSlug], donc aucun risque de collision avec les autres
 * routes racine. Cette liste doit être tenue à jour à chaque nouvelle route ajoutée
 * directement sous src/app/ (en dehors des route groups qui n'ajoutent pas de segment).
 */
export const RESERVED_STUDIO_SLUGS = new Set([
  // (auth)
  "forgot-password",
  "login",
  "register",
  "reset-password",
  // (gallery)
  "g",
  "invite",
  // (marketing)
  "a-propos",
  "cgu",
  "cgv",
  "confidentialite",
  "exemples",
  "mentions-legales",
  "tarifs",
  // (platform-admin)
  "admin",
  // (public-site)
  "s",
  // (studio)
  "checkout",
  "dashboard",
  // racine (hors groupes)
  "api",
  "c",
  "i",
  // espace client (voir spec accès invités/visibilité, 29/07/2026)
  "client",
  "approve-guest",
  // conventions Next.js / fichiers statiques
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "_next",
]);

export function isReservedStudioSlug(slug: string): boolean {
  return RESERVED_STUDIO_SLUGS.has(slug.toLowerCase());
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function randomSuffix(length = 6): string {
  return Math.random().toString(36).slice(2, 2 + length);
}
