"use client";

import { useEffect, useState } from "react";

export interface HeroCarouselSlide {
  id: string;
  text: string;
  imageUrl: string | null;
}

/**
 * Bandeau carrousel affiché tout en haut de la page d'accueil publique du studio, juste
 * après le header (voir Réglages > Carrousel côté dashboard pour la config : texte +
 * image de fond par slide). Défilement automatique quand il y a plusieurs slides, avec
 * indicateurs cliquables ; ne s'affiche pas du tout si aucune slide n'est configurée.
 */
export function HeroCarousel({ slides }: { slides: HeroCarouselSlide[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div className="relative h-[60vh] min-h-[360px] w-full overflow-hidden bg-gray-900 sm:h-[70vh]">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-700 ${
            index === active ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {slide.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/30" />
          {slide.text && (
            // `mx-auto max-w-6xl px-6` reproduit exactement le conteneur de la grille
            // "Portfolio" (voir PortfolioGrid) : le texte démarre ainsi pile à la même
            // position horizontale que la première galerie affichée juste en dessous.
            <div className="absolute inset-0 flex items-center">
              <div className="mx-auto w-full max-w-6xl px-6">
                {/* Pas de troncature (line-clamp) : le texte doit rester lisible en
                    entier. On vise plutôt "2 lignes max" en laissant beaucoup de largeur
                    (max-w-4xl) et une taille de police qui redescend un peu si besoin. */}
                <p className="max-w-4xl text-left font-serif text-xl font-semibold uppercase leading-snug tracking-wide text-white drop-shadow sm:text-3xl lg:text-4xl">
                  {slide.text}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Slide ${index + 1}`}
              onClick={() => setActive(index)}
              className={`h-2 rounded-full transition-all ${
                index === active ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
