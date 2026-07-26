/**
 * Résolution des vidéos externes (Vimeo/YouTube) — onglet "Vidéo" d'une galerie (v1 :
 * uniquement des liens externes, voir le commentaire du modèle Video dans schema.prisma).
 * Pas de clé API nécessaire : les endpoints oEmbed de Vimeo et YouTube sont publics.
 */

export type VideoProvider = "vimeo" | "youtube";

export interface ParsedVideoUrl {
  provider: VideoProvider;
  externalId: string;
}

const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/i;
const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i;

/** Détecte le provider et extrait l'identifiant vidéo depuis une URL collée par le studio. */
export function parseVideoUrl(url: string): ParsedVideoUrl | null {
  const trimmed = url.trim();
  const vimeoMatch = trimmed.match(VIMEO_RE);
  if (vimeoMatch) return { provider: "vimeo", externalId: vimeoMatch[1] };
  const youtubeMatch = trimmed.match(YOUTUBE_RE);
  if (youtubeMatch) return { provider: "youtube", externalId: youtubeMatch[1] };
  return null;
}

/** URL à mettre dans le `src` de l'iframe du lecteur (galerie publique + aperçu studio). */
export function buildEmbedUrl(provider: VideoProvider, externalId: string): string {
  if (provider === "vimeo") return `https://player.vimeo.com/video/${externalId}`;
  return `https://www.youtube.com/embed/${externalId}`;
}

export interface VideoOEmbedMeta {
  title: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
}

/**
 * Interroge l'API oEmbed publique du provider pour récupérer titre/miniature/durée au
 * moment où le studio colle le lien — en cas d'échec (lien privé, provider indisponible,
 * timeout), on renvoie des métadonnées vides plutôt que de bloquer l'ajout de la vidéo :
 * le studio peut toujours donner un titre manuellement (voir POST /api/galleries/[id]/videos).
 */
export async function fetchVideoOEmbed(url: string, provider: VideoProvider): Promise<VideoOEmbedMeta> {
  const endpoint =
    provider === "vimeo"
      ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
      : `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { title: null, thumbnailUrl: null, duration: null };
    const data = await res.json();
    return {
      title: typeof data.title === "string" ? data.title : null,
      thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
      // Seul Vimeo renvoie `duration` (secondes) dans son oEmbed ; YouTube ne l'inclut pas.
      duration: typeof data.duration === "number" ? data.duration : null,
    };
  } catch {
    return { title: null, thumbnailUrl: null, duration: null };
  }
}

/** Formate une durée en secondes vers `m:ss` (ex: 125 → "2:05"), ou null si inconnue. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
