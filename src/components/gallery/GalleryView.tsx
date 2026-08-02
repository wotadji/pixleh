"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { photoDisplayFilename } from "@/lib/photoNaming";
import {
  resolveGalleryDesign,
  getFont,
  getPalette,
  gridColsClass,
  gridGapClass,
  masonryColumnCount,
  masonryGapClass,
  masonryItemSpacingClass,
} from "@/lib/galleryDesign";
import { buildEmbedUrl, formatDuration, type VideoProvider } from "@/lib/videoEmbed";
import { MarketingLanguageSwitcher } from "@/components/marketing/MarketingLanguageSwitcher";

interface PhotoDTO {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  updatedAt: string;
  collectionId?: string | null;
}

/** Set (Collection) de la galerie, pour le filtre par set de la barre du haut. */
interface CollectionDTO {
  id: string;
  title: string;
}

/** Vidéo de la galerie (onglet "Vidéo" à côté de "Photos") — soit externe (Vimeo/YouTube :
 * `provider`/`externalId`, lue via iframe), soit auto-hébergée (`storageKey` renseigné :
 * lue via <video> natif et téléchargeable comme une photo, voir VideoSection). */
interface VideoDTO {
  id: string;
  title: string;
  provider: VideoProvider | null;
  externalId: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  storageKey: string | null;
  mimeType: string | null;
}

interface PrintProductDTO {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
}

export function GalleryView({
  gallery,
  studioId,
  photos,
  collections = [],
  videos = [],
  initialFavorites,
  initialPrintSelection,
  printProducts,
  allowRemarks = false,
  allowPrintStore = true,
  shareBaseUrl,
}: {
  gallery: {
    id: string;
    slug: string;
    title: string;
    allowDownload: boolean;
    allowFavorites: boolean;
    coverPhotoId?: string | null;
    design?: unknown;
    studioName?: string;
    studioSlug?: string;
    studioLogoUrl?: string | null;
    studioContactEmail?: string | null;
    studioContactPhone?: string | null;
    studioInstagramUrl?: string | null;
    studioFacebookUrl?: string | null;
    eventDate?: string | null;
  };
  studioId: string;
  photos: PhotoDTO[];
  /** Sets (Collections) de la galerie, pour le filtre par set de la barre du haut — omis
   * ou vide si la galerie n'a aucun set, auquel cas aucun filtre n'est affiché. */
  collections?: CollectionDTO[];
  /** Vidéos externes de la galerie — omis ou vide si aucune, auquel cas pas d'onglet
   * "Vidéo" et la galerie se comporte comme avant (que des photos). */
  videos?: VideoDTO[];
  initialFavorites: string[];
  initialPrintSelection: { photoId: string; productId: string | null }[];
  printProducts: PrintProductDTO[];
  /** Icône "remarque" sur chaque vignette — lien client uniquement (jamais côté invité). */
  allowRemarks?: boolean;
  /** Lien "Print Store" + icône panier impression de la barre du haut — désactivés sur le
   * portfolio public (/[studioSlug]/portfolio/[gallerySlug]) où il n'y a ni session ni
   * commande possible, contrairement au lien client normal (/g/[slug]), seul contexte où
   * ils gardent un sens. */
  allowPrintStore?: boolean;
  /** Base du lien utilisé par le bouton "Partager" (icône + modale) — par défaut
   * `/g/[slug]` (lien client protégé). Le portfolio public passe sa propre URL
   * (`/[studioSlug]/portfolio/[gallerySlug]`) pour ne jamais partager un lien qui mène en
   * fait à la galerie complète protégée. */
  shareBaseUrl?: string;
}) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [remarksOnly, setRemarksOnly] = useState(false);
  // Filtre par set (Collection) — pills sous la barre du haut, voir plus bas. `null` =
  // "Toutes les photos" (comportement par défaut, y compris les photos sans set).
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  // Bascule Photos / Vidéo — n'apparaît que si la galerie a au moins une vidéo (voir
  // `videos` prop). Le lecteur affiche la première vidéo par défaut.
  const [mainView, setMainView] = useState<"photos" | "video">("photos");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(videos[0]?.id ?? null);
  const [shareTarget, setShareTarget] = useState<{ url: string; title: string } | null>(null);
  const [downloadPanelOpen, setDownloadPanelOpen] = useState(false);

  // Remarque de retouche (icône dédiée sur chaque vignette, lien client uniquement) :
  // `remarkPhotoId` pilote l'ouverture du petit composeur, `remarks` garde le texte et le
  // statut de la remarque du visiteur courant pour chaque photo — "pending" (icône jaune,
  // tant que le photographe n'a pas traité la remarque) ou "resolved" (icône verte, une
  // fois les modifications appliquées). Chargé au montage depuis le serveur (GET
  // /api/remarks) pour refléter aussi une remarque laissée lors d'une visite précédente,
  // et rouvrir l'icône déjà envoyée doit montrer ce texte (et permettre de le modifier),
  // pas un formulaire vide. Tant qu'une photo n'a pas été ouverte en plein écran (zoom),
  // son icône reste colorée et visible en permanence pour attirer l'attention du client ;
  // dès qu'il zoome dessus une fois traitée (`seenByClient`, persisté côté serveur — voir
  // PATCH /api/remarks — donc ça survit à un rechargement de page), elle redevient une
  // icône normale, visible seulement au survol comme les autres (favori, téléchargement...).
  const [remarkPhotoId, setRemarkPhotoId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<
    Map<string, { id: string; message: string; resolved: boolean; seenByClient: boolean }>
  >(new Map());

  function remarkStateFor(photoId: string): "pending" | "resolved" | undefined {
    const r = remarks.get(photoId);
    if (!r) return undefined;
    return r.resolved ? "resolved" : "pending";
  }

  async function acknowledgeRemark(photoId: string) {
    // Une photo "en attente" (jaune) doit rester mise en avant même après un zoom — seule
    // une photo "traitée" (verte) doit redevenir une icône normale une fois vue, pour
    // confirmer au client que le photographe a bien appliqué la modification.
    const r = remarks.get(photoId);
    if (!r || !r.resolved || r.seenByClient) return;
    // Mise à jour optimiste, puis confirmation en base (voir PATCH /api/remarks) pour que
    // ça reste vrai après un rechargement de page.
    setRemarks((prev) => {
      const existing = prev.get(photoId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(photoId, { ...existing, seenByClient: true });
      return next;
    });
    try {
      await fetch("/api/remarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gallerySlug: gallery.slug, photoId }),
      });
    } catch {}
  }

  useEffect(() => {
    if (!allowRemarks) return;
    fetch(`/api/remarks?gallerySlug=${encodeURIComponent(gallery.slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.remarks) return;
        const next = new Map<
          string,
          { id: string; message: string; resolved: boolean; seenByClient: boolean }
        >();
        for (const r of data.remarks as {
          id: string;
          photoId: string;
          message: string;
          resolved: boolean;
          seenByClient: boolean;
        }[]) {
          next.set(r.photoId, { id: r.id, message: r.message, resolved: r.resolved, seenByClient: r.seenByClient });
        }
        setRemarks(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowRemarks, gallery.slug]);

  async function submitRemark(photoId: string, message: string) {
    const res = await fetch("/api/remarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gallerySlug: gallery.slug, photoId, message }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      setRemarks((prev) => {
        const next = new Map(prev);
        next.set(photoId, {
          id: data?.remark?.id ?? prev.get(photoId)?.id ?? "",
          message,
          // Une remarque toute juste envoyée (ou modifiée) repasse "en attente" et "non
          // vue" — le photographe ne l'a pas encore vue, et le client devra revoir sa
          // future résolution (voir upsert côté API).
          resolved: false,
          seenByClient: false,
        });
        return next;
      });
      setRemarkPhotoId(null);
    }
    return res.ok;
  }

  // Sélection impression : `printSelection` = photos ajoutées au panier impression (icône
  // imprimante sur chaque vignette). Tout ce qui s'y trouve compte dans le total ; pour
  // retirer une photo dont on ne veut plus, on la sort carrément de cet ensemble (bouton
  // "Retirer" par photo, ou suppression groupée depuis les cases à cocher du panneau).
  // Persistée en base (comme les favoris, voir toggleFavorite) avec `initialPrintSelection`
  // pour l'état initial — sinon elle disparaissait au rechargement de la page.
  // Le service d'impression par photo (Selection.productId) n'est plus lu ici depuis le
  // 01/08/2026 : le regroupement par service se fait désormais dans la page dédiée
  // /g/[gallerySlug]/print-selection (voir PrintSelectionPageView), qui charge sa propre copie
  // des données plutôt que de partager ce state React — seul le nombre d'éléments du panier
  // (badge sur l'icône imprimante) reste utile ici.
  const [printSelection, setPrintSelection] = useState<Set<string>>(
    new Set(initialPrintSelection.map((s) => s.photoId))
  );

  const design = resolveGalleryDesign(gallery.design);
  const font = getFont(design.font);
  const palette = getPalette(design.color);

  // Nombre de colonnes réel de la grille mosaïque, recalculé à chaque redimensionnement
  // de fenêtre pour respecter les mêmes seuils responsives que le reste de l'app (voir
  // masonryColumnCount). La valeur initiale (mobile) sert uniquement au tout premier
  // rendu serveur ; `useLayoutEffect` (au lieu de `useEffect`) recalcule la vraie valeur
  // de façon SYNCHRONE avant que le navigateur n'affiche quoi que ce soit, ce qui évite
  // l'effet "les photos s'agrandissent puis rétrécissent" qu'on aurait avec `useEffect`
  // (qui, lui, s'exécute après le premier affichage — d'où le flash visible).
  const [masonryCols, setMasonryCols] = useState(() => masonryColumnCount(design.columnsPerRow, 375));
  useLayoutEffect(() => {
    function updateCols() {
      setMasonryCols(masonryColumnCount(design.columnsPerRow, window.innerWidth));
    }
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, [design.columnsPerRow]);

  // Ouvre directement la visionneuse sur une photo précise si l'URL contient
  // `?photo=<id>` — c'est ce lien que produit "Partager" sur une photo individuelle
  // (voir openShare), pour que le destinataire arrive directement dessus.
  useEffect(() => {
    const photoParam = new URLSearchParams(window.location.search).get("photo");
    if (!photoParam) return;
    const idx = photos.findIndex((p) => p.id === photoParam);
    if (idx >= 0) {
      setLightboxIndex(idx);
      acknowledgeRemark(photoParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?v= (basé sur updatedAt) invalide le cache navigateur dès qu'une image est régénérée
  // côté serveur (filigrane activé/désactivé, miniature recadrée...), sinon l'ancienne
  // version resterait affichée jusqu'à expiration du cache HTTP.
  const fileUrl = (photoId: string, variant: "thumb" | "preview") => {
    const version = photos.find((p) => p.id === photoId)?.updatedAt;
    const v = version ? new Date(version).getTime() : 0;
    return `/api/files/studios/${studioId}/galleries/${gallery.id}/${photoId}/${variant}.jpg?v=${v}`;
  };

  // Précharge l'aperçu HD dès que la souris survole une vignette (avant même le clic) —
  // avec le cache ETag ajouté côté serveur (voir /api/files), l'ouverture de la
  // visionneuse tombe alors quasiment toujours sur une image déjà en cache. Sans effet sur
  // mobile (pas de survol), où le préchargement des photos voisines dans la visionneuse
  // elle-même prend le relais. `useRef` (plutôt qu'un state) pour ne pas provoquer de
  // re-rendu et pour survivre aux re-rendus déclenchés ailleurs (favoris, etc.).
  const prefetchedPreviews = useRef<Set<string>>(new Set());
  function prefetchPreview(photoId: string) {
    if (prefetchedPreviews.current.has(photoId)) return;
    prefetchedPreviews.current.add(photoId);
    const img = new window.Image();
    img.src = fileUrl(photoId, "preview");
  }

  const coverPhotoId = gallery.coverPhotoId || photos[0]?.id || null;
  const coverUrl = coverPhotoId ? fileUrl(coverPhotoId, "preview") : null;

  let visiblePhotos = photos;
  if (activeSetId) {
    visiblePhotos = visiblePhotos.filter((p) => p.collectionId === activeSetId);
  }
  if (favoritesOnly && gallery.allowFavorites) {
    visiblePhotos = visiblePhotos.filter((p) => favorites.has(p.id));
  }
  // Filtre "Mes remarques" (icône dédiée dans la barre du haut, lien client uniquement) :
  // n'affiche que les photos pour lesquelles le visiteur a déjà envoyé une remarque —
  // pratique pour retrouver rapidement les photos en cours de retouche.
  if (remarksOnly && allowRemarks) {
    visiblePhotos = visiblePhotos.filter((p) => remarks.has(p.id));
  }

  async function toggleFavorite(photoId: string) {
    if (!gallery.allowFavorites) return;
    const isFav = favorites.has(photoId);
    const next = new Set(favorites);
    if (isFav) {
      next.delete(photoId);
      setFavorites(next);
      await fetch(`/api/selections?galleryId=${gallery.id}&photoId=${photoId}`, { method: "DELETE" });
    } else {
      next.add(photoId);
      setFavorites(next);
      await fetch("/api/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleryId: gallery.id, photoId }),
      });
    }
  }

  function downloadPhoto(photoId: string) {
    window.location.href = `/api/galleries/${gallery.id}/photos/${photoId}/download`;
  }

  // Prépare le contenu de la modale "Partager" — soit pour toute la galerie (bouton de la
  // barre du haut), soit pour une photo précise (icône sur une vignette ou dans la
  // visionneuse), auquel cas le lien contient `?photo=<id>` pour rouvrir directement dessus.
  function openShare(photoId?: string) {
    const base = `${window.location.origin}${shareBaseUrl ?? `/g/${gallery.slug}`}`;
    const url = photoId ? `${base}?photo=${photoId}` : base;
    setShareTarget({ url, title: photoId ? `${gallery.title} — photo` : gallery.title });
  }

  function scrollToGrid() {
    document.getElementById("gallery-grid")?.scrollIntoView({ behavior: "smooth" });
  }

  // Ajoute/retire une photo du panier impression (icône imprimante sur la vignette) — un
  // simple bascule, comme les favoris (toggleFavorite ci-dessus), persistée en base via
  // /api/selections (type PRINT) pour qu'elle survive à un rechargement de page.
  async function togglePrintSelection(photoId: string) {
    const isSelected = printSelection.has(photoId);
    const next = new Set(printSelection);
    if (isSelected) {
      next.delete(photoId);
      setPrintSelection(next);
      await fetch(`/api/selections?galleryId=${gallery.id}&photoId=${photoId}&type=PRINT`, {
        method: "DELETE",
      });
    } else {
      next.add(photoId);
      setPrintSelection(next);
      // Plus d'assignation par défaut au premier service (retiré le 01/08/2026, demande
      // d'Adriel : "je veux que cela soit faite sur uniquement les photos choisit" — l'ancien
      // comportement mettait TOUTES les nouvelles photos dans le même groupe par défaut, ce qui
      // donnait l'impression qu'une réassignation groupée "touchait toutes les photos" alors
      // qu'elle ne faisait que confirmer ce regroupement automatique préexistant). Chaque photo
      // arrive donc "Service non assigné" dans la page dédiée (/g/[gallerySlug]/print-selection)
      // et n'est groupée que lorsque le client la coche puis choisit explicitement un produit.
      await fetch("/api/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleryId: gallery.id, photoId, type: "PRINT", productId: null }),
      });
    }
  }

  return (
    <div style={{ backgroundColor: palette.bg, color: palette.text, fontFamily: font.stack }}>
      <GalleryCover
        design={design.coverStyle}
        title={gallery.title}
        coverUrl={coverUrl}
        focalX={design.coverFocalX}
        focalY={design.coverFocalY}
        font={font}
        palette={palette}
        studioName={gallery.studioName}
        studioLogoUrl={gallery.studioLogoUrl}
        studioSlug={gallery.studioSlug}
        eventDate={gallery.eventDate}
        onViewGallery={scrollToGrid}
      />

      {/* Barre sticky : avatar + studio + titre à gauche (avec, si la galerie a des sets,
          une ligne de pills juste en dessous pour filtrer par set), icônes d'action à
          droite — `items-start` sur la ligne globale + `items-center` sur le bloc gauche
          en colonne : les icônes restent alignées avec le titre seul quand il n'y a pas de
          sets, et se recentrent automatiquement sur toute la hauteur (titre + pills) dès
          qu'une ligne de sets apparaît, plutôt que de rester collées en haut. */}
      <div
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: `${palette.accent}33`, backgroundColor: `${palette.bg}f0` }}
      >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {/* Seuls l'avatar et le nom du studio mènent vers la page publique du studio —
              le titre de LA galerie courante ne doit pas être cliquable vers autre chose
              puisqu'on est déjà dessus (auparavant tout le bloc, titre inclus, était un seul
              lien, ce qui rendait le titre cliquable sans que ça se voie visuellement). */}
          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              href={gallery.studioSlug ? `/s/${gallery.studioSlug}` : "#"}
              className="shrink-0"
              aria-label={gallery.studioName || undefined}
            >
              <StudioAvatar name={gallery.studioName} logoUrl={gallery.studioLogoUrl} />
            </Link>
            <div className="leading-tight">
              <p className="text-xs font-semibold uppercase leading-tight tracking-wide sm:text-sm">{gallery.title}</p>
              {gallery.studioName && (
                <Link
                  href={gallery.studioSlug ? `/s/${gallery.studioSlug}` : "#"}
                  className="block text-[11px] uppercase leading-tight tracking-wide opacity-60 hover:underline"
                >
                  {gallery.studioName}
                </Link>
              )}
            </div>
          </div>

          {/* Filtre par set : une pill par set + "Toutes les photos", masqué si la galerie
              n'a aucun set ou si on est en vue Vidéo. Sur la même ligne que le bloc
              avatar/titre (plutôt que sur sa propre ligne en dessous), avec défilement
              horizontal plutôt que passage à la ligne pour rester compact. */}
          {mainView === "photos" && collections.length > 0 && (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <SetPill
                label="Toutes les photos"
                active={activeSetId === null}
                onClick={() => setActiveSetId(null)}
              />
              {collections.map((c) => (
                <SetPill
                  key={c.id}
                  label={c.title}
                  active={activeSetId === c.id}
                  onClick={() => setActiveSetId(c.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Sélecteur de langue (02/08/2026, demande d'Adriel : "dans gallery mettre la
              possibilité de changer de langue") — réutilise le composant du site marketing. */}
          <MarketingLanguageSwitcher />
          <span className="hidden h-4 w-px opacity-20 sm:inline" style={{ backgroundColor: palette.text }} />
          {/* Bascule Photos / Vidéo — visible seulement si la galerie a au moins une
              vidéo (voir `videos` prop), au même niveau que les icônes d'action et
              directement à côté d'elles plutôt que sur sa propre ligne. */}
          {videos.length > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-black/5 p-0.5 text-[11px] font-semibold uppercase tracking-wide">
              <button
                onClick={() => setMainView("photos")}
                className="rounded-full px-2.5 py-1 transition-colors"
                style={{
                  opacity: mainView === "photos" ? 1 : 0.6,
                  backgroundColor: mainView === "photos" ? palette.bg : "transparent",
                }}
              >
                Photos
              </button>
              <button
                onClick={() => setMainView("video")}
                className="rounded-full px-2.5 py-1 transition-colors"
                style={{
                  opacity: mainView === "video" ? 1 : 0.6,
                  backgroundColor: mainView === "video" ? palette.bg : "transparent",
                }}
              >
                Vidéo
              </button>
            </div>
          )}
          {videos.length > 0 && (
            <span className="hidden h-4 w-px opacity-20 sm:inline" style={{ backgroundColor: palette.text }} />
          )}
          {mainView === "photos" && (
            <>
              {allowPrintStore && (
                <>
                  <Link
                    href={`/g/${gallery.slug}/store`}
                    className="hidden text-xs uppercase tracking-wide opacity-70 hover:opacity-100 sm:inline"
                  >
                    Print Store
                  </Link>
                  <span className="hidden h-4 w-px opacity-20 sm:inline" style={{ backgroundColor: palette.text }} />
                  {/* Demande d'Adriel (01/08/2026) : "quand on clique sur imprimante, il faut un
                      target avec une page" — ouvre désormais une page dédiée (voir
                      /g/[gallerySlug]/print-selection/page.tsx) dans un nouvel onglet plutôt que
                      la modale PrintSelectionPanel (supprimée), qui superposait l'écran de
                      commande à la galerie. */}
                  <Link
                    href={`/g/${gallery.slug}/print-selection`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Sélection impression"
                    aria-label="Sélection impression"
                    className="relative flex h-8 w-8 items-center justify-center rounded-full opacity-70 transition-colors hover:bg-black/5 hover:opacity-100"
                  >
                    <IconPrinter />
                    {printSelection.size > 0 && (
                      <span
                        className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: palette.accent }}
                      >
                        {printSelection.size}
                      </span>
                    )}
                  </Link>
                </>
              )}
              {gallery.allowFavorites && (
                <IconButton
                  label={favoritesOnly ? "Toutes les photos" : "Mes favoris"}
                  onClick={() => setFavoritesOnly((v) => !v)}
                  active={favoritesOnly}
                >
                  <IconHeart filled={favoritesOnly} />
                </IconButton>
              )}
              {gallery.allowDownload && (
                <IconButton label="Télécharger" onClick={() => setDownloadPanelOpen(true)}>
                  <IconDownload />
                </IconButton>
              )}
            </>
          )}
          <IconButton label="Partager" onClick={() => openShare()}>
            <IconShare />
          </IconButton>
          {mainView === "photos" && photos.length > 0 && (
            <IconButton label="Diaporama" onClick={() => setLightboxIndex(0)}>
              <IconPlay />
            </IconButton>
          )}
          {mainView === "photos" && allowRemarks && (
            <IconButton
              label={remarksOnly ? "Toutes les photos" : "Mes remarques"}
              onClick={() => setRemarksOnly((v) => !v)}
              active={remarksOnly}
            >
              <IconRemark />
            </IconButton>
          )}
        </div>
      </div>
      </div>

      {mainView === "video" && videos.length > 0 && (
        <VideoSection
          videos={videos}
          activeVideoId={activeVideoId}
          onSelect={setActiveVideoId}
          palette={palette}
          galleryId={gallery.id}
          allowDownload={gallery.allowDownload}
          fallbackCoverUrl={coverUrl}
        />
      )}

      {/* Grille : "mosaïque" (masonry, ratio naturel de chaque photo, pas de recadrage) par
          défaut, ou grille uniforme à cases carrées si le style "horizontal" est choisi
          dans l'éditeur — voir Design > Grille > Style de grille. Masquée en vue Vidéo. */}
      {mainView === "photos" && (
        <>
      {visiblePhotos.length === 0 && favoritesOnly && (
        <p className="py-10 text-center text-sm opacity-60">Aucun favori pour le moment.</p>
      )}
      {visiblePhotos.length === 0 && remarksOnly && !favoritesOnly && (
        <p className="py-10 text-center text-sm opacity-60">Aucune remarque envoyée pour le moment.</p>
      )}
      {visiblePhotos.length === 0 && activeSetId && !favoritesOnly && !remarksOnly && (
        <p className="py-10 text-center text-sm opacity-60">Aucune photo dans ce set.</p>
      )}
      {design.gridStyle === "horizontal" ? (
        <div
          id="gallery-grid"
          className={`grid ${gridColsClass(design.columnsPerRow)} ${gridGapClass(design.gridSpacing)}`}
        >
          {visiblePhotos.map((photo) => {
            const i = photos.indexOf(photo);
            return (
              <figure key={photo.id} className="group relative aspect-square overflow-hidden bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(photo.id, "thumb")}
                  alt={photoDisplayFilename(gallery.title, i, photos.length, photo.filename)}
                  loading="lazy"
                  className="h-full w-full cursor-pointer object-cover"
                  onMouseEnter={() => prefetchPreview(photo.id)}
                  onClick={() => {
                    setLightboxIndex(i);
                    acknowledgeRemark(photo.id);
                  }}
                />
                <PhotoOverlay
                  allowFavorites={gallery.allowFavorites}
                  allowDownload={gallery.allowDownload}
                  isFavorite={favorites.has(photo.id)}
                  onToggleFavorite={() => toggleFavorite(photo.id)}
                  onDownload={() => downloadPhoto(photo.id)}
                  onShare={() => openShare(photo.id)}
                  isSelectedForPrint={printSelection.has(photo.id)}
                  onTogglePrint={() => togglePrintSelection(photo.id)}
                  allowPrint={allowPrintStore}
                  allowRemarks={allowRemarks}
                  hasRemark={remarks.has(photo.id)}
                  remarkState={remarkStateFor(photo.id)}
                  remarkSeen={!!remarks.get(photo.id)?.seenByClient}
                  onRemark={() => setRemarkPhotoId(photo.id)}
                />
              </figure>
            );
          })}
        </div>
      ) : (
        <div id="gallery-grid" className={`flex items-start ${masonryGapClass(design.gridSpacing)}`}>
          {Array.from({ length: masonryCols }, (_, colIdx) =>
            visiblePhotos.filter((_, idx) => idx % masonryCols === colIdx)
          ).map((column, colIdx) => (
            <div key={colIdx} className="flex min-w-0 flex-1 flex-col">
              {column.map((photo) => {
                const i = photos.indexOf(photo);
                return (
                  <figure
                    key={photo.id}
                    className={`group relative block w-full overflow-hidden bg-gray-50 ${masonryItemSpacingClass(
                      design.gridSpacing
                    )}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fileUrl(photo.id, "thumb")}
                      alt={photoDisplayFilename(gallery.title, i, photos.length, photo.filename)}
                      loading="lazy"
                      style={
                        photo.width && photo.height ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined
                      }
                      className="block h-auto w-full cursor-pointer"
                      onMouseEnter={() => prefetchPreview(photo.id)}
                      onClick={() => {
                        setLightboxIndex(i);
                        acknowledgeRemark(photo.id);
                      }}
                    />
                    <PhotoOverlay
                      allowFavorites={gallery.allowFavorites}
                      allowDownload={gallery.allowDownload}
                      isFavorite={favorites.has(photo.id)}
                      onToggleFavorite={() => toggleFavorite(photo.id)}
                      onDownload={() => downloadPhoto(photo.id)}
                      onShare={() => openShare(photo.id)}
                      isSelectedForPrint={printSelection.has(photo.id)}
                      onTogglePrint={() => togglePrintSelection(photo.id)}
                      allowPrint={allowPrintStore}
                      allowRemarks={allowRemarks}
                      hasRemark={remarks.has(photo.id)}
                      remarkState={remarkStateFor(photo.id)}
                      remarkSeen={!!remarks.get(photo.id)?.seenByClient}
                      onRemark={() => setRemarkPhotoId(photo.id)}
                    />
                  </figure>
                );
              })}
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          galleryId={gallery.id}
          galleryTitle={gallery.title}
          studioId={studioId}
          allowDownload={gallery.allowDownload}
          allowFavorites={gallery.allowFavorites}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onShare={(photoId) => openShare(photoId)}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(i) => {
            setLightboxIndex(i);
            const p = photos[i];
            if (p) acknowledgeRemark(p.id);
          }}
        />
      )}

      {shareTarget && (
        <ShareModal
          url={shareTarget.url}
          title={shareTarget.title}
          accentColor={palette.accent}
          onClose={() => setShareTarget(null)}
        />
      )}

      {downloadPanelOpen && (
        <DownloadPanel
          galleryId={gallery.id}
          photos={photos}
          collections={collections}
          accentColor={palette.accent}
          onClose={() => setDownloadPanelOpen(false)}
        />
      )}

      {remarkPhotoId && (
        <RemarkComposer
          key={remarkPhotoId}
          thumbUrl={fileUrl(remarkPhotoId, "thumb")}
          initialMessage={remarks.get(remarkPhotoId)?.message ?? ""}
          resolved={!!remarks.get(remarkPhotoId)?.resolved}
          onCancel={() => setRemarkPhotoId(null)}
          onSubmit={(message) => submitRemark(remarkPhotoId, message)}
        />
      )}

      <GalleryFooter
        studioName={gallery.studioName}
        studioSlug={gallery.studioSlug}
        studioLogoUrl={gallery.studioLogoUrl}
        contactEmail={gallery.studioContactEmail}
        contactPhone={gallery.studioContactPhone}
        instagramUrl={gallery.studioInstagramUrl}
        facebookUrl={gallery.studioFacebookUrl}
        palette={palette}
        font={font}
      />
    </div>
  );
}

/**
 * Pied de page de la galerie publique : identité du studio/photographe (logo, nom, lien
 * vers son site public), coordonnées de contact, et un simple lien "À propos" vers la
 * section correspondante du site studio (plutôt que d'y dupliquer toute la présentation
 * détaillée — voir la section #about sur /s/[studioSlug], avec photo + texte). Reprend
 * les champs déjà saisis par le photographe dans Réglages > Profil du studio, chargés
 * côté serveur dans page.tsx. N'affiche que ce qui a été renseigné : un studio qui n'a
 * rien rempli n'a qu'une ligne de copyright minimale.
 */
function GalleryFooter({
  studioName,
  studioSlug,
  studioLogoUrl,
  contactEmail,
  contactPhone,
  instagramUrl,
  facebookUrl,
  palette,
  font,
}: {
  studioName?: string;
  studioSlug?: string;
  studioLogoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  palette: { bg: string; text: string; accent: string };
  font: { stack: string; className: string };
}) {
  if (!studioName) return null;
  const hasContact = contactEmail || contactPhone || instagramUrl || facebookUrl;

  return (
    <footer
      className="mt-10 border-t px-6 py-10 sm:px-12"
      style={{ borderColor: `${palette.accent}30`, backgroundColor: palette.bg }}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <Link
          href={studioSlug ? `/s/${studioSlug}` : "#"}
          className="flex flex-col items-center gap-2.5 opacity-90 hover:opacity-100"
        >
          <StudioAvatar name={studioName} logoUrl={studioLogoUrl} />
          <span
            className={`text-sm uppercase tracking-[0.15em] ${font.className}`}
            style={{ color: palette.text, fontFamily: font.stack }}
          >
            {studioName}
          </span>
        </Link>

        {studioSlug && (
          <Link
            href={`/s/${studioSlug}#about`}
            className="text-xs uppercase tracking-wide opacity-70 hover:opacity-100 hover:underline"
            style={{ color: palette.text }}
          >
            À propos
          </Link>
        )}

        {hasContact && (
          <div
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs opacity-70"
            style={{ color: palette.text }}
          >
            {contactEmail && (
              <a href={`mailto:${contactEmail}`} className="hover:underline">
                {contactEmail}
              </a>
            )}
            {contactPhone && <span>{contactPhone}</span>}
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                Instagram
              </a>
            )}
            {facebookUrl && (
              <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                Facebook
              </a>
            )}
          </div>
        )}

        <p className="text-[11px] uppercase tracking-wide opacity-40" style={{ color: palette.text }}>
          © {new Date().getFullYear()} {studioName} — Propulsé par pixleh
        </p>
      </div>
    </footer>
  );
}

/**
 * Bandeau de couverture affiché en haut de la galerie publique, dont l'apparence
 * (position du titre, cadre, bande de couleur...) reflète le style choisi dans
 * l'onglet Design de l'éditeur — voir CoverStylePreviewThumb/DesignLivePreview dans
 * GalleryManager.tsx pour le même rendu côté éditeur. Le style par défaut ("left")
 * reproduit le rendu classique d'une couverture Pixieset : titre en bas à gauche,
 * bouton "Voir la galerie" en bas à droite.
 */
function GalleryCover({
  design,
  title,
  coverUrl,
  focalX = 0.5,
  focalY = 0.5,
  font,
  palette,
  studioName,
  studioLogoUrl,
  studioSlug,
  eventDate,
  onViewGallery,
}: {
  design: string;
  title: string;
  coverUrl: string | null;
  /** Point focal (0 à 1) choisi via "Repositionner" dans le panel — voir galleryDesign.ts. */
  focalX?: number;
  focalY?: number;
  font: { stack: string; className: string };
  palette: { bg: string; text: string; accent: string };
  studioName?: string;
  studioLogoUrl?: string | null;
  studioSlug?: string;
  eventDate?: string | null;
  onViewGallery: () => void;
}) {
  // La couverture est affichée en pleine largeur d'écran (souvent >1MB avec un CSS
  // `background-image`, contrairement aux vignettes) : `loaded` pilote un spinner affiché
  // par-dessus la couleur de fond neutre le temps du téléchargement. On précharge via un
  // `Image()` séparé plutôt que d'attendre un événement sur le `<div>` (qui n'en émet pas
  // pour un fond CSS) — la requête est partagée avec celle du `background-image` grâce au
  // cache HTTP du navigateur, donc pas de double téléchargement.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!coverUrl) return;
    setLoaded(false);
    const img = new window.Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setLoaded(true);
    img.src = coverUrl;
    if (img.complete) setLoaded(true);
  }, [coverUrl]);

  if (!coverUrl) return null;
  // `bg-center` (classe Tailwind, dans chaque style ci-dessous) reste la valeur par
  // défaut ; ce style inline la surcharge dès qu'un point focal personnalisé a été
  // choisi (l'attribut `style` a toujours priorité sur une classe CSS).
  const bg = {
    backgroundImage: `url(${coverUrl})`,
    backgroundPosition: `${focalX * 100}% ${focalY * 100}%`,
  };

  const viewGalleryBtn = (
    <button
      onClick={onViewGallery}
      className="border border-white/70 px-5 py-2.5 text-xs uppercase tracking-widest text-white transition-colors hover:bg-white/10"
    >
      Voir la galerie
    </button>
  );

  // Badge studio (avatar + nom) affiché en haut à gauche de la couverture, quel que soit
  // le style choisi — grande photo (voir StudioAvatar size="lg") posée directement sur la
  // couverture, nom en blanc avec ombre portée pour rester lisible sans pastille de fond.
  const studioBadge = studioName ? (
    <Link
      href={studioSlug ? `/s/${studioSlug}` : "#"}
      className="absolute left-4 top-4 flex items-center gap-3 transition-opacity hover:opacity-85 sm:left-6 sm:top-6"
    >
      <StudioAvatar name={studioName} logoUrl={studioLogoUrl} size="lg" />
      <span
        className="text-sm uppercase tracking-[0.2em] text-white sm:text-base"
        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.55)" }}
      >
        {studioName}
      </span>
    </Link>
  ) : null;

  switch (design) {
    case "frame":
      return (
        <div className="w-full p-4 sm:p-8" style={{ backgroundColor: palette.bg }}>
          <div className="relative aspect-[16/9] w-full bg-neutral-800 bg-cover bg-center sm:aspect-[21/9]" style={bg}>
            {!loaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Spinner className="text-white/70" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            {studioBadge}
            <div className="absolute bottom-6 right-6">{viewGalleryBtn}</div>
          </div>
          <h1
            className={`mt-4 text-center text-2xl sm:text-3xl ${font.className}`}
            style={{ color: palette.text, fontFamily: font.stack }}
          >
            {title}
          </h1>
        </div>
      );
    case "stripe":
      return (
        <div className="relative h-[60vh] max-h-[640px] min-h-[420px] w-full bg-neutral-800 bg-cover bg-center" style={bg}>
          {!loaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Spinner className="text-white/70" />
            </div>
          )}
          {studioBadge}
          <div
            className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 py-6"
            style={{ backgroundColor: `${palette.accent}cc` }}
          >
            <h1 className={`text-2xl font-semibold text-white sm:text-4xl ${font.className}`} style={{ fontFamily: font.stack }}>
              {title}
            </h1>
            {viewGalleryBtn}
          </div>
        </div>
      );
    case "divider":
      return (
        <div style={{ backgroundColor: palette.bg }}>
          <div className="relative aspect-[21/10] w-full bg-neutral-800 bg-cover bg-center" style={bg}>
            {!loaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Spinner className="text-white/70" />
              </div>
            )}
            {studioBadge}
            <div className="absolute bottom-6 right-6">{viewGalleryBtn}</div>
          </div>
          <div className="border-t" style={{ borderColor: palette.accent }} />
          <h1
            className={`py-6 text-center text-2xl sm:text-3xl ${font.className}`}
            style={{ color: palette.text, fontFamily: font.stack }}
          >
            {title}
          </h1>
        </div>
      );
    case "outline":
      return (
        <div className="relative h-[60vh] max-h-[640px] min-h-[420px] w-full bg-neutral-800 bg-cover bg-center" style={bg}>
          {!loaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Spinner className="text-white/70" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/30" />
          {studioBadge}
          <div className="absolute inset-10 flex items-center justify-center border border-white/80 sm:inset-16">
            <h1 className={`px-4 text-center text-2xl text-white sm:text-3xl ${font.className}`} style={{ fontFamily: font.stack }}>
              {title}
            </h1>
          </div>
          <div className="absolute bottom-6 right-6">{viewGalleryBtn}</div>
        </div>
      );
    case "center":
      return (
        <div className="relative h-[80vh] max-h-[860px] min-h-[560px] w-full bg-neutral-800 bg-cover bg-center" style={bg}>
          {!loaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Spinner className="text-white/70" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/35" />
          {studioBadge}
          <div className="absolute inset-0 flex items-center justify-center">
            <h1 className={`px-4 text-center text-3xl text-white sm:text-4xl ${font.className}`} style={{ fontFamily: font.stack }}>
              {title}
            </h1>
          </div>
          <div className="absolute bottom-6 right-6">{viewGalleryBtn}</div>
        </div>
      );
    case "right":
      // Miroir du style "left" : même panneau (studio, titre, bouton) mais collé à
      // droite, photo pleine à gauche — utile pour varier la composition d'une galerie
      // à l'autre sans perdre la lisibilité du style par défaut.
      return (
        <div className="flex h-screen max-h-[900px] min-h-[520px] w-full flex-col md:flex-row-reverse" style={{ backgroundColor: palette.bg }}>
          <div className="relative flex w-full flex-col justify-between border-b md:h-full md:w-[38%] md:border-b-0 md:border-l" style={{ borderColor: `${palette.accent}30` }}>
            {studioName && (
              <Link
                href={studioSlug ? `/s/${studioSlug}` : "#"}
                className="group flex items-center gap-2.5 px-8 pt-8 sm:px-16 sm:pt-14 md:px-[10%]"
              >
                <StudioAvatar name={studioName} logoUrl={studioLogoUrl} />
                <p
                  className="text-xs uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100"
                  style={{ color: palette.text }}
                >
                  {studioName}
                </p>
              </Link>
            )}
            <div className="px-8 sm:px-16 md:px-[10%]">
              <h1
                className={`text-4xl leading-tight sm:text-5xl ${font.className}`}
                style={{ color: palette.text, fontFamily: font.stack }}
              >
                {title}
              </h1>
              {eventDate && (
                <p className="mt-3 text-xs uppercase tracking-[0.15em] opacity-60" style={{ color: palette.text }}>
                  {new Date(eventDate).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            <div className="px-8 pb-8 sm:px-16 sm:pb-14 md:px-[10%]">
              <button
                onClick={onViewGallery}
                className="border px-5 py-2.5 text-xs uppercase tracking-widest transition-colors hover:bg-black/5"
                style={{ borderColor: `${palette.text}55`, color: palette.text }}
              >
                Voir la galerie
              </button>
            </div>
          </div>
          <div className="relative h-64 w-full bg-neutral-200 bg-cover bg-center md:h-full md:flex-1" style={bg}>
            {!loaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Spinner className="text-gray-400" />
              </div>
            )}
          </div>
        </div>
      );
    case "minimal":
      // Photo plein cadre, sans aucun panneau ni assombrissement : juste une pastille
      // "verre dépoli" flottante en bas avec le nom du studio, le titre et le bouton.
      return (
        <div className="relative h-screen max-h-[900px] min-h-[520px] w-full bg-neutral-200 bg-cover bg-center" style={bg}>
          {!loaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Spinner className="text-gray-400" />
            </div>
          )}
          <div
            className="absolute inset-x-4 bottom-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4 shadow-lg backdrop-blur sm:inset-x-8 sm:bottom-8 sm:px-8 sm:py-5"
            style={{ backgroundColor: `${palette.bg}e6` }}
          >
            <div className="flex items-center gap-3">
              {studioName && <StudioAvatar name={studioName} logoUrl={studioLogoUrl} />}
              <div>
                {studioName && (
                  <p className="text-[11px] uppercase tracking-[0.2em] opacity-60" style={{ color: palette.text }}>
                    {studioName}
                  </p>
                )}
                <h1 className={`text-lg sm:text-xl ${font.className}`} style={{ color: palette.text, fontFamily: font.stack }}>
                  {title}
                </h1>
              </div>
            </div>
            <button
              onClick={onViewGallery}
              className="shrink-0 border px-4 py-2 text-xs uppercase tracking-widest transition-colors hover:opacity-70"
              style={{ borderColor: `${palette.text}40`, color: palette.text }}
            >
              Voir la galerie
            </button>
          </div>
        </div>
      );
    case "editorial":
      // Typographie éditoriale : le titre (grande taille serif/sans selon la police
      // choisie) est affiché AU-DESSUS de la photo plutôt qu'en surimpression — pensé
      // pour les studios qui veulent mettre le nom de la séance en avant.
      return (
        <div className="w-full" style={{ backgroundColor: palette.bg }}>
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center sm:py-20">
            {studioName && (
              <Link
                href={studioSlug ? `/s/${studioSlug}` : "#"}
                className="mb-1 flex items-center gap-2 opacity-70 hover:opacity-100"
              >
                <StudioAvatar name={studioName} logoUrl={studioLogoUrl} />
                <span className="text-xs uppercase tracking-[0.2em]" style={{ color: palette.text }}>
                  {studioName}
                </span>
              </Link>
            )}
            <h1
              className={`max-w-3xl text-4xl leading-tight sm:text-6xl ${font.className}`}
              style={{ color: palette.text, fontFamily: font.stack }}
            >
              {title}
            </h1>
            {eventDate && (
              <p className="text-xs uppercase tracking-[0.15em] opacity-60" style={{ color: palette.text }}>
                {new Date(eventDate).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
            <button
              onClick={onViewGallery}
              className="mt-2 border px-5 py-2.5 text-xs uppercase tracking-widest transition-colors hover:bg-black/5"
              style={{ borderColor: `${palette.text}55`, color: palette.text }}
            >
              Voir la galerie
            </button>
          </div>
          <div className="relative h-[55vh] max-h-[640px] min-h-[360px] w-full bg-neutral-200 bg-cover bg-center" style={bg}>
            {!loaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Spinner className="text-gray-400" />
              </div>
            )}
          </div>
        </div>
      );
    case "left":
    default:
      // Rendu par défaut : panneau uni à gauche (nom du studio, titre, bouton) et photo
      // pleine à droite, séparés par un simple trait — aucun assombrissement de la photo.
      return (
        <div className="flex h-screen max-h-[900px] min-h-[520px] w-full flex-col md:flex-row" style={{ backgroundColor: palette.bg }}>
          <div className="relative flex w-full flex-col justify-between border-b md:h-full md:w-[38%] md:border-b-0 md:border-r" style={{ borderColor: `${palette.accent}30` }}>
            {studioName && (
              <Link
                href={studioSlug ? `/s/${studioSlug}` : "#"}
                className="group flex items-center gap-2.5 px-8 pt-8 sm:px-16 sm:pt-14 md:px-[10%]"
              >
                <StudioAvatar name={studioName} logoUrl={studioLogoUrl} />
                <p
                  className="text-xs uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100"
                  style={{ color: palette.text }}
                >
                  {studioName}
                </p>
              </Link>
            )}
            <div className="px-8 sm:px-16 md:px-[10%]">
              <h1
                className={`text-4xl leading-tight sm:text-5xl ${font.className}`}
                style={{ color: palette.text, fontFamily: font.stack }}
              >
                {title}
              </h1>
              {eventDate && (
                <p className="mt-3 text-xs uppercase tracking-[0.15em] opacity-60" style={{ color: palette.text }}>
                  {new Date(eventDate).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            <div className="px-8 pb-8 sm:px-16 sm:pb-14 md:px-[10%]">
              <button
                onClick={onViewGallery}
                className="border px-5 py-2.5 text-xs uppercase tracking-widest transition-colors hover:bg-black/5"
                style={{ borderColor: `${palette.text}55`, color: palette.text }}
              >
                Voir la galerie
              </button>
            </div>
          </div>
          <div className="relative h-64 w-full bg-neutral-200 bg-cover bg-center md:h-full md:flex-1" style={bg}>
            {!loaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Spinner className="text-gray-400" />
              </div>
            )}
          </div>
        </div>
      );
  }
}

/** Petit indicateur de chargement réutilisé partout (couverture, visionneuse...). */
function Spinner({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function StudioAvatar({
  name,
  logoUrl,
  size = "sm",
}: {
  name?: string;
  logoUrl?: string | null;
  /** "lg" : grand format (coins arrondis, pas de cercle) utilisé pour le badge studio en
   * surimpression de la couverture — voir studioBadge dans GalleryCover. */
  size?: "sm" | "lg";
}) {
  if (size === "lg") {
    if (logoUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name || "Studio"}
          className="h-16 w-16 rounded-xl object-cover shadow-lg ring-1 ring-white/20 sm:h-20 sm:w-20"
        />
      );
    }
    const initialLg = name?.trim()?.[0]?.toUpperCase() || "?";
    return (
      <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-200 text-2xl font-semibold text-gray-600 shadow-lg ring-1 ring-white/20 sm:h-20 sm:w-20">
        {initialLg}
      </span>
    );
  }
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={name || "Studio"} className="h-8 w-8 rounded-md object-cover" />
    );
  }
  const initial = name?.trim()?.[0]?.toUpperCase() || "?";
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-200 text-xs font-semibold text-gray-600">
      {initial}
    </span>
  );
}

/** Pill de filtre par set — même logique visuelle que IconButton (bordure "currentColor"
 * + opacité pleine quand actif) pour rester cohérent avec le reste de la barre du haut,
 * quelle que soit la palette de couleur choisie pour la galerie. */
/**
 * Vue "Vidéo" de la galerie publique — lecteur pour la vidéo sélectionnée, avec une liste
 * de clips en dessous si la galerie en a plusieurs (une seule vidéo : pas de liste, juste
 * le lecteur). Deux modes selon la vidéo, voir VideoDTO :
 * - Externe (Vimeo/YouTube) : iframe oEmbed (`buildEmbedUrl`), pas de téléchargement
 *   possible (le provider ne l'autorise pas).
 * - Auto-hébergée (`storageKey`) : lecteur <video> natif pointant vers
 *   /api/galleries/[galleryId]/videos/[id]/file, avec un bouton "Télécharger" si
 *   `allowDownload` est activé sur la galerie — exactement comme pour une photo.
 */
function VideoSection({
  videos,
  activeVideoId,
  onSelect,
  palette,
  galleryId,
  allowDownload,
  fallbackCoverUrl,
}: {
  videos: {
    id: string;
    title: string;
    provider: VideoProvider | null;
    externalId: string | null;
    thumbnailUrl: string | null;
    duration: number | null;
    storageKey: string | null;
    mimeType: string | null;
  }[];
  activeVideoId: string | null;
  onSelect: (id: string) => void;
  palette: { bg: string; text: string; accent: string };
  galleryId: string;
  allowDownload: boolean;
  /** Couverture de la galerie, utilisée en fond des vignettes de clips qui n'ont pas leur
   * propre miniature (typiquement une vidéo auto-hébergée : pas de génération de vignette
   * vidéo en v1) plutôt qu'un simple aplat gris. */
  fallbackCoverUrl: string | null;
}) {
  const active = videos.find((v) => v.id === activeVideoId) ?? videos[0];
  const isUpload = !!active?.storageKey;
  const embedUrl =
    !isUpload && active?.provider && active.externalId ? buildEmbedUrl(active.provider, active.externalId) : null;
  const fileUrl = isUpload && active ? `/api/galleries/${galleryId}/videos/${active.id}/file` : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "16 / 9" }}>
        {fileUrl ? (
          <video key={active.id} src={fileUrl} controls className="h-full w-full" preload="metadata" />
        ) : embedUrl ? (
          <iframe
            key={active.id}
            src={embedUrl}
            title={active.title}
            className="h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm opacity-60" style={{ color: "#fff" }}>
            Vidéo indisponible
          </div>
        )}
      </div>
      {active && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm opacity-80">{active.title}</p>
          {isUpload && allowDownload && (
            <a
              href={`/api/galleries/${galleryId}/videos/${active.id}/file?download=1`}
              className="shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-wide opacity-80 transition-opacity hover:opacity-100"
              style={{ borderColor: `${palette.text}40` }}
            >
              Télécharger
            </a>
          )}
        </div>
      )}

      {videos.length > 1 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {videos.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              className="group text-left"
            >
              <div
                className="relative overflow-hidden rounded-md bg-gray-100 bg-cover bg-center"
                style={{
                  aspectRatio: "16 / 9",
                  outline: v.id === active?.id ? `2px solid ${palette.accent}` : "none",
                  backgroundImage:
                    !v.thumbnailUrl && fallbackCoverUrl ? `url(${fallbackCoverUrl})` : undefined,
                }}
              >
                {v.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnailUrl} alt={v.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-black/25">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black">
                      <IconPlay />
                    </span>
                  </div>
                )}
                {formatDuration(v.duration) && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    {formatDuration(v.duration)}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-xs opacity-70 group-hover:opacity-100">{v.title}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SetPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide transition-colors ${
        active ? "border-current opacity-100" : "border-transparent opacity-60 hover:opacity-90"
      }`}
      style={{ backgroundColor: active ? "rgba(128,128,128,0.12)" : "transparent" }}
    >
      {label}
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
  href,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  // Bordure visible dès que l'icône pilote un état actif (filtre "Mes favoris"/"Mes
  // remarques" activé, etc.) — pour que le client voie immédiatement laquelle est "en
  // cours" au lieu de devoir deviner à partir de la seule opacité.
  const className = `flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-black/5 ${
    active ? "border-current opacity-100" : "border-transparent opacity-70 hover:opacity-100"
  }`;
  if (href) {
    return (
      <Link href={href} title={label} aria-label={label} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} title={label} aria-label={label} className={className}>
      {children}
    </button>
  );
}

function IconPrinter() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHeart({ filled, small }: { filled?: boolean; small?: boolean }) {
  const size = small ? "16" : "17";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
    </svg>
  );
}

/**
 * Icônes affichées au survol d'une vignette (impression, favori, téléchargement direct,
 * partage), centrées sur la photo — permet de télécharger, partager ou marquer une photo
 * pour impression sans devoir l'ouvrir en plein écran. Identiques que la grille soit en
 * mode "mosaïque" ou en cases carrées (voir GalleryView) — factorisées ici pour ne pas
 * dupliquer le balisage. L'icône imprimante bascule simplement la photo dans/hors du
 * panier impression (voir togglePrintSelection) ; le récapitulatif et le calcul du prix se
 * font dans la page dédiée /g/[gallerySlug]/print-selection, ouverte depuis la barre du haut.
 */
function PhotoOverlay({
  allowFavorites,
  allowDownload,
  isFavorite,
  onToggleFavorite,
  onDownload,
  onShare,
  isSelectedForPrint,
  onTogglePrint,
  allowPrint = true,
  allowRemarks,
  hasRemark,
  remarkState,
  remarkSeen,
  onRemark,
}: {
  allowFavorites: boolean;
  allowDownload: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onDownload: () => void;
  onShare: () => void;
  isSelectedForPrint: boolean;
  onTogglePrint: () => void;
  /** Icône panier impression (hover sur la vignette) — masquée sur le portfolio public, voir
   * allowPrintStore dans GalleryView. */
  allowPrint?: boolean;
  allowRemarks?: boolean;
  hasRemark?: boolean;
  /** "pending" (photographe n'a pas encore traité) ou "resolved" (modifications appliquées). */
  remarkState?: "pending" | "resolved";
  /** true dès que le client a ouvert cette photo en plein écran au moins une fois. */
  remarkSeen?: boolean;
  onRemark?: () => void;
}) {
  const iconClass =
    "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform hover:scale-110";
  // Tant que le client n'a pas zoomé sur la photo, l'icône de remarque reste visible en
  // permanence (jaune = en attente, verte = traitée) pour attirer son attention, en dehors
  // de la barre d'icônes normale (qui, elle, reste cachée hors survol). Une fois zoomée,
  // elle rejoint la barre normale comme une icône classique (visible au survol seulement).
  const showHighlightBadge = !!allowRemarks && !!remarkState && !remarkSeen;
  const showNormalRemarkIcon = !!allowRemarks && (!remarkState || remarkSeen);
  return (
    <>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-5 bg-gradient-to-t from-black/55 via-black/15 to-transparent pb-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
      {allowPrint && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePrint();
          }}
          aria-label={isSelectedForPrint ? "Retirer de la sélection impression" : "Ajouter à la sélection impression"}
          className={
            isSelectedForPrint
              ? "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-900 shadow transition-transform hover:scale-110"
              : iconClass
          }
        >
          {isSelectedForPrint ? <IconCheck /> : <IconPrinter />}
        </button>
      )}
      {allowFavorites && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label="Favori"
          className={iconClass}
        >
          <IconHeart filled={isFavorite} />
        </button>
      )}
      {allowDownload && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          aria-label="Télécharger"
          className={iconClass}
        >
          <IconDownload />
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onShare();
        }}
        aria-label="Partager"
        className={iconClass}
      >
        <IconShare />
      </button>
      {showNormalRemarkIcon && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemark?.();
          }}
          aria-label={hasRemark ? "Remarque envoyée" : "Laisser une remarque"}
          className={
            hasRemark
              ? "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-900 shadow transition-transform hover:scale-110"
              : iconClass
          }
        >
          {hasRemark ? <IconCheck /> : <IconRemark />}
        </button>
      )}
    </div>
    {showHighlightBadge && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemark?.();
        }}
        aria-label={remarkState === "resolved" ? "Modifications appliquées" : "Remarque envoyée, en attente"}
        className={`pointer-events-auto absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white shadow-lg transition-transform hover:scale-110 ${
          remarkState === "resolved" ? "border-green-500 text-green-500" : "border-yellow-400 text-yellow-400"
        }`}
      >
        {remarkState === "resolved" ? <IconCheck /> : <IconRemark />}
      </button>
    )}
    </>
  );
}

function IconDownload() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6l6.8-3.8M8.6 13.4l6.8 3.8" />
    </svg>
  );
}

/** Icône "remarque" (bulle avec un trait, façon annotation) — voir PhotoOverlay. */
function IconRemark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" />
      <path d="M8 9h8M8 12.5h5" strokeLinecap="round" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8.5v7M14 8.5v7" strokeLinecap="round" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" strokeLinecap="round" />
      <path d="M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Visionneuse plein écran (clic sur une photo) : fond blanc, flèche retour en haut à
 * gauche, favori/téléchargement/partage/diaporama en haut à droite, nom du fichier sous
 * la photo — reproduit le viewer Pixieset plutôt que l'ancien fond noir + liens texte.
 */
function Lightbox({
  photos,
  index,
  galleryId,
  galleryTitle,
  studioId,
  allowDownload,
  allowFavorites,
  favorites,
  onToggleFavorite,
  onShare,
  onClose,
  onNavigate,
}: {
  photos: PhotoDTO[];
  index: number;
  galleryId: string;
  galleryTitle: string;
  studioId: string;
  allowDownload: boolean;
  allowFavorites: boolean;
  favorites: Set<string>;
  onToggleFavorite: (photoId: string) => void;
  onShare: (photoId: string) => void;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const photo = photos[index];
  const displayName = photoDisplayFilename(galleryTitle, index, photos.length, photo.filename);
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const [playing, setPlaying] = useState(false);

  // L'aperçu HD (~2000px) est nettement plus lourd que la miniature déjà affichée dans la
  // grille (~700px) : la route qui le sert a maintenant un vrai cache (ETag, voir
  // /api/files) et les photos voisines sont préchargées ci-dessous, donc l'affichage
  // redevient instantané dans l'immense majorité des cas — on retrouve l'affichage simple
  // d'origine (pas de flou de transition). `showSpinner` ne s'active qu'après un court
  // délai si l'image n'est toujours pas arrivée (connexion lente une fois en prod), pour
  // ne jamais faire clignoter un loader sur un chargement rapide.
  const [loaded, setLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setShowSpinner(false);
    const timer = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(timer);
  }, [photo.id]);

  function urlFor(photoId: string, variant: "thumb" | "preview") {
    const p = photos.find((ph) => ph.id === photoId);
    const v = p ? new Date(p.updatedAt).getTime() : 0;
    return `/api/files/studios/${studioId}/galleries/${galleryId}/${photoId}/${variant}.jpg?v=${v}`;
  }

  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      if (i < 0 || i >= photos.length) return;
      const img = new window.Image();
      img.src = urlFor(photos[i].id, "preview");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate(Math.min(index + 1, photos.length - 1));
      if (e.key === "ArrowLeft") onNavigate(Math.max(index - 1, 0));
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, photos.length, onClose, onNavigate]);

  // Diaporama : avance automatiquement toutes les 3s tant que `playing` est actif, boucle
  // à la première photo une fois la dernière atteinte.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      onNavigate(index + 1 >= photos.length ? 0 : index + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, [playing, index, photos.length, onNavigate]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          aria-label="Retour"
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
        >
          <IconArrowLeft />
        </button>
        <div className="flex items-center gap-1 text-gray-700">
          {allowFavorites && (
            <IconButton
              label="Favori"
              onClick={() => onToggleFavorite(photo.id)}
              active={favorites.has(photo.id)}
            >
              <IconHeart filled={favorites.has(photo.id)} />
            </IconButton>
          )}
          {allowDownload && (
            <IconButton
              label="Télécharger"
              onClick={() => {
                window.location.href = `/api/galleries/${galleryId}/photos/${photo.id}/download`;
              }}
            >
              <IconDownload />
            </IconButton>
          )}
          <IconButton label="Partager" onClick={() => onShare(photo.id)}>
            <IconShare />
          </IconButton>
          {photos.length > 1 && (
            <IconButton
              label={playing ? "Mettre en pause" : "Diaporama"}
              onClick={() => setPlaying((v) => !v)}
              active={playing}
            >
              {playing ? <IconPause /> : <IconPlay />}
            </IconButton>
          )}
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        {hasPrev && (
          <button
            onClick={() => onNavigate(index - 1)}
            aria-label="Photo précédente"
            className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow transition-colors hover:bg-gray-100 sm:left-6"
          >
            <IconChevronLeft />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={urlFor(photo.id, "preview")}
          alt={displayName}
          onLoad={() => setLoaded(true)}
          className="max-h-full max-w-full object-contain"
        />
        {/* N'apparaît que si le chargement traîne (voir le délai de 300ms plus haut) — une
            connexion normale ou une image déjà en cache ne montre jamais ce spinner. Posé
            sur le conteneur (déjà `relative`) plutôt que sur un wrapper autour de l'image :
            un wrapper supplémentaire cassait le calcul `max-h-full` de l'image (hauteur
            "auto" du wrapper → pourcentage non résolu → image affichée à sa taille réelle
            au lieu d'être cadrée dans l'écran, mal recadrée). */}
        {!loaded && showSpinner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner className="text-gray-400" />
          </div>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(index + 1)}
            aria-label="Photo suivante"
            className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow transition-colors hover:bg-gray-100 sm:right-6"
          >
            <IconChevronRight />
          </button>
        )}
      </div>
      <p className="pb-6 pt-2 text-center text-sm text-gray-500">{displayName}</p>
    </div>
  );
}

/**
 * Modale de partage (déclenchée par les icônes "Partager" de la barre du haut, des
 * vignettes de la grille et de la visionneuse) : champ URL en lecture seule + bouton
 * Copier, puis une grille d'icônes de réseaux sociaux — reproduit la modale "SHARE" de
 * Pixieset. `url`/`title` diffèrent selon qu'on partage toute la galerie ou une photo
 * précise (voir openShare dans GalleryView, qui ajoute `?photo=<id>` dans ce dernier
 * cas) : c'est la seule différence entre les deux cas, tout le reste du composant est
 * identique.
 */
/**
 * Petite modale pour laisser (ou modifier) une remarque de retouche sur une photo précise
 * (icône dédiée dans PhotoOverlay, lien client uniquement) — un simple champ texte, envoyé
 * à /api/remarks. Le photographe la retrouve dans l'onglet "Remarques" du panel, avec la
 * miniature de la photo concernée. Si une remarque a déjà été envoyée pour cette photo,
 * `initialMessage` préremplit le champ avec son texte (au lieu d'un formulaire vide) pour
 * que le client puisse la relire et la corriger — la validation renvoie alors le texte mis
 * à jour, qui remplace la remarque existante côté serveur (voir POST /api/remarks).
 */
function RemarkComposer({
  thumbUrl,
  initialMessage = "",
  resolved = false,
  onCancel,
  onSubmit,
}: {
  thumbUrl: string;
  initialMessage?: string;
  /** true si le photographe a déjà traité cette remarque (voir onglet Remarques du panel). */
  resolved?: boolean;
  onCancel: () => void;
  onSubmit: (message: string) => Promise<boolean>;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const isEditing = initialMessage.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError(false);
    const ok = await onSubmit(message.trim());
    setSending(false);
    if (!ok) setError(true);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl} alt="" className="h-14 w-14 rounded object-cover" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
              {isEditing ? "Modifier la remarque" : "Remarque"}
            </h2>
            <p className="text-xs text-gray-500">Visible directement par le photographe.</p>
          </div>
        </div>
        {resolved && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            <span aria-hidden="true">✓</span>
            <span>
              Le photographe a déjà appliqué cette modification. Vous pouvez laisser un nouveau message si besoin.
            </span>
          </p>
        )}
        <textarea
          autoFocus
          required
          rows={4}
          className="input mt-4 w-full"
          placeholder="Ex : recadrer un peu plus haut, retoucher ce bouton..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {error && <p className="mt-2 text-xs text-red-600">Impossible d&apos;envoyer la remarque, réessayez.</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">
            Annuler
          </button>
          <button type="submit" disabled={sending || !message.trim()} className="btn-primary text-sm">
            {sending ? "Envoi..." : isEditing ? "Mettre à jour" : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ShareModal({
  url,
  title,
  accentColor,
  onClose,
}: {
  url: string;
  title: string;
  accentColor: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiez le lien :", url);
    }
  }

  async function shareMore() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // annulé par l'utilisateur : rien à faire
      }
    } else {
      copyLink();
    }
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const networks: { label: string; href: string; icon: React.ReactNode }[] = [
    { label: "Messenger", href: `fb-messenger://share?link=${encodedUrl}`, icon: <IconMessenger /> },
    { label: "WhatsApp", href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`, icon: <IconWhatsApp /> },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: <IconFacebook /> },
    { label: "Email", href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`, icon: <IconEmail /> },
    { label: "X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`, icon: <IconX /> },
    {
      label: "Pinterest",
      href: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}`,
      icon: <IconPinterest />,
    },
    { label: "Threads", href: `https://www.threads.net/intent/post?text=${encodedTitle}%20${encodedUrl}`, icon: <IconThreads /> },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-sm bg-[#f6f1ea] p-7 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="w-6" />
          <h2 className="flex-1 text-sm font-semibold uppercase tracking-[0.2em] text-gray-800">Partager</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-6 w-6 items-center justify-center text-gray-500 hover:text-gray-800"
          >
            <IconClose />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <input
            readOnly
            value={url}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="min-w-0 flex-1 border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700"
          />
          <button
            onClick={copyLink}
            style={{ backgroundColor: accentColor }}
            className="shrink-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
          >
            {copied ? "Copié" : "Copier"}
          </button>
        </div>

        <div className="mt-7 grid grid-cols-4 gap-x-3 gap-y-4">
          {networks.map((n) => (
            <a
              key={n.label}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={n.label}
              className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm transition-transform hover:scale-105"
            >
              {n.icon}
            </a>
          ))}
          <button
            onClick={shareMore}
            aria-label="Plus d'options"
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm transition-transform hover:scale-105"
          >
            <IconMore />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Panneau "Télécharger" (icône de la barre du haut) — reprend le flux Pixieset : choisir
 * des sets (sinon tout est inclus), une résolution, une destination, puis lancer le
 * téléchargement. Le ZIP s'ouvre dans un nouvel onglet (`target="_blank"`, voir le lien en
 * bas) plutôt que de naviguer la page courante, pour ne pas faire perdre sa place dans la
 * galerie au client pendant que le ZIP se génère côté serveur.
 *
 * Accès : ce panneau n'apparaît que si `gallery.allowDownload` (déjà vérifié par l'appelant)
 * — et l'API /download-all revérifie de son côté l'accès (mot de passe client déjà saisi via
 * PasswordGate, ou session invité) avant de générer quoi que ce soit, donc pas de risque de
 * contournement même si ce panneau s'affichait par erreur.
 *
 * "Enregistrer dans Google Photos"/"Dropbox" sont affichés mais désactivés ("Bientôt
 * disponible") : une vraie intégration demanderait des identifiants OAuth côté Google Cloud
 * / Dropbox App Console, pas encore mise en place.
 */
function DownloadPanel({
  galleryId,
  photos,
  collections,
  accentColor,
  onClose,
}: {
  galleryId: string;
  photos: { id: string; collectionId?: string | null }[];
  collections: { id: string; title: string }[];
  accentColor: string;
  onClose: () => void;
}) {
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [size, setSize] = useState<"hd" | "web">("hd");
  const [destination, setDestination] = useState<"device" | "google" | "dropbox">("device");

  function toggleSet(id: string) {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const countFor = (setId: string) => photos.filter((p) => p.collectionId === setId).length;

  function startDownload() {
    const params = new URLSearchParams();
    if (size === "web") params.set("size", "web");
    if (selectedSetIds.size > 0) {
      const ids = photos.filter((p) => p.collectionId && selectedSetIds.has(p.collectionId)).map((p) => p.id);
      if (ids.length > 0) params.set("ids", ids.join(","));
    }
    const query = params.toString();
    const url = `/api/galleries/${galleryId}/download-all${query ? `?${query}` : ""}`;
    // Nouvel onglet plutôt que navigation de la page courante : le client garde sa place
    // dans la galerie pendant que le ZIP se génère côté serveur (voir maxDuration=120 sur
    // la route), et peut relancer un téléchargement sans repasser par le mot de passe.
    window.open(url, "_blank");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-sm bg-[#f6f1ea] p-10 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold uppercase tracking-[0.2em] text-gray-800">Télécharger</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center text-gray-500 hover:text-gray-800"
          >
            <IconClose />
          </button>
        </div>

        {collections.length > 0 && (
          <div className="mt-8">
            <h3 className="font-serif text-lg font-semibold text-gray-900">Choisir des photos</h3>
            <p className="mt-1.5 text-sm text-gray-500">
              Laissez tout décoché pour télécharger toute la galerie, ou sélectionnez des sets précis.
            </p>
            <div className="mt-3">
              {collections.map((c) => {
                const count = countFor(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-1 hover:bg-black/5"
                  >
                    <span className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedSetIds.has(c.id)}
                        onChange={() => toggleSet(c.id)}
                        className="h-4 w-4 rounded-sm border-gray-300"
                        style={{ accentColor }}
                      />
                      {c.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{count} photo{count > 1 ? "s" : ""}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h3 className="font-serif text-lg font-semibold text-gray-900">Choisissez la taille du téléchargement</h3>
          <div className="mt-3">
            {(
              [
                { key: "hd", label: "Haute résolution" },
                { key: "web", label: "Taille web" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.key}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-1 hover:bg-black/5"
              >
                <input
                  type="radio"
                  name="download-size"
                  checked={size === opt.key}
                  onChange={() => setSize(opt.key)}
                  className="h-4 w-4 border-gray-300"
                  style={{ accentColor }}
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="font-serif text-lg font-semibold text-gray-900">Télécharger vers</h3>
          <div className="mt-4 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
            <button
              onClick={() => setDestination("device")}
              className="flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {destination === "device" && <IconCheckSmall />}
              </span>
              <IconLaptop />
              <span className="text-sm text-gray-800">Enregistrer sur mon appareil</span>
            </button>
            <div className="flex w-full items-center gap-4 px-5 py-4 text-left opacity-40">
              <span className="h-4 w-4 shrink-0" />
              <IconGooglePhotos />
              <span className="text-sm text-gray-800">Enregistrer dans Google Photos</span>
              <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                Bientôt
              </span>
            </div>
            <div className="flex w-full items-center gap-4 px-5 py-4 text-left opacity-40">
              <span className="h-4 w-4 shrink-0" />
              <IconDropbox />
              <span className="text-sm text-gray-800">Enregistrer dans Dropbox</span>
              <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                Bientôt
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={startDownload}
          style={{ backgroundColor: accentColor }}
          className="mt-9 w-full py-3.5 text-center text-xs font-semibold uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-90"
        >
          Démarrer le téléchargement
        </button>
      </div>
    </div>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconCheckSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLaptop() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-gray-600">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M1.5 19.5h21" strokeLinecap="round" />
    </svg>
  );
}

function IconGooglePhotos() {
  // Approximation simple du "moulinet" 4 couleurs de Google Photos — quatre pétales
  // arrondis autour du centre, chacun dans une des couleurs de la marque.
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
      <path fill="#EA4335" d="M12 12V2a10 10 0 0 0-10 10h10z" />
      <path fill="#4285F4" d="M12 12h10A10 10 0 0 0 12 2v10z" />
      <path fill="#34A853" d="M12 12H2a10 10 0 0 0 10 10V12z" />
      <path fill="#FBBC04" d="M12 12v10a10 10 0 0 0 10-10H12z" />
    </svg>
  );
}

function IconDropbox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
      <path
        fill="#0061FF"
        d="M6 2l6 3.8L6 9.6 0 5.8 6 2zm12 0l6 3.8-6 3.8-6-3.8L18 2zM0 13.4l6-3.8 6 3.8-6 3.8-6-3.8zm18-3.8l6 3.8-6 3.8-6-3.8 6-3.8zM6 18.6l6-3.8 6 3.8-6 3.8-6-3.8z"
      />
    </svg>
  );
}

function IconAlert({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 9v4" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z" strokeLinejoin="round" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconMessenger() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0084FF">
      <path d="M12 2C6.48 2 2 6.15 2 11.25c0 2.9 1.44 5.49 3.7 7.19V22l3.38-1.86c.9.25 1.87.39 2.92.39 5.52 0 10-4.15 10-9.28S17.52 2 12 2zm1.02 12.5l-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82z" />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.47 14.38c-.29-.15-1.7-.84-1.97-.93-.26-.1-.46-.15-.65.15-.19.29-.75.93-.92 1.12-.17.19-.34.22-.63.07-.29-.15-1.22-.45-2.32-1.43-.86-.76-1.44-1.71-1.6-2-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.65-1.57-.89-2.15-.24-.57-.48-.5-.65-.5-.17 0-.36-.02-.56-.02-.19 0-.51.07-.78.36-.26.29-1.02 1-1.02 2.44s1.05 2.83 1.19 3.02c.15.19 2.06 3.15 5 4.42.7.3 1.24.48 1.67.61.7.22 1.34.19 1.84.12.56-.08 1.7-.7 1.94-1.37.24-.68.24-1.26.17-1.38-.07-.12-.26-.19-.55-.34z" />
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.87.5 3.62 1.38 5.13L2 22l4.98-1.31A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.09c-1.66 0-3.2-.47-4.51-1.28l-.32-.19-3.06.8.82-2.98-.21-.31A8.08 8.08 0 013.91 12c0-4.46 3.63-8.09 8.09-8.09S20.09 7.54 20.09 12 16.46 20.09 12 20.09z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99C18.34 21.13 22 16.99 22 12z" />
    </svg>
  );
}

function IconEmail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#000">
      <path d="M18.9 2H22l-7.6 8.7L23.3 22h-7.1l-5.6-6.9L4.2 22H1l8.1-9.3L.9 2H8.2l5.1 6.3zm-1.2 18h1.7L7.4 4H5.6z" />
    </svg>
  );
}

function IconPinterest() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#E60023">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.64 7.86 6.35 9.31-.09-.79-.17-2.01.04-2.88.19-.79 1.23-5.03 1.23-5.03s-.31-.63-.31-1.55c0-1.45.84-2.53 1.89-2.53.89 0 1.32.67 1.32 1.47 0 .9-.57 2.24-.87 3.48-.25 1.04.52 1.89 1.54 1.89 1.85 0 3.28-1.95 3.28-4.77 0-2.49-1.79-4.23-4.34-4.23-2.96 0-4.69 2.22-4.69 4.51 0 .89.34 1.85.77 2.37.08.1.09.19.07.29-.08.32-.25 1.04-.29 1.18-.05.19-.15.24-.35.14-1.3-.6-2.11-2.49-2.11-4.01 0-3.27 2.38-6.27 6.85-6.27 3.6 0 6.4 2.56 6.4 5.99 0 3.58-2.25 6.46-5.38 6.46-1.05 0-2.04-.55-2.38-1.19l-.65 2.47c-.23.9-.87 2.02-1.29 2.71.98.3 2 .46 3.08.46 5.52 0 10-4.48 10-10S17.52 2 12 2z" />
    </svg>
  );
}

function IconThreads() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
      <path d="M12.2 2C7.1 2 3.6 5.1 3.5 10.2v3.6C3.6 18.9 7.1 22 12.2 22c4.6 0 7.9-2.5 8.3-6.5.2-2.4-.9-4.2-2.9-5.1-.1-2.6-1.7-4.2-4.4-4.4-2.2-.1-3.9.9-4.6 2.6l1.7.7c.4-.9 1.3-1.5 2.7-1.4 1.6.1 2.4.9 2.6 2.3-.6-.1-1.3-.2-2.1-.2-2.7 0-4.6 1.3-4.6 3.4 0 1.9 1.6 3.1 3.9 3.1 1.9 0 3.2-.8 3.9-2.1.3.4.5.9.5 1.4-.3 2.6-2.4 3.9-5.7 3.9-3.6 0-6-2.2-6.1-6V10.3c.1-3.8 2.5-6 6.1-6 2.5 0 4.3 1 5.3 2.9l1.7-.9C16.9 3.3 14.9 2 12.2 2zm.6 10.1c.7 0 1.3.1 1.9.2 0 1.5-.9 2.4-2.3 2.4-1.1 0-1.9-.5-1.9-1.4 0-.9.9-1.2 2.3-1.2z" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8">
      <circle cx="5" cy="12" r="1.5" fill="#555" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="#555" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="#555" stroke="none" />
    </svg>
  );
}

