import { StudioNotFound } from "@/components/public-site/StudioNotFound";

export const metadata = { title: "Page introuvable" };

/**
 * 404 pour toute page manquante sous /s/[studioSlug]/... (galerie, article de blog, page à
 * propos...) — texte volontairement différent du 404 global de pixleh (voir src/app/not-found.tsx) :
 * pas de lien "nous contacter" ici, ce n'est pas à pixleh de répondre pour le studio. Demandé
 * par Adriel le 30/07/2026. Se déclenche aussi si layout.tsx du même dossier appelle notFound()
 * (studioSlug inexistant) : dans ce cas ce fichier est rendu SANS le header/footer du studio
 * (le layout n'a pas pu se monter), voir StudioNotFound.tsx pour comment le lien "page d'accueil"
 * se construit quand même à partir de l'URL.
 */
export default function NotFound() {
  return <StudioNotFound />;
}
