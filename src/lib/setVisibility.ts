const VALID_VISIBILITY = ["CLIENT", "GUEST", "PORTFOLIO"] as const;
export type SetVisibilityValue = (typeof VALID_VISIBILITY)[number];

/**
 * Valide/nettoie la liste de catégories envoyée par le dashboard (voir les cases à
 * cocher Client/Invité/Portfolio dans GalleryManager) avant de l'enregistrer sur un
 * Collection.visibility — évite d'écrire des valeurs arbitraires en base si jamais le
 * payload est malformé. Renvoie `undefined` si le champ n'est pas un tableau (= pas de
 * changement demandé), jamais un tableau vide involontairement.
 */
export function sanitizeVisibility(input: unknown): SetVisibilityValue[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const cleaned = input.filter((v): v is SetVisibilityValue =>
    VALID_VISIBILITY.includes(v as SetVisibilityValue)
  );
  return Array.from(new Set(cleaned));
}
