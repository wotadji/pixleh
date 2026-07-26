/**
 * Loader partagé du dashboard studio — même style (cercle border-t-brand-500) déjà utilisé
 * ponctuellement (ex. upload de photos dans GalleryManager), extrait ici pour être réutilisé
 * par tous les `loading.tsx` de page (Server Components) et les états de chargement des
 * pages en Client Component (fetch initial en useEffect).
 */
export function Spinner({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Conteneur pleine page pour un `loading.tsx` de route — centre le spinner dans la zone de
 * contenu du dashboard (la sidebar reste affichée, voir dashboard/layout.tsx : `loading.tsx`
 * ne remplace que `{children}`).
 */
export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
