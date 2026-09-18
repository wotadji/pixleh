"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { formatFileSize } from "@/lib/photoSort";
import { rejectRawFileReason } from "@/lib/rawFileUpload";

interface TransferListItem {
  id: string;
  slug: string;
  title: string | null;
  message: string | null;
  recipientEmail: string | null;
  status: "ACTIVE" | "FROZEN";
  createdAt: string;
  expiresAt: string;
  fileCount: number;
  totalBytes: number;
}

interface TransferFile {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

/**
 * Transfert rapide façon WeTransfer (18/09/2026, demande d'Adriel : "dans le sidebar ajouter
 * la fonctionnalité transfert rapide permettant de transferer des traveaux sans toute fois
 * creer une galerie") — voir modèle QuickTransfer. Cette passe construit uniquement le
 * mécanisme de gel/statut (14 jours puis blocage du téléchargement, fichiers conservés) ;
 * le paiement de récupération après gel est reporté (choix d'Adriel, voir tâche #557).
 */
export default function QuickTransfersPage() {
  const { t } = useLanguage();
  const [transfers, setTransfers] = useState<TransferListItem[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createRecipientEmail, setCreateRecipientEmail] = useState("");
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createProgress, setCreateProgress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TransferListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Panneau "gérer les fichiers" d'un transfert existant — réutilise la même modale que la
  // création (ajout de fichiers après coup, suppression individuelle).
  const [manageTransfer, setManageTransfer] = useState<TransferListItem | null>(null);
  const [manageFiles, setManageFiles] = useState<TransferFile[] | null>(null);
  const [manageUploading, setManageUploading] = useState(false);
  const [manageProgress, setManageProgress] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageDeleting, setManageDeleting] = useState<string | null>(null);

  const loadTransfers = useCallback(() => {
    fetch("/api/quick-transfers")
      .then((r) => r.json())
      .then((d) => setTransfers(d.transfers || []));
  }, []);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const onCreateDrop = useCallback((accepted: File[]) => {
    setCreateFiles((prev) => [...prev, ...accepted]);
  }, []);
  const { getRootProps: getCreateRootProps, getInputProps: getCreateInputProps, isDragActive: isCreateDragActive } =
    useDropzone({ onDrop: onCreateDrop, noClick: true, noKeyboard: true });

  function openCreateModal() {
    setCreateTitle("");
    setCreateMessage("");
    setCreateRecipientEmail("");
    setCreateFiles([]);
    setCreateError(null);
    setCreateOpen(true);
  }

  async function submitCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/quick-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: createTitle, message: createMessage, recipientEmail: createRecipientEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || t("qt.createError"));
      const transferId = data.transfer.id as string;

      const errors: string[] = [];
      let uploaded = 0;
      for (const file of createFiles) {
        const reason = rejectRawFileReason(file);
        if (reason) {
          errors.push(`${file.name} — ${reason === "tooLarge" ? t("qt.rawTooLarge") : t("qt.rawUnsupportedType")}`);
          continue;
        }
        setCreateProgress(`${uploaded + 1} / ${createFiles.length}`);
        const formData = new FormData();
        formData.append("file", file);
        const fr = await fetch(`/api/quick-transfers/${transferId}/files`, { method: "POST", body: formData });
        if (!fr.ok) {
          const fd = await fr.json().catch(() => ({}));
          errors.push(`${file.name} — ${fd?.error || t("qt.createError")}`);
          continue;
        }
        uploaded++;
      }
      setCreateProgress(null);
      setCreateOpen(false);
      loadTransfers();
      if (errors.length > 0) setCreateError(errors.join(" — "));
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t("qt.createError"));
    } finally {
      setCreating(false);
      setCreateProgress(null);
    }
  }

  function publicUrl(slug: string) {
    if (typeof window === "undefined") return `/t/${slug}`;
    return `${window.location.origin}/t/${slug}`;
  }

  async function copyLink(transfer: TransferListItem) {
    const url = publicUrl(transfer.slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(transfer.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt(t("gm.copyLinkFallback"), url);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await fetch(`/api/quick-transfers/${deleteConfirm.id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      loadTransfers();
    } finally {
      setDeleting(false);
    }
  }

  function openManage(transfer: TransferListItem) {
    setManageTransfer(transfer);
    setManageFiles(null);
    setManageError(null);
    fetch(`/api/quick-transfers/${transfer.id}`)
      .then((r) => r.json())
      .then((d) => setManageFiles(d.files || []));
  }

  const onManageDrop = useCallback(
    async (accepted: File[]) => {
      if (!manageTransfer || accepted.length === 0) return;
      setManageUploading(true);
      setManageError(null);
      const errors: string[] = [];
      let uploaded = 0;
      for (const file of accepted) {
        const reason = rejectRawFileReason(file);
        if (reason) {
          errors.push(`${file.name} — ${reason === "tooLarge" ? t("qt.rawTooLarge") : t("qt.rawUnsupportedType")}`);
          continue;
        }
        setManageProgress(`${uploaded + 1} / ${accepted.length}`);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/quick-transfers/${manageTransfer.id}/files`, { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors.push(`${file.name} — ${data?.error || t("qt.createError")}`);
          continue;
        }
        uploaded++;
        setManageFiles((prev) => [data.file, ...(prev || [])]);
      }
      setManageUploading(false);
      setManageProgress(null);
      if (errors.length > 0) setManageError(errors.join(" — "));
      loadTransfers();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manageTransfer]
  );
  const { getRootProps: getManageRootProps, getInputProps: getManageInputProps, isDragActive: isManageDragActive } =
    useDropzone({ onDrop: onManageDrop, noClick: true, noKeyboard: true });

  async function deleteManageFile(fileId: string) {
    if (!manageTransfer) return;
    setManageDeleting(fileId);
    try {
      await fetch(`/api/quick-transfers/${manageTransfer.id}/files/${fileId}`, { method: "DELETE" });
      setManageFiles((prev) => (prev || []).filter((f) => f.id !== fileId));
      loadTransfers();
    } finally {
      setManageDeleting(null);
    }
  }

  if (!transfers) return <PageSpinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{t("qt.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("qt.subtitle")}</p>
        </div>
        <button type="button" onClick={openCreateModal} className="btn-primary text-sm">
          {t("qt.newButton")}
        </button>
      </div>

      {transfers.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          {t("qt.empty")}
        </p>
      ) : (
        <div className="mt-6 space-y-2.5">
          {transfers.map((tr) => (
            <div key={tr.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-gray-900">{tr.title || t("qt.untitled")}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      tr.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {tr.status === "ACTIVE"
                      ? t("qt.statusActive").replace("{days}", String(daysLeft(tr.expiresAt)))
                      : t("qt.statusFrozen")}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {tr.fileCount} {t("qt.filesLabel")} · {formatFileSize(tr.totalBytes)}
                  {tr.recipientEmail ? ` · ${tr.recipientEmail}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => openManage(tr)} className="btn-secondary text-xs">
                  {t("qt.manageFiles")}
                </button>
                <button type="button" onClick={() => copyLink(tr)} className="btn-secondary text-xs">
                  {copiedId === tr.id ? t("gm.linkCopied") : t("qt.copyLink")}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(tr)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title={t("qt.delete")}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Création d'un nouveau transfert */}
      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title={t("qt.createModalTitle")}
        widthClassName="max-w-lg"
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} disabled={creating} className="btn-secondary text-sm">
              {t("qt.cancel")}
            </button>
            <button onClick={submitCreate} disabled={creating} className="btn-primary text-sm">
              {creating ? t("common.saving") : t("qt.createSubmit")}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("qt.fieldTitle")}</label>
            <input
              className="input w-full"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder={t("qt.fieldTitlePlaceholder")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("qt.fieldMessage")}</label>
            <textarea
              className="input w-full"
              rows={2}
              value={createMessage}
              onChange={(e) => setCreateMessage(e.target.value)}
              placeholder={t("qt.fieldMessagePlaceholder")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("qt.fieldRecipientEmail")}</label>
            <input
              type="email"
              className="input w-full"
              value={createRecipientEmail}
              onChange={(e) => setCreateRecipientEmail(e.target.value)}
              placeholder={t("qt.fieldRecipientEmailPlaceholder")}
            />
          </div>

          <div
            {...getCreateRootProps()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center ${
              isCreateDragActive ? "border-brand-400 bg-brand-50" : "border-gray-200"
            }`}
          >
            <input {...getCreateInputProps()} />
            <p className="text-sm text-gray-600">{t("qt.dropHint")}</p>
          </div>
          {createFiles.length > 0 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-gray-500">
              {createFiles.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0">{formatFileSize(f.size)}</span>
                </li>
              ))}
            </ul>
          )}
          {creating && createProgress && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Spinner size={14} />
              {createProgress}
            </div>
          )}
          {createError && <p className="text-xs text-red-600">{createError}</p>}
        </div>
      </Modal>

      {/* Confirmation suppression */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={t("qt.delete")}
        footer={
          <>
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-sm">
              {t("qt.cancel")}
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {deleting ? t("common.saving") : t("qt.delete")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t("qt.confirmDelete")}</p>
      </Modal>

      {/* Gestion des fichiers d'un transfert existant */}
      <Modal open={!!manageTransfer} onClose={() => setManageTransfer(null)} title={t("qt.manageFiles")} widthClassName="max-w-lg">
        {manageTransfer?.status === "FROZEN" && <p className="mb-3 text-xs text-amber-600">{t("qt.frozenNotice")}</p>}

        {manageTransfer?.status !== "FROZEN" && (
          <div
            {...getManageRootProps()}
            className={`mb-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center ${
              isManageDragActive ? "border-brand-400 bg-brand-50" : "border-gray-200"
            }`}
          >
            <input {...getManageInputProps()} />
            <p className="text-sm text-gray-600">{t("qt.dropHint")}</p>
          </div>
        )}
        {manageUploading && manageProgress && (
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
            <Spinner size={14} />
            {manageProgress}
          </div>
        )}
        {manageError && <p className="mb-3 text-xs text-red-600">{manageError}</p>}

        {manageFiles === null ? (
          <div className="flex items-center justify-center py-6">
            <Spinner size={20} />
          </div>
        ) : manageFiles.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">{t("qt.noFiles")}</p>
        ) : (
          <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto">
            {manageFiles.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-800">{f.filename}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(f.sizeBytes)}</p>
                </div>
                <button
                  onClick={() => deleteManageFile(f.id)}
                  disabled={manageDeleting === f.id}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {manageDeleting === f.id ? <Spinner size={14} /> : <IconTrash />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
