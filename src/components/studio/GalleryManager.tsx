"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { MultiSearchableSelect } from "@/components/ui/MultiSearchableSelect";
import { CoverFocalPointModal } from "@/components/studio/CoverFocalPointModal";
import {
  COVER_STYLES,
  COVER_MODES,
  BANDEAU_COMPOSITIONS,
  LAYOUT_STYLES,
  SECTIONS_NAV_MODES,
  SLIDESHOW_TRANSITIONS,
  VIDEO_DISPLAY_MODES,
  BACKGROUND_THEMES,
  ACCENT_COLORS,
  FONTS,
  GRID_COLUMNS_OPTIONS,
  resolveGalleryDesign,
  getFont,
  getDesignRootStyle,
  resolveAccentHex,
  type GalleryDesign,
  type CoverStyle,
  type BandeauComposition,
} from "@/lib/galleryDesign";
import { sortPhotos, resolvePhotoSortKey, formatFileSize, type PhotoSortKey } from "@/lib/photoSort";
import { formatDuration } from "@/lib/videoEmbed";
import { generateGalleryCode as generateGalleryPassword } from "@/lib/galleryCode";
import { shareOrDownloadImage } from "@/lib/shareImage";

/**
 * Hash SHA-256 (hex) d'un fichier, calculé côté navigateur via Web Crypto — utilisé pour
 * détecter les doublons AVANT l'upload (voir beginUpload / check-duplicates) sans avoir à
 * envoyer les fichiers une première fois juste pour vérifier. Le serveur recalcule de toute
 * façon son propre hash à l'upload réel ; celui-ci ne sert qu'à proposer le bon choix
 * (ignorer/écraser/conserver) dans l'UI.
 */
async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface PhotoDTO {
  id: string;
  filename: string;
  collectionId: string | null;
  updatedAt: string;
  createdAt: string;
  sizeBytes: number | null;
  /** Indépendants de collectionId : une photo peut être "dans" le set Portfolio et/ou
   * Réseaux sociaux SANS quitter son set client d'origine (retour d'Adriel, 21/08/2026 —
   * avant, l'assigner à ces sets la sortait de son set client, donc invisible au client).
   * Pilotés par les icônes dédiées sur chaque vignette plutôt que par le menu "Déplacer
   * vers", qui n'en propose plus que les vrais sets. Voir togglePhotoTag. */
  portfolioTagged: boolean;
  socialTagged: boolean;
}

/** Remarque de modification laissée par le client sur une photo (lien /g, jamais /invite). */
interface RemarkDTO {
  id: string;
  message: string;
  resolved: boolean;
  createdAt: string;
  photo: { id: string; filename: string; updatedAt: string };
}

/** Vidéo de la galerie (onglet "Vidéo") — soit un lien externe (Vimeo/YouTube :
 * `provider`/`externalUrl`/`externalId`), soit un fichier auto-hébergé uploadé directement
 * (`storageKey`/`mimeType`/`sizeBytes`), jamais les deux à la fois. */
interface VideoDTO {
  id: string;
  title: string;
  provider: string | null;
  externalUrl: string | null;
  externalId: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  storageKey: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

/** Catégories de visibilité d'un set (voir Réglages > lien invité + portfolio public). */
type SetVisibility = "CLIENT" | "GUEST" | "PORTFOLIO";

interface CollectionDTO {
  id: string;
  title: string;
  visibility: SetVisibility[];
  /** Set "Portfolio" auto-créé à la création de la galerie (voir POST /api/galleries) — le
   * seul dont la visibilité PORTFOLIO se pilote via un interrupteur dédié dans le panneau
   * Sets plutôt que le modal de renommage (voir togglePortfolioVisibility). */
  isPortfolioDefault: boolean;
  /** Set "Réseaux sociaux" auto-créé à la création de la galerie (voir POST /api/galleries) —
   * dossier de curation privé, non supprimable, sans visibilité publique propre. */
  isSocialDefault: boolean;
}

interface ClientOption {
  id: string;
  name: string;
}

interface GalleryDTO {
  id: string;
  studioId: string;
  slug: string;
  title: string;
  clientId: string | null;
  /** Clients additionnels (accès secondaire en lecture seule, voir modèle GalleryClientAccess
   * dans schema.prisma) — jamais le client principal ci-dessus. Éditable depuis l'onglet
   * Réglages (voir additionalClientIds plus bas), pas seulement à la création de la galerie. */
  additionalClientIds: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  eventDate: string | null;
  password: string | null;
  coverPhotoId: string | null;
  allowDownload: boolean;
  downloadLimit: number | null;
  guestSlug: string | null;
  allowGuestDownload: boolean;
  /** Si activé, toute nouvelle demande d'accès invité (lien /invite/[guestSlug]) reste en
   * attente (GalleryGuest.status = PENDING) tant que le client (Gallery.client) ne l'a pas
   * explicitement approuvée — voir POST /api/guest-access. Réglage manuel (interrupteur dans
   * l'onglet Réglages, section "Lien invité"). */
  requireGuestApproval: boolean;
  allowFavorites: boolean;
  showWatermark: boolean;
  expiresAt: string | null;
  categoryTag: string | null;
  starred: boolean;
  /** "Visible par" au niveau galerie — pris en compte tant qu'aucun set n'est créé, voir
   * Gallery.defaultVisibility dans schema.prisma et le même champ dans NewGalleryForm. */
  defaultVisibility: SetVisibility[];
  design: unknown;
  photoSortOrder: string;
  photos: PhotoDTO[];
  collections: CollectionDTO[];
  // ---- Nouveaux champs (chantier refonte Réglages, 12/09/2026) ----
  description: string | null;
  tags: string[];
  projectName: string | null;
  allowComments: boolean;
  containsPortraits: boolean;
  selectionLimit: number | null;
  showMetadata: boolean;
  downloadWebOptimized: boolean;
  downloadSocialFormats: boolean;
  credits: GalleryCreditDTO[];
}

interface GalleryCreditDTO {
  id: string;
  role: string;
  name: string;
  url: string | null;
}

interface GalleryPresetDTO {
  id: string;
  name: string;
  design: unknown;
}

type MainTab = "photos" | "video" | "settings" | "remarks";
type DesignSection = "cover" | "typography" | "ambiance" | "layout";
/** Sous-onglets du panneau "Réglages" unifié (chantier du 12/09/2026, référence Picstudio :
 * fusion des anciens onglets Design + Réglages en un seul, avec aperçu live permanent). */
type SettingsSubTab = "publication" | "presentation" | "delivery" | "security";

export function GalleryManager({
  gallery,
  existingTags = [],
  presets = [],
}: {
  gallery: GalleryDTO;
  /** Tags déjà utilisés sur d'autres galeries du studio, proposés en autocomplétion. */
  existingTags?: string[];
  /** Modèles de réglages du studio (voir GalleryPreset), proposés dans l'onglet Présentation. */
  presets?: GalleryPresetDTO[];
}) {
  const router = useRouter();
  const { t, locale } = useLanguage();

  const STATUS_LABELS: Record<GalleryDTO["status"], string> = {
    DRAFT: t("status.draft"),
    PUBLISHED: t("status.published"),
    ARCHIVED: t("status.archived"),
  };
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Statistiques de progression de l'upload en cours (barre + % + temps restant estimé),
  // demandé par Adriel le 06/08/2026 ("comme pour l'upload de google drive") — distinct de
  // `progress` (texte simple utilisé pour la phase de vérification des doublons, avant que
  // l'upload à proprement parler ne démarre). Basé sur les octets réellement envoyés (voir
  // uploadFiles/xhrPostFormData plus bas), pas seulement le nombre de fichiers, pour rester
  // exact même quand les fichiers ont des tailles très différentes.
  const [uploadStats, setUploadStats] = useState<{ percent: number; etaSeconds: number | null } | null>(null);
  // Miroir local de gallery.photos, complété au fil des lots qui terminent PENDANT l'upload
  // (voir runBatch) — permet aux photos déjà envoyées d'apparaître progressivement dans la
  // grille sans attendre router.refresh() (qui n'intervient qu'une fois tout le lot terminé,
  // voir la fin de uploadFiles), comme le fait Google Drive. Resynchronisé sur gallery.photos
  // dès que le Server Component parent renvoie une version à jour (après router.refresh()).
  const [localPhotos, setLocalPhotos] = useState<PhotoDTO[]>(gallery.photos);
  useEffect(() => {
    setLocalPhotos(gallery.photos);
  }, [gallery.photos]);
  const [error, setError] = useState<string | null>(null);
  const [activeSet, setActiveSet] = useState<string | null>(null); // null = "Toutes les photos"
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  // Le tri est persisté en base (Gallery.photoSortOrder) pour s'appliquer aussi à la
  // galerie publiée, pas seulement à cette vue admin — voir setPhotoSortOrder ci-dessous.
  const [sortBy, setSortBy] = useState<PhotoSortKey>(resolvePhotoSortKey(gallery.photoSortOrder));
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Affichage de la grille Photos : "grid" (vignettes carrées, historique) ou "list" (une
  // ligne par photo avec nom + métadonnées) — demande d'Adriel le 13/09/2026.
  // 3 modes d'affichage de la grille Photos (demande d'Adriel le 14/09/2026) : grille
  // compacte, grille agrandie (vignettes plus grandes) et liste.
  const [photoViewMode, setPhotoViewMode] = useState<"grid" | "gridLarge" | "list">("grid");
  // Panneau latéral "Photos" (Toutes les photos + Sessions), onglet Photos — masqué par
  // défaut à l'ouverture d'une galerie (demande d'Adriel le 14/09/2026, façon concurrence) ;
  // un bouton permet de l'afficher/masquer en entier (pas seulement la liste des sessions).
  const [photosPanelOpen, setPhotosPanelOpen] = useState(false);
  // Sélection multiple (grille Photos) : cases à cocher sur les vignettes + barre d'actions
  // groupées (déplacer vers un set, supprimer) qui remplace la barre d'outils normale tant
  // qu'au moins une photo est sélectionnée.
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  // Sélection par rectangle glissé à la souris + réordonnancement par glisser-déposer des
  // vignettes (demande d'Adriel le 14/09/2026, façon concurrence : "Tracez un rectangle
  // pour sélectionner plusieurs photos, puis glissez la sélection pour la déplacer").
  const photoGridRef = useRef<HTMLDivElement | null>(null);
  const photoTileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const marqueeOriginRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeBaseSelectionRef = useRef<Set<string>>(new Set());
  const lastSelectedPhotoIndexRef = useRef<number | null>(null);
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [dragOverPhotoId, setDragOverPhotoId] = useState<string | null>(null);
  // Glisser-déposer pour réordonner les sessions (demande d'Adriel le 14/09/2026, même
  // principe que pour les photos) — pas d'état local pour gallery.collections (comme le
  // reste des mutations de sets dans ce composant), on persiste puis router.refresh().
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);
  // Visionneuse plein écran (zoom) : clic sur une vignette de la grille Photos ouvre la photo
  // en grand plutôt que de la (dé)sélectionner (retour d'Adriel, 21/08/2026 — la sélection se
  // fait désormais uniquement via la case à cocher qui apparaît au survol de la vignette).
  const [lightboxPhotoId, setLightboxPhotoId] = useState<string | null>(null);
  const [bulkMoveMenuOpen, setBulkMoveMenuOpen] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedGuest, setCopiedGuest] = useState(false);
  // Bouton "Partager au client" (à côté d'Aperçu) : envoie par email le lien + code de la
  // galerie (voir POST /api/galleries/[id]/share-to-client), distinct du bouton "Partager"
  // ci-dessus qui se contente de copier le lien dans le presse-papier sans rien envoyer.
  const [shareToClientState, setShareToClientState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [shareToClientError, setShareToClientError] = useState<string | null>(null);
  const [guestSlug, setGuestSlug] = useState(gallery.guestSlug);
  const [guestSlugLoading, setGuestSlugLoading] = useState(false);
  const [remarks, setRemarks] = useState<RemarkDTO[] | null>(null);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [remarksFilter, setRemarksFilter] = useState<"all" | "pending" | "resolved">("pending");
  // Remplacement du fichier d'une photo depuis une remarque (voir replacePhotoForRemark) —
  // demandé par Adriel, 31/07/2026 : le studio/photographe/vidéaste uploade la photo
  // retouchée après avoir traité la remarque du client, sans créer une nouvelle photo (même
  // id conservé, voir PUT /api/galleries/[id]/photos/[photoId]/replace). `id` de la remarque
  // en cours de remplacement (état de chargement par ligne), `null` si aucune en cours.
  const [replacingRemarkId, setReplacingRemarkId] = useState<string | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);
  // Remarque ciblée par le prochain choix de fichier — le <input type="file"> est unique et
  // partagé entre toutes les lignes (déclenché via .click() sur le bon bouton), donc on doit
  // mémoriser QUELLE remarque a demandé l'ouverture du sélecteur avant que l'utilisateur ne
  // choisisse son fichier.
  const [replaceTargetRemarkId, setReplaceTargetRemarkId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoDTO[] | null>(null);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [videoTitleInput, setVideoTitleInput] = useState("");
  const [videoAdding, setVideoAdding] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  // Mode "Uploader un fichier" de l'onglet Vidéo — alternative au lien externe pour livrer
  // directement le montage final (le client peut alors la télécharger, contrairement à un
  // lien Vimeo/YouTube). `videoUploadTitle` est optionnel : si vide, le nom de fichier sert
  // de titre.
  const [videoUploadMode, setVideoUploadMode] = useState<"link" | "upload">("link");
  const [videoUploadTitle, setVideoUploadTitle] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  // Renommage d'une vidéo déjà ajoutée à la liste (titre uniquement, voir PATCH
  // /api/galleries/[id]/videos/[videoId]) — même principe que le renommage d'un set.
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingVideoTitle, setEditingVideoTitle] = useState("");
  const [videoRenaming, setVideoRenaming] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);
  const [setModal, setSetModal] = useState<{
    mode: "add" | "rename";
    collectionId?: string;
    value: string;
    visibility: SetVisibility[];
  } | null>(null);
  const [setModalSaving, setSetModalSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ collectionId: string; title: string } | null>(
    null
  );
  // Bascule rapide de la visibilité du set "Portfolio" (isPortfolioDefault), sans passer par
  // le modal — voir togglePortfolioVisibility. `null` = aucun toggle en cours.
  const [portfolioToggling, setPortfolioToggling] = useState<string | null>(null);
  // Upload de photos : permet d'interrompre en cours de route (bouton "Arrêter" dans l'overlay
  // de progression, voir uploadFiles/stopUpload) — `AbortController` plutôt qu'un simple
  // booléen pour couper aussi le batch en cours d'envoi (`fetch`), pas seulement empêcher le
  // suivant de démarrer.
  const uploadAbortRef = useRef<AbortController | null>(null);
  // Suivi des octets envoyés par lot (clé = index de lot), pour calculer une progression
  // globale en octets (pas juste en nombre de fichiers) — voir uploadFiles/uploadStats.
  const uploadBytesByBatchRef = useRef<Map<number, number>>(new Map());
  const uploadTotalBytesRef = useRef<number>(0);
  const uploadStartedAtRef = useRef<number>(0);
  const uploadStatsThrottleRef = useRef<number>(0);
  // Doublons détectés AVANT l'envoi (voir beginUpload/check-duplicates) : tant que ce state
  // est renseigné, l'upload est en pause en attendant que le studio choisisse Ignorer /
  // Écraser / Conserver dans la modale correspondante.
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ files: File[]; count: number } | null>(null);

  // ---- Onglets (Photos / Vidéo / Remarques / Réglages) ----
  const [activeTab, setActiveTab] = useState<MainTab>("photos");
  // Sous-onglets du panneau "Réglages" unifié (fusion Design+Réglages, 12/09/2026) — voir
  // SettingsSubTab. "publication" par défaut : c'est la première chose qu'on veut voir/faire
  // en ouvrant les réglages (statut, publier), comme chez Picstudio.
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("publication");
  const [designSection, setDesignSection] = useState<DesignSection>("cover");
  const [design, setDesign] = useState<GalleryDesign>(() => resolveGalleryDesign(gallery.design));
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(gallery.coverPhotoId);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [focalPointModalOpen, setFocalPointModalOpen] = useState(false);

  // ---- Onglet Publication : description, tags multiples, projet (12/09/2026) ----
  const [description, setDescription] = useState(gallery.description || "");
  const [tags, setTags] = useState<string[]>(gallery.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [projectName, setProjectName] = useState(gallery.projectName || "");
  function addTag(raw: string) {
    const value = raw.trim();
    if (!value || tags.includes(value)) return;
    setTags((prev) => [...prev, value]);
    setTagInput("");
  }
  function removeTag(value: string) {
    setTags((prev) => prev.filter((t) => t !== value));
  }

  // ---- Onglet Livraison : nouveaux réglages (12/09/2026) ----
  const [deliveryForm, setDeliveryForm] = useState({
    allowComments: gallery.allowComments,
    containsPortraits: gallery.containsPortraits,
    selectionLimit: gallery.selectionLimit ? String(gallery.selectionLimit) : "",
    showMetadata: gallery.showMetadata,
    downloadWebOptimized: gallery.downloadWebOptimized,
    downloadSocialFormats: gallery.downloadSocialFormats,
  });

  // ---- Crédits prestataires (GalleryCredit) ----
  const [credits, setCredits] = useState<GalleryCreditDTO[]>(gallery.credits);
  const [creditFormRole, setCreditFormRole] = useState<string | null>(null);
  const [creditFormName, setCreditFormName] = useState("");
  const [creditFormUrl, setCreditFormUrl] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);

  // ---- Presets de réglages (GalleryPreset) — "Réutiliser cette mise en scène" ----
  const [presetList, setPresetList] = useState<GalleryPresetDTO[]>(presets);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  // ---- Réglages de la galerie (titre, client, mot de passe, téléchargement, favoris...) ----
  const [settingsForm, setSettingsForm] = useState({
    title: gallery.title,
    clientId: gallery.clientId || "",
    password: gallery.password || "",
    allowDownload: gallery.allowDownload,
    downloadLimit: gallery.downloadLimit ? String(gallery.downloadLimit) : "",
    allowGuestDownload: gallery.allowGuestDownload,
    requireGuestApproval: gallery.requireGuestApproval,
    allowFavorites: gallery.allowFavorites,
    showWatermark: gallery.showWatermark,
    expiresAt: gallery.expiresAt ? gallery.expiresAt.slice(0, 10) : "",
    eventDate: gallery.eventDate ? gallery.eventDate.slice(0, 10) : "",
    categoryTag: gallery.categoryTag || "",
  });
  // "Visible par" (Client/Invités/Portfolio) — même champ et même règle qu'à la création
  // (voir NewGalleryForm) : pris en compte tant qu'aucun set n'existe dans la galerie,
  // sinon c'est la visibilité de chaque set qui prend le relais.
  const [visibility, setVisibility] = useState<SetVisibility[]>(
    gallery.defaultVisibility?.length ? gallery.defaultVisibility : ["CLIENT"]
  );
  // Clients additionnels (accès secondaire en lecture seule, voir modèle GalleryClientAccess)
  // — même principe que `visibility` ci-dessus : un state séparé de `settingsForm`, envoyé
  // avec le reste du formulaire Réglages (voir saveSettings). Éditable après création
  // (demandé par Adriel le 11/08/2026), pas seulement au moment de NewGalleryForm.
  const [additionalClientIds, setAdditionalClientIds] = useState<string[]>(
    gallery.additionalClientIds || []
  );
  function toggleVisibility(v: SetVisibility) {
    setVisibility((prev) => {
      const has = prev.includes(v);
      if (has && prev.length === 1) return prev;
      return has ? prev.filter((x) => x !== v) : [...prev, v];
    });
  }
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // `useState(gallery.xxx)` ne lit la prop `gallery` qu'au tout premier rendu : quand le
  // Server Component parent se ré-exécute (ex: router.refresh() après un save) et repasse
  // un `gallery` à jour, React NE réinitialise PAS ce state tout seul. Résultat : la case
  // "Filigrane" pouvait rester affichée telle que l'utilisateur l'avait cliquée, même si
  // l'enregistrement avait en réalité échoué en base — donnant l'illusion trompeuse que le
  // réglage est bien à jour alors qu'on ne sait pas ce qu'il y a vraiment côté serveur. On
  // resynchronise donc explicitement dès que la valeur persistée change.
  useEffect(() => {
    setSettingsForm((f) => ({
      ...f,
      showWatermark: gallery.showWatermark,
      title: gallery.title,
      clientId: gallery.clientId || "",
      categoryTag: gallery.categoryTag || "",
    }));
  }, [gallery.showWatermark, gallery.title, gallery.clientId, gallery.categoryTag]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []))
      .catch(() => {});
  }, []);

  // Le bandeau d'erreur/info (upload, doublons...) se ferme tout seul après quelques
  // secondes plutôt que de rester affiché indéfiniment — voir aussi le bouton ✕ juste à
  // côté du message pour une fermeture manuelle immédiate.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  // Envoie un lot en `multipart/form-data` via XMLHttpRequest plutôt que `fetch` : c'est le
  // seul moyen standard d'obtenir une progression en octets réels pendant l'envoi
  // (`xhr.upload.onprogress`) — `fetch` n'expose pas d'équivalent pour le corps de requête
  // envoyé par le navigateur. Le reste du comportement (parsing JSON de la réponse,
  // annulation via AbortSignal) reproduit fidèlement ce que faisait `fetch` avant.
  function xhrPostFormData(
    url: string,
    formData: FormData,
    signal: AbortSignal,
    onProgress: (loadedBytes: number) => void
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      const onAbort = () => xhr.abort();
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      xhr.onload = () => {
        cleanup();
        let data: unknown = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // Réponse non-JSON (erreur serveur brute, timeout de proxy...) — laissé vide,
          // géré comme une erreur générique par l'appelant via `ok`.
        }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
      };
      xhr.onerror = () => {
        cleanup();
        reject(new Error("network"));
      };
      xhr.onabort = () => {
        cleanup();
        reject(new DOMException("Upload annulé", "AbortError"));
      };
      signal.addEventListener("abort", onAbort);
      xhr.send(formData);
    });
  }

  const uploadFiles = useCallback(
    async (files: File[], duplicateAction: "skip" | "replace" | "keep" = "skip") => {
      setUploading(true);
      setError(null);
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      uploadBytesByBatchRef.current = new Map();
      uploadTotalBytesRef.current = files.reduce((sum, f) => sum + f.size, 0);
      uploadStartedAtRef.current = Date.now();
      uploadStatsThrottleRef.current = 0;
      setUploadStats({ percent: 0, etaSeconds: null });
      const BATCH_SIZE = 5;
      // Un lot ne dépasse jamais ~40 Mo au total : au-delà, un gros fichier (photo HD)
      // part seul dans sa propre requête plutôt que de s'entasser avec d'autres dans le
      // même envoi. Utile en combinaison avec CONCURRENCY ci-dessous — voir le commentaire
      // plus bas pour le contexte complet.
      const MAX_BATCH_BYTES = 40 * 1024 * 1024;
      const batches: File[][] = [];
      {
        let current: File[] = [];
        let currentBytes = 0;
        for (const f of files) {
          const wouldOverflow =
            current.length > 0 && (current.length >= BATCH_SIZE || currentBytes + f.size > MAX_BATCH_BYTES);
          if (wouldOverflow) {
            batches.push(current);
            current = [];
            currentBytes = 0;
          }
          current.push(f);
          currentBytes += f.size;
        }
        if (current.length > 0) batches.push(current);
      }
      // Envoi de plusieurs lots EN PARALLÈLE (pas un par un) : mesuré le 06/08/2026 sur la
      // prod (retour d'Adriel). Un test rapide (petit fichier, 4 connexions) avait suggéré
      // un plafond par connexion (~400 Ko/s chacune) plutôt qu'un plafond global — mais un
      // vrai test soutenu (23 photos de 24 Mo, CONCURRENCY=4) n'a obtenu que ~920 Ko/s
      // cumulés (~2,3x, pas ~4x) : le lien semble avoir une capacité totale à peu près fixe
      // en régime établi, quel que soit le nombre de connexions. On pousse quand même un
      // peu plus (6) pour voir s'il reste de la marge — au-delà, la vraie solution est de
      // découper les gros fichiers eux-mêmes en morceaux, pas d'ajouter des connexions.
      const CONCURRENCY = 6;
      const errors: string[] = [];
      let uploadedCount = 0;
      let skippedCount = 0;
      let rejectedCount = 0;
      let completedFiles = 0;
      let stopped = false;

      // Recalcule % + temps restant estimé à partir des octets réellement envoyés (tous
      // lots confondus), avec un léger throttle (200ms) car `xhr.upload.onprogress` peut se
      // déclencher très fréquemment — inutile de re-render à chaque appel. Le temps restant
      // n'est affiché qu'une fois qu'on a un minimum de recul (>1,5s écoulées et au moins un
      // octet envoyé), sinon l'estimation initiale est trop bruitée pour être utile.
      function updateUploadStats(force = false) {
        const now = Date.now();
        if (!force && now - uploadStatsThrottleRef.current < 200) return;
        uploadStatsThrottleRef.current = now;
        const loaded = Array.from(uploadBytesByBatchRef.current.values()).reduce((a, b) => a + b, 0);
        const total = uploadTotalBytesRef.current || 1;
        const percent = Math.min(100, Math.round((loaded / total) * 100));
        const elapsedSec = (now - uploadStartedAtRef.current) / 1000;
        let etaSeconds: number | null = null;
        if (elapsedSec > 1.5 && loaded > 0) {
          const throughput = loaded / elapsedSec;
          if (throughput > 0) etaSeconds = Math.max(0, (total - loaded) / throughput);
        }
        setUploadStats({ percent, etaSeconds });
      }

      async function runBatch(batch: File[], batchIndex: number) {
        const batchBytes = batch.reduce((sum, f) => sum + f.size, 0);
        const formData = new FormData();
        batch.forEach((f) => formData.append("files", f));
        // Upload alors qu'on est sur le set Portfolio ou Réseaux sociaux : on tague les
        // nouvelles photos plutôt que de les affecter à ce set via collectionId (retour
        // d'Adriel, 21/08/2026 — même principe que togglePhotoTag ci-dessus), pour qu'elles
        // restent visibles en "Toutes les photos"/sans set côté client comme les autres.
        const activeCollectionForUpload = activeSet ? gallery.collections.find((c) => c.id === activeSet) : null;
        if (activeCollectionForUpload?.isPortfolioDefault) {
          formData.append("portfolioTagged", "true");
        } else if (activeCollectionForUpload?.isSocialDefault) {
          formData.append("socialTagged", "true");
        } else if (activeSet) {
          formData.append("collectionId", activeSet);
        }
        formData.append("duplicateAction", duplicateAction);
        try {
          const res = await xhrPostFormData(
            `/api/galleries/${gallery.id}/photos`,
            formData,
            controller.signal,
            (loadedBytes) => {
              uploadBytesByBatchRef.current.set(batchIndex, loadedBytes);
              updateUploadStats();
            }
          );
          const data = (res.data ?? {}) as { photos?: PhotoDTO[]; skipped?: unknown[]; rejected?: unknown[]; error?: unknown };
          if (!res.ok) {
            errors.push(data?.error ? JSON.stringify(data.error) : `${t("gm.httpError")} ${res.status}`);
          } else {
            uploadedCount += Array.isArray(data.photos) ? data.photos.length : batch.length;
            if (Array.isArray(data.skipped)) skippedCount += data.skipped.length;
            if (Array.isArray(data.rejected)) rejectedCount += data.rejected.length;
            // Affichage progressif (style Google Drive) : ce lot vient de se terminer, ses
            // photos apparaissent dans la grille tout de suite, sans attendre les autres
            // lots ni le router.refresh() de fin d'upload.
            if (Array.isArray(data.photos) && data.photos.length > 0) {
              setLocalPhotos((prev) => [...prev, ...data.photos!]);
            }
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            // Envoi interrompu volontairement (bouton "Arrêter") — pas une erreur à signaler,
            // seulement à s'arrêter proprement et rafraîchir ce qui a déjà été uploadé.
            stopped = true;
            return;
          }
          errors.push(e instanceof Error ? e.message : t("gm.networkError"));
        } finally {
          // Les lots se terminent dans un ordre imprévisible en parallèle — on avance le
          // compteur au fil des complétions plutôt que par index de lot. On force aussi ce
          // lot à 100% de ses propres octets (même en cas d'erreur/annulation avant le
          // dernier événement de progression) pour que la barre ne reste jamais bloquée
          // juste sous 100% à la fin.
          completedFiles += batch.length;
          uploadBytesByBatchRef.current.set(batchIndex, batchBytes);
          updateUploadStats(true);
          setProgress(`${Math.min(completedFiles, files.length)} / ${files.length} ${t("gm.photosUploaded")}`);
        }
      }

      // Petit pool à concurrence bornée : chaque "worker" prend le prochain lot disponible
      // dès qu'il est libre, jusqu'à épuisement de la file — CONCURRENCY lots au plus en
      // vol simultanément.
      let cursor = 0;
      async function worker() {
        while (cursor < batches.length) {
          if (controller.signal.aborted) {
            stopped = true;
            return;
          }
          const batchIndex = cursor;
          const batch = batches[cursor++];
          await runBatch(batch, batchIndex);
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));

      uploadAbortRef.current = null;
      setUploading(false);
      setProgress(null);
      setUploadStats(null);
      // Priorité d'affichage : une interruption manuelle ou une vraie erreur réseau/serveur
      // prime sur les simples constats (doublons ignorés, fichiers refusés) — mais ceux-ci
      // peuvent se cumuler avec le message principal plutôt que de s'écraser entre eux.
      const notices: string[] = [];
      if (rejectedCount > 0) notices.push(`${rejectedCount} ${t("gm.filesRejected")}`);
      if (skippedCount > 0) notices.push(`${skippedCount} ${t("gm.duplicatesSkipped")}`);
      if (stopped) {
        const base = uploadedCount > 0 ? `${t("gm.uploadStopped")} (${uploadedCount}/${files.length})` : t("gm.uploadStopped");
        setError([base, ...notices].join(" — "));
      } else if (errors.length > 0) {
        setError(`${t("gm.uploadFailed")} ${errors[0]}`);
      } else if (notices.length > 0) {
        setError(notices.join(" — "));
      }
      router.refresh();
    },
    [gallery.id, gallery.collections, activeSet, router, t]
  );

  function stopUpload() {
    uploadAbortRef.current?.abort();
  }

  // Point d'entrée de tout envoi de photos (drag & drop ou sélecteur de fichiers) : calcule
  // d'abord le hash de chaque fichier côté navigateur et vérifie auprès du serveur lesquels
  // existent déjà dans la galerie AVANT de lancer l'upload. S'il y a des doublons, on
  // suspend l'envoi et on demande au studio de choisir (voir duplicateConfirm et la modale
  // correspondante plus bas) — sinon on part directement sur l'upload normal.
  const beginUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setError(null);
      setProgress(t("gm.checkingDuplicates"));
      try {
        const hashes = await Promise.all(files.map(sha256Hex));
        const res = await fetch(`/api/galleries/${gallery.id}/photos/check-duplicates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hashes }),
        });
        const data = await res.json().catch(() => ({}));
        const dupSet = new Set<string>(Array.isArray(data.duplicates) ? data.duplicates : []);
        const duplicateCount = hashes.filter((h) => dupSet.has(h)).length;
        setProgress(null);
        if (duplicateCount > 0) {
          setUploading(false);
          setDuplicateConfirm({ files, count: duplicateCount });
          return;
        }
      } catch {
        // Si la vérification échoue (réseau...), on ne bloque pas l'upload : le serveur
        // refera de toute façon sa propre détection au moment de l'envoi réel.
        setProgress(null);
      }
      uploadFiles(files, "skip");
    },
    [gallery.id, t, uploadFiles]
  );

  function resolveDuplicates(action: "skip" | "replace" | "keep") {
    if (!duplicateConfirm) return;
    const files = duplicateConfirm.files;
    setDuplicateConfirm(null);
    uploadFiles(files, action);
  }

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) beginUpload(accepted);
    },
    [beginUpload]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    noClick: true,
    noKeyboard: true,
  });

  async function setStatus(status: GalleryDTO["status"]) {
    setStatusMenuOpen(false);
    await fetch(`/api/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function deletePhoto(photoId: string) {
    await fetch(`/api/galleries/${gallery.id}/photos/${photoId}`, { method: "DELETE" });
    router.refresh();
  }

  /** Glisser-déposer d'une session (Collection) sur une autre pour réordonner la liste —
   * demande d'Adriel le 14/09/2026. Comme le reste des mutations de sets dans ce composant
   * (renommer, supprimer...), pas de mise à jour optimiste locale : on persiste le nouvel
   * ordre puis on laisse router.refresh() rafraîchir gallery.collections depuis le serveur. */
  async function handleCollectionDrop(targetCollectionId: string) {
    const draggedId = draggedCollectionId;
    setDraggedCollectionId(null);
    setDragOverCollectionId(null);
    if (!draggedId || draggedId === targetCollectionId) return;

    const current = gallery.collections;
    const dragged = current.find((c) => c.id === draggedId);
    if (!dragged) return;
    const without = current.filter((c) => c.id !== draggedId);
    const targetIndex = without.findIndex((c) => c.id === targetCollectionId);
    const reordered =
      targetIndex === -1
        ? [...without, dragged]
        : [...without.slice(0, targetIndex), dragged, ...without.slice(targetIndex)];

    try {
      await fetch(`/api/galleries/${gallery.id}/collections/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionIds: reordered.map((c) => c.id) }),
      });
    } finally {
      router.refresh();
    }
  }

  async function movePhoto(photoId: string, collectionId: string) {
    await fetch(`/api/galleries/${gallery.id}/photos/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: collectionId || null }),
    });
    router.refresh();
  }

  // Ajoute/retire une photo du set Portfolio ou Réseaux sociaux SANS toucher à son set
  // client réel (collectionId) — voir le commentaire sur Photo.portfolioTagged dans
  // schema.prisma. Mise à jour optimiste de l'état local pour un rendu immédiat des icônes,
  // même logique que toggleSelectPhoto.
  async function togglePhotoTag(photoId: string, tag: "portfolioTagged" | "socialTagged") {
    const current = localPhotos.find((p) => p.id === photoId);
    if (!current) return;
    const nextValue = !current[tag];
    setLocalPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, [tag]: nextValue } : p)));
    await fetch(`/api/galleries/${gallery.id}/photos/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [tag]: nextValue }),
    });
  }

  // ---- Sélection multiple (grille Photos) ----
  function toggleSelectPhoto(photoId: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedPhotoIds(new Set());
  }

  function toggleSelectAllFiltered() {
    setSelectedPhotoIds((prev) => {
      const allSelected = filteredPhotos.length > 0 && filteredPhotos.every((p) => prev.has(p.id));
      if (allSelected) return new Set();
      return new Set(filteredPhotos.map((p) => p.id));
    });
  }

  /** Sélection par plage (Shift+clic) entre la dernière vignette cliquée et celle-ci, dans
   * l'ordre affiché (filteredPhotos) — s'ajoute à la sélection en cours. */
  function selectRangeTo(photoId: string) {
    const idx = filteredPhotos.findIndex((p) => p.id === photoId);
    if (idx === -1) return;
    const anchor = lastSelectedPhotoIndexRef.current;
    if (anchor === null) {
      toggleSelectPhoto(photoId);
      lastSelectedPhotoIndexRef.current = idx;
      return;
    }
    const [start, end] = anchor < idx ? [anchor, idx] : [idx, anchor];
    const range = filteredPhotos.slice(start, end + 1).map((p) => p.id);
    setSelectedPhotoIds((prev) => new Set([...prev, ...range]));
    lastSelectedPhotoIndexRef.current = idx;
  }

  function registerPhotoTileRef(photoId: string) {
    return (el: HTMLDivElement | null) => {
      if (el) photoTileRefs.current.set(photoId, el);
      else photoTileRefs.current.delete(photoId);
    };
  }

  /** Démarre une sélection par rectangle glissé — uniquement si le clic commence sur une
   * zone vide de la grille (pas sur une vignette), sinon c'est le glisser-déposer de
   * réordonnancement qui prend le relais (voir `draggable` sur chaque vignette). */
  function handlePhotoGridMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-photo-tile]")) return;
    const container = photoGridRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const originX = e.clientX - containerRect.left + container.scrollLeft;
    const originY = e.clientY - containerRect.top + container.scrollTop;
    marqueeOriginRef.current = { x: originX, y: originY };
    marqueeBaseSelectionRef.current = e.shiftKey ? new Set(selectedPhotoIds) : new Set();
    if (!e.shiftKey) setSelectedPhotoIds(new Set());
    setMarqueeRect({ x: originX, y: originY, w: 0, h: 0 });
    setIsMarqueeActive(true);
  }

  // Suit la souris pendant une sélection par rectangle (écouteurs sur window pour continuer
  // à suivre même si le curseur sort de la grille), et sélectionne en direct les vignettes
  // qui intersectent le rectangle tracé.
  useEffect(() => {
    if (!isMarqueeActive) return;
    function onMove(e: MouseEvent) {
      const container = photoGridRef.current;
      const origin = marqueeOriginRef.current;
      if (!container || !origin) return;
      const containerRect = container.getBoundingClientRect();
      const currentX = e.clientX - containerRect.left + container.scrollLeft;
      const currentY = e.clientY - containerRect.top + container.scrollTop;
      const rect = {
        x: Math.min(origin.x, currentX),
        y: Math.min(origin.y, currentY),
        w: Math.abs(currentX - origin.x),
        h: Math.abs(currentY - origin.y),
      };
      setMarqueeRect(rect);
      const intersecting = new Set<string>();
      photoTileRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        const relX = r.left - containerRect.left + container.scrollLeft;
        const relY = r.top - containerRect.top + container.scrollTop;
        const hit = relX < rect.x + rect.w && relX + r.width > rect.x && relY < rect.y + rect.h && relY + r.height > rect.y;
        if (hit) intersecting.add(id);
      });
      setSelectedPhotoIds(new Set([...marqueeBaseSelectionRef.current, ...intersecting]));
    }
    function onUp() {
      setIsMarqueeActive(false);
      setMarqueeRect(null);
      marqueeOriginRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isMarqueeActive]);

  /** Glisser-déposer : déplace la vignette lâchée (ou tout le groupe sélectionné si la
   * vignette glissée en fait partie) juste avant `targetPhotoId`, met à jour l'ordre
   * localement puis le persiste en base (Photo.position) — bascule aussi le tri sur
   * "Manuel", seul mode où cet ordre a un sens. */
  async function handlePhotoDrop(targetPhotoId: string) {
    const draggedIds =
      draggedPhotoId && selectedPhotoIds.has(draggedPhotoId) && selectedPhotoIds.size > 1
        ? filteredPhotos.filter((p) => selectedPhotoIds.has(p.id)).map((p) => p.id)
        : draggedPhotoId
          ? [draggedPhotoId]
          : [];
    setDraggedPhotoId(null);
    setDragOverPhotoId(null);
    if (draggedIds.length === 0 || draggedIds.includes(targetPhotoId)) return;

    const draggedSet = new Set(draggedIds);
    const remaining = filteredPhotos.filter((p) => !draggedSet.has(p.id));
    const targetIndex = remaining.findIndex((p) => p.id === targetPhotoId);
    const movedPhotos = filteredPhotos.filter((p) => draggedSet.has(p.id));
    const reordered =
      targetIndex === -1
        ? [...remaining, ...movedPhotos]
        : [...remaining.slice(0, targetIndex), ...movedPhotos, ...remaining.slice(targetIndex)];
    const affectedIds = new Set(reordered.map((p) => p.id));

    let cursor = 0;
    const newLocalPhotos = localPhotos.map((p) => (affectedIds.has(p.id) ? reordered[cursor++] : p));
    setLocalPhotos(newLocalPhotos);

    if (sortBy !== "manual") {
      changeSortOrder("manual");
    }
    try {
      await fetch(`/api/galleries/${gallery.id}/photos/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: newLocalPhotos.map((p) => p.id) }),
      });
    } catch {
      // Best-effort : en cas d'échec réseau, l'ordre reste correct côté client jusqu'au
      // prochain rechargement — pas bloquant pour un simple réordonnancement visuel.
    }
  }

  async function bulkDeleteSelected() {
    if (selectedPhotoIds.size === 0 || bulkActing) return;
    setBulkActing(true);
    try {
      await fetch(`/api/galleries/${gallery.id}/photos/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedPhotoIds) }),
      });
      clearSelection();
      setBulkDeleteConfirm(false);
      router.refresh();
    } finally {
      setBulkActing(false);
    }
  }

  async function bulkMoveSelected(collectionId: string) {
    if (selectedPhotoIds.size === 0 || bulkActing) return;
    setBulkActing(true);
    try {
      await fetch(`/api/galleries/${gallery.id}/photos/bulk-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedPhotoIds), collectionId: collectionId || null }),
      });
      setBulkMoveMenuOpen(false);
      clearSelection();
      router.refresh();
    } finally {
      setBulkActing(false);
    }
  }

  // Télécharge les photos sélectionnées en ZIP (demande d'Adriel le 15/09/2026, pop-up
  // flottant de sélection) — réutilise la route /download-all déjà utilisée par le
  // panneau de téléchargement de la galerie publique (src/components/gallery/GalleryView.tsx),
  // qui accepte un paramètre `ids` pour ne zipper qu'un sous-ensemble des photos. Le studio
  // n'est jamais bloqué par allowDownload/downloadLimit (réservés aux clients/invités, voir
  // la route), donc pas de vérification côté client ici.
  function downloadSelectedPhotos() {
    if (selectedPhotoIds.size === 0) return;
    const ids = Array.from(selectedPhotoIds).join(",");
    window.open(`/api/galleries/${gallery.id}/download-all?ids=${ids}`, "_blank");
  }

  function openAddSetModal() {
    setSetModal({ mode: "add", value: "", visibility: ["CLIENT"] });
  }

  function openRenameSetModal(collection: CollectionDTO) {
    setSetModal({
      mode: "rename",
      collectionId: collection.id,
      value: collection.title,
      visibility: collection.visibility?.length ? collection.visibility : ["CLIENT"],
    });
  }

  function toggleSetVisibility(v: SetVisibility) {
    setSetModal((m) => {
      if (!m) return m;
      const has = m.visibility.includes(v);
      // Toujours garder au moins une catégorie cochée (un set doit rester visible
      // quelque part) : le dernier interrupteur ne peut pas se désactiver tout seul.
      if (has && m.visibility.length === 1) return m;
      return { ...m, visibility: has ? m.visibility.filter((x) => x !== v) : [...m.visibility, v] };
    });
  }

  /** Active/désactive PORTFOLIO sur le set dédié (isPortfolioDefault), en ne touchant qu'à ce
   * seul drapeau — les autres (CLIENT/GUEST) éventuellement cochés sur ce set restent
   * inchangés. Demandé par Adriel le 30/07/2026 : un interrupteur direct dans le panneau
   * Sets, plutôt que d'ouvrir le modal de renommage pour cocher/décocher "Portfolio" parmi
   * 3 options sans rapport évident pour ce set précis. */
  async function togglePortfolioVisibility(c: CollectionDTO) {
    const has = c.visibility.includes("PORTFOLIO");
    const nextVisibility = has
      ? c.visibility.filter((v) => v !== "PORTFOLIO")
      : [...c.visibility, "PORTFOLIO"];
    setPortfolioToggling(c.id);
    await fetch(`/api/galleries/${gallery.id}/collections/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: nextVisibility }),
    });
    setPortfolioToggling(null);
    router.refresh();
  }

  async function submitSetModal(e: React.FormEvent) {
    e.preventDefault();
    if (!setModal || !setModal.value.trim()) return;
    setSetModalSaving(true);
    if (setModal.mode === "add") {
      await fetch(`/api/galleries/${gallery.id}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: setModal.value.trim(), visibility: setModal.visibility }),
      });
    } else if (setModal.collectionId) {
      await fetch(`/api/galleries/${gallery.id}/collections/${setModal.collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: setModal.value.trim(), visibility: setModal.visibility }),
      });
    }
    setSetModalSaving(false);
    setSetModal(null);
    router.refresh();
  }

  async function confirmDeleteSet() {
    if (!deleteConfirm) return;
    await fetch(`/api/galleries/${gallery.id}/collections/${deleteConfirm.collectionId}`, {
      method: "DELETE",
    });
    if (activeSet === deleteConfirm.collectionId) setActiveSet(null);
    setDeleteConfirm(null);
    router.refresh();
  }

  const galleryUrl =
    typeof window !== "undefined" ? `${window.location.origin}/g/${gallery.slug}` : `/g/${gallery.slug}`;

  const guestUrl =
    guestSlug && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${guestSlug}`
      : guestSlug
        ? `/invite/${guestSlug}`
        : null;

  async function handleShare() {
    const text = gallery.password
      ? `${galleryUrl}\n${t("gm.passwordPrefix")} : ${gallery.password}`
      : galleryUrl;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("gm.copyLinkFallback"), text);
    }
  }

  async function handleShareToClient() {
    if (shareToClientState === "sending") return;
    setShareToClientState("sending");
    setShareToClientError(null);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/share-to-client`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShareToClientState("error");
        setShareToClientError(data?.error || t("gm.shareToClientError"));
        return;
      }
      setShareToClientState("sent");
      setTimeout(() => setShareToClientState("idle"), 2500);
    } catch {
      setShareToClientState("error");
      setShareToClientError(t("gm.shareToClientError"));
    }
  }

  async function ensureGuestLink() {
    if (guestSlug) return guestSlug;
    setGuestSlugLoading(true);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ensureGuestSlug: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.gallery?.guestSlug) {
        setGuestSlug(data.gallery.guestSlug);
        return data.gallery.guestSlug as string;
      }
    } finally {
      setGuestSlugLoading(false);
    }
    return null;
  }

  async function handleShareGuest() {
    const slug = guestSlug || (await ensureGuestLink());
    if (!slug) return;
    const url =
      typeof window !== "undefined" ? `${window.location.origin}/invite/${slug}` : `/invite/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedGuest(true);
      setTimeout(() => setCopiedGuest(false), 2000);
    } catch {
      window.prompt(t("gm.copyLinkFallback"), url);
    }
  }

  const loadRemarks = useCallback(async () => {
    setRemarksLoading(true);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/remarks`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRemarks(data.remarks || []);
    } finally {
      setRemarksLoading(false);
    }
  }, [gallery.id]);

  // Chargées dès l'ouverture du panel (pas seulement au clic sur l'onglet Remarques) pour
  // que le badge de notification sur l'icône soit correct immédiatement après un
  // rechargement de page, au lieu de rester à zéro tant que l'onglet n'a pas été ouvert.
  useEffect(() => {
    if (remarks === null) {
      loadRemarks();
    }
  }, [remarks, loadRemarks]);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/videos`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setVideos(data.videos || []);
    } finally {
      setVideosLoading(false);
    }
  }, [gallery.id]);

  // Chargées à la première ouverture de l'onglet plutôt qu'au montage du panel (contrairement
  // aux remarques, qui ont besoin d'un badge de notification visible dès l'arrivée) : la
  // vidéo n'a pas cet impératif, autant éviter l'appel réseau si le studio n'ouvre jamais l'onglet.
  useEffect(() => {
    if (activeTab === "video" && videos === null) {
      loadVideos();
    }
  }, [activeTab, videos, loadVideos]);

  async function addVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!videoUrlInput.trim() || videoAdding) return;
    setVideoAdding(true);
    setVideoError(null);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrlInput.trim(), title: videoTitleInput.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVideoError(typeof data?.error === "string" ? data.error : t("gm.httpError"));
        return;
      }
      setVideos((list) => [...(list || []), data.video]);
      setVideoUrlInput("");
      setVideoTitleInput("");
    } catch {
      setVideoError(t("gm.networkError"));
    } finally {
      setVideoAdding(false);
    }
  }

  async function deleteVideo(id: string) {
    const previous = videos;
    setVideos((list) => list?.filter((v) => v.id !== id) ?? list);
    const res = await fetch(`/api/galleries/${gallery.id}/videos/${id}`, { method: "DELETE" });
    if (!res.ok) setVideos(previous || null);
  }

  // Upload direct d'un fichier vidéo — livraison du montage final par le studio/vidéaste,
  // à la différence du lien externe : le client pourra ensuite la télécharger comme une
  // photo (voir VideoSection côté GalleryView). Pas de barre de progression détaillée
  // (comme pour l'upload photo, voir uploadFiles) : juste un état "en cours" pendant le
  // transfert, qui peut être long pour un gros fichier.
  async function uploadVideoFile(file: File) {
    if (videoUploading) return;
    setVideoUploading(true);
    setVideoError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (videoUploadTitle.trim()) body.append("title", videoUploadTitle.trim());
      const res = await fetch(`/api/galleries/${gallery.id}/videos/upload`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVideoError(typeof data?.error === "string" ? data.error : t("gm.httpError"));
        return;
      }
      setVideos((list) => [...(list || []), data.video]);
      setVideoUploadTitle("");
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    } catch {
      setVideoError(t("gm.networkError"));
    } finally {
      setVideoUploading(false);
    }
  }

  async function saveVideoTitle(id: string) {
    const title = editingVideoTitle.trim();
    if (!title || videoRenaming) return;
    setVideoRenaming(true);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setVideos((list) => list?.map((v) => (v.id === id ? { ...v, title: data.video?.title ?? title } : v)) ?? list);
        setEditingVideoId(null);
      }
    } finally {
      setVideoRenaming(false);
    }
  }

  async function toggleRemarkResolved(id: string, resolved: boolean) {
    // Mise à jour optimiste : le photographe coche/décoche en un clic sans attendre le
    // round-trip serveur, avec retour arrière silencieux en cas d'échec.
    setRemarks((list) => list?.map((r) => (r.id === id ? { ...r, resolved } : r)) ?? list);
    const res = await fetch(`/api/remarks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (!res.ok) {
      setRemarks((list) => list?.map((r) => (r.id === id ? { ...r, resolved: !resolved } : r)) ?? list);
    }
  }

  // Ouvre le sélecteur de fichier natif pour la photo de CETTE remarque — voir
  // replaceTargetRemarkId/onReplaceFileChange plus bas pour la suite du flux.
  function beginReplacePhotoForRemark(remarkId: string) {
    if (replacingRemarkId) return;
    setReplaceTargetRemarkId(remarkId);
    replaceFileInputRef.current?.click();
  }

  async function onReplaceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const remarkId = replaceTargetRemarkId;
    e.target.value = ""; // permet de resélectionner le même fichier une prochaine fois
    setReplaceTargetRemarkId(null);
    if (!file || !remarkId) return;
    const remark = remarks?.find((r) => r.id === remarkId);
    if (!remark) return;

    setReplacingRemarkId(remarkId);
    setReplaceError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("remarkId", remarkId);
      const res = await fetch(`/api/galleries/${gallery.id}/photos/${remark.photo.id}/replace`, {
        method: "PUT",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = typeof data?.error === "string" ? data.error : null;
        setReplaceError(
          reason === "unsupportedType"
            ? t("remarks.replaceUnsupportedType")
            : reason === "tooLarge"
            ? t("remarks.replaceTooLarge")
            : reason === "quotaExceeded"
            ? t("remarks.replaceQuotaExceeded")
            : t("gm.uploadFailed") + (reason || "")
        );
        return;
      }
      // La photo a changé de fichier (updatedAt bumpé côté serveur) et la remarque est
      // désormais résolue : on recharge les deux plutôt que de rafistoler le state local,
      // le thumbUrl dépendant de gallery.photos (prop serveur) pour son cache-busting.
      setRemarks((list) =>
        list?.map((r) => (r.id === remarkId ? { ...r, resolved: true } : r)) ?? list
      );
      router.refresh();
    } catch {
      setReplaceError(t("gm.networkError"));
    } finally {
      setReplacingRemarkId(null);
    }
  }

  async function regenerateThumbnails() {
    setRegenLoading(true);
    setRegenMessage(null);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/regenerate-thumbnails`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRegenMessage(`${t("gm.regenerateDone")} (${data.regenerated}/${data.total})`);
        router.refresh();
      } else {
        setRegenMessage(data?.error ? String(data.error) : t("gm.httpError"));
      }
    } catch {
      setRegenMessage(t("gm.networkError"));
    }
    setRegenLoading(false);
    setTimeout(() => setRegenMessage(null), 5000);
  }

  // Sets "réels" (avec vraie affectation collectionId) proposés dans "Déplacer vers" et le
  // menu de déplacement groupé — Portfolio et Réseaux sociaux en sont exclus depuis le
  // 21/08/2026 : ce ne sont plus des sets qu'on "déplace" une photo vers (ce qui la sortait
  // de son set client), mais des étiquettes qu'on ajoute/retire via l'icône dédiée sur
  // chaque vignette, voir togglePhotoTag.
  const assignableCollections = gallery.collections.filter((c) => !c.isPortfolioDefault && !c.isSocialDefault);

  const filteredPhotos = useMemo(() => {
    const activeCollection = gallery.collections.find((c) => c.id === activeSet) || null;
    const base = localPhotos.filter((p) => {
      if (!activeSet) return true;
      if (activeCollection?.isPortfolioDefault) return p.portfolioTagged;
      if (activeCollection?.isSocialDefault) return p.socialTagged;
      return p.collectionId === activeSet;
    });
    // Même helper que la galerie publique (/g/[slug]) : le tri choisi ici est ce que le
    // client voit, pas juste un tri d'affichage local à ce panel.
    return sortPhotos(base, sortBy);
  }, [localPhotos, activeSet, sortBy, gallery.collections]);

  // Set "Réseaux sociaux" ouvert : affiche le bandeau d'explication + le bouton Partager
  // au-dessus de la grille (voir plus bas) — demande d'Adriel, 12/08/2026.
  const activeSocialSet = gallery.collections.find((c) => c.id === activeSet && c.isSocialDefault) || null;
  const [sharingPhotoId, setSharingPhotoId] = useState<string | null>(null);
  // Bandeau "photo téléchargée au lieu d'être partagée" — affiché quand shareOrDownloadImage
  // bascule sur le téléchargement parce qu'on est sur desktop (voir shareImage.ts : le partage
  // de fichier natif n'attache pas la photo hors mobile, ex. Facebook sur Mac).
  const [shareDesktopNotice, setShareDesktopNotice] = useState(false);

  async function handleSharePhoto(photo: PhotoDTO) {
    setSharingPhotoId(photo.id);
    try {
      const result = await shareOrDownloadImage(
        `/api/galleries/${gallery.id}/photos/${photo.id}/download`,
        photo.filename,
        gallery.title
      );
      if (result === "downloaded-desktop") {
        setShareDesktopNotice(true);
        setTimeout(() => setShareDesktopNotice(false), 6000);
      }
    } catch {
      // Échec silencieux (annulation du partage natif, réseau...) — rien de bloquant à
      // signaler, l'icône reprend simplement son état normal juste après.
    }
    setSharingPhotoId(null);
  }

  /** Change le tri ET le persiste en base (Gallery.photoSortOrder) pour qu'il s'applique
   * aussi côté galerie publiée et lien invité, pas seulement dans cette vue admin. */
  async function changeSortOrder(key: PhotoSortKey) {
    setSortBy(key);
    setSortMenuOpen(false);
    await fetch(`/api/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoSortOrder: key }),
    });
  }

  const unsortedCount = localPhotos.filter((p) => !p.collectionId).length;

  const thumbUrl = (photoId: string) => {
    // Le paramètre ?v= (basé sur updatedAt) force le navigateur à recharger l'image dès
    // qu'elle est régénérée côté serveur (filigrane, recadrage...) — sans lui, le cache
    // HTTP continuerait de servir l'ancienne version indéfiniment.
    const version = localPhotos.find((p) => p.id === photoId)?.updatedAt;
    const v = version ? new Date(version).getTime() : 0;
    return `/api/files/studios/${gallery.studioId}/galleries/${gallery.id}/${photoId}/thumb.jpg?v=${v}`;
  };

  // Variante "preview" (plus grande, sans le crop carré des miniatures) utilisée par la
  // visionneuse plein écran — voir thumbUrl ci-dessus pour le principe du paramètre ?v=.
  const previewUrl = (photoId: string) => {
    const version = localPhotos.find((p) => p.id === photoId)?.updatedAt;
    const v = version ? new Date(version).getTime() : 0;
    return `/api/files/studios/${gallery.studioId}/galleries/${gallery.id}/${photoId}/preview.jpg?v=${v}`;
  };

  const activeCoverPhotoId = coverPhotoId || localPhotos[0]?.id || null;
  // Fond des vignettes de l'onglet Vidéo qui n'ont pas de miniature propre (upload direct,
  // pas de génération de vignette vidéo en v1) — la couverture de la galerie plutôt qu'un
  // aplat gris, comme côté galerie publique (voir VideoSection dans GalleryView.tsx).
  const videoCoverFallbackUrl = activeCoverPhotoId ? thumbUrl(activeCoverPhotoId) : null;

  // ---- Design : sauvegarde live (chaque clic patch immédiatement, comme dans Pixieset) ----
  async function updateDesign<K extends keyof GalleryDesign>(key: K, value: GalleryDesign[K]) {
    return updateDesignFields({ [key]: value } as Partial<GalleryDesign>);
  }

  /**
   * Variante de `updateDesign` acceptant PLUSIEURS clés à la fois — indispensable dès
   * qu'un même clic doit changer plus d'un champ (ex: le swatch "Ambiance > Le fond" qui
   * fixe `backgroundTheme` ET remet `backgroundCustomHex`/`backgroundCustomTextHex` à
   * null pour sortir du mode migration legacy). Bug corrigé le 13/09/2026 (retour
   * d'Adriel : "quand je change dans Ambiance rien ne change") : appeler `updateDesign`
   * plusieurs fois de suite dans le même clic ne fonctionnait pas, chaque appel calculait
   * `next` à partir du même `design` (encore non mis à jour) capturé dans la fermeture au
   * moment du rendu — seul le DERNIER appel "gagnait" et les changements précédents
   * étaient perdus. Un seul `setDesign`/PATCH avec toutes les clés à la fois évite ça.
   */
  async function updateDesignFields(patch: Partial<GalleryDesign>) {
    const next = { ...design, ...patch };
    setDesign(next);
    await fetch(`/api/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design: patch }),
    });
  }

  async function updateCoverFocalPoint(x: number, y: number) {
    const next = { ...design, coverFocalX: x, coverFocalY: y };
    setDesign(next);
    setFocalPointModalOpen(false);
    await fetch(`/api/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design: { coverFocalX: x, coverFocalY: y } }),
    });
  }

  async function chooseCoverPhoto(photoId: string) {
    setCoverPhotoId(photoId);
    setCoverPickerOpen(false);
    await fetch(`/api/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverPhotoId: photoId }),
    });
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: settingsForm.title.trim(),
          clientId: settingsForm.clientId || null,
          additionalClientIds,
          password: settingsForm.password.trim() || null,
          allowDownload: settingsForm.allowDownload,
          downloadLimit: settingsForm.downloadLimit ? Number(settingsForm.downloadLimit) : null,
          allowGuestDownload: settingsForm.allowGuestDownload,
          requireGuestApproval: settingsForm.requireGuestApproval,
          allowFavorites: settingsForm.allowFavorites,
          showWatermark: settingsForm.showWatermark,
          expiresAt: settingsForm.expiresAt || null,
          eventDate: settingsForm.eventDate || null,
          categoryTag: settingsForm.categoryTag.trim() || null,
          defaultVisibility: visibility,
          description: description.trim() || null,
          tags,
          projectName: projectName.trim() || null,
          allowComments: deliveryForm.allowComments,
          containsPortraits: deliveryForm.containsPortraits,
          selectionLimit: deliveryForm.selectionLimit ? Number(deliveryForm.selectionLimit) : null,
          showMetadata: deliveryForm.showMetadata,
          downloadWebOptimized: deliveryForm.downloadWebOptimized,
          downloadSocialFormats: deliveryForm.downloadSocialFormats,
        }),
      });
      if (!res.ok) {
        // Auparavant cette route n'était jamais vérifiée : un échec (session expirée,
        // validation refusée, erreur serveur...) affichait quand même "Enregistré", ce qui
        // masquait complètement le fait que le réglage n'avait pas été sauvegardé en base —
        // exactement le genre de bug qui fait croire que le filigrane "ne s'éteint jamais"
        // alors qu'en réalité l'enregistrement n'avait jamais abouti.
        const data = await res.json().catch(() => ({}));
        setSettingsError(data?.error ? String(data.error) : `Erreur ${res.status}`);
        return;
      }
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      router.refresh();
    } catch {
      setSettingsError(t("gm.networkError"));
    } finally {
      setSettingsSaving(false);
    }
  }

  // ---- Crédits prestataires (GalleryCredit) — section "Crédits" onglet Publication ----
  async function addCredit(role: string) {
    if (!creditFormName.trim()) return;
    setCreditSaving(true);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, name: creditFormName.trim(), url: creditFormUrl.trim() || null }),
      });
      if (res.ok) {
        const created = await res.json();
        setCredits((prev) => [...prev, created]);
        setCreditFormRole(null);
        setCreditFormName("");
        setCreditFormUrl("");
      }
    } finally {
      setCreditSaving(false);
    }
  }
  async function deleteCredit(id: string) {
    setCredits((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/galleries/${gallery.id}/credits?creditId=${id}`, { method: "DELETE" });
  }

  // ---- Presets de réglages (GalleryPreset) — "Réutiliser cette mise en scène" ----
  async function savePreset() {
    const name = presetNameInput.trim();
    if (!name) return;
    setPresetSaving(true);
    try {
      const res = await fetch(`/api/gallery-presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, design }),
      });
      if (res.ok) {
        const created = await res.json();
        setPresetList((prev) => [created, ...prev]);
        setPresetNameInput("");
      }
    } finally {
      setPresetSaving(false);
    }
  }
  async function applyPreset(preset: GalleryPresetDTO) {
    const merged = resolveGalleryDesign(preset.design);
    setDesign(merged);
    await fetch(`/api/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design: merged }),
    });
  }
  async function deletePreset(id: string) {
    setPresetList((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/gallery-presets?presetId=${id}`, { method: "DELETE" });
  }

  const pendingRemarksCount = remarks?.filter((r) => !r.resolved).length ?? 0;

  /** Rôles proposés en saisie rapide pour un crédit prestataire (section Crédits) — liste
   * ouverte : "Autre" permet de créditer un rôle non prévu ici sans attendre de migration
   * (voir GalleryCredit.role, en String libre). */
  const CREDIT_ROLES = [
    "florist",
    "venue",
    "decor",
    "caterer",
    "dj",
    "weddingPlanner",
    "videographer",
    "makeup",
    "hair",
    "dress",
  ] as const;

  const SORT_OPTIONS: { key: PhotoSortKey; label: string }[] = [
    { key: "manual", label: t("gm.sortManual") },
    { key: "dateAddedDesc", label: t("gm.sortDateAddedDesc") },
    { key: "dateAddedAsc", label: t("gm.sortDateAddedAsc") },
    { key: "nameAsc", label: t("gm.sortNameAsc") },
    { key: "nameDesc", label: t("gm.sortNameDesc") },
    { key: "sizeDesc", label: t("gm.sortSizeDesc") },
    { key: "sizeAsc", label: t("gm.sortSizeAsc") },
  ];

  const TABS: { key: MainTab; label: string; icon: JSX.Element }[] = [
    { key: "photos", label: t("gm.tabPhotos"), icon: <IconPhotos /> },
    { key: "video", label: t("gm.tabVideo"), icon: <IconVideo /> },
    { key: "remarks", label: t("gm.tabRemarks"), icon: <IconRemarksTab /> },
    { key: "settings", label: t("gm.tabSettings"), icon: <IconSettings /> },
  ];

  return (
    <div className="-m-8 flex h-screen flex-col">
      {/* Barre du haut */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/galleries" className="text-gray-400 hover:text-gray-700">
            ←
          </Link>
          <div>
            <p className="font-medium leading-tight">{gallery.title}</p>
            {gallery.eventDate && (
              <p className="text-xs text-gray-500">
                {new Date(gallery.eventDate).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setStatusMenuOpen((v) => !v)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                gallery.status === "PUBLISHED"
                  ? "bg-green-100 text-green-700"
                  : gallery.status === "ARCHIVED"
                  ? "bg-gray-100 text-gray-600"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {STATUS_LABELS[gallery.status]} ▾
            </button>
            {statusMenuOpen && (
              <div className="absolute left-0 top-8 z-20 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {(Object.keys(STATUS_LABELS) as GalleryDTO["status"][]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* `ml-auto` (au lieu de compter uniquement sur le `justify-between` du parent) :
            quand ce groupe de boutons passe à la ligne sur mobile (le `flex-wrap` du
            conteneur), il devient seul sur sa ligne et `justify-between` n'a alors plus rien
            à espacer — il retombait donc à gauche. `ml-auto` le pousse à droite dans tous les
            cas, ligne partagée ou non — demande d'Adriel, 12/08/2026 ("mettre les menu icon
            sur la droite"). */}
        <div className="ml-auto flex items-center gap-2">
          {localPhotos.length > 0 && (
            <button
              onClick={regenerateThumbnails}
              disabled={regenLoading}
              title={regenLoading ? t("gm.regenerating") : t("gm.regenerateThumbsHint")}
              className="flex items-center gap-1 text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline disabled:opacity-50"
            >
              {/* Icône seule sur mobile, texte à partir de sm — demande d'Adriel,
                  12/08/2026 : "mettre Régénérer les miniatures en icone". */}
              <IconRefreshThumbs className={regenLoading ? "animate-spin" : undefined} />
              <span className="hidden sm:inline">
                {regenLoading ? t("gm.regenerating") : t("gm.regenerateThumbs")}
              </span>
            </button>
          )}
          {/* Icônes seules sur mobile (place limitée à côté du titre) ; libellé visible à
              partir de sm — demande d'Adriel, 11/08/2026 : "proposez des icones a la place
              des textes sur les bouton" après que ces 4 boutons débordaient sur mobile. */}
          <a
            href={`/g/${gallery.slug}`}
            target="_blank"
            title={t("gm.preview")}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <IconEye />
            <span className="hidden sm:inline">{t("gm.preview")}</span>
          </a>
          {gallery.clientId && (
            <button
              onClick={handleShareToClient}
              disabled={shareToClientState === "sending"}
              title={
                shareToClientState === "error"
                  ? shareToClientError || undefined
                  : t("gm.shareToClient")
              }
              className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              <IconSendToClient />
              <span className="hidden sm:inline">
                {shareToClientState === "sending"
                  ? t("gm.shareToClientSending")
                  : shareToClientState === "sent"
                    ? t("gm.shareToClientSent")
                    : shareToClientState === "error"
                      ? t("gm.shareToClientError")
                      : t("gm.shareToClient")}
              </span>
            </button>
          )}
          <button
            onClick={handleShare}
            title={copied ? t("gm.linkCopied") : t("gm.share")}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <IconShareLink />
            <span className="hidden sm:inline">{copied ? t("gm.linkCopied") : t("gm.share")}</span>
          </button>
          {/* Masqué pendant l'upload (demandé par Adriel le 11/08/2026) : évite de laisser
              croire qu'on peut relancer un envoi par-dessus celui en cours, la barre de
              progression prenant le relais visuellement à la place du bouton. */}
          {!uploading && (
            // Icône upload (au lieu du "+") + libellé sans "+" dans le dictionnaire —
            // il y avait deux "+" visibles sur ce bouton (icône ET texte), retour
            // d'Adriel le 15/09/2026, façon concurrence (cf. capture fournie).
            <button onClick={open} title={t("gm.addMedia")} className="btn-primary flex items-center gap-1.5 text-sm">
              <IconUpload />
              <span className="hidden sm:inline">{t("gm.addMedia")}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-600">
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            aria-label={t("common.close")}
            className="shrink-0 rounded p-1 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}
      {regenMessage && (
        <p className="border-b border-green-100 bg-green-50 px-6 py-2 text-sm text-green-700">{regenMessage}</p>
      )}
      {shareDesktopNotice && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-6 py-2 text-sm text-amber-700">
          <p>{t("gm.shareDesktopNotice")}</p>
          <button
            onClick={() => setShareDesktopNotice(false)}
            aria-label={t("common.close")}
            className="shrink-0 rounded p-1 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Rail d'icônes : Photos / Design / Réglages */}
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-3">
          {TABS.map((tabDef) => (
            <button
              key={tabDef.key}
              onClick={() => setActiveTab(tabDef.key)}
              title={tabDef.label}
              className={`relative flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-medium ${
                activeTab === tabDef.key
                  ? "bg-brand-50 text-brand-600"
                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              {tabDef.icon}
              {tabDef.key === "remarks" && pendingRemarksCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
                  {pendingRemarksCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {activeTab === "photos" && (
          // Sur mobile, le panneau Sets passe au-dessus de la grille (au lieu d'à côté) —
          // demande d'Adriel le 12/08/2026 ("mettre la sous menu au dessus et les photos en
          // dessous") : côte à côte, les deux ne laissaient presque plus de place pour la
          // grille sur petit écran. Hauteur plafonnée + défilement propre sur mobile pour
          // qu'un grand nombre de sets ne pousse pas toute la grille hors champ ; revient à
          // la disposition côte à côte d'origine à partir de md.
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
            {/* Panneau Sets/Sessions — masqué par défaut (voir photosPanelOpen), un seul
                bouton affiche/masque tout le bloc (pas juste la liste des sessions).
                En-tête façon référence d'Adriel le 14/09/2026 : le libellé "SESSIONS" et
                l'icône « de masquage sont réunis sur une seule ligne (plus de ligne "Photos"
                séparée au-dessus). */}
            {!photosPanelOpen && (
              <button
                type="button"
                onClick={() => setPhotosPanelOpen(true)}
                title={t("gm.showPhotosPanel")}
                aria-label={t("gm.showPhotosPanel")}
                className="group flex shrink-0 items-center justify-center gap-1.5 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:w-10 md:flex-col md:gap-2 md:border-b-0 md:border-r md:py-3"
              >
                {/* Bordure ronde autour de la flèche (demande d'Adriel le 15/09/2026) —
                    la distingue mieux comme bouton plutôt qu'une simple icône flottante. */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-300 group-hover:border-gray-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="md:[writing-mode:vertical-rl]">{t("gm.setsLabel")}</span>
              </button>
            )}
            {photosPanelOpen && (
            <aside className="max-h-40 shrink-0 overflow-y-auto border-b border-gray-200 bg-gray-50 p-3 md:max-h-none md:w-56 md:border-b-0 md:border-r">
              {/* En-tête en tout premier (demande d'Adriel le 14/09/2026, façon
                  concurrence) : "Toutes les photos" et les sessions suivent juste en
                  dessous, dans une seule liste. */}
              <div className="mb-4 flex items-center justify-between px-2">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t("gm.setsLabel")}
                  {gallery.collections.length > 0 && (
                    <span className="text-gray-300">({gallery.collections.length})</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setPhotosPanelOpen(false)}
                  title={t("gm.hidePhotosPanel")}
                  aria-label={t("gm.hidePhotosPanel")}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-gray-400 hover:border-gray-400 hover:bg-gray-200 hover:text-gray-600"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {/* Ligne de séparation après chaque session (demande d'Adriel le 13/09/2026) :
                  `divide-y` place un trait fin entre les items sans en ajouter un après le
                  dernier, plus propre qu'un `border-b` sur chaque ligne. Ce bloc entier est
                  déjà masqué avec le reste du panneau via photosPanelOpen ci-dessus.
                  "Toutes les photos" est maintenant le premier item de cette liste (avant,
                  il était séparé au-dessus de l'en-tête) et partage le même style "pastille à
                  bordure ronde" quand actif que les sessions ci-dessous (demande d'Adriel le
                  14/09/2026, façon concurrence). */}
              <div className="mt-1 divide-y divide-gray-200">
              <div className="pb-1">
                <button
                  onClick={() => setActiveSet(null)}
                  className={`my-0.5 flex w-full items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-sm ${
                    activeSet === null
                      ? "border-brand-500 bg-white font-medium text-brand-700"
                      : "border-transparent hover:bg-gray-100"
                  }`}
                >
                  <span>{t("gm.allPhotos")}</span>
                  <span className="text-xs text-gray-400">{localPhotos.length}</span>
                </button>
                {unsortedCount > 0 && gallery.collections.length > 0 && (
                  <p className="px-3 pb-1 pt-1 text-xs text-gray-400">
                    {unsortedCount} {t("gm.noSetPhotos")}
                  </p>
                )}
              </div>
              {gallery.collections.map((c) => {
                // Portfolio/Réseaux sociaux : compte sur le tag (portfolioTagged/socialTagged),
                // pas sur collectionId — voir togglePhotoTag et le commentaire sur ces champs
                // dans schema.prisma.
                const count = c.isPortfolioDefault
                  ? localPhotos.filter((p) => p.portfolioTagged).length
                  : c.isSocialDefault
                    ? localPhotos.filter((p) => p.socialTagged).length
                    : localPhotos.filter((p) => p.collectionId === c.id).length;
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedCollectionId(c.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverCollectionId !== c.id) setDragOverCollectionId(c.id);
                    }}
                    onDragLeave={() => setDragOverCollectionId((id) => (id === c.id ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleCollectionDrop(c.id);
                    }}
                    onDragEnd={() => {
                      setDraggedCollectionId(null);
                      setDragOverCollectionId(null);
                    }}
                    className={`group flex items-center ${draggedCollectionId === c.id ? "opacity-40" : ""} ${
                      dragOverCollectionId === c.id && draggedCollectionId !== c.id ? "bg-brand-50" : ""
                    }`}
                  >
                    <button
                      onClick={() => setActiveSet(c.id)}
                      className={`my-0.5 flex flex-1 items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-sm ${
                        activeSet === c.id
                          ? "border-brand-500 bg-white font-medium text-brand-700"
                          : "border-transparent hover:bg-gray-100"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{c.title}</span>
                        <span className="flex shrink-0 gap-0.5">
                          {c.visibility?.includes("GUEST") && (
                            <span
                              title={t("gm.setVisibilityGuest")}
                              className="rounded bg-gray-200 px-1 text-[10px] font-semibold text-gray-500"
                            >
                              I
                            </span>
                          )}
                          {!c.isPortfolioDefault && c.visibility?.includes("PORTFOLIO") && (
                            <span
                              title={t("gm.setVisibilityPortfolio")}
                              className="rounded bg-gray-200 px-1 text-[10px] font-semibold text-gray-500"
                            >
                              P
                            </span>
                          )}
                          {c.isSocialDefault && (
                            <span
                              title={t("gm.socialSetBadge")}
                              className="rounded bg-gray-200 px-1 text-[10px] font-semibold text-gray-500"
                            >
                              R
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="text-xs text-gray-400">{count}</span>
                    </button>
                    {/* Set "Portfolio" auto-créé : interrupteur direct (au lieu du badge "P" +
                        case à cocher dans le modal) pour activer/désactiver sa visibilité sur
                        le profil public sans quitter le panneau — demandé par Adriel le
                        30/07/2026. Toujours visible (pas group-hover) et bouton "supprimer"
                        masqué pour ce set, afin d'éviter de retirer par erreur le seul set
                        que /api/galleries et le portfolio public s'attendent à trouver. */}
                    {c.isPortfolioDefault && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={c.visibility?.includes("PORTFOLIO") || false}
                        disabled={portfolioToggling === c.id}
                        onClick={() => togglePortfolioVisibility(c)}
                        title={
                          c.visibility?.includes("PORTFOLIO")
                            ? t("gm.deactivatePortfolio")
                            : t("gm.activatePortfolio")
                        }
                        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
                          c.visibility?.includes("PORTFOLIO") ? "bg-green-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            c.visibility?.includes("PORTFOLIO") ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    )}
                    <button
                      onClick={() => openRenameSetModal(c)}
                      className="hidden px-1 text-xs text-gray-400 hover:text-brand-600 group-hover:block"
                      title={t("gm.rename")}
                    >
                      ✎
                    </button>
                    {!c.isPortfolioDefault && !c.isSocialDefault && (
                      <button
                        onClick={() => setDeleteConfirm({ collectionId: c.id, title: c.title })}
                        className="hidden px-1 text-xs text-gray-400 hover:text-red-500 group-hover:block"
                        title={t("gm.deleteSetTitle")}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              </div>
              {/* Bouton d'ajout déplacé en bas de la liste des sessions (demande d'Adriel le
                  14/09/2026, façon concurrence) — plus dans l'en-tête, à la suite de la
                  dernière session existante. */}
              <button
                onClick={openAddSetModal}
                className="mt-2 flex w-full items-center justify-center rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-brand-400 hover:text-brand-600"
              >
                {t("gm.addSet")}
              </button>
            </aside>
            )}

            {/* Grille de photos, sur fond clair (pas de fond noir derrière les images) */}
            <main
              {...getRootProps()}
              className={`relative flex-1 overflow-hidden bg-gray-50 ${
                isDragActive ? "ring-4 ring-inset ring-brand-500" : ""
              }`}
            >
              <input {...getInputProps()} />

              {/* Le loader/overlay d'upload est un FRÈRE (pas un enfant) du conteneur qui
                  scrolle juste en dessous : en enfant direct d'un `overflow-y-auto`, un
                  `absolute inset-0` reste ancré au sommet du CONTENU (donc défile hors champ
                  dès qu'on scrolle) plutôt qu'à la zone visible. Ici le scroll se fait dans
                  le wrapper interne ; ce `<main>` lui-même ne scrolle pas, donc l'overlay
                  reste toujours visible par-dessus la grille, quelle que soit la position du
                  scroll. */}
              {isDragActive && !uploading && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/85 text-lg font-medium text-gray-700">
                  {t("gm.dropHere")}
                </div>
              )}

              {/* Widget flottant façon Google Drive (demandé par Adriel le 11/08/2026) :
                  auparavant un bandeau opaque `inset-0` cachait toute la grille pendant
                  l'upload — désormais une carte compacte en bas à droite, qui laisse la
                  grille visible en dessous pour que les photos déjà envoyées (voir
                  localPhotos, alimenté au fil des lots dans runBatch) apparaissent
                  progressivement pendant que le reste continue d'uploader. */}
              {uploading && (
                <div className="absolute bottom-4 right-4 z-20 w-72 rounded-xl border border-gray-200 bg-white p-4 text-gray-700 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
                    {/* Barre de progression + % + temps restant estimé pendant l'envoi
                        proprement dit (voir uploadFiles/uploadStats) — demandé par Adriel le
                        06/08/2026 ("comme pour l'upload de google drive"). Pendant la phase de
                        vérification des doublons (avant que l'upload ne démarre), uploadStats
                        est encore `null` : on retombe alors sur le simple texte `progress`. */}
                    {uploadStats ? (
                      <div className="min-w-0 flex-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
                            style={{ width: `${uploadStats.percent}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
                          <span className="font-semibold text-gray-700">{uploadStats.percent}%</span>
                          <span>
                            {uploadStats.etaSeconds === null
                              ? t("gm.timeRemainingCalculating")
                              : `${t("gm.timeRemainingLabel")} ${formatDuration(uploadStats.etaSeconds) ?? "0:00"}`}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{progress}</p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {progress && uploadStats && (
                      <p className="min-w-0 flex-1 truncate text-xs text-gray-400">{progress}</p>
                    )}
                    <button
                      type="button"
                      onClick={stopUpload}
                      className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t("gm.stopUpload")}
                    </button>
                  </div>
                </div>
              )}

              <div className="absolute inset-0 overflow-y-auto">
              {/* Bandeau d'explication du set "Réseaux sociaux" — visible uniquement quand ce
                  set est ouvert (voir activeSocialSet), demande d'Adriel, 12/08/2026. */}
              {activeSocialSet && (
                <div className="m-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-800">{t("gm.socialBannerTitle")}</p>
                  <p className="mt-1 text-xs text-gray-500">{t("gm.socialBannerBody")}</p>
                </div>
              )}
              {filteredPhotos.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
                  <p>{activeSet ? t("gm.noPhotosInSet") : t("gm.noPhotosYet")}</p>
                  {!uploading && (
                    <button onClick={open} className="btn-primary text-sm">
                      {t("gm.addMedia")}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Barre d'outils grille : soit le compteur + tri normal, soit — dès
                      qu'au moins une photo est sélectionnée (cases à cocher sur les
                      vignettes) — une barre d'actions groupées (déplacer vers un set,
                      supprimer) qui prend sa place. */}
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/95 px-3 py-2 backdrop-blur-sm">
                    {/* Barre normale toujours visible en haut (compteur + vue + tri) —
                        les actions groupées sur la sélection sont désormais dans le pop-up
                        flottant en bas de l'écran (voir plus bas, demande d'Adriel du
                        14/09/2026, façon concurrence), plus dans cette barre du haut. */}
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={filteredPhotos.length > 0 && filteredPhotos.every((p) => selectedPhotoIds.has(p.id))}
                        onChange={toggleSelectAllFiltered}
                        className="h-4 w-4 rounded-sm border-gray-300"
                        aria-label={t("gm.selectAll")}
                      />
                      <p className="text-xs text-gray-500">
                        {filteredPhotos.length} {t("gm.photosCountLabel")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                    {/* Toggle grille/liste (demande d'Adriel le 13/09/2026) — même charte
                        que la bascule vue de /admin/guests. */}
                    <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
                      <button
                        type="button"
                        onClick={() => setPhotoViewMode("grid")}
                        title={t("gm.viewGrid")}
                        aria-label={t("gm.viewGrid")}
                        className={`rounded-md p-1.5 ${photoViewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                      >
                        <IconGridView />
                      </button>
                      {/* 3e mode : grille agrandie, vignettes plus grandes (demande
                          d'Adriel le 14/09/2026). */}
                      <button
                        type="button"
                        onClick={() => setPhotoViewMode("gridLarge")}
                        title={t("gm.viewGridLarge")}
                        aria-label={t("gm.viewGridLarge")}
                        className={`rounded-md p-1.5 ${photoViewMode === "gridLarge" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                      >
                        <IconGridLarge />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhotoViewMode("list")}
                        title={t("gm.viewList")}
                        aria-label={t("gm.viewList")}
                        className={`rounded-md p-1.5 ${photoViewMode === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                      >
                        <IconListView />
                      </button>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setSortMenuOpen((v) => !v)}
                        title={`${t("gm.sortBy")}: ${SORT_OPTIONS.find((o) => o.key === sortBy)?.label}`}
                        className="btn-secondary flex items-center gap-1.5 text-xs"
                      >
                        <IconSort />
                        {/* Libellé complet masqué sur mobile (place limitée dans la barre
                            d'outils grille) — icône seule + tooltip, comme les boutons du
                            header (demande d'Adriel, 11/08/2026). */}
                        <span className="hidden sm:inline">
                          {t("gm.sortBy")}: {SORT_OPTIONS.find((o) => o.key === sortBy)?.label}
                        </span>
                        <span className="text-gray-400">▾</span>
                      </button>
                      {sortMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
                          <div className="absolute right-0 top-9 z-20 w-60 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            {SORT_OPTIONS.map((o) => (
                              <button
                                key={o.key}
                                type="button"
                                onClick={() => changeSortOrder(o.key)}
                                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                                  sortBy === o.key ? "font-medium text-brand-600" : "text-gray-700"
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    </div>
                  </div>

                  {photoViewMode === "list" ? (
                    /* Vue liste (demande d'Adriel le 13/09/2026) : une ligne compacte par
                       photo avec vignette + nom + taille, plutôt que la grille de vignettes
                       carrées — mêmes actions (sélection, set, tags, partage, suppression)
                       que la vue grille, juste réarrangées horizontalement. */
                    <div className="divide-y divide-gray-200">
                      {filteredPhotos.map((photo) => {
                        const selected = selectedPhotoIds.has(photo.id);
                        return (
                          <div
                            key={photo.id}
                            onClick={() => setLightboxPhotoId(photo.id)}
                            className={`group flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 ${
                              selected ? "bg-brand-50" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectPhoto(photo.id);
                              }}
                              title={t("gm.selectPhoto")}
                              aria-label={t("gm.selectPhoto")}
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                                selected ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white text-transparent"
                              }`}
                            >
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                <path
                                  fillRule="evenodd"
                                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl(photo.id)}
                              alt={photo.filename}
                              className="h-12 w-12 shrink-0 rounded-md object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-gray-800">{photo.filename}</p>
                              <p className="text-xs text-gray-400">{formatFileSize(photo.sizeBytes)}</p>
                            </div>
                            {assignableCollections.length > 0 && (
                              <select
                                value={photo.collectionId || ""}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => movePhoto(photo.id, e.target.value)}
                                className="hidden shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 sm:block"
                              >
                                <option value="">{t("gm.noSetOption")}</option>
                                {assignableCollections.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                  </option>
                                ))}
                              </select>
                            )}
                            <div className="hidden shrink-0 gap-1 md:flex">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePhotoTag(photo.id, "portfolioTagged");
                                }}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  photo.portfolioTagged ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                }`}
                              >
                                {t("gm.tagPortfolio")}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePhotoTag(photo.id, "socialTagged");
                                }}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  photo.socialTagged ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                }`}
                              >
                                {t("gm.tagSocial")}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSharePhoto(photo);
                              }}
                              disabled={sharingPhotoId === photo.id}
                              title={t("gm.sharePhoto")}
                              aria-label={t("gm.sharePhoto")}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-wait disabled:opacity-70"
                            >
                              {sharingPhotoId === photo.id ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                              ) : (
                                <IconShare />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePhoto(photo.id);
                              }}
                              className="shrink-0 rounded px-2 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
                            >
                              {t("gm.delete")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                  /* Vignettes plus petites, façon concurrence (demande d'Adriel le
                     13/09/2026) : plus de colonnes à chaque palier pour des miniatures plus
                     compactes qu'avant (6 colonnes max → 10). Espace entre les vignettes
                     agrandi le 14/09/2026 (gap-1 → gap-3, padding du conteneur assorti).
                     3e mode "gridLarge" ajouté le 14/09/2026 : moins de colonnes pour des
                     vignettes bien plus grandes, coins arrondis sur toutes les vignettes.
                     Sélection par rectangle glissé (marqueeRect) le 14/09/2026 : mousedown
                     sur une zone vide de la grille démarre le tracé (voir
                     handlePhotoGridMouseDown), overlay rendu ci-dessous en position absolue. */
                  <div
                    ref={photoGridRef}
                    onMouseDown={handlePhotoGridMouseDown}
                    className={`relative grid select-none gap-3 p-3 ${
                      photoViewMode === "gridLarge"
                        ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                        : "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10"
                    }`}
                  >
                    {marqueeRect && (
                      <div
                        className="pointer-events-none absolute z-20 border border-brand-500 bg-brand-500/10"
                        style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
                      />
                    )}
                    {filteredPhotos.map((photo) => {
                      const selected = selectedPhotoIds.has(photo.id);
                      return (
                        <div
                          key={photo.id}
                          ref={registerPhotoTileRef(photo.id)}
                          data-photo-tile
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            // Ne sélectionne PAS la photo glissée (retour d'Adriel le
                            // 14/09/2026) : glisser-déposer ne doit faire que réordonner,
                            // pas sélectionner. handlePhotoDrop gère déjà les deux cas :
                            // déplacer tout le groupe si la photo glissée fait partie d'une
                            // sélection existante, sinon ne déplacer qu'elle seule.
                            setDraggedPhotoId(photo.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverPhotoId !== photo.id) setDragOverPhotoId(photo.id);
                          }}
                          onDragLeave={() => setDragOverPhotoId((id) => (id === photo.id ? null : id))}
                          onDrop={(e) => {
                            e.preventDefault();
                            handlePhotoDrop(photo.id);
                          }}
                          onDragEnd={() => {
                            setDraggedPhotoId(null);
                            setDragOverPhotoId(null);
                          }}
                          onClick={(e) => {
                            if (e.shiftKey) {
                              selectRangeTo(photo.id);
                              return;
                            }
                            lastSelectedPhotoIndexRef.current = filteredPhotos.findIndex((p) => p.id === photo.id);
                            setLightboxPhotoId(photo.id);
                          }}
                          className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-gray-100 transition-opacity ${
                            selected ? "ring-2 ring-inset ring-brand-500" : ""
                          } ${draggedPhotoId === photo.id ? "opacity-40" : ""} ${
                            dragOverPhotoId === photo.id && draggedPhotoId !== photo.id ? "ring-2 ring-brand-400" : ""
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbUrl(photo.id)}
                            alt={photo.filename}
                            className="h-full w-full object-cover"
                          />
                          {/* Clic sur l'image = zoom (voir onClick du conteneur) — la case à
                              cocher ci-dessous est désormais une vraie zone cliquable dédiée à
                              la sélection, visible en permanence si sélectionnée, sinon
                              seulement au survol (retour d'Adriel, 21/08/2026). */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectPhoto(photo.id);
                              lastSelectedPhotoIndexRef.current = filteredPhotos.findIndex((p) => p.id === photo.id);
                            }}
                            title={t("gm.selectPhoto")}
                            aria-label={t("gm.selectPhoto")}
                            className={`absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-sm text-white transition-opacity ${
                              selected ? "bg-brand-500 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            {selected && (
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                <path
                                  fillRule="evenodd"
                                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                          {/* Bouton "Partager" : visible sur toutes les vignettes au survol,
                              mais en permanence (pas seulement au hover) dans le set "Réseaux
                              sociaux" — demande d'Adriel, 12/08/2026. Positionné en miroir de
                              la pastille de sélection ci-dessus. */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSharePhoto(photo);
                            }}
                            disabled={sharingPhotoId === photo.id}
                            title={t("gm.sharePhoto")}
                            aria-label={t("gm.sharePhoto")}
                            className={`absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white transition-opacity hover:bg-black/70 disabled:cursor-wait disabled:opacity-70 ${
                              activeSocialSet ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            {sharingPhotoId === photo.id ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            ) : (
                              <IconShare />
                            )}
                          </button>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-x-0 bottom-0 hidden flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 group-hover:flex"
                          >
                            {sortBy === "sizeDesc" || sortBy === "sizeAsc" ? (
                              <span className="text-[10px] text-white/80">{formatFileSize(photo.sizeBytes)}</span>
                            ) : null}
                            {assignableCollections.length > 0 && (
                              <select
                                value={photo.collectionId || ""}
                                onChange={(e) => movePhoto(photo.id, e.target.value)}
                                className="rounded bg-black/60 px-1 py-0.5 text-xs text-white"
                              >
                                <option value="">{t("gm.noSetOption")}</option>
                                {assignableCollections.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                  </option>
                                ))}
                              </select>
                            )}
                            {/* Tags Portfolio/Réseaux sociaux : indépendants de collectionId, la
                                photo reste dans son set ci-dessus (retour d'Adriel, 21/08/2026) —
                                voir togglePhotoTag. */}
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => togglePhotoTag(photo.id, "portfolioTagged")}
                                className={`flex-1 rounded px-1 py-0.5 text-[10px] font-medium ${
                                  photo.portfolioTagged ? "bg-brand-500 text-white" : "bg-black/60 text-white/80 hover:bg-black/70"
                                }`}
                              >
                                {t("gm.tagPortfolio")}
                              </button>
                              <button
                                type="button"
                                onClick={() => togglePhotoTag(photo.id, "socialTagged")}
                                className={`flex-1 rounded px-1 py-0.5 text-[10px] font-medium ${
                                  photo.socialTagged ? "bg-brand-500 text-white" : "bg-black/60 text-white/80 hover:bg-black/70"
                                }`}
                              >
                                {t("gm.tagSocial")}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </>
              )}
              </div>
            </main>
          </div>
        )}

        {/* Pop-up flottant en bas de l'écran dès qu'au moins une photo est sélectionnée
            (demande d'Adriel le 14/09/2026, façon concurrence, cf. capture fournie) —
            remplace l'ancienne barre d'actions groupées qui prenait la place de la barre
            d'outils normale en haut de la grille.
            Retour d'Adriel (14/09/2026) : fond plein (pas de transparence/flou, moins
            lisible sur une grille chargée) et élargir la barre plutôt que l'agrandir en
            hauteur — px-8/gap-8 pour la largeur, hauteur gardée compacte (icônes 40px). */}
        {activeTab === "photos" && selectedPhotoIds.size > 0 && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-gray-900 px-8 py-3 text-white shadow-2xl">
              <div className="flex items-center gap-3 whitespace-nowrap text-sm">
                <span className="font-semibold">{selectedPhotoIds.size}</span>
                <span className="text-white/60">{t("gm.photosCountLabel")}</span>
                <span className="h-4 w-px bg-white/15" />
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="font-medium text-brand-300 transition-colors hover:text-brand-200 hover:underline"
                >
                  {t("gm.selectAll")}
                </button>
              </div>
              <span className="h-7 w-px bg-white/15" />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={downloadSelectedPhotos}
                  title={t("gm.downloadSelected")}
                  aria-label={t("gm.downloadSelected")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <IconDownloadCircle />
                </button>
                {assignableCollections.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      disabled={bulkActing}
                      onClick={() => setBulkMoveMenuOpen((v) => !v)}
                      title={t("gm.moveToSet")}
                      aria-label={t("gm.moveToSet")}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                    >
                      <IconFolderMove />
                    </button>
                    {bulkMoveMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setBulkMoveMenuOpen(false)} />
                        <div className="absolute bottom-12 left-1/2 z-20 w-52 -translate-x-1/2 rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg">
                          <button
                            type="button"
                            onClick={() => bulkMoveSelected("")}
                            className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            {t("gm.noSetOption")}
                          </button>
                          {assignableCollections.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => bulkMoveSelected(c.id)}
                              className="block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                            >
                              {c.title}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={bulkActing}
                  onClick={() => setBulkDeleteConfirm(true)}
                  title={t("gm.delete")}
                  aria-label={t("gm.delete")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                >
                  <IconTrashCircle />
                </button>
              </div>
              <div className="h-7 w-px bg-white/15" />
              <button
                type="button"
                onClick={clearSelection}
                title={t("gm.clearSelection")}
                aria-label={t("gm.clearSelection")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Visionneuse plein écran (zoom) — ouverte au clic sur une vignette de la grille
            Photos. Navigation précédent/suivant dans l'ordre affiché (filteredPhotos), donc
            cohérente avec le tri/filtre en cours. */}
        {lightboxPhotoId && (() => {
          const index = filteredPhotos.findIndex((p) => p.id === lightboxPhotoId);
          if (index === -1) return null;
          const photo = filteredPhotos[index];
          const goTo = (i: number) => {
            if (i < 0 || i >= filteredPhotos.length) return;
            setLightboxPhotoId(filteredPhotos[i].id);
          };
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
              onClick={() => setLightboxPhotoId(null)}
            >
              <button
                type="button"
                onClick={() => setLightboxPhotoId(null)}
                title={t("gm.lightbox.close")}
                aria-label={t("gm.lightbox.close")}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M5.3 4.3a1 1 0 0 1 1.4 0L10 7.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 9l3.3 3.3a1 1 0 0 1-1.4 1.4L10 10.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 9 5.3 5.7a1 1 0 0 1 0-1.4Z" />
                </svg>
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(index - 1);
                  }}
                  title={t("gm.lightbox.prev")}
                  aria-label={t("gm.lightbox.prev")}
                  className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path
                      fillRule="evenodd"
                      d="M12.7 4.3a1 1 0 0 1 0 1.4L8.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
              {index < filteredPhotos.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(index + 1);
                  }}
                  title={t("gm.lightbox.next")}
                  aria-label={t("gm.lightbox.next")}
                  className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path
                      fillRule="evenodd"
                      d="M7.3 15.7a1 1 0 0 1 0-1.4L11.6 10 7.3 5.7a1 1 0 0 1 1.4-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl(photo.id)}
                alt={photo.filename}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] max-w-[92vw] select-none object-contain"
              />
            </div>
          );
        })()}

        {activeTab === "settings" && (
          <main className="flex flex-1 flex-col overflow-hidden bg-[#EBEBEB]">
            {/* En-tête façon overlay (chantier UX "onglets + aperçu live", 12/09/2026,
                référence Picstudio) — fusionne les anciens onglets Design et Réglages en un
                seul, avec un aperçu live permanent. Le ✕ ramène simplement à l'onglet Photos
                (pas de vraie modale par-dessus le reste : le contenu reste inline dans la même
                arborescence, plus simple et cohérent avec le reste du panel). */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold uppercase tracking-wide text-neutral-400">
                  {t("gs.title")}
                </span>
                <span className="text-neutral-300">·</span>
                <span className="font-medium text-neutral-900">{gallery.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("photos")}
                aria-label={t("common.close")}
                title={t("common.close")}
                className="rounded-lg px-2 py-1 text-lg leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-neutral-200 bg-white px-6 py-3">
              {(
                [
                  { key: "publication", label: t("gs.tabPublication") },
                  { key: "presentation", label: t("gs.tabPresentation") },
                  { key: "delivery", label: t("gs.tabDelivery") },
                  { key: "security", label: t("gs.tabSecurity") },
                ] as { key: SettingsSubTab; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSettingsSubTab(s.key)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    settingsSubTab === s.key
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Occupation de l'espace façon concurrence (retour d'Adriel le 13/09/2026,
                captures à l'appui) : les deux colonnes ci-dessous remplissent chacune toute
                la largeur/hauteur disponible (plus de centrage `max-w-6xl` avec marges mortes
                de part et d'autre), et défilent chacune INDÉPENDAMMENT (retour suivant :
                "on dois avoir deux scroll, pour la gauche et pour la droite") — le `<form>`
                ne scrolle plus lui-même (`overflow-hidden` + hauteur fixée par le flex parent),
                chaque colonne porte son propre `overflow-y-auto`. `items-stretch` égalise leur
                hauteur avant que chacune ne gère son propre dépassement de contenu. */}
            <form onSubmit={saveSettings} className="flex-1 overflow-hidden p-6 lg:p-10">
              {/* Largeurs des deux colonnes (retour d'Adriel, 13/09/2026) : d'abord réduite à
                  320px ("augmente le with de la section de gauche" — l'aperçu live, en 1fr,
                  gagne l'espace repris à la colonne de droite), puis Adriel a demandé
                  d'agrandir À NOUVEAU la colonne Réglages (420px, padding p-8 au lieu de p-6)
                  une fois la grille "Composition" à 4 vignettes ajoutée (mode Bandeau,
                  captures PicStudio à l'appui) — plus confortable pour ces vignettes que 320px. */}
              <div className="grid h-full grid-cols-1 items-stretch gap-8 lg:grid-cols-[1fr_420px]">
                  {/* Aperçu live — à GAUCHE, toujours visible quel que soit le sous-onglet
                      actif (référence Picstudio), pas seulement pour la Présentation. Même
                      traitement "carte" que la colonne Réglages (rounded-2xl/bg-white/shadow-sm/
                      ring) depuis le retour d'Adriel du 13/09/2026 — padding plus resserré
                      (p-3 au lieu de p-6) car DesignLivePreview gère déjà ses propres marges
                      internes autour de la mock-fenêtre du navigateur. */}
                  <div className="min-w-0 space-y-6 overflow-y-auto rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 lg:order-1">
                    <DesignLivePreview
                      design={design}
                      title={gallery.title}
                      coverPhotoUrl={activeCoverPhotoId ? thumbUrl(activeCoverPhotoId) : null}
                      photos={localPhotos.slice(0, 6).map((p) => thumbUrl(p.id))}
                      credits={credits}
                      t={t}
                    />
                  </div>

                  <div className="min-w-0 space-y-6 overflow-y-auto rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5 lg:order-2">
                    {settingsSubTab === "publication" && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            {t("gs.sectionInformation")}
                          </h3>
                          <div className="space-y-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium">{t("galleryForm.titleLabel")}</label>
                              <input
                                required
                                type="text"
                                className="input"
                                value={settingsForm.title}
                                onChange={(e) => setSettingsForm((f) => ({ ...f, title: e.target.value }))}
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium">{t("gs.description")}</label>
                              <textarea
                                rows={3}
                                className="input"
                                placeholder={t("gs.descriptionPlaceholder")}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                              />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-sm font-medium">{t("galleryForm.clientLabel")}</label>
                                <SearchableSelect
                                  value={settingsForm.clientId}
                                  onChange={(clientId) => {
                                    // Le client principal ne peut pas apparaître aussi dans les
                                    // additionnels (même règle qu'à la création, NewGalleryForm).
                                    setSettingsForm((f) => ({ ...f, clientId }));
                                    if (clientId) setAdditionalClientIds((ids) => ids.filter((id) => id !== clientId));
                                  }}
                                  placeholder={t("common.noClientOption")}
                                  searchPlaceholder={t("common.searchPlaceholder")}
                                  emptyOptionLabel={t("common.noClientOption")}
                                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                                />
                              </div>
                              <div>
                                {/* "Projet" : texte libre plutôt qu'un modèle Project dédié —
                                    évite une nouvelle table pour un simple repère textuel
                                    (voir Gallery.projectName dans schema.prisma). */}
                                <label className="mb-1 block text-sm font-medium">{t("gs.project")}</label>
                                <input
                                  type="text"
                                  className="input"
                                  placeholder={t("gs.projectPlaceholder")}
                                  value={projectName}
                                  onChange={(e) => setProjectName(e.target.value)}
                                />
                              </div>
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium">{t("galleryForm.additionalClientsLabel")}</label>
                              <MultiSearchableSelect
                                values={additionalClientIds}
                                onChange={setAdditionalClientIds}
                                placeholder={t("galleryForm.additionalClientsPlaceholder")}
                                searchPlaceholder={t("common.searchPlaceholder")}
                                options={clients
                                  .filter((c) => c.id !== settingsForm.clientId)
                                  .map((c) => ({ value: c.id, label: c.name }))}
                              />
                              <p className="mt-1 text-xs text-gray-500">{t("galleryForm.additionalClientsHint")}</p>
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium">{t("gs.eventDate")}</label>
                              <input
                                type="date"
                                className="input w-48"
                                value={settingsForm.eventDate}
                                onChange={(e) => setSettingsForm((f) => ({ ...f, eventDate: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-neutral-100 pt-6">
                          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            {t("gs.sectionTags")}
                          </h3>
                          {/* Tags multiples (nouveau) — distincts de "Catégorie" ci-dessous, qui
                              reste la seule catégorie unique utilisée par les filtres de la
                              liste des galeries (voir /dashboard/galleries) : changer sa forme
                              casserait ces filtres. Les deux coexistent, usages différents. */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => removeTag(tag)}
                                  className="text-neutral-400 hover:text-neutral-700"
                                  aria-label={t("common.remove")}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                            <input
                              type="text"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  addTag(tagInput);
                                }
                              }}
                              onBlur={() => addTag(tagInput)}
                              placeholder={t("gs.addTagPlaceholder")}
                              className="min-w-[8rem] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-neutral-400"
                            />
                          </div>

                          <div className="mt-4">
                            <label className="mb-1 block text-sm font-medium">{t("gs.categoryTag")}</label>
                            <input
                              type="text"
                              className="input"
                              placeholder={t("gs.categoryTagPlaceholder")}
                              value={settingsForm.categoryTag}
                              onChange={(e) => setSettingsForm((f) => ({ ...f, categoryTag: e.target.value }))}
                              list="category-tag-options"
                              autoComplete="off"
                            />
                            <datalist id="category-tag-options">
                              {existingTags.map((tag) => (
                                <option key={tag} value={tag} />
                              ))}
                            </datalist>
                            {existingTags.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {existingTags.map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setSettingsForm((f) => ({ ...f, categoryTag: tag }))}
                                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                                      settingsForm.categoryTag === tag
                                        ? "border-gray-900 bg-gray-900 text-white"
                                        : "border-gray-200 text-gray-600 hover:border-gray-400"
                                    }`}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Automatisations : simple vitrine pour l'instant (aucun moteur de
                            déclenchement réel derrière) — volontairement présentée comme
                            indisponible plutôt que de simuler un comportement qui n'existe pas
                            (voir tâche de suivi #512/#518). */}
                        <div className="border-t border-neutral-100 pt-6">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                              {t("gs.sectionAutomations")}
                            </h3>
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                              {t("gs.comingSoon")}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-neutral-500">{t("gs.automationsEmpty")}</p>
                          <button
                            type="button"
                            disabled
                            title={t("gs.comingSoon")}
                            className="mt-2 w-full cursor-not-allowed rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-400"
                          >
                            {t("gs.chooseAutomation")}
                          </button>
                        </div>

                        <div className="flex items-center gap-3 border-t border-neutral-100 pt-6">
                          <button type="submit" disabled={settingsSaving} className="btn-primary text-sm">
                            {settingsSaving ? t("common.saving") : t("gs.save")}
                          </button>
                          {settingsSaved && <span className="text-sm text-green-600">{t("gs.saved")} ✓</span>}
                          {settingsError && <span className="text-sm text-red-600">{settingsError}</span>}
                        </div>
                      </div>
                    )}

                    {settingsSubTab === "presentation" && (
                      <div className="space-y-8">
                        {/* Sous-nav Présentation : Couverture / Police / Ambiance / Style —
                            horizontale, en haut du panel (plutôt qu'une colonne verticale).
                            flex-nowrap + overflow-x-auto : garde les 4 pastilles sur UNE seule
                            ligne (retour d'Adriel, 13/09/2026 — "Style" retombait à la ligne
                            dans la colonne d'options, plus étroite que l'aperçu). */}
                        <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
                          {(
                            [
                              { key: "cover", label: t("design.sectionCover") },
                              { key: "typography", label: t("design.sectionTypography") },
                              { key: "ambiance", label: t("design.sectionAmbiance") },
                              { key: "layout", label: t("design.sectionLayout") },
                            ] as { key: DesignSection; label: string }[]
                          ).map((s) => (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => setDesignSection(s.key)}
                              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                                designSection === s.key
                                  ? "bg-neutral-600 text-white"
                                  : "text-neutral-600 hover:bg-neutral-100"
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>

                        {designSection === "cover" && (
                          <div className="space-y-6">
                            <DesignOptionGroup
                              label={t("design.coverModeLabel")}
                              options={COVER_MODES.map((m) => ({ key: m.key, label: t(m.labelKey) }))}
                              value={design.coverMode}
                              onChange={(v) => updateDesign("coverMode", v as GalleryDesign["coverMode"])}
                              columns={3}
                            />

                            {design.coverMode !== "none" && (
                              <>
                                <div className="flex items-center gap-3 border-b border-neutral-100 pb-6">
                                  {activeCoverPhotoId ? (
                                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-neutral-200">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={thumbUrl(activeCoverPhotoId)}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-neutral-300 text-[10px] text-neutral-500">
                                      {t("gm.noPhotosYet")}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setCoverPickerOpen(true)}
                                      disabled={localPhotos.length === 0}
                                      className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {t("design.choosePhoto")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setFocalPointModalOpen(true)}
                                      disabled={!activeCoverPhotoId}
                                      className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {t("design.repositionCover")}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-600">
                                    {t("design.compositionLabel")}
                                  </p>
                                  {/* Mode "Bandeau" : 4 compositions dédiées (Éditorial/Centré/Côte à
                                      côte/Journal), distinctes des 9 styles "Hero" — retour d'Adriel
                                      le 13/09/2026, captures de PicStudio à l'appui (picstudio.fr,
                                      concurrent direct). Une bannière compacte n'a de sens qu'avec un
                                      choix restreint : les 9 styles "Hero" (frame/stripe/divider...)
                                      ne transposent pas correctement à ce format court. Voir
                                      BANDEAU_COMPOSITIONS dans galleryDesign.ts. */}
                                  {design.coverMode === "bandeau" ? (
                                    <>
                                      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                                        {BANDEAU_COMPOSITIONS.map((c) => (
                                          <button
                                            key={c.key}
                                            type="button"
                                            onClick={() => updateDesign("bandeauComposition", c.key)}
                                            className="text-center"
                                          >
                                            <div
                                              className={`aspect-[4/3] overflow-hidden rounded-lg border ${
                                                design.bandeauComposition === c.key ? "border-brand-500" : "border-[#808080]"
                                              }`}
                                            >
                                              <BandeauCompositionPreviewThumb
                                                composition={c.key}
                                                photoUrl={activeCoverPhotoId ? thumbUrl(activeCoverPhotoId) : null}
                                              />
                                            </div>
                                            <p className="mt-2 truncate text-xs text-neutral-600">{t(c.labelKey)}</p>
                                          </button>
                                        ))}
                                      </div>
                                      <p className="mt-3 text-xs text-neutral-500">
                                        {t(
                                          BANDEAU_COMPOSITIONS.find((c) => c.key === design.bandeauComposition)?.descKey ||
                                            BANDEAU_COMPOSITIONS[3].descKey
                                        )}
                                      </p>
                                    </>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                                      {COVER_STYLES.map((c) => (
                                        <button key={c.key} onClick={() => updateDesign("coverStyle", c.key)} className="text-center">
                                          <div
                                            className={`aspect-[4/3] overflow-hidden rounded-lg border ${
                                              design.coverStyle === c.key ? "border-brand-500" : "border-[#808080]"
                                            }`}
                                          >
                                            <CoverStylePreviewThumb
                                              style={c.key}
                                              photoUrl={activeCoverPhotoId ? thumbUrl(activeCoverPhotoId) : null}
                                            />
                                          </div>
                                          <p className="mt-2 truncate text-xs text-neutral-600">{t(c.labelKey)}</p>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-4 border-t border-neutral-100 pt-6">
                                  <label className="flex items-center justify-between text-sm">
                                    <span className="font-medium">{t("design.showCoverTitleLabel")}</span>
                                    <input
                                      type="checkbox"
                                      checked={design.showCoverTitle}
                                      onChange={(e) => updateDesign("showCoverTitle", e.target.checked)}
                                    />
                                  </label>
                                  {design.showCoverTitle && (
                                    <div className="grid grid-cols-2 gap-4">
                                      <DesignOptionGroup
                                        label={t("design.coverTitleScaleLabel")}
                                        options={[
                                          { key: "sm", label: "Aa" },
                                          { key: "md", label: "Aa" },
                                          { key: "lg", label: "Aa" },
                                        ]}
                                        value={design.coverTitleScale}
                                        onChange={(v) => updateDesign("coverTitleScale", v as GalleryDesign["coverTitleScale"])}
                                        columns={3}
                                      />
                                      <DesignOptionGroup
                                        label={t("design.coverTitleCaseLabel")}
                                        options={[
                                          { key: "uppercase", label: t("design.coverTitleCase.uppercase") },
                                          { key: "normal", label: t("design.coverTitleCase.normal") },
                                        ]}
                                        value={design.coverTitleCase}
                                        onChange={(v) => updateDesign("coverTitleCase", v as GalleryDesign["coverTitleCase"])}
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className="border-t border-neutral-100 pt-6">
                                  <label className="mb-1 block text-sm font-medium">{t("design.coverVideoUrlLabel")}</label>
                                  <input
                                    type="url"
                                    className="input"
                                    placeholder="https://..."
                                    value={design.coverVideoUrl || ""}
                                    onChange={(e) => updateDesign("coverVideoUrl", e.target.value || null)}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {designSection === "typography" && (
                          <div className="grid grid-cols-2 gap-4">
                            {FONTS.map((f) => (
                              <button
                                key={f.key}
                                onClick={() => updateDesign("font", f.key)}
                                className={`rounded-lg border-2 bg-neutral-50 px-4 py-6 text-center transition-colors hover:bg-neutral-100 ${
                                  design.font === f.key ? "border-brand-500" : "border-neutral-200"
                                }`}
                              >
                                <p
                                  className={`text-2xl text-neutral-900 ${f.className}`}
                                  style={{ fontFamily: f.stack }}
                                >
                                  Aa
                                </p>
                                <p className="mt-2 text-xs text-neutral-500">{t(f.labelKey)}</p>
                              </button>
                            ))}
                          </div>
                        )}

                        {designSection === "ambiance" && (
                          <div className="space-y-6">
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
                                {t("design.backgroundLabel")}
                              </p>
                              <p className="mb-3 text-xs text-neutral-400">{t("design.backgroundHint")}</p>
                              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                                {BACKGROUND_THEMES.map((bgTheme) => (
                                  <button
                                    key={bgTheme.key}
                                    type="button"
                                    onClick={() =>
                                      updateDesignFields({
                                        backgroundTheme: bgTheme.key,
                                        backgroundCustomHex: null,
                                        backgroundCustomTextHex: null,
                                      })
                                    }
                                    className={`overflow-hidden rounded-lg border-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                                      !design.backgroundCustomHex && design.backgroundTheme === bgTheme.key
                                        ? "border-brand-500"
                                        : "border-neutral-200 hover:border-neutral-300"
                                    }`}
                                  >
                                    <div
                                      className="flex h-10 items-center justify-center border-b border-black/5 text-[10px] font-medium"
                                      style={{ backgroundColor: bgTheme.bg, color: bgTheme.text }}
                                    >
                                      Aa
                                    </div>
                                    <p className="px-2 py-1 text-[11px] text-neutral-600">{t(bgTheme.labelKey)}</p>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="border-t border-neutral-100 pt-6">
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
                                {t("design.accentLabel")}
                              </p>
                              <p className="mb-3 text-xs text-neutral-400">{t("design.accentHint")}</p>
                              <div className="flex flex-wrap gap-2.5">
                                {ACCENT_COLORS.map((accentColorOption) => (
                                  <button
                                    key={accentColorOption.key}
                                    type="button"
                                    onClick={() => updateDesign("accentTheme", accentColorOption.key)}
                                    title={t(accentColorOption.labelKey)}
                                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 hover:shadow-md ${
                                      design.accentTheme === accentColorOption.key
                                        ? "border-neutral-900"
                                        : "border-transparent hover:border-neutral-300"
                                    }`}
                                    style={{
                                      backgroundColor:
                                        accentColorOption.key === "custom"
                                          ? design.accentCustomHex || accentColorOption.hex
                                          : accentColorOption.hex,
                                    }}
                                  />
                                ))}
                              </div>
                              {design.accentTheme === "custom" && (
                                <input
                                  type="text"
                                  className="input mt-3 w-40"
                                  placeholder="#4f6bf6"
                                  value={design.accentCustomHex || ""}
                                  onChange={(e) => updateDesign("accentCustomHex", e.target.value || null)}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {designSection === "layout" && (
                          <div className="space-y-6">
                            <DesignOptionGroup
                              label={t("design.layoutStyleLabel")}
                              options={LAYOUT_STYLES.map((l) => ({ key: l.key, label: t(l.labelKey) }))}
                              value={design.layoutStyle}
                              onChange={(v) => updateDesign("layoutStyle", v as GalleryDesign["layoutStyle"])}
                              columns={3}
                            />
                            {design.layoutStyle === "slideshow" && (
                              <DesignOptionGroup
                                label={t("design.slideshowTransitionLabel")}
                                options={SLIDESHOW_TRANSITIONS.map((tr) => ({ key: tr.key, label: t(tr.labelKey) }))}
                                value={design.slideshowTransition}
                                onChange={(v) => updateDesign("slideshowTransition", v as GalleryDesign["slideshowTransition"])}
                                columns={3}
                              />
                            )}
                            <DesignOptionGroup
                              label={t("design.gridStyleLabel")}
                              options={[
                                { key: "vertical", label: t("design.gridStyle.vertical") },
                                { key: "horizontal", label: t("design.gridStyle.horizontal") },
                              ]}
                              value={design.gridStyle}
                              onChange={(v) => updateDesign("gridStyle", v as GalleryDesign["gridStyle"])}
                            />
                            <DesignOptionGroup
                              label={t("design.columnsPerRowLabel")}
                              options={GRID_COLUMNS_OPTIONS.map((n) => ({ key: String(n), label: String(n) }))}
                              value={String(design.columnsPerRow)}
                              onChange={(v) => updateDesign("columnsPerRow", Number(v) as GalleryDesign["columnsPerRow"])}
                              columns={5}
                            />
                            <DesignOptionGroup
                              label={t("design.gridSpacingLabel")}
                              options={[
                                { key: "regular", label: t("design.gridSpacing.regular") },
                                { key: "large", label: t("design.gridSpacing.large") },
                                { key: "xlarge", label: t("design.gridSpacing.xlarge") },
                              ]}
                              value={design.gridSpacing}
                              onChange={(v) => updateDesign("gridSpacing", v as GalleryDesign["gridSpacing"])}
                              columns={3}
                            />
                            <DesignOptionGroup
                              label={t("design.navigationStyleLabel")}
                              options={[
                                { key: "icon", label: t("design.navigationStyle.icon") },
                                { key: "iconText", label: t("design.navigationStyle.iconText") },
                              ]}
                              value={design.navigationStyle}
                              onChange={(v) => updateDesign("navigationStyle", v as GalleryDesign["navigationStyle"])}
                            />
                            <DesignOptionGroup
                              label={t("design.sectionsNavModeLabel")}
                              options={SECTIONS_NAV_MODES.map((m) => ({ key: m.key, label: t(m.labelKey) }))}
                              value={design.sectionsNavMode}
                              onChange={(v) => updateDesign("sectionsNavMode", v as GalleryDesign["sectionsNavMode"])}
                            />
                            <DesignOptionGroup
                              label={t("design.videoDisplayModeLabel")}
                              options={VIDEO_DISPLAY_MODES.map((m) => ({ key: m.key, label: t(m.labelKey) }))}
                              value={design.videoDisplayMode}
                              onChange={(v) => updateDesign("videoDisplayMode", v as GalleryDesign["videoDisplayMode"])}
                              columns={3}
                            />
                            <div>
                              <label className="mb-1 block text-sm font-medium">{t("design.musicUrlLabel")}</label>
                              <input
                                type="url"
                                className="input"
                                placeholder="https://.../musique.mp3"
                                value={design.musicUrl || ""}
                                onChange={(e) => updateDesign("musicUrl", e.target.value || null)}
                              />
                              <p className="mt-1 text-xs text-gray-500">{t("design.musicUrlHint")}</p>
                            </div>
                          </div>
                        )}

                        {/* Presets — "Réutiliser cette mise en scène ?" (voir GalleryPreset) */}
                        <div className="border-t border-neutral-100 pt-6">
                          <button
                            type="button"
                            onClick={() => setPresetsOpen((v) => !v)}
                            className="flex w-full items-center justify-between text-left text-sm font-medium text-neutral-700"
                          >
                            {t("gs.presetsTitle")}
                            <span className="text-neutral-400">{presetsOpen ? "▴" : "▾"}</span>
                          </button>
                          {presetsOpen && (
                            <div className="mt-3 space-y-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  className="input flex-1"
                                  placeholder={t("gs.presetNamePlaceholder")}
                                  value={presetNameInput}
                                  onChange={(e) => setPresetNameInput(e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={savePreset}
                                  disabled={presetSaving || !presetNameInput.trim()}
                                  className="btn-secondary shrink-0 whitespace-nowrap text-xs disabled:opacity-50"
                                >
                                  {presetSaving ? t("common.saving") : t("gs.savePreset")}
                                </button>
                              </div>
                              {presetList.length > 0 && (
                                <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                                  {presetList.map((preset) => (
                                    <li key={preset.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                      <span className="truncate text-neutral-700">{preset.name}</span>
                                      <span className="flex shrink-0 items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => applyPreset(preset)}
                                          className="text-xs font-medium text-brand-600 hover:text-brand-700"
                                        >
                                          {t("gs.applyPreset")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deletePreset(preset.id)}
                                          aria-label={t("common.remove")}
                                          className="text-neutral-400 hover:text-red-600"
                                        >
                                          🗑
                                        </button>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Crédits prestataires (GalleryCredit) — affichés en pied de galerie
                            publique (voir tâche de suivi côté rendu public, #516). */}
                        <div className="border-t border-neutral-100 pt-6">
                          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            {t("gs.creditsTitle")}
                          </h3>
                          {credits.length > 0 && (
                            <ul className="mt-2 space-y-1.5">
                              {credits.map((credit) => (
                                <li
                                  key={credit.id}
                                  className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                                >
                                  <span>
                                    <span className="font-medium text-neutral-800">{credit.name}</span>
                                    <span className="ml-2 text-xs uppercase tracking-wide text-neutral-400">
                                      {t(`gs.creditRole.${credit.role}`)}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => deleteCredit(credit.id)}
                                    aria-label={t("common.remove")}
                                    className="text-neutral-400 hover:text-red-600"
                                  >
                                    🗑
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {creditFormRole ? (
                            <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3">
                              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                                {t(`gs.creditRole.${creditFormRole}`)}
                              </p>
                              <input
                                type="text"
                                className="input"
                                placeholder={t("gs.creditNamePlaceholder")}
                                value={creditFormName}
                                onChange={(e) => setCreditFormName(e.target.value)}
                              />
                              <input
                                type="url"
                                className="input"
                                placeholder={t("gs.creditUrlPlaceholder")}
                                value={creditFormUrl}
                                onChange={(e) => setCreditFormUrl(e.target.value)}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => addCredit(creditFormRole)}
                                  disabled={creditSaving || !creditFormName.trim()}
                                  className="btn-primary text-xs disabled:opacity-50"
                                >
                                  {creditSaving ? t("common.saving") : t("gs.addCredit")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCreditFormRole(null)}
                                  className="text-xs text-neutral-500 hover:text-neutral-800"
                                >
                                  {t("common.cancel")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {CREDIT_ROLES.map((role) => (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => setCreditFormRole(role)}
                                  className="rounded-lg border border-neutral-200 px-2 py-2.5 text-center text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
                                >
                                  {t(`gs.creditRole.${role}`)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {settingsSubTab === "delivery" && (
                      <div className="space-y-6">
                        <div className="rounded-lg border border-gray-200 p-4">
                          <p className="block text-sm font-medium">{t("gs.galleryLinkLabel")}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{t("gs.galleryLinkHint")}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              className="input flex-1 text-xs"
                              value={galleryUrl}
                              onFocus={(e) => e.target.select()}
                            />
                            <button
                              type="button"
                              onClick={handleShare}
                              className="btn-secondary shrink-0 whitespace-nowrap text-xs"
                            >
                              {copied ? t("gm.linkCopied") : t("gs.copyLink")}
                            </button>
                          </div>
                        </div>

                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={settingsForm.allowDownload}
                            onChange={(e) => setSettingsForm((f) => ({ ...f, allowDownload: e.target.checked }))}
                          />
                          <span>
                            <span className="block font-medium">{t("gs.download")}</span>
                            <span className="block text-xs text-gray-500">{t("gs.downloadHint")}</span>
                          </span>
                        </label>

                        {settingsForm.allowDownload && (
                          <div className="ml-6 space-y-3">
                            <div>
                              <label className="mb-1 block text-sm font-medium">{t("gs.downloadLimit")}</label>
                              <input
                                type="number"
                                min={1}
                                className="input w-40"
                                placeholder={t("gs.downloadLimitPlaceholder")}
                                value={settingsForm.downloadLimit}
                                onChange={(e) => setSettingsForm((f) => ({ ...f, downloadLimit: e.target.value }))}
                              />
                            </div>
                            <label className="flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={deliveryForm.downloadWebOptimized}
                                onChange={(e) =>
                                  setDeliveryForm((f) => ({ ...f, downloadWebOptimized: e.target.checked }))
                                }
                              />
                              <span>
                                <span className="block font-medium">{t("gs.downloadWebOptimized")}</span>
                                <span className="block text-xs text-gray-500">{t("gs.downloadWebOptimizedHint")}</span>
                              </span>
                            </label>
                            <label className="flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={deliveryForm.downloadSocialFormats}
                                onChange={(e) =>
                                  setDeliveryForm((f) => ({ ...f, downloadSocialFormats: e.target.checked }))
                                }
                              />
                              <span>
                                <span className="block font-medium">{t("gs.downloadSocialFormats")}</span>
                                <span className="block text-xs text-gray-500">{t("gs.downloadSocialFormatsHint")}</span>
                              </span>
                            </label>
                          </div>
                        )}

                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={settingsForm.allowFavorites}
                            onChange={(e) => setSettingsForm((f) => ({ ...f, allowFavorites: e.target.checked }))}
                          />
                          <span>
                            <span className="block font-medium">{t("gs.favorites")}</span>
                            <span className="block text-xs text-gray-500">{t("gs.favoritesHint")}</span>
                          </span>
                        </label>

                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={deliveryForm.allowComments}
                            onChange={(e) => setDeliveryForm((f) => ({ ...f, allowComments: e.target.checked }))}
                          />
                          <span>
                            <span className="block font-medium">{t("gs.allowComments")}</span>
                            <span className="block text-xs text-gray-500">{t("gs.allowCommentsHint")}</span>
                          </span>
                        </label>

                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={settingsForm.showWatermark}
                            onChange={(e) => setSettingsForm((f) => ({ ...f, showWatermark: e.target.checked }))}
                          />
                          <span>
                            <span className="block font-medium">{t("gs.watermark")}</span>
                            <span className="block text-xs text-gray-500">{t("gs.watermarkHint")}</span>
                          </span>
                        </label>

                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={deliveryForm.containsPortraits}
                            onChange={(e) => setDeliveryForm((f) => ({ ...f, containsPortraits: e.target.checked }))}
                          />
                          <span>
                            <span className="block font-medium">{t("gs.containsPortraits")}</span>
                            <span className="block text-xs text-gray-500">{t("gs.containsPortraitsHint")}</span>
                          </span>
                        </label>

                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={deliveryForm.showMetadata}
                            onChange={(e) => setDeliveryForm((f) => ({ ...f, showMetadata: e.target.checked }))}
                          />
                          <span>
                            <span className="block font-medium">{t("gs.showMetadata")}</span>
                            <span className="block text-xs text-gray-500">{t("gs.showMetadataHint")}</span>
                          </span>
                        </label>

                        <div>
                          <label className="mb-1 block text-sm font-medium">{t("gs.selectionLimit")}</label>
                          <input
                            type="number"
                            min={1}
                            className="input w-40"
                            placeholder={t("gs.selectionLimitPlaceholder")}
                            value={deliveryForm.selectionLimit}
                            onChange={(e) => setDeliveryForm((f) => ({ ...f, selectionLimit: e.target.value }))}
                          />
                          <p className="mt-1 text-xs text-gray-500">{t("gs.selectionLimitHint")}</p>
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium">{t("gs.expiry")}</label>
                          <input
                            type="date"
                            className="input"
                            value={settingsForm.expiresAt}
                            onChange={(e) => setSettingsForm((f) => ({ ...f, expiresAt: e.target.value }))}
                          />
                          <p className="mt-1 text-xs text-gray-500">{t("gs.expiryHint")}</p>
                        </div>

                        <div className="flex items-center gap-3 border-t border-neutral-100 pt-6">
                          <button type="submit" disabled={settingsSaving} className="btn-primary text-sm">
                            {settingsSaving ? t("common.saving") : t("gs.save")}
                          </button>
                          {settingsSaved && <span className="text-sm text-green-600">{t("gs.saved")} ✓</span>}
                          {settingsError && <span className="text-sm text-red-600">{settingsError}</span>}
                        </div>
                      </div>
                    )}

                    {settingsSubTab === "security" && (
                      <div className="space-y-6">
                        <div>
                          <label className="mb-1 block text-sm font-medium">{t("gs.password")}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="input flex-1"
                              placeholder={t("gs.passwordPlaceholder")}
                              value={settingsForm.password}
                              onChange={(e) => setSettingsForm((f) => ({ ...f, password: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setSettingsForm((f) => ({ ...f, password: generateGalleryPassword() }))}
                              className="btn-secondary shrink-0 whitespace-nowrap text-xs"
                            >
                              {t("gs.generatePassword")}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">{t("gs.passwordHint")}</p>
                        </div>

                        <div>
                          <p className="mb-1 block text-sm font-medium">{t("gm.setVisibilityLabel")}</p>
                          <p className="mb-1.5 text-xs text-gray-500">{t("galleryForm.visibilityHint")}</p>
                          <div className="space-y-1.5">
                            {(
                              [
                                { key: "CLIENT", label: t("gm.setVisibilityClient") },
                                { key: "GUEST", label: t("gm.setVisibilityGuest") },
                              ] as { key: SetVisibility; label: string }[]
                            ).map((opt) => (
                              <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={visibility.includes(opt.key)}
                                  onChange={() => toggleVisibility(opt.key)}
                                />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Lien UNIQUE à partager avec le client (voir GalleryEntryChooser) : à
                            l'ouverture, le visiteur choisit lui-même "Client" (mot de passe) ou
                            "Invité" (email, soumis à validation). Le lien invité juste en dessous
                            n'est qu'une alternative directe (saute le choix, utile pour un
                            post-it ou une story Instagram). */}
                        <div className="rounded-lg border border-gray-200 p-4">
                          <p className="block text-sm font-medium">{t("gs.guestLinkLabel")}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{t("gs.guestLinkHint")}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              className="input flex-1 text-xs"
                              value={guestUrl || t("gs.guestLinkNotGenerated")}
                              onFocus={(e) => e.target.select()}
                            />
                            <button
                              type="button"
                              onClick={handleShareGuest}
                              disabled={guestSlugLoading}
                              className="btn-secondary shrink-0 whitespace-nowrap text-xs"
                            >
                              {guestSlugLoading
                                ? t("gm.loading")
                                : copiedGuest
                                  ? t("gm.linkCopied")
                                  : guestUrl
                                    ? t("gs.copyLink")
                                    : t("gs.generateGuestLink")}
                            </button>
                          </div>

                          <label className="mt-3 flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={settingsForm.allowGuestDownload}
                              onChange={(e) =>
                                setSettingsForm((f) => ({ ...f, allowGuestDownload: e.target.checked }))
                              }
                            />
                            <span>
                              <span className="block font-medium">{t("gs.allowGuestDownload")}</span>
                              <span className="block text-xs text-gray-500">{t("gs.allowGuestDownloadHint")}</span>
                            </span>
                          </label>

                          <label className="mt-3 flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={settingsForm.requireGuestApproval}
                              onChange={(e) =>
                                setSettingsForm((f) => ({ ...f, requireGuestApproval: e.target.checked }))
                              }
                            />
                            <span>
                              <span className="block font-medium">{t("gs.requireGuestApproval")}</span>
                              <span className="block text-xs text-gray-500">{t("gs.requireGuestApprovalHint")}</span>
                            </span>
                          </label>

                          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {t("gs.visibilityDisclaimer")}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 border-t border-neutral-100 pt-6">
                          <button type="submit" disabled={settingsSaving} className="btn-primary text-sm">
                            {settingsSaving ? t("common.saving") : t("gs.save")}
                          </button>
                          {settingsSaved && <span className="text-sm text-green-600">{t("gs.saved")} ✓</span>}
                          {settingsError && <span className="text-sm text-red-600">{settingsError}</span>}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </form>
          </main>
        )}

        {activeTab === "video" && (
          <main className="flex-1 overflow-y-auto bg-white p-6">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-serif text-lg font-semibold">{t("video.title")}</h2>
              <p className="mt-1 text-sm text-gray-500">{t("video.hint")}</p>

              <div className="mt-4 rounded-lg border border-gray-200 p-4">
                {/* Deux façons d'ajouter une vidéo : coller un lien (Vimeo/YouTube, pas de
                    téléchargement possible côté client) ou uploader directement le fichier
                    (livraison du montage final, le client pourra le télécharger). */}
                <div className="mb-3 inline-flex rounded-full bg-gray-100 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setVideoUploadMode("link")}
                    className={`rounded-full px-3 py-1 transition-colors ${
                      videoUploadMode === "link" ? "bg-white shadow-sm" : "text-gray-500"
                    }`}
                  >
                    {t("video.modeLink")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoUploadMode("upload")}
                    className={`rounded-full px-3 py-1 transition-colors ${
                      videoUploadMode === "upload" ? "bg-white shadow-sm" : "text-gray-500"
                    }`}
                  >
                    {t("video.modeUpload")}
                  </button>
                </div>

                {videoUploadMode === "link" ? (
                  <form onSubmit={addVideo} className="space-y-2">
                    <input
                      type="url"
                      required
                      className="input"
                      placeholder={t("video.urlPlaceholder")}
                      value={videoUrlInput}
                      onChange={(e) => setVideoUrlInput(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder={t("video.titlePlaceholder")}
                      value={videoTitleInput}
                      onChange={(e) => setVideoTitleInput(e.target.value)}
                    />
                    {videoError && <p className="text-sm text-red-600">{videoError}</p>}
                    <button
                      type="submit"
                      disabled={videoAdding || !videoUrlInput.trim()}
                      className="btn-primary text-sm"
                    >
                      {videoAdding ? t("common.saving") : t("video.add")}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">{t("video.uploadHint")}</p>
                    <input
                      type="text"
                      className="input"
                      placeholder={t("video.titlePlaceholder")}
                      value={videoUploadTitle}
                      onChange={(e) => setVideoUploadTitle(e.target.value)}
                    />
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="video/*"
                      disabled={videoUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadVideoFile(file);
                      }}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-gray-700"
                    />
                    {videoError && <p className="text-sm text-red-600">{videoError}</p>}
                    {videoUploading && <p className="text-sm text-gray-500">{t("video.uploading")}</p>}
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-3">
                {videosLoading && videos === null && (
                  <p className="text-sm text-gray-400">{t("gm.loading")}</p>
                )}

                {videos !== null && videos.length === 0 && (
                  <p className="text-sm text-gray-400">{t("video.empty")}</p>
                )}

                {videos?.map((v) => {
                  const isUpload = !!v.storageKey;
                  const isEditing = editingVideoId === v.id;
                  return (
                    <div key={v.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                      <div
                        className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 bg-cover bg-center"
                        style={{
                          backgroundImage:
                            !v.thumbnailUrl && videoCoverFallbackUrl ? `url(${videoCoverFallbackUrl})` : undefined,
                        }}
                      >
                        {v.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnailUrl} alt={v.title} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white">
                            <IconVideo />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveVideoTitle(v.id);
                            }}
                            className="flex items-center gap-2"
                          >
                            <input
                              autoFocus
                              type="text"
                              className="input text-sm"
                              value={editingVideoTitle}
                              onChange={(e) => setEditingVideoTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingVideoId(null);
                              }}
                            />
                            <button
                              type="submit"
                              disabled={!editingVideoTitle.trim() || videoRenaming}
                              className="shrink-0 rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                            >
                              {videoRenaming ? t("common.saving") : t("gm.rename")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingVideoId(null)}
                              className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                            >
                              {t("gm.cancel")}
                            </button>
                          </form>
                        ) : (
                          <>
                            <p className="truncate text-sm font-medium text-gray-800">{v.title}</p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {isUpload
                                ? t("video.uploadedBadge")
                                : v.provider === "vimeo"
                                  ? "Vimeo"
                                  : v.provider === "youtube"
                                    ? "YouTube"
                                    : ""}
                              {formatDuration(v.duration) ? ` · ${formatDuration(v.duration)}` : ""}
                              {isUpload && v.sizeBytes ? ` · ${formatFileSize(v.sizeBytes)}` : ""}
                            </p>
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <>
                          <button
                            onClick={() => {
                              setEditingVideoId(v.id);
                              setEditingVideoTitle(v.title);
                            }}
                            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                          >
                            {t("gm.rename")}
                          </button>
                          <button
                            onClick={() => deleteVideo(v.id)}
                            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600"
                          >
                            {t("gm.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </main>
        )}

        {activeTab === "remarks" && (
          <main className="flex-1 overflow-y-auto bg-white p-6">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-serif text-lg font-semibold">{t("remarks.title")}</h2>
              <p className="mt-1 text-sm text-gray-500">{t("remarks.hint")}</p>

              {/* Sélecteur de fichier unique, partagé entre toutes les lignes — voir
                  beginReplacePhotoForRemark/onReplaceFileChange. */}
              <input
                ref={replaceFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff"
                className="hidden"
                onChange={onReplaceFileChange}
              />

              {replaceError && (
                <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span>{replaceError}</span>
                  <button onClick={() => setReplaceError(null)} className="shrink-0 text-red-400 hover:text-red-600">
                    ✕
                  </button>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                {(["pending", "resolved", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRemarksFilter(f)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      remarksFilter === f
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {f === "pending"
                      ? t("remarks.filterPending")
                      : f === "resolved"
                      ? t("remarks.filterResolved")
                      : t("remarks.filterAll")}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {remarksLoading && remarks === null && (
                  <p className="text-sm text-gray-400">{t("gm.loading")}</p>
                )}

                {remarks !== null &&
                  (() => {
                    const filtered = remarks.filter((r) =>
                      remarksFilter === "all" ? true : remarksFilter === "pending" ? !r.resolved : r.resolved
                    );
                    if (filtered.length === 0) {
                      return <p className="text-sm text-gray-400">{t("remarks.empty")}</p>;
                    }
                    return filtered.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          r.resolved ? "border-gray-100 bg-gray-50" : "border-gray-200"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl(r.photo.id)}
                          alt={r.photo.filename}
                          className="h-16 w-16 shrink-0 rounded-md object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${r.resolved ? "text-gray-400" : "text-gray-800"}`}>
                            {r.message}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {new Date(r.createdAt).toLocaleDateString(locale, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <button
                            onClick={() => beginReplacePhotoForRemark(r.id)}
                            disabled={replacingRemarkId === r.id}
                            title={t("remarks.replacePhotoHint")}
                            className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-60"
                          >
                            {replacingRemarkId === r.id ? (
                              <Spinner size={12} />
                            ) : (
                              <IconUpload />
                            )}
                            {t("remarks.replacePhoto")}
                          </button>
                          <button
                            onClick={() => toggleRemarkResolved(r.id, !r.resolved)}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              r.resolved
                                ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                : "bg-green-100 text-green-700 hover:bg-green-200"
                            }`}
                          >
                            {r.resolved ? t("remarks.markPending") : t("remarks.markResolved")}
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
              </div>
            </div>
          </main>
        )}
      </div>

      <Modal
        open={!!setModal}
        onClose={() => setSetModal(null)}
        title={setModal?.mode === "rename" ? t("gm.renameSetTitle") : t("gm.addSetTitle")}
        footer={
          <>
            <button onClick={() => setSetModal(null)} className="btn-secondary text-sm">
              {t("gm.cancel")}
            </button>
            <button
              form="set-modal-form"
              type="submit"
              disabled={setModalSaving || !setModal?.value.trim()}
              className="btn-primary text-sm"
            >
              {setModalSaving ? t("common.saving") : t("common.save")}
            </button>
          </>
        }
      >
        <form id="set-modal-form" onSubmit={submitSetModal}>
          <input
            autoFocus
            className="input"
            placeholder={t("gm.setNamePlaceholder")}
            value={setModal?.value || ""}
            onChange={(e) => setSetModal((m) => (m ? { ...m, value: e.target.value } : m))}
          />

          <p className="mb-1.5 mt-4 text-xs font-medium text-gray-600">{t("gm.setVisibilityLabel")}</p>
          {/* PORTFOLIO retiré ici (05/08/2026, demande d'Adriel) — même logique que le
              "Visible par" global de la création de galerie (voir NewGalleryForm.tsx) : la
              visibilité portfolio d'un set personnalisé n'est plus éditable via cette case à
              cocher, seul le set "Portfolio" auto-créé garde son interrupteur dédié
              (togglePortfolioVisibility ci-dessus) pour éviter d'avoir deux façons différentes
              de piloter le portfolio public. */}
          <div className="space-y-1.5">
            {(
              [
                { key: "CLIENT", label: t("gm.setVisibilityClient") },
                { key: "GUEST", label: t("gm.setVisibilityGuest") },
              ] as { key: SetVisibility; label: string }[]
            ).map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={setModal?.visibility.includes(opt.key) || false}
                  onChange={() => toggleSetVisibility(opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={t("gm.deleteSetTitle")}
        footer={
          <>
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-sm">
              {t("gm.cancel")}
            </button>
            <button
              onClick={confirmDeleteSet}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t("gm.delete")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {deleteConfirm && <span className="font-medium text-gray-900">« {deleteConfirm.title} » — </span>}
          {t("gm.confirmDeleteSet")}
        </p>
      </Modal>

      <Modal
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        title={t("gm.delete")}
        footer={
          <>
            <button onClick={() => setBulkDeleteConfirm(false)} className="btn-secondary text-sm">
              {t("gm.cancel")}
            </button>
            <button
              onClick={bulkDeleteSelected}
              disabled={bulkActing}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {bulkActing ? t("common.saving") : t("gm.delete")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{selectedPhotoIds.size}</span> {t("gm.confirmBulkDelete")}
        </p>
      </Modal>

      {/* Doublons détectés avant l'envoi (voir beginUpload) : on suspend l'upload et on
          demande explicitement au studio ce qu'il veut faire plutôt que de choisir à sa
          place — les 3 options reflètent les cas d'usage réels (photo déjà envoyée par
          erreur, nouvelle version du même fichier à remplacer, ou volonté assumée de garder
          deux copies). */}
      <Modal
        open={!!duplicateConfirm}
        onClose={() => setDuplicateConfirm(null)}
        title={t("gm.duplicateModalTitle")}
        widthClassName="max-w-lg"
        footer={
          <>
            <button onClick={() => resolveDuplicates("skip")} className="btn-secondary text-sm">
              {t("gm.duplicateIgnore")}
            </button>
            <button onClick={() => resolveDuplicates("replace")} className="btn-secondary text-sm">
              {t("gm.duplicateReplace")}
            </button>
            <button onClick={() => resolveDuplicates("keep")} className="btn-secondary text-sm">
              {t("gm.duplicateKeep")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{duplicateConfirm?.count ?? 0}</span> {t("gm.duplicateModalBody")}
        </p>
        <ul className="mt-4 space-y-2.5 text-sm text-gray-500">
          <li><span className="font-medium text-gray-700">{t("gm.duplicateIgnore")}</span> — {t("gm.duplicateIgnoreHint")}</li>
          <li><span className="font-medium text-gray-700">{t("gm.duplicateReplace")}</span> — {t("gm.duplicateReplaceHint")}</li>
          <li><span className="font-medium text-gray-700">{t("gm.duplicateKeep")}</span> — {t("gm.duplicateKeepHint")}</li>
        </ul>
      </Modal>

      <Modal
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        title={t("design.coverPhotoLabel")}
      >
        <div className="grid max-h-[60vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
          {localPhotos.map((p) => (
            <button
              key={p.id}
              onClick={() => chooseCoverPhoto(p.id)}
              className={`aspect-square overflow-hidden rounded border-2 ${
                activeCoverPhotoId === p.id ? "border-brand-500" : "border-transparent hover:border-gray-300"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(p.id)} alt={p.filename} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </Modal>

      {focalPointModalOpen && activeCoverPhotoId && (
        <CoverFocalPointModal
          imageUrl={thumbUrl(activeCoverPhotoId)}
          initialX={design.coverFocalX}
          initialY={design.coverFocalY}
          onCancel={() => setFocalPointModalOpen(false)}
          onConfirm={updateCoverFocalPoint}
          t={t}
        />
      )}
    </div>
  );
}

// ===================== Sous-composants =====================

function DesignOptionGroup({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  /** Nombre de colonnes de la grille de boutons (par défaut 2, ex: 5 pour tout tenir sur une ligne). */
  columns?: 2 | 3 | 4 | 5 | 6;
}) {
  // Classes écrites en toutes lettres pour que le JIT Tailwind les détecte (voir la
  // même remarque dans galleryDesign.ts : pas de `grid-cols-${n}` construit dynamiquement).
  const colsClass: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };
  const compact = columns > 2;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-600">{label}</p>
      <div className={`grid ${colsClass[columns] || "grid-cols-2"} ${compact ? "gap-2" : "gap-3"}`}>
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-lg border-2 bg-neutral-50 text-center text-xs text-neutral-600 transition-colors hover:bg-neutral-100 ${
              compact ? "px-2 py-3" : "px-3 py-4"
            } ${value === o.key ? "border-brand-500 text-neutral-900" : "border-neutral-200"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Petite vignette illustrant à quoi ressemble un style de couverture donné. */
function CoverStylePreviewThumb({ style, photoUrl }: { style: CoverStyle; photoUrl: string | null }) {
  const bg = photoUrl ? { backgroundImage: `url(${photoUrl})` } : {};
  const base = "relative h-full w-full bg-neutral-300 bg-cover bg-center";
  switch (style) {
    case "left":
      // Reflète le vrai rendu (voir GalleryCover "left" dans GalleryView.tsx) : panneau uni
      // à gauche (~35%) avec un repère de titre, photo pleine à droite — pas un simple
      // dégradé, pour ne pas induire en erreur sur ce à quoi ce style ressemble vraiment.
      return (
        <div className="flex h-full w-full bg-neutral-200">
          <div className="flex w-[35%] shrink-0 flex-col justify-between p-1.5">
            <div className="h-1 w-4 rounded-sm bg-neutral-400" />
            <div className="h-1.5 w-8 rounded-sm bg-neutral-700/85" />
            <div className="h-1 w-5 rounded-sm border border-neutral-400" />
          </div>
          <div className="flex-1 bg-neutral-300 bg-cover bg-center" style={bg} />
        </div>
      );
    case "right":
      // Miroir de "left" (voir GalleryCover "right" dans GalleryView.tsx) : photo à
      // gauche, panneau uni à droite.
      return (
        <div className="flex h-full w-full bg-neutral-200">
          <div className="flex-1 bg-neutral-300 bg-cover bg-center" style={bg} />
          <div className="flex w-[35%] shrink-0 flex-col justify-between p-1.5">
            <div className="h-1 w-4 self-end rounded-sm bg-neutral-400" />
            <div className="h-1.5 w-8 self-end rounded-sm bg-neutral-700/85" />
            <div className="h-1 w-5 self-end rounded-sm border border-neutral-400" />
          </div>
        </div>
      );
    case "minimal":
      // Photo plein cadre + pastille flottante en bas (voir GalleryCover "minimal").
      return (
        <div className={base} style={bg}>
          <div className="absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-1">
            <div className="h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
            <div className="h-1 w-8 rounded-sm bg-neutral-500" />
          </div>
        </div>
      );
    case "editorial":
      // Titre au-dessus de la photo (voir GalleryCover "editorial").
      return (
        <div className="flex h-full w-full flex-col bg-neutral-200">
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-1.5">
            <div className="h-1 w-8 rounded-sm bg-neutral-400" />
            <div className="h-1.5 w-12 rounded-sm bg-neutral-700" />
          </div>
          <div className="h-[55%] w-full bg-neutral-300 bg-cover bg-center" style={bg} />
        </div>
      );
    case "frame":
      return (
        <div className="flex h-full w-full items-center justify-center bg-neutral-200 p-2">
          <div className="h-full w-full bg-neutral-300 bg-cover bg-center" style={bg} />
        </div>
      );
    case "stripe":
      return (
        <div className={base} style={bg}>
          <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 bg-white/85" />
        </div>
      );
    case "divider":
      return (
        <div className="flex h-full w-full flex-col bg-neutral-200">
          <div className="flex-1 bg-neutral-300 bg-cover bg-center" style={bg} />
          <div className="h-px bg-neutral-400" />
          <div className="flex h-4 items-center justify-center">
            <div className="h-1 w-6 rounded-sm bg-neutral-400" />
          </div>
        </div>
      );
    case "outline":
      return (
        <div className={base} style={bg}>
          <div className="absolute inset-0 bg-neutral-500/25" />
          <div className="absolute inset-4 border border-white/80" />
        </div>
      );
    case "center":
    default:
      return (
        <div className={base} style={bg}>
          <div className="absolute inset-0 bg-neutral-500/30" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white/90" />
        </div>
      );
  }
}

/** Miniatures des 4 compositions du mode "Bandeau" (voir BANDEAU_COMPOSITIONS) — même esprit
 * que CoverStylePreviewThumb ci-dessus, mais pour le format compact bandeau plutôt que "Hero"
 * plein écran. Chaque case reflète le vrai rendu produit par renderBandeauComposition ci-dessous
 * (et son équivalent GalleryView.tsx). */
function BandeauCompositionPreviewThumb({
  composition,
  photoUrl,
}: {
  composition: BandeauComposition;
  photoUrl: string | null;
}) {
  const bg = photoUrl ? { backgroundImage: `url(${photoUrl})` } : {};
  switch (composition) {
    case "editorial":
      // Titre au-dessus d'une bande photo courte.
      return (
        <div className="flex h-full w-full flex-col bg-neutral-200">
          <div className="flex flex-1 flex-col items-center justify-center gap-1">
            <div className="h-1 w-8 rounded-sm bg-neutral-400" />
            <div className="h-1.5 w-12 rounded-sm bg-neutral-700" />
          </div>
          <div className="h-[45%] w-full bg-neutral-300 bg-cover bg-center" style={bg} />
        </div>
      );
    case "centered":
      // Titre superposé au centre de la bande photo (scrim semi-transparent).
      return (
        <div className="relative h-full w-full bg-neutral-300 bg-cover bg-center" style={bg}>
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/35">
            <div className="h-1.5 w-12 rounded-sm bg-white/90" />
          </div>
        </div>
      );
    case "sideBySide":
      // Bande photo courte à côté d'un panneau titre (au lieu d'empilés).
      return (
        <div className="flex h-full w-full bg-neutral-200">
          <div className="h-full w-[55%] bg-neutral-300 bg-cover bg-center" style={bg} />
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-1">
            <div className="h-1 w-6 rounded-sm bg-neutral-400" />
            <div className="h-1 w-8 rounded-sm border border-neutral-400" />
          </div>
        </div>
      );
    case "journal":
    default:
      // Bande photo courte, PUIS titre dessous, jamais en surimpression.
      return (
        <div className="flex h-full w-full flex-col bg-neutral-200">
          <div className="h-[55%] w-full bg-neutral-300 bg-cover bg-center" style={bg} />
          <div className="flex flex-1 flex-col items-center justify-center gap-1">
            <div className="h-1.5 w-12 rounded-sm bg-neutral-700" />
            <div className="h-1 w-6 rounded-sm border border-neutral-400" />
          </div>
        </div>
      );
  }
}

/** Aperçu "live" (cover + mini grille) qui reflète les réglages de design actuels. */
function DesignLivePreview({
  design,
  title,
  coverPhotoUrl,
  photos,
  credits = [],
  t,
}: {
  design: GalleryDesign;
  title: string;
  coverPhotoUrl: string | null;
  photos: string[];
  /** Crédits prestataires — "générique de fin" affiché sous la grille, voir le même rendu
   * dans GalleryFooter (GalleryView.tsx, rendu public). Corrigé le 13/09/2026 (retour
   * d'Adriel : "Crédits ... ne s'affiche pas a l'aperçu"). */
  credits?: GalleryCreditDTO[];
  t: (key: string) => string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const isMobile = device === "mobile";
  const font = getFont(design.font);
  // Voir le même commentaire dans GalleryView.tsx (chantier "Ambiance", 12/09/2026) : `palette`
  // garde la forme {bg, text, accent} pour ne pas toucher aux appels ci-dessous, seule la
  // source change (fond+accent indépendants avec migration douce, au lieu de l'ancienne
  // palette combinée `getPalette(design.color)`).
  const rootStyle = getDesignRootStyle(design);
  const palette = { bg: rootStyle.backgroundColor, text: rootStyle.color, accent: resolveAccentHex(design) };
  const bg = coverPhotoUrl ? { backgroundImage: `url(${coverPhotoUrl})` } : {};

  // Titre affiché dans la couverture : respecte Casse du titre / Échelle du titre / Afficher
  // le titre de couverture (corrigé le 13/09/2026 — retour d'Adriel : ces 3 réglages
  // n'avaient jamais été branchés sur l'aperçu). Même logique que GalleryCover dans
  // GalleryView.tsx (rendu public), voir le commentaire là-bas pour le détail.
  const displayTitle = design.coverTitleCase === "uppercase" ? title.toUpperCase() : title;
  function renderTitle() {
    if (!design.showCoverTitle) return null;
    const scaleStyle =
      design.coverTitleScale === "sm"
        ? { transform: "scale(0.82)" }
        : design.coverTitleScale === "lg"
          ? { transform: "scale(1.18)" }
          : {};
    return (
      <span className={font.className} style={{ fontFamily: font.stack, display: "inline-block", ...scaleStyle }}>
        {displayTitle}
      </span>
    );
  }

  // Mode "bandeau" : bannière compacte pleine largeur, avec 4 compositions dédiées
  // (design.bandeauComposition — voir BANDEAU_COMPOSITIONS dans galleryDesign.ts) plutôt que
  // les 9 styles "Hero" (retour d'Adriel le 13/09/2026, captures de PicStudio à l'appui).
  // Même logique que renderBandeauComposition dans GalleryCover (GalleryView.tsx, rendu
  // public) — garder les deux en phase pour que l'aperçu ne mente jamais sur le rendu final.
  let coverContent: JSX.Element | null = null;
  if (design.coverMode === "bandeau") {
    const viewGalleryBadge = (
      <span
        className="shrink-0 border px-2.5 py-1 text-[9px] uppercase tracking-widest"
        style={{ borderColor: palette.accent, color: palette.accent }}
      >
        {t("design.previewViewGallery")}
      </span>
    );
    const titleSpan = (
      <span className={`text-center uppercase tracking-[0.15em] ${font.className}`} style={{ color: palette.text, fontFamily: font.stack }}>
        {renderTitle()}
      </span>
    );
    if (design.bandeauComposition === "editorial") {
      coverContent = (
        <div className="w-full" style={{ backgroundColor: palette.bg }}>
          <div className="flex flex-col items-center gap-2 px-3 py-3 text-xs">
            {titleSpan}
            {viewGalleryBadge}
          </div>
          <div className="h-20 w-full bg-neutral-300 bg-cover bg-center sm:h-28" style={bg} />
        </div>
      );
    } else if (design.bandeauComposition === "centered") {
      coverContent = (
        <div className="relative h-28 w-full bg-neutral-300 bg-cover bg-center sm:h-36" style={bg}>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-900/35 px-3 text-xs">
            <span className={`text-center uppercase tracking-[0.15em] text-white ${font.className}`} style={{ fontFamily: font.stack }}>
              {renderTitle()}
            </span>
            <span className="shrink-0 border border-white/70 px-2.5 py-1 text-[9px] uppercase tracking-widest text-white">
              {t("design.previewViewGallery")}
            </span>
          </div>
        </div>
      );
    } else if (design.bandeauComposition === "sideBySide") {
      const align = design.coverStyle === "right" ? "right" : "left";
      coverContent = (
        <div className={`flex w-full ${align === "right" ? "flex-row-reverse" : ""}`} style={{ backgroundColor: palette.bg }}>
          <div className="h-24 w-[55%] bg-neutral-300 bg-cover bg-center sm:h-32" style={bg} />
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-3 text-xs">
            {titleSpan}
            {viewGalleryBadge}
          </div>
        </div>
      );
    } else {
      // "journal" (défaut) : bande photo courte, PUIS titre dessous, jamais en surimpression.
      const align = design.coverStyle === "left" ? "left" : design.coverStyle === "right" ? "right" : "center";
      coverContent = (
        <div className="w-full">
          <div className="h-24 w-full bg-neutral-300 bg-cover bg-center sm:h-32" style={bg} />
          <div
            className={`flex flex-col items-center gap-2 border-b px-3 py-2.5 text-xs sm:flex-row sm:gap-3 ${
              align === "left" ? "sm:justify-start" : align === "right" ? "sm:justify-end" : "sm:justify-center"
            }`}
            style={{ backgroundColor: palette.bg, borderColor: `${palette.accent}30` }}
          >
            {titleSpan}
            {viewGalleryBadge}
          </div>
        </div>
      );
    }
  } else if (design.coverMode !== "none") {
  switch (design.coverStyle) {
    case "left":
      // Même structure que le vrai rendu public (GalleryCover "left") : panneau uni à
      // gauche (titre + bouton), photo pleine à droite — sans quoi l'aperçu de l'éditeur
      // mentirait sur le résultat final. En mobile, la vraie page publique empile le
      // panneau au-dessus de la photo (flex-col) au lieu de les mettre côte à côte.
      coverContent = (
        <div
          className={`flex w-full ${isMobile ? "flex-col" : "aspect-[16/10]"}`}
          style={{ backgroundColor: palette.bg }}
        >
          <div className={`flex shrink-0 flex-col justify-between p-3 ${isMobile ? "w-full" : "w-[36%]"}`}>
            <span className="text-[9px] uppercase tracking-widest opacity-60" style={{ color: palette.text }}>
              {t("design.previewStudioLabel")}
            </span>
            <div className="text-base leading-tight" style={{ color: palette.text }}>
              {renderTitle()}
            </div>
            <span
              className="w-fit border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: palette.accent, color: palette.accent }}
            >
              {t("design.previewViewGallery")}
            </span>
          </div>
          <div
            className={`flex-1 bg-neutral-300 bg-cover bg-center ${isMobile ? "aspect-[16/10] w-full" : ""}`}
            style={bg}
          />
        </div>
      );
      break;
    case "right":
      // Miroir de "left" : photo à gauche, panneau à droite (voir GalleryCover "right").
      coverContent = (
        <div
          className={`flex w-full ${isMobile ? "flex-col" : "aspect-[16/10] flex-row-reverse"}`}
          style={{ backgroundColor: palette.bg }}
        >
          <div className={`flex shrink-0 flex-col justify-between p-3 ${isMobile ? "w-full" : "w-[36%]"}`}>
            <span className="text-[9px] uppercase tracking-widest opacity-60" style={{ color: palette.text }}>
              {t("design.previewStudioLabel")}
            </span>
            <div className="text-base leading-tight" style={{ color: palette.text }}>
              {renderTitle()}
            </div>
            <span
              className="w-fit border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: palette.accent, color: palette.accent }}
            >
              {t("design.previewViewGallery")}
            </span>
          </div>
          <div
            className={`flex-1 bg-neutral-300 bg-cover bg-center ${isMobile ? "aspect-[16/10] w-full" : ""}`}
            style={bg}
          />
        </div>
      );
      break;
    case "minimal":
      // Photo plein cadre + pastille flottante (voir GalleryCover "minimal").
      coverContent = (
        <div className="relative aspect-[16/10] w-full bg-neutral-300 bg-cover bg-center" style={bg}>
          <div
            className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 shadow"
            style={{ backgroundColor: `${palette.bg}e6` }}
          >
            <span className="truncate text-xs" style={{ color: palette.text, fontFamily: font.stack }}>
              {renderTitle()}
            </span>
            <span
              className="shrink-0 border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: palette.accent, color: palette.accent }}
            >
              {t("design.previewViewGallery")}
            </span>
          </div>
        </div>
      );
      break;
    case "editorial":
      // Titre au-dessus de la photo (voir GalleryCover "editorial").
      coverContent = (
        <div style={{ backgroundColor: palette.bg }}>
          <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
            <span className="text-[9px] uppercase tracking-widest opacity-60" style={{ color: palette.text }}>
              {t("design.previewStudioLabel")}
            </span>
            <div className="text-xl leading-tight" style={{ color: palette.text }}>
              {renderTitle()}
            </div>
            <span
              className="mt-1 w-fit border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: palette.accent, color: palette.accent }}
            >
              {t("design.previewViewGallery")}
            </span>
          </div>
          <div className="aspect-[16/9] w-full bg-neutral-300 bg-cover bg-center" style={bg} />
        </div>
      );
      break;
    case "frame":
      coverContent = (
        <div className="aspect-[16/10] w-full p-4" style={{ backgroundColor: palette.bg }}>
          <div className="h-full w-full bg-neutral-300 bg-cover bg-center" style={bg} />
          <p className="mt-2 text-center text-sm" style={{ color: palette.text, fontFamily: font.stack }}>
            {renderTitle()}
          </p>
        </div>
      );
      break;
    case "stripe":
      coverContent = (
        <div className="relative aspect-[16/10] w-full bg-neutral-300 bg-cover bg-center" style={bg}>
          <div
            className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center py-3"
            style={{ backgroundColor: `${palette.accent}cc` }}
          >
            <span className="text-lg font-semibold text-white" style={{ fontFamily: font.stack }}>
              {renderTitle()}
            </span>
          </div>
        </div>
      );
      break;
    case "divider":
      coverContent = (
        <div style={{ backgroundColor: palette.bg }}>
          <div className="aspect-[16/11] w-full bg-neutral-300 bg-cover bg-center" style={bg} />
          <div className="border-t" style={{ borderColor: palette.accent }} />
          <p
            className="py-3 text-center text-sm"
            style={{ color: palette.text, fontFamily: font.stack }}
          >
            {renderTitle()}
          </p>
        </div>
      );
      break;
    case "outline":
      coverContent = (
        <div className="relative aspect-[16/10] w-full bg-neutral-300 bg-cover bg-center" style={bg}>
          <div className="absolute inset-0 bg-neutral-500/25" />
          <div className="absolute inset-6 flex items-center justify-center border border-white/80">
            <span className="px-3 text-lg text-white" style={{ fontFamily: font.stack }}>
              {renderTitle()}
            </span>
          </div>
        </div>
      );
      break;
    case "center":
    default:
      coverContent = (
        <div className="relative aspect-[16/10] w-full bg-neutral-300 bg-cover bg-center" style={bg}>
          <div className="absolute inset-0 bg-neutral-500/30" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl text-white" style={{ fontFamily: font.stack }}>
              {renderTitle()}
            </span>
          </div>
        </div>
      );
      break;
  }
  }

  // Classes littérales (voir GRID_COLS_CLASSES dans galleryDesign.ts pour la même
  // contrainte : Tailwind ne génère que les classes trouvées telles quelles dans le code).
  const desktopGridColsClasses: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };
  const gridColsClass = isMobile
    ? design.columnsPerRow === 2
      ? "grid-cols-1"
      : "grid-cols-2"
    : desktopGridColsClasses[design.columnsPerRow] || "grid-cols-3";
  const gridGapClass =
    design.gridSpacing === "xlarge" ? "gap-4 p-4" : design.gridSpacing === "large" ? "gap-1.5 p-1.5" : "gap-px p-px";

  // Même nombre de colonnes pour le mode "mosaïque" (masonry), mais réparti en JS
  // (colonnes flex, photo i → colonne i % N) plutôt qu'avec `columns-N` : comme sur la
  // page publique (voir masonryColumnCount dans galleryDesign.ts), `columns-N` remplirait
  // chaque colonne de haut en bas avant de passer à la suivante, cassant l'ordre de
  // lecture gauche→droite des photos.
  const masonryColsCount = isMobile ? (design.columnsPerRow === 2 ? 1 : 2) : Math.min(design.columnsPerRow, 6);
  const isMasonry = design.gridStyle !== "horizontal";

  return (
    <div>
      {/* Bascule Bureau / Mobile — comme l'éditeur Pixieset, pour vérifier le rendu
          responsive sans avoir à ouvrir la page publique dans un autre onglet. */}
      <div className="mb-6 flex justify-center gap-2">
        {(["desktop", "mobile"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setDevice(mode)}
            className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              device === mode
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {mode === "desktop" ? t("design.previewDesktop") : t("design.previewMobile")}
          </button>
        ))}
      </div>
      <div
        className={`mx-auto overflow-hidden rounded-xl border border-neutral-800 shadow-xl transition-all ${
          isMobile ? "max-w-[320px]" : "w-full"
        }`}
      >
        {coverContent}
        {/* Barre titre entre couverture et grille (comme le "BANALOUNGE" de l'éditeur
            Pixieset) : nom de la galerie centré, séparé de la grille par un simple trait. */}
        <div
          className="flex items-center justify-center gap-2 border-b px-3 py-2"
          style={{ backgroundColor: palette.bg, borderColor: `${palette.accent}30` }}
        >
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium text-white"
            style={{ backgroundColor: palette.accent }}
          >
            {(title || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span
            className="truncate text-[10px] uppercase tracking-[0.15em]"
            style={{ color: palette.text, fontFamily: font.stack }}
          >
            {title}
          </span>
        </div>
        {isMasonry ? (
          <div className={`flex items-start ${gridGapClass}`} style={{ backgroundColor: palette.bg }}>
            {(photos.length > 0
              ? Array.from({ length: masonryColsCount }, (_, colIdx) =>
                  photos.filter((_, i) => i % masonryColsCount === colIdx)
                )
              : Array.from({ length: masonryColsCount }, (_, colIdx) =>
                  Array.from({ length: 6 }).filter((_, i) => i % masonryColsCount === colIdx)
                )
            ).map((column, colIdx) => (
              <div key={colIdx} className="flex min-w-0 flex-1 flex-col gap-px">
                {photos.length > 0
                  ? (column as string[]).map((url, i) => (
                      // Pas de wrapper aspect-square : chaque photo garde son ratio
                      // naturel, comme sur la page publique.
                      <div key={i} className="overflow-hidden bg-neutral-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="block h-auto w-full" />
                      </div>
                    ))
                  : column.map((_, i) => <div key={i} className="aspect-[3/4] bg-neutral-200" />)}
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid ${gridColsClass} ${gridGapClass}`} style={{ backgroundColor: palette.bg }}>
            {photos.length > 0
              ? photos.map((url, i) => (
                  <div key={i} className="aspect-square overflow-hidden bg-neutral-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square bg-neutral-200" />
                ))}
          </div>
        )}
        {credits.length > 0 && (
          // Générique de fin, voir le même rendu dans GalleryFooter (GalleryView.tsx, page
          // publique) — même règle "role — nom".
          <div
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t px-3 py-2.5 text-[10px] opacity-70"
            style={{ backgroundColor: palette.bg, color: palette.text, borderColor: `${palette.accent}30` }}
          >
            {credits.map((credit) => (
              <span key={credit.id}>
                {credit.role} — {credit.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IconPhotos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function IconDesign() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

function IconVideo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="5.5" width="14" height="13" rx="2" />
      <path d="M16.5 10l5-3v10l-5-3" strokeLinejoin="round" />
    </svg>
  );
}

function IconRemarksTab() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

/** Icônes des boutons de la barre du haut (Aperçu / Partager au client / Partager /
 * Ajouter des médias), affichées seules sur mobile faute de place — voir la barre du haut
 * dans GalleryManager (demande d'Adriel, 11/08/2026). */
function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconSendToClient() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
    </svg>
  );
}

function IconShareLink() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.5l6.8-3.9M8.6 13.5l6.8 3.9" strokeLinecap="round" />
    </svg>
  );
}

/** Bouton "Partager" des vignettes de la grille (voir handleSharePhoto) — flèche sortant
 * d'une boîte, icône de partage standard style iOS. */
function IconShare() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRefreshThumbs({ className }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M3 12a9 9 0 0115.4-6.36M21 12a9 9 0 01-15.4 6.36" strokeLinecap="round" />
      <path d="M18.6 3.6v4.5h-4.5M5.4 20.4v-4.5h4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4" strokeLinecap="round" />
      <path d="M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSort() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7h11" />
      <path d="M3 12h7" />
      <path d="M3 17h4" />
      <path d="M17 5v14" />
      <path d="M13 15l4 4 4-4" />
    </svg>
  );
}

// Toggle vue grille/liste de la grille Photos — icônes reprises telles quelles de
// admin/guests/page.tsx pour garder la même charte visuelle dans tout le dashboard.
function IconGridView() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

/** Icônes du pop-up flottant de sélection multiple (demande d'Adriel le 14/09/2026). */
function IconFolderMove() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
    </svg>
  );
}
/** Bouton "Télécharger la sélection" du pop-up (demande d'Adriel le 15/09/2026). */
function IconDownloadCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v11" strokeLinecap="round" />
      <path d="M7.5 11.5 12 16l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  );
}
function IconTrashCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconGridLarge() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7.5" height="17" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="17" rx="1.5" />
    </svg>
  );
}
function IconListView() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
