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
 *
 * IMPORTANT (bug remonté par Adriel le 13/08/2026, capture à l'appui) : sur DESKTOP (Mac,
 * navigateur), partager vers un site web comme facebook.com ouvre bien la fenêtre "Créer une
 * publication", mais SANS la photo attachée. `navigator.canShare({ files })` peut répondre
 * `true` sur desktop (le navigateur accepte la requête), mais rien ne garantit que le fichier
 * binaire soit réellement transmis à travers le mécanisme de partage du navigateur/OS vers une
 * cible web — en pratique il ne l'est pas pour facebook.com sur macOS/Windows. Le partage de
 * fichier fiable via `navigator.share({ files })` ne fonctionne que vers des apps NATIVES
 * installées sur mobile (iOS/Android) qui s'enregistrent comme cibles de partage du système :
 * l'app Facebook/Instagram/TikTok mobile reçoit alors vraiment le fichier.
 *
 * On ne tente donc `navigator.share({ files })` QUE si on détecte un appareil mobile (voir
 * `isMobileDevice`) ET que `navigator.canShare({ files })` est vrai. Sur desktop, on saute
 * directement au téléchargement (fallback déjà existant pour les navigateurs incompatibles),
 * et on renvoie `"downloaded-desktop"` pour permettre à l'appelant d'afficher un message
 * expliquant qu'il faut publier la photo manuellement.
 */

/**
 * Détection fiable "mobile" (téléphone/tablette). iPadOS (depuis iOS 13) se présente comme un
 * Mac dans `navigator.userAgent`/`platform` : on le distingue d'un vrai Mac via le support
 * tactile (`navigator.maxTouchPoints > 1`, qu'un Mac n'a pas — 0 ou 1 selon les modèles/trackpad).
 */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  if (/Mac/i.test(navigator.platform || "") && navigator.maxTouchPoints > 1) return true;
  return false;
}

/**
 * - "shared" : partage natif de fichier réussi (mobile uniquement).
 * - "cancelled" : partage natif annulé par l'utilisateur.
 * - "downloaded" : repli téléchargement (mobile sans support fichier, ou navigateur non
 *   compatible avec la Web Share API).
 * - "downloaded-desktop" : repli téléchargement spécifiquement parce qu'on est sur desktop —
 *   à distinguer de "downloaded" pour pouvoir informer l'utilisateur qu'il doit publier la
 *   photo manuellement (le partage direct de fichier n'est pas fiable hors mobile).
 */
export type ShareResult = "shared" | "cancelled" | "downloaded" | "downloaded-desktop";

export async function shareOrDownloadImage(
  fileUrl: string,
  filename: string,
  shareTitle?: string
): Promise<ShareResult> {
  const res = await fetch(fileUrl);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  const mobile = isMobileDevice();

  if (
    mobile &&
    typeof navigator !== "undefined" &&
    "share" in navigator &&
    "canShare" in navigator &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
      return "shared";
    } catch {
      // Partage annulé par l'utilisateur — rien à faire, pas un échec à signaler.
      return "cancelled";
    }
  }

  // Pas de partage natif de fichier disponible (desktop, ou navigateur mobile non compatible) :
  // déclenche un téléchargement classique, à publier manuellement ensuite.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return mobile ? "downloaded" : "downloaded-desktop";
}
