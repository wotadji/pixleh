import { StudioNotFound } from "@/components/public-site/StudioNotFound";

export const metadata = { title: "Page introuvable" };

/**
 * 404 pour /[studioSlug]/portfolio/[gallerySlug] (portfolio public dédié — voir
 * src/app/[studioSlug]/portfolio/[gallerySlug]/page.tsx, qui appelle notFound() si le studio,
 * la galerie ou son set Portfolio n'existent pas/plus). Même contenu que le 404 de
 * (public-site)/s/[studioSlug]/ (voir StudioNotFound.tsx), qui sait retrouver le bon lien
 * "page d'accueil" (toujours /s/[studioSlug]) quelle que soit l'URL d'origine.
 */
export default function NotFound() {
  return <StudioNotFound />;
}
