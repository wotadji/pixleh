"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { formatFileSize } from "@/lib/photoSort";
import { rejectRawFileReason } from "@/lib/rawFileUpload";
import { useSetBreadcrumbExtra } from "@/components/studio/BreadcrumbContext";

interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
}

interface FileItem {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
  folderId?: string | null;
}

interface BrowseResponse {
  folders: FolderItem[];
  files: FileItem[];
  folderId: string | null;
  breadcrumb?: { id: string; name: string }[];
  archivedView?: boolean;
}

type RenameTarget = { type: "file" | "folder"; id: string; currentName: string };
type DeleteTarget = { type: "file" | "folder"; id: string; name: string };

/**
 * Espace "Fichiers" d'une galerie — façon explorateur de fichiers local (18/09/2026, demande
 * d'Adriel : "un espace comme s'il etait dans son ordinateur"). Client component autonome
 * (fetch tout via l'API), monté par la page Server Component dédiée
 * /dashboard/galleries/[id]/files (voir le commentaire de ce fichier).
 *
 * Toujours privé au studio, jamais exposé au client/invité — mêmes routes API que l'ancienne
 * modale (voir GET/POST .../raw-files), étendues pour supporter les dossiers.
 */
export function GalleryFilesExplorer({ galleryId, galleryTitle }: { galleryId: string; galleryTitle: string }) {
  const { t } = useLanguage();
  useSetBreadcrumbExtra(galleryTitle);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [archivedMode, setArchivedMode] = useState(false);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [archiving, setArchiving] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const load = useCallback(
    (folderId: string | null, archived: boolean) => {
      setData(null);
      setLoadError(null);
      const qs = archived ? "?archived=1" : folderId ? `?folderId=${folderId}` : "";
      fetch(`/api/galleries/${galleryId}/raw-files${qs}`)
        .then((r) => r.json())
        .then((d) => setData(d))
        .catch(() => setLoadError(t("gm.filesLoadError")));
    },
    [galleryId, t]
  );

  useEffect(() => {
    load(currentFolderId, archivedMode);
  }, [currentFolderId, archivedMode, load]);

  function navigateTo(folderId: string | null) {
    setArchivedMode(false);
    setCurrentFolderId(folderId);
  }

  function openArchives() {
    setArchivedMode(true);
    setCurrentFolderId(null);
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0 || archivedMode) return;
    setUploading(true);
    setUploadError(null);
    const errors: string[] = [];
    let uploaded = 0;
    for (const file of files) {
      const reason = rejectRawFileReason(file);
      if (reason) {
        errors.push(`${file.name} — ${reason === "tooLarge" ? t("gm.rawTooLarge") : t("gm.rawUnsupportedType")}`);
        continue;
      }
      setUploadProgress(`${uploaded + 1} / ${files.length}`);
      const formData = new FormData();
      formData.append("file", file);
      if (currentFolderId) formData.append("folderId", currentFolderId);
      const res = await fetch(`/api/galleries/${galleryId}/raw-files`, { method: "POST", body: formData });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        errors.push(`${file.name} — ${resData?.error || t("gm.filesUploadError")}`);
        continue;
      }
      uploaded++;
    }
    setUploading(false);
    setUploadProgress(null);
    if (errors.length > 0) setUploadError(errors.join(" — "));
    load(currentFolderId, archivedMode);
  }

  const onDrop = useCallback(
    (accepted: File[]) => uploadFiles(accepted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentFolderId, galleryId]
  );
  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled: archivedMode,
  });

  async function submitCreateFolder() {
    const name = createFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/galleries/${galleryId}/raw-files/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      if (res.ok) {
        setCreateFolderOpen(false);
        setCreateFolderName("");
        load(currentFolderId, archivedMode);
      }
    } finally {
      setCreatingFolder(false);
    }
  }

  function openRename(target: RenameTarget) {
    setRenameTarget(target);
    setRenameValue(target.currentName);
  }

  async function submitRename() {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenaming(true);
    try {
      const url =
        renameTarget.type === "folder"
          ? `/api/galleries/${galleryId}/raw-files/folders/${renameTarget.id}`
          : `/api/galleries/${galleryId}/raw-files/${renameTarget.id}`;
      const body = renameTarget.type === "folder" ? { name } : { filename: name };
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRenameTarget(null);
        load(currentFolderId, archivedMode);
      }
    } finally {
      setRenaming(false);
    }
  }

  async function toggleArchive(folder: FolderItem) {
    setArchiving(folder.id);
    try {
      await fetch(`/api/galleries/${galleryId}/raw-files/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !folder.archived }),
      });
      load(currentFolderId, archivedMode);
    } finally {
      setArchiving(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const url =
        deleteTarget.type === "folder"
          ? `/api/galleries/${galleryId}/raw-files/folders/${deleteTarget.id}`
          : `/api/galleries/${galleryId}/raw-files/${deleteTarget.id}`;
      await fetch(url, { method: "DELETE" });
      setDeleteTarget(null);
      load(currentFolderId, archivedMode);
    } finally {
      setDeleting(false);
    }
  }

  async function moveFileToFolder(fileId: string, folderId: string) {
    await fetch(`/api/galleries/${galleryId}/raw-files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    load(currentFolderId, archivedMode);
  }

  async function moveFolderToFolder(movedFolderId: string, targetFolderId: string) {
    if (movedFolderId === targetFolderId) return;
    await fetch(`/api/galleries/${galleryId}/raw-files/folders/${movedFolderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: targetFolderId }),
    });
    load(currentFolderId, archivedMode);
  }

  const folders = data?.folders || [];
  const files = data?.files || [];
  const breadcrumb = data?.breadcrumb || [];
  const isEmpty = data !== null && folders.length === 0 && files.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/galleries/${galleryId}`} className="text-sm text-gray-400 hover:text-gray-600">
              ← {galleryTitle}
            </Link>
          </div>
          <h1 className="mt-0.5 font-serif text-2xl font-semibold">{t("gm.rawFiles")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("gm.rawFilesHint")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openArchives}
            className={`btn-secondary text-sm ${archivedMode ? "border-brand-400 text-brand-700" : ""}`}
          >
            <IconArchiveBox /> {t("gm.filesArchivesView")}
          </button>
          {!archivedMode && (
            <>
              <button type="button" onClick={() => setCreateFolderOpen(true)} className="btn-secondary text-sm">
                <IconNewFolder /> {t("gm.filesNewFolder")}
              </button>
              <button type="button" onClick={openFileDialog} className="btn-primary text-sm">
                {t("gm.rawFilesChooseFiles")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fil d'Ariane interne (dossiers) */}
      <nav className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
        {archivedMode ? (
          <span className="font-medium text-gray-900">{t("gm.filesArchivesView")}</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigateTo(null)}
              className={`${currentFolderId === null ? "font-medium text-gray-900" : "text-gray-500 hover:text-gray-800"}`}
            >
              {t("gm.filesRoot")}
            </button>
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.id} className="flex items-center gap-1.5">
                <span className="text-gray-300">/</span>
                <button
                  type="button"
                  onClick={() => navigateTo(crumb.id)}
                  className={`${i === breadcrumb.length - 1 ? "font-medium text-gray-900" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </>
        )}
      </nav>

      {uploadError && <p className="mt-3 text-xs text-red-600">{uploadError}</p>}
      {loadError && <p className="mt-3 text-xs text-red-600">{loadError}</p>}

      <div
        {...getRootProps()}
        className={`mt-5 min-h-[40vh] rounded-2xl border-2 border-dashed p-4 transition-colors ${
          isDragActive ? "border-brand-400 bg-brand-50" : "border-transparent"
        }`}
      >
        <input {...getInputProps()} />

        {uploading && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <Spinner size={14} />
            {t("gm.filesUploading")} {uploadProgress}
          </div>
        )}

        {data === null ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={22} />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm text-gray-400">
              {archivedMode ? t("gm.filesArchivesEmpty") : t("gm.rawFilesEmpty")}
            </p>
            {!archivedMode && <p className="text-xs text-gray-300">{t("gm.rawFilesDropHint")}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {folders.map((folder) => (
              <div
                key={folder.id}
                draggable={!archivedMode}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-raw-folder", folder.id);
                }}
                onDragOver={(e) => {
                  if (archivedMode) return;
                  e.preventDefault();
                  setDragOverFolderId(folder.id);
                }}
                onDragLeave={() => setDragOverFolderId((v) => (v === folder.id ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverFolderId(null);
                  const fileId = e.dataTransfer.getData("application/x-raw-file");
                  const draggedFolderId = e.dataTransfer.getData("application/x-raw-folder");
                  if (fileId) moveFileToFolder(fileId, folder.id);
                  else if (draggedFolderId && draggedFolderId !== folder.id) moveFolderToFolder(draggedFolderId, folder.id);
                }}
                className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center ${
                  dragOverFolderId === folder.id ? "border-brand-400 bg-brand-50" : "border-gray-100 hover:bg-gray-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => navigateTo(folder.id)}
                  className="flex flex-col items-center gap-2"
                >
                  <IconFolderLarge />
                  <span className="line-clamp-2 max-w-[10rem] break-words text-xs font-medium text-gray-800">
                    {folder.name}
                  </span>
                </button>
                <div className="absolute right-1.5 top-1.5 hidden gap-0.5 group-hover:flex">
                  <a
                    href={`/api/galleries/${galleryId}/raw-files/folders/${folder.id}/download`}
                    title={t("gm.rawFilesDownload")}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                  >
                    <IconDownloadSmall />
                  </a>
                  <button
                    type="button"
                    title={t("gm.filesRename")}
                    onClick={() => openRename({ type: "folder", id: folder.id, currentName: folder.name })}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                  >
                    <IconRenameSmall />
                  </button>
                  <button
                    type="button"
                    title={folder.archived ? t("gm.filesUnarchive") : t("gm.filesArchive")}
                    onClick={() => toggleArchive(folder)}
                    disabled={archiving === folder.id}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-50"
                  >
                    {archiving === folder.id ? <Spinner size={12} /> : <IconArchiveSmall />}
                  </button>
                  <button
                    type="button"
                    title={t("gm.filesDelete")}
                    onClick={() => setDeleteTarget({ type: "folder", id: folder.id, name: folder.name })}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-red-600"
                  >
                    <IconTrashSmall />
                  </button>
                </div>
              </div>
            ))}

            {files.map((file) => (
              <div
                key={file.id}
                draggable={!archivedMode}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-raw-file", file.id);
                }}
                className="group relative flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-3 text-center hover:bg-gray-50"
              >
                <IconFileLarge />
                <span className="line-clamp-2 max-w-[10rem] break-words text-xs font-medium text-gray-800">
                  {file.filename}
                </span>
                <span className="text-[11px] text-gray-400">{formatFileSize(file.sizeBytes)}</span>
                <div className="absolute right-1.5 top-1.5 hidden gap-0.5 group-hover:flex">
                  <a
                    href={`/api/galleries/${galleryId}/raw-files/${file.id}/file`}
                    title={t("gm.rawFilesDownload")}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                  >
                    <IconDownloadSmall />
                  </a>
                  <button
                    type="button"
                    title={t("gm.filesRename")}
                    onClick={() => openRename({ type: "file", id: file.id, currentName: file.filename })}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                  >
                    <IconRenameSmall />
                  </button>
                  <button
                    type="button"
                    title={t("gm.filesDelete")}
                    onClick={() => setDeleteTarget({ type: "file", id: file.id, name: file.filename })}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-red-600"
                  >
                    <IconTrashSmall />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Créer un dossier */}
      <Modal
        open={createFolderOpen}
        onClose={() => !creatingFolder && setCreateFolderOpen(false)}
        title={t("gm.filesNewFolder")}
        footer={
          <>
            <button onClick={() => setCreateFolderOpen(false)} disabled={creatingFolder} className="btn-secondary text-sm">
              {t("qt.cancel")}
            </button>
            <button onClick={submitCreateFolder} disabled={creatingFolder || !createFolderName.trim()} className="btn-primary text-sm">
              {creatingFolder ? t("common.saving") : t("gm.filesCreate")}
            </button>
          </>
        }
      >
        <input
          autoFocus
          className="input w-full"
          value={createFolderName}
          onChange={(e) => setCreateFolderName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCreateFolder()}
          placeholder={t("gm.filesFolderNamePlaceholder")}
        />
      </Modal>

      {/* Renommer un fichier/dossier */}
      <Modal
        open={!!renameTarget}
        onClose={() => !renaming && setRenameTarget(null)}
        title={t("gm.filesRename")}
        footer={
          <>
            <button onClick={() => setRenameTarget(null)} disabled={renaming} className="btn-secondary text-sm">
              {t("qt.cancel")}
            </button>
            <button onClick={submitRename} disabled={renaming || !renameValue.trim()} className="btn-primary text-sm">
              {renaming ? t("common.saving") : t("gm.filesSave")}
            </button>
          </>
        }
      >
        <input
          autoFocus
          className="input w-full"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitRename()}
        />
      </Modal>

      {/* Confirmation suppression */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("gm.filesDelete")}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary text-sm">
              {t("qt.cancel")}
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {deleting ? t("common.saving") : t("gm.filesDelete")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {deleteTarget?.type === "folder" ? t("gm.filesConfirmDeleteFolder") : t("gm.filesConfirmDeleteFile")}
        </p>
      </Modal>
    </div>
  );
}

function IconFolderLarge() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-brand-400">
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        fill="currentColor"
        fillOpacity="0.12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFileLarge() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-gray-400">
      <path
        d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
        fill="currentColor"
        fillOpacity="0.06"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNewFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="inline -mt-0.5 mr-1">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11v4M10 13h4" strokeLinecap="round" />
    </svg>
  );
}

function IconArchiveBox() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="inline -mt-0.5 mr-1">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a1 1 0 001 1h12a1 1 0 001-1V8M10 13h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDownloadSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v11" strokeLinecap="round" />
      <path d="M7.5 11.5 12 16l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  );
}

function IconRenameSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M15.5 4.5 19.5 8.5 8 20H4v-4L15.5 4.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArchiveSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a1 1 0 001 1h12a1 1 0 001-1V8M10 13h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrashSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
