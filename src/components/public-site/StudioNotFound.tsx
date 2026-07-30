"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Contenu du 404 scoppé à un studio — réutilisé par deux dossiers différents :
 * (public-site)/s/[studioSlug]/not-found.tsx (ex: /s/jane-doe/blog/article-supprime, URL
 * `/s/<slug>/...`) et [studioSlug]/not-found.tsx (portfolio public dédié, URL
 * `/<slug>/portfolio/<gallerySlug>`, pas de préfixe `/s/`). Next.js 14 ne transmet pas les
 * params de route à not-found.tsx (limitation connue :
 * https://github.com/vercel/next.js/discussions/43179), donc on récupère le slug directement
 * depuis l'URL courante via usePathname() plutôt que de faire une requête DB — d'où la
 * détection du préfixe `/s/` ci-dessous pour retrouver le bon segment selon l'origine. La page
 * d'accueil du studio vit toujours sur /s/[studioSlug], quel que soit le point d'entrée. Si le
 * slug lui-même est invalide, le lien "page d'accueil" mènera vers ce même 404 — dégradation
 * acceptable pour ce cas limite (URL de studio mal tapée).
 *
 * Redesign du 30/07/2026 (charte pixleh) : même traitement typographique du "404" (dégradé
 * identique au logo pixleh, voir src/app/not-found.tsx) que le 404 global, MAIS sans le logo
 * pixleh lui-même ni de lien "nous contacter" — cette page reste dans l'espace du studio
 * (avatar/nom déjà affichés par PublicSiteHeader au-dessus, voir
 * (public-site)/s/[studioSlug]/layout.tsx), pixleh n'a pas à s'y mettre en avant.
 */
export function StudioNotFound() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const studioSlug = segments[0] === "s" ? segments[1] : segments[0];
  const homeHref = studioSlug ? `/s/${studioSlug}` : "/";

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-20 text-center">
      <p
        className="font-serif text-6xl font-bold leading-none sm:text-7xl"
        style={{
          backgroundImage: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 75%, #F97316 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        404
      </p>
      <h1 className="mt-5 font-serif text-2xl font-semibold text-gray-900 sm:text-3xl">
        Cette page a été supprimée ou modifiée
      </h1>
      <Link href={homeHref} className="btn-primary mt-7">
        Retour à la page d&apos;accueil
      </Link>
    </div>
  );
}
