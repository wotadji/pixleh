"use client";

/**
 * Partage natif d'une photo vers les réseaux sociaux (Facebook/Instagram/TikTok/...), utilisé
 * par le set "Réseaux sociaux" du panel studio (GalleryManager) et par les collections privées
 * du portail client (voir ClientCollections) — 12/08/2026, demande d'Adriel.
 *
 * Il n'existe pas d'API web permettant de publier directement sur Instagram ou TikTok sans
 * intégration officielle (compte développeur validé par Meta/TikTok, revue de l'app, compte
 * Business connecté...) — voir la discussion avec Adriel du 12/08/2026. La seule voie "directe"
 * réellement disponible sans cette lourdeur est la Web Share API de niveau 2 (`navigator.share`
 * avec `files`), qui ouvre la feuille de partage native du système d'exploitation : sur mobile,
 * elle propose Instagram/TikTok/Facebook/Messenger comme cibles au même titre que n'importe
 * quelle app installée, et l'utilisateur n'a plus qu'à appuyer sur "Publier" dans l'app choisie.
 * Sur desktop (pas de feuille de partage système avec fichiers), on retombe sur un simple
 * téléchargement de la photo.
 */
export async function shareOrDownloadImage(fileUrl: string, filename: string, shareTitle?: string) {
  const res = await fetch(fileUrl);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

  if (
    typeof navigator !== "undefined" &&
    "share" in navigator &&
    "canShare" in navigator &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
      return "shared" as const;
    } catch {
      // Partage annulé par l'utilisateur — rien à faire, pas un échec à signaler.
      return "cancelled" as const;
    }
  }

  // Pas de partage natif de fichier disponible (desktop, navigateur non compatible) :
  // déclenche un téléchargement classique, à publier manuellement ensuite.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded" as const;
}
