/**
 * Squelette affiché automatiquement par Next.js (App Router) pendant le chargement de la
 * page galerie publique (récupération de la galerie, des photos, vérification d'accès...
 * tout se fait côté serveur avant le premier rendu). Sans ce fichier, le navigateur reste
 * sur un écran blanc pendant ce temps — ici on affiche tout de suite une structure proche
 * du rendu final (couverture pleine largeur + barre + grille de vignettes), en pulsation,
 * pour que la page ne semble jamais figée.
 */
export default function GalleryLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-[60vh] max-h-[640px] min-h-[420px] w-full bg-neutral-200" />
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="h-3 w-32 rounded bg-gray-200" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="h-8 w-8 rounded-full bg-gray-200" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="aspect-square bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
