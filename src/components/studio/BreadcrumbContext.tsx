"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Permet à une page profonde du dashboard (ex: GalleryManager, qui connaît le titre de LA
 * galerie ouverte) de fournir un dernier segment dynamique au fil d'Ariane de DashboardTopBar,
 * sans que celle-ci ait besoin de refaire une requête ou de connaître chaque type de page.
 *
 * `null` = aucun segment dynamique (la page courante n'en a pas besoin, ex: /dashboard/clients
 * dont le libellé "Clients" suffit, déjà déduit du chemin par DashboardTopBar).
 */
const BreadcrumbContext = createContext<{
  extraLabel: string | null;
  setExtraLabel: (label: string | null) => void;
}>({ extraLabel: null, setExtraLabel: () => {} });

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [extraLabel, setExtraLabel] = useState<string | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ extraLabel, setExtraLabel }}>{children}</BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbExtra() {
  return useContext(BreadcrumbContext).extraLabel;
}

/** À appeler depuis une page/un composant profond (ex: GalleryManager avec `gallery.title`) —
 * enregistre le segment dynamique au montage et le retire au démontage, pour ne jamais laisser
 * le fil d'Ariane d'une page précédente "traîner" sur la page suivante. */
export function useSetBreadcrumbExtra(label: string | null) {
  const { setExtraLabel } = useContext(BreadcrumbContext);
  useEffect(() => {
    setExtraLabel(label);
    return () => setExtraLabel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);
}
