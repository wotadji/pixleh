/**
 * Composition de deux cartes UI (facture + boutique) pour la section CTA finale de
 * l'accueil — même esprit que la vignette "Start using Pixieset today" de pixieset.com
 * (plusieurs cartes produit qui se chevauchent), mais avec l'identité et les vraies
 * fonctionnalités de pixleh plutôt que le visuel réel d'un client Pixieset (Topicrem) que
 * je ne peux pas réutiliser — voir l'échange avec Adriel. Purement CSS, aucune image.
 */
export function FinalCtaVisual() {
  return (
    <div className="relative mx-auto h-72 w-full max-w-sm sm:h-80">
      <div className="absolute inset-x-4 top-0 h-56 rounded-3xl bg-gradient-to-br from-brand-100 via-brand-50 to-white sm:h-64" />

      {/* Carte boutique — grille de produits */}
      <div className="absolute right-0 top-0 w-56 -rotate-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
        <p className="text-xs font-semibold text-gray-900">Boutique</p>
        <p className="text-[11px] text-gray-400">Tirages & téléchargements</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="h-10 rounded-md bg-brand-200" />
          <div className="h-10 rounded-md bg-gray-300" />
          <div className="h-10 rounded-md bg-amber-200" />
          <div className="h-10 rounded-md bg-gray-200" />
          <div className="h-10 rounded-md bg-brand-300" />
          <div className="h-10 rounded-md bg-rose-200" />
        </div>
      </div>

      {/* Carte facture */}
      <div className="absolute bottom-0 left-0 w-48 rotate-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-900">Facture 240€</p>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-800">
            Payée
          </span>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Camille &amp; Hugo</p>
        <div className="mt-3 h-px bg-gray-100" />
        <div className="mt-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
            ↓
          </span>
          <span className="text-[11px] text-gray-500">Télécharger le PDF</span>
        </div>
      </div>
    </div>
  );
}
