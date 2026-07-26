/**
 * Mockup CSS animé pour le hero de l'accueil — en attendant une vraie vidéo produit (voir
 * discussion avec Adriel : pas d'outil de génération vidéo côté Claude, et hors de question
 * de réutiliser la vidéo d'accueil de Pixieset, qui montre leur propre marque). Simule un
 * défilement dans une galerie pixleh avec une grille de vignettes en boucle infinie
 * (voir .hero-grid-pan dans globals.css) — aucune image chargée, aucun fichier vidéo,
 * juste des blocs colorés qui évoquent des photos.
 */

// Teintes variées (tons "photo") + touches de la palette de marque, pour que la grille
// ait l'air d'un vrai mélange de clichés plutôt que d'un dégradé répétitif.
const TILE_TONES = [
  "bg-brand-200",
  "bg-gray-300",
  "bg-amber-200",
  "bg-brand-400",
  "bg-gray-200",
  "bg-rose-200",
  "bg-brand-300",
  "bg-gray-400",
  "bg-orange-200",
];

const HEIGHTS = ["h-24", "h-32", "h-20", "h-28"];

function GridTiles({ ariaHidden }: { ariaHidden: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-3" aria-hidden={ariaHidden}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className={`${TILE_TONES[i % TILE_TONES.length]} ${HEIGHTS[i % HEIGHTS.length]} rounded-md`}
        />
      ))}
    </div>
  );
}

export function HeroMockup() {
  return (
    <div className="hero-float mx-auto w-full max-w-sm">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="ml-2 truncate text-xs text-gray-400">pixleh.app/s/votre-studio</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-gray-900">Mariage — Camille &amp; Hugo</p>
            <p className="text-[11px] text-gray-400">248 photos</p>
          </div>
          <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-800">
            ♥ 12
          </span>
        </div>
        <div className="h-72 overflow-hidden">
          <div className="hero-grid-pan space-y-2 py-1">
            <GridTiles ariaHidden={false} />
            <GridTiles ariaHidden />
            <GridTiles ariaHidden />
          </div>
        </div>
      </div>
    </div>
  );
}
