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
 */
export function StudioNotFound() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const studioSlug = segments[0] === "s" ? segments[1] : segments[0];
  const homeHref = studioSlug ? `/s/${studioSlug}` : "/";

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="font-serif text-3xl font-semibold text-gray-900 sm:text-4xl">
        Cette page a été supprimée ou modifiée
      </h1>
      <p className="mt-4 text-gray-600">
        Vous pouvez retourner à la{" "}
        <Link href={homeHref} className="text-brand-600 underline underline-offset-2 hover:text-brand-700">
          page d&apos;accueil
        </Link>
        .
      </p>
    </div>
  );
}
