"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { CoverFocalPointModal } from "@/components/studio/CoverFocalPointModal";
import {
  COLOR_PALETTES,
  COVER_STYLES,
  FONTS,
  GRID_COLUMNS_OPTIONS,
  resolveGalleryDesign,
  getFont,
  getPalette,
  type GalleryDesign,
  type CoverStyle,
} from "@/lib/galleryDesign";
import { sortPhotos, resolvePhotoSortKey, formatFileSize, type PhotoSortKey } from "@/lib/photoSort";
import { formatDuration } from "@/lib/videoEmbed";
import { generateGalleryCode as generateGalleryPassword } from "@/lib/galleryCode";

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
}

type MainTab = "photos" | "design" | "video" | "settings" | "remarks";
type DesignSection = "cover" | "typography" | "color" | "grid";

export function GalleryManager({
  gallery,
  existingTags = [],
}: {
  gallery: GalleryDTO;
  /** Tags déjà utilisés sur d'autres galeries du studio, proposés en autocomplétion. */
  existingTags?: string[];
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
  const [error, setError] = useState<string | null>(null);
  const [activeSet, setActiveSet] = useState<string | null>(null); // null = "Toutes les photos"
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  // Le tri est persisté en base (Gallery.photoSortOrder) pour s'appliquer aussi à la
  // galerie publiée, pas seulement à cette vue admin — voir setPhotoSortOrder ci-dessous.
  const [sortBy, setSortBy] = useState<PhotoSortKey>(resolvePhotoSortKey(gallery.photoSortOrder));
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Sélection multiple (grille Photos) : cases à cocher sur les vignettes + barre d'actions
  // groupées (déplacer vers un set, supprimer) qui remplace la barre d'outils normale tant
  // qu'au moins une photo est sélectionnée.
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
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
  // Doublons détectés AVANT l'envoi (voir beginUpload/check-duplicates) : tant que ce state
  // est renseigné, l'upload est en pause en attendant que le studio choisisse Ignorer /
  // Écraser / Conserver dans la modale correspondante.
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ files: File[]; count: number } | null>(null);

  // ---- Onglets (Photos / Design / Réglages) ----
  const [activeTab, setActiveTab] = useState<MainTab>("photos");
  const [designSection, setDesignSection] = useState<DesignSection>("cover");
  const [design, setDesign] = useState<GalleryDesign>(() => resolveGalleryDesign(gallery.design));
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(gallery.coverPhotoId);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [focalPointModalOpen, setFocalPointModalOpen] = useState(false);

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

  const uploadFiles = useCallback(
    async (files: File[], duplicateAction: "skip" | "replace" | "keep" = "skip") => {
      setUploading(true);
      setError(null);
      const controller = new AbortController();
      uploadAbortRef.current = controller;
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

      async function runBatch(batch: File[]) {
        const formData = new FormData();
        batch.forEach((f) => formData.append("files", f));
        if (activeSet) formData.append("collectionId", activeSet);
        formData.append("duplicateAction", duplicateAction);
        try {
          const res = await fetch(`/api/galleries/${gallery.id}/photos`, {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            errors.push(data?.error ? JSON.stringify(data.error) : `${t("gm.httpError")} ${res.status}`);
          } else {
            uploadedCount += Array.isArray(data.photos) ? data.photos.length : batch.length;
            if (Array.isArray(data.skipped)) skippedCount += data.skipped.length;
            if (Array.isArray(data.rejected)) rejectedCount += data.rejected.length;
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
          // compteur au fil des complétions plutôt que par index de lot.
          completedFiles += batch.length;
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
          const batch = batches[cursor++];
          await runBatch(batch);
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));

      uploadAbortRef.current = null;
      setUploading(false);
      setProgress(null);
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
    [gallery.id, activeSet, router, t]
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

  async function movePhoto(photoId: string, collectionId: string) {
    await fetch(`/api/galleries/${gallery.id}/photos/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: collectionId || null }),
    });
    router.refresh();
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

  const filteredPhotos = useMemo(() => {
    const base = gallery.photos.filter((p) => (activeSet ? p.collectionId === activeSet : true));
    // Même helper que la galerie publique (/g/[slug]) : le tri choisi ici est ce que le
    // client voit, pas juste un tri d'affichage local à ce panel.
    return sortPhotos(base, sortBy);
  }, [gallery.photos, activeSet, sortBy]);

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

  const unsortedCount = gallery.photos.filter((p) => !p.collectionId).length;

  const thumbUrl = (photoId: string) => {
    // Le paramètre ?v= (basé sur updatedAt) force le navigateur à recharger l'image dès
    // qu'elle est régénérée côté serveur (filigrane, recadrage...) — sans lui, le cache
    // HTTP continuerait de servir l'ancienne version indéfiniment.
    const version = gallery.photos.find((p) => p.id === photoId)?.updatedAt;
    const v = version ? new Date(version).getTime() : 0;
    return `/api/files/studios/${gallery.studioId}/galleries/${gallery.id}/${photoId}/thumb.jpg?v=${v}`;
  };

  const activeCoverPhotoId = coverPhotoId || gallery.photos[0]?.id || null;
  // Fond des vignettes de l'onglet Vidéo qui n'ont pas de miniature propre (upload direct,
  // pas de génération de vignette vidéo en v1) — la couverture de la galerie plutôt qu'un
  // aplat gris, comme côté galerie publique (voir VideoSection dans GalleryView.tsx).
  const videoCoverFallbackUrl = activeCoverPhotoId ? thumbUrl(activeCoverPhotoId) : null;

  // ---- Design : sauvegarde live (chaque clic patch immédiatement, comme dans Pixieset) ----
  async function updateDesign<K extends keyof GalleryDesign>(key: K, value: GalleryDesign[K]) {
    const next = { ...design, [key]: value };
    setDesign(next);
    await fetch(`/api/galleries/${gallery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design: { [key]: value } }),
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

  const pendingRemarksCount = remarks?.filter((r) => !r.resolved).length ?? 0;

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
    { key: "design", label: t("gm.tabDesign"), icon: <IconDesign /> },
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
        <div className="flex items-center gap-2">
          {gallery.photos.length > 0 && (
            <button
              onClick={regenerateThumbnails}
              disabled={regenLoading}
              title={t("gm.regenerateThumbsHint")}
              className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline disabled:opacity-50"
            >
              {regenLoading ? t("gm.regenerating") : t("gm.regenerateThumbs")}
            </button>
          )}
          <a href={`/g/${gallery.slug}`} target="_blank" className="btn-secondary text-sm">
            {t("gm.preview")}
          </a>
          {gallery.clientId && (
            <button
              onClick={handleShareToClient}
              disabled={shareToClientState === "sending"}
              title={shareToClientState === "error" ? shareToClientError || undefined : undefined}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              {shareToClientState === "sending"
                ? t("gm.shareToClientSending")
                : shareToClientState === "sent"
                  ? t("gm.shareToClientSent")
                  : shareToClientState === "error"
                    ? t("gm.shareToClientError")
                    : t("gm.shareToClient")}
            </button>
          )}
          <button onClick={handleShare} className="btn-secondary text-sm">
            {copied ? t("gm.linkCopied") : t("gm.share")}
          </button>
          <button onClick={open} className="btn-primary text-sm">
            {t("gm.addMedia")}
          </button>
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
          <>
            {/* Panneau Sets */}
            <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("gm.photosLabel")}
              </p>
              <button
                onClick={() => setActiveSet(null)}
                className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  activeSet === null ? "bg-brand-100 text-brand-700" : "hover:bg-gray-100"
                }`}
              >
                <span>{t("gm.allPhotos")}</span>
                <span className="text-xs text-gray-400">{gallery.photos.length}</span>
              </button>
              {unsortedCount > 0 && gallery.collections.length > 0 && (
                <p className="px-3 pb-1 text-xs text-gray-400">
                  {unsortedCount} {t("gm.noSetPhotos")}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between px-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t("gm.setsLabel")}
                </p>
                <button onClick={openAddSetModal} className="text-xs text-brand-600 hover:underline">
                  {t("gm.addSet")}
                </button>
              </div>
              {gallery.collections.map((c) => {
                const count = gallery.photos.filter((p) => p.collectionId === c.id).length;
                return (
                  <div key={c.id} className="group flex items-center">
                    <button
                      onClick={() => setActiveSet(c.id)}
                      className={`my-0.5 flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                        activeSet === c.id ? "bg-brand-100 text-brand-700" : "hover:bg-gray-100"
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
                    {!c.isPortfolioDefault && (
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
            </aside>

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

              {uploading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/90 text-gray-700">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
                  <p className="text-sm font-medium">{progress}</p>
                  <button
                    type="button"
                    onClick={stopUpload}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("gm.stopUpload")}
                  </button>
                </div>
              )}

              <div className="absolute inset-0 overflow-y-auto">
              {filteredPhotos.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
                  <p>{activeSet ? t("gm.noPhotosInSet") : t("gm.noPhotosYet")}</p>
                  <button onClick={open} className="btn-primary text-sm">
                    {t("gm.addMedia")}
                  </button>
                </div>
              ) : (
                <>
                  {/* Barre d'outils grille : soit le compteur + tri normal, soit — dès
                      qu'au moins une photo est sélectionnée (cases à cocher sur les
                      vignettes) — une barre d'actions groupées (déplacer vers un set,
                      supprimer) qui prend sa place. */}
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/95 px-3 py-2 backdrop-blur-sm">
                    {selectedPhotoIds.size > 0 ? (
                      <>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={clearSelection}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-lg leading-none text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                            aria-label={t("gm.clearSelection")}
                          >
                            ×
                          </button>
                          <p className="text-xs font-medium text-gray-700">
                            {selectedPhotoIds.size} {t("gm.selectedCountLabel")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {gallery.collections.length > 0 && (
                            <div className="relative">
                              <button
                                type="button"
                                disabled={bulkActing}
                                onClick={() => setBulkMoveMenuOpen((v) => !v)}
                                className="btn-secondary flex items-center gap-1.5 text-xs"
                              >
                                {t("gm.moveToSet")}
                                <span className="text-gray-400">▾</span>
                              </button>
                              {bulkMoveMenuOpen && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setBulkMoveMenuOpen(false)} />
                                  <div className="absolute right-0 top-9 z-20 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                                    <button
                                      type="button"
                                      onClick={() => bulkMoveSelected("")}
                                      className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                      {t("gm.noSetOption")}
                                    </button>
                                    {gallery.collections.map((c) => (
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
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            {t("gm.delete")}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
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
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setSortMenuOpen((v) => !v)}
                            className="btn-secondary flex items-center gap-1.5 text-xs"
                          >
                            <IconSort />
                            {t("gm.sortBy")}: {SORT_OPTIONS.find((o) => o.key === sortBy)?.label}
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
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {filteredPhotos.map((photo) => {
                      const selected = selectedPhotoIds.has(photo.id);
                      return (
                        <div
                          key={photo.id}
                          onClick={() => toggleSelectPhoto(photo.id)}
                          className={`group relative aspect-square cursor-pointer overflow-hidden bg-gray-100 ${
                            selected ? "ring-2 ring-inset ring-brand-500" : ""
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbUrl(photo.id)}
                            alt={photo.filename}
                            className="h-full w-full object-cover"
                          />
                          {/* Clic sur l'image = (dé)sélection directe (voir onClick du
                              conteneur) — cette pastille n'est qu'un indicateur visuel de
                              l'état, plus une case à cocher séparée à viser précisément. */}
                          <span
                            className={`pointer-events-none absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-sm text-white transition-opacity ${
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
                          </span>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-x-0 bottom-0 hidden flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 group-hover:flex"
                          >
                            {sortBy === "sizeDesc" || sortBy === "sizeAsc" ? (
                              <span className="text-[10px] text-white/80">{formatFileSize(photo.sizeBytes)}</span>
                            ) : null}
                            {gallery.collections.length > 0 && (
                              <select
                                value={photo.collectionId || ""}
                                onChange={(e) => movePhoto(photo.id, e.target.value)}
                                className="rounded bg-black/60 px-1 py-0.5 text-xs text-white"
                              >
                                <option value="">{t("gm.noSetOption")}</option>
                                {gallery.collections.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => deletePhoto(photo.id)}
                              className="self-end rounded bg-black/60 px-2 py-0.5 text-xs text-white hover:bg-red-600"
                            >
                              {t("gm.delete")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              </div>
            </main>
          </>
        )}

        {activeTab === "design" && (
          <>
            {/* Options + aperçu live */}
            <main className="flex-1 overflow-y-auto bg-[#EBEBEB] p-6 lg:p-10">
              <div className="mx-auto max-w-6xl">
                {/* Sous-nav Design : Cover / Typography / Color / Grid — horizontale, en haut
                    du panel (plutôt qu'une colonne verticale à gauche). */}
                <div className="mb-8 flex flex-wrap gap-2">
                  {(
                    [
                      { key: "cover", label: t("design.sectionCover") },
                      { key: "typography", label: t("design.sectionTypography") },
                      { key: "color", label: t("design.sectionColor") },
                      { key: "grid", label: t("design.sectionGrid") },
                    ] as { key: DesignSection; label: string }[]
                  ).map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setDesignSection(s.key)}
                      className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                        designSection === s.key
                          ? "bg-neutral-600 text-white"
                          : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[380px_1fr] lg:gap-12">
                  <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                  {designSection === "cover" && (
                    <div className="space-y-6">
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
                            disabled={gallery.photos.length === 0}
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

                  {designSection === "color" && (
                    <div className="grid grid-cols-2 gap-4">
                      {COLOR_PALETTES.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => updateDesign("color", p.key)}
                          className={`rounded-lg border-2 bg-neutral-50 p-4 transition-colors hover:bg-neutral-100 ${
                            design.color === p.key ? "border-brand-500" : "border-neutral-200"
                          }`}
                        >
                          <div className="flex gap-1.5">
                            <span
                              className="h-6 w-6 rounded-full border border-black/10"
                              style={{ backgroundColor: p.bg }}
                            />
                            <span
                              className="h-6 w-6 rounded-full border border-black/10"
                              style={{ backgroundColor: p.text }}
                            />
                            <span
                              className="h-6 w-6 rounded-full border border-black/10"
                              style={{ backgroundColor: p.accent }}
                            />
                          </div>
                          <p className="mt-2 text-left text-xs text-neutral-500">{t(p.labelKey)}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {designSection === "grid" && (
                    <div className="space-y-6">
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
                        ]}
                        value={design.gridSpacing}
                        onChange={(v) => updateDesign("gridSpacing", v as GalleryDesign["gridSpacing"])}
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
                    </div>
                  )}
                  </div>

                  {/* Aperçu live */}
                  <div className="min-w-0 lg:sticky lg:top-6">
                    <DesignLivePreview
                      design={design}
                      title={gallery.title}
                      coverPhotoUrl={activeCoverPhotoId ? thumbUrl(activeCoverPhotoId) : null}
                      photos={gallery.photos.slice(0, 6).map((p) => thumbUrl(p.id))}
                      t={t}
                    />
                  </div>
                </div>
              </div>
            </main>
          </>
        )}

        {activeTab === "settings" && (
          <main className="flex-1 overflow-y-auto bg-white p-6">
            <form onSubmit={saveSettings} className="max-w-xl space-y-6">
              <h2 className="font-serif text-lg font-semibold">{t("gs.title")}</h2>

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
                <label className="mb-1 block text-sm font-medium">{t("galleryForm.clientLabel")}</label>
                <SearchableSelect
                  value={settingsForm.clientId}
                  onChange={(clientId) => setSettingsForm((f) => ({ ...f, clientId }))}
                  placeholder={t("common.noClientOption")}
                  searchPlaceholder={t("common.searchPlaceholder")}
                  emptyOptionLabel={t("common.noClientOption")}
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>

              <div>
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
                {/* Autocomplétion native : suggère les tags déjà utilisés sur les autres
                    galeries du studio (ex: "Mariage", "Portrait") ; taper un nom qui n'existe
                    pas encore le crée simplement au moment de l'enregistrement. */}
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

              <div>
                <p className="mb-1 block text-sm font-medium">{t("gm.setVisibilityLabel")}</p>
                <p className="mb-1.5 text-xs text-gray-500">{t("galleryForm.visibilityHint")}</p>
                {/* PORTFOLIO retiré ici : la visibilité portfolio est désormais gouvernée
                    uniquement par le set "Portfolio" dédié (onglet Photos > Sets), créé
                    automatiquement sur chaque galerie et activable indépendamment — plus
                    cohérent qu'un réglage global qui s'appliquait à toute la galerie. */}
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
                <label className="mb-1 block text-sm font-medium">{t("gs.eventDate")}</label>
                <input
                  type="date"
                  className="input"
                  value={settingsForm.eventDate}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, eventDate: e.target.value }))}
                />
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
                  checked={settingsForm.showWatermark}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, showWatermark: e.target.checked }))}
                />
                <span>
                  <span className="block font-medium">{t("gs.watermark")}</span>
                  <span className="block text-xs text-gray-500">{t("gs.watermarkHint")}</span>
                </span>
              </label>

              {/* Lien UNIQUE à partager avec le client (voir GalleryEntryChooser) : à l'ouverture,
                  le visiteur choisit lui-même "Client" (mot de passe) ou "Invité" (email, soumis
                  à validation) — c'est donc CE lien-ci qu'il faut communiquer par défaut, le lien
                  invité juste en dessous n'étant qu'une alternative directe (saute le choix,
                  utile pour un post-it ou une story Instagram par ex.). Demandé par Adriel le
                  30/07/2026, qui ne le trouvait pas assez visible dans ce panneau (seul le bouton
                  "Partager" tout en haut le proposait jusqu'ici). */}
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

                {/* Interrupteur explicite (05/08/2026, demande d'Adriel) — remplace le texte
                    informatif introduit le 29/07/2026 : l'approbation automatique dérivée de
                    "Visible pour mes invités" sur les sets n'était pas assez lisible pour le
                    studio, qui veut pouvoir activer/désactiver ce comportement directement. */}
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

              <div className="flex items-center gap-3">
                <button type="submit" disabled={settingsSaving} className="btn-primary text-sm">
                  {settingsSaving ? t("common.saving") : t("gs.save")}
                </button>
                {settingsSaved && <span className="text-sm text-green-600">{t("gs.saved")} ✓</span>}
                {settingsError && <span className="text-sm text-red-600">{settingsError}</span>}
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
          {gallery.photos.map((p) => (
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

/** Aperçu "live" (cover + mini grille) qui reflète les réglages de design actuels. */
function DesignLivePreview({
  design,
  title,
  coverPhotoUrl,
  photos,
  t,
}: {
  design: GalleryDesign;
  title: string;
  coverPhotoUrl: string | null;
  photos: string[];
  t: (key: string) => string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const isMobile = device === "mobile";
  const font = getFont(design.font);
  const palette = getPalette(design.color);
  const bg = coverPhotoUrl ? { backgroundImage: `url(${coverPhotoUrl})` } : {};

  const titleEl = (
    <span className={font.className} style={{ fontFamily: font.stack }}>
      {title}
    </span>
  );

  let coverContent: JSX.Element;
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
              {titleEl}
            </div>
            <span
              className="w-fit border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: `${palette.text}55`, color: palette.text }}
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
              {titleEl}
            </div>
            <span
              className="w-fit border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: `${palette.text}55`, color: palette.text }}
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
              {title}
            </span>
            <span
              className="shrink-0 border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: `${palette.text}40`, color: palette.text }}
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
              {titleEl}
            </div>
            <span
              className="mt-1 w-fit border px-2 py-1 text-[8px] uppercase tracking-widest"
              style={{ borderColor: `${palette.text}55`, color: palette.text }}
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
            {title}
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
              {title}
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
            {title}
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
              {title}
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
              {title}
            </span>
          </div>
        </div>
      );
      break;
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
  const gridGapClass = design.gridSpacing === "large" ? "gap-1.5 p-1.5" : "gap-px p-px";

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
          isMobile ? "max-w-[300px]" : "max-w-xl"
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

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
