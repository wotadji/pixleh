"use client";

import { useEffect, useState } from "react";

interface PortfolioPhoto {
  id: string;
  width: number | null;
  height: number | null;
  thumbUrl: string;
  previewUrl: string;
}

/**
 * Grille + visionneuse de la page publique /[studioSlug]/portfolio/[gallerySlug] — volontairement
 * un composant à part de GalleryView (bien plus lourd : panier impression, favoris, remarques,
 * filtre par set...), puisque cette page n'affiche jamais qu'une seule "collection" implicite
 * (les photos déjà filtrées côté serveur aux sets marqués "Invité"... pardon, "Portfolio", voir
 * page.tsx) à un visiteur anonyme, sans aucune action possible autre que regarder en grand.
 */
export function PublicPortfolioGallery({ photos }: { photos: PortfolioPhoto[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i === null ? i : Math.min(i + 1, photos.length - 1)));
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? i : Math.max(i - 1, 0)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, photos.length]);

  return (
    <>
      <div className="columns-2 gap-3 px-4 sm:columns-3 sm:gap-4 sm:px-6 lg:columns-4">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setLightboxIndex(index)}
            className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-md bg-gray-100 sm:mb-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbUrl}
              alt=""
              width={photo.width ?? undefined}
              height={photo.height ?? undefined}
              loading="lazy"
              className="w-full transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Fermer"
            className="absolute right-4 top-4 text-3xl font-light text-white/80 hover:text-white"
          >
            ×
          </button>
          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? i : Math.max(i - 1, 0)));
              }}
              aria-label="Précédent"
              className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/70 hover:text-white sm:left-6"
            >
              ‹
            </button>
          )}
          {lightboxIndex < photos.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? i : Math.min(i + 1, photos.length - 1)));
              }}
              aria-label="Suivant"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/70 hover:text-white sm:right-6"
            >
              ›
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightboxIndex].previewUrl}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full object-contain"
          />
        </div>
      )}
    </>
  );
}
