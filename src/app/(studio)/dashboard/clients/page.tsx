"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";
import { RichTextEditor } from "@/components/studio/RichTextEditor";
import { IconWarning } from "@/components/studio/OverviewIcons";
import { Modal } from "@/components/ui/Modal";

interface AttachmentDTO {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
}

interface MessageDTO {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  createdAt: string;
  attachments: AttachmentDTO[];
  emailFailed: boolean;
}

interface ClientDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: "PROSPECT" | "CLIENT";
  unreadMessage: boolean;
  createdAt: string;
  /** Un seul élément (le plus récent) — voir GET /api/clients, sert d'aperçu dans la liste. */
  messages: MessageDTO[];
}

type Filter = "all" | "prospect" | "client";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** contentEditable laisse souvent un "<br>" résiduel une fois tout le texte effacé — pas un
 * vrai contenu, mais {value.trim() !== ""} le laisserait passer comme non-vide à tort. */
function isHtmlEmpty(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

/**
 * Réponse à la question d'Adriel : un message de contact ne fait PAS automatiquement de son
 * auteur un client — il arrive au statut PROSPECT (badge ambre), et le studio le fait passer
 * manuellement à CLIENT (badge émeraude, bouton "Valider en client") une fois la conversation
 * engagée. Filtres + recherche (nom/email/téléphone) permettent de retrouver quelqu'un vite.
 *
 * Mise en page à deux colonnes façon Messenger/LinkedIn : liste des conversations à gauche
 * (avatar, aperçu du dernier message, indicateur non-lu), fil + en-tête + zone de réponse à
 * droite. Composeur en texte enrichi (RichTextEditor, réutilisé depuis Réglages > À propos)
 * avec pièce jointe optionnelle (10 Mo max, une par message) — le fichier est envoyé en pièce
 * jointe du VRAI email au client, pas juste stocké côté panel. Toujours pas de module de
 * messagerie séparé : cette page reste la seule source de vérité pour un client.
 */
export default function ClientsPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, MessageDTO[]>>({});
  const [threadLoading, setThreadLoading] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});
  const [emailWarning, setEmailWarning] = useState<Record<string, string | null>>({});
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, File | null>>({});
  const [attachmentError, setAttachmentError] = useState<Record<string, string | null>>({});
  // Incrémenté à chaque envoi pour forcer un remontage du RichTextEditor (contentEditable,
  // qui ne se resynchronise pas tout seul quand `value` repasse à "" — voir RichTextEditor.tsx).
  const [composerVersion, setComposerVersion] = useState<Record<string, number>>({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "" });
  const [addLoading, setAddLoading] = useState(false);

  // Édition des coordonnées d'un client existant (bouton "Modifier" dans l'en-tête de la
  // conversation) — demande d'Adriel le 05/08/2026. Formulaire distinct de "Nouveau client"
  // ci-dessus, avec en plus le champ Notes (historique pré-migration, en lecture/écriture ici).
  const [editingClient, setEditingClient] = useState<ClientDTO | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Sentinelle en bas du fil de discussion (voir le JSX plus bas) — scrollée en vue à chaque
  // changement de conversation ou de nouveau message, pour toujours ouvrir/rester sur les
  // derniers échanges plutôt que sur le début de l'historique (comme une vraie messagerie).
  const threadEndRef = useRef<HTMLDivElement>(null);

  const previewDateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  const bubbleDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    [locale]
  );

  useEffect(() => {
    if (!selectedId) return;
    threadEndRef.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, threads[selectedId ?? ""]?.length]);

  function load() {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []))
      .finally(() => setPageLoading(false));
  }

  useEffect(load, []);

  if (pageLoading) return <PageSpinner />;

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setAddForm({ name: "", email: "", phone: "" });
    setAddLoading(false);
    setShowAddForm(false);
    load();
  }

  function openEditModal(c: ClientDTO) {
    setEditingClient(c);
    setEditForm({ name: c.name, email: c.email, phone: c.phone || "", notes: c.notes || "" });
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingClient) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone || null,
          notes: editForm.notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(res.status === 409 ? t("clients.editModal.emailConflict") : t("clients.sendFailedError"));
        return;
      }
      setClients((prev) => prev.map((x) => (x.id === editingClient.id ? { ...x, ...data.client } : x)));
      setEditingClient(null);
    } finally {
      setEditLoading(false);
    }
  }

  async function selectClient(c: ClientDTO) {
    setSelectedId(c.id);

    if (c.unreadMessage) {
      setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, unreadMessage: false } : x)));
      await fetch(`/api/clients/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unreadMessage: false }),
      });
      // La bulle de notification sur "Clients" (sidebar) est calculée côté serveur dans
      // dashboard/layout.tsx — sans ce refresh, le compteur ne bougeait qu'après un
      // rechargement complet de la page (bug remonté par Adriel). router.refresh() invalide
      // le cache du Server Component partagé (le layout) sans perdre l'état de cette page.
      router.refresh();
    }

    if (!threads[c.id]) {
      setThreadLoading((prev) => ({ ...prev, [c.id]: true }));
      try {
        const res = await fetch(`/api/clients/${c.id}`);
        const data = await res.json().catch(() => ({}));
        setThreads((prev) => ({ ...prev, [c.id]: data.client?.messages || [] }));
      } finally {
        setThreadLoading((prev) => ({ ...prev, [c.id]: false }));
      }
    }
  }

  async function validateProspect(c: ClientDTO) {
    setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "CLIENT" } : x)));
    await fetch(`/api/clients/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLIENT" }),
    });
  }

  function pickAttachment(clientId: string) {
    fileInputRef.current?.setAttribute("data-client-id", clientId);
    fileInputRef.current?.click();
  }

  function onAttachmentSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const clientId = e.target.getAttribute("data-client-id");
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de resélectionner le même fichier plus tard
    if (!clientId || !file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError((prev) => ({ ...prev, [clientId]: t("clients.attachment.tooLarge") }));
      return;
    }
    setAttachmentError((prev) => ({ ...prev, [clientId]: null }));
    setPendingAttachments((prev) => ({ ...prev, [clientId]: file }));
  }

  async function sendReply(c: ClientDTO) {
    const html = replyDrafts[c.id] || "";
    const file = pendingAttachments[c.id] || null;
    const empty = isHtmlEmpty(html);
    if (empty && !file) return;

    setReplySending((prev) => ({ ...prev, [c.id]: true }));
    setEmailWarning((prev) => ({ ...prev, [c.id]: null }));
    try {
      const formData = new FormData();
      formData.append("body", empty ? "" : html);
      if (file) formData.append("file", file);

      const res = await fetch(`/api/clients/${c.id}/messages`, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.message) {
        setThreads((prev) => ({ ...prev, [c.id]: [...(prev[c.id] || []), data.message] }));
        setReplyDrafts((prev) => ({ ...prev, [c.id]: "" }));
        setPendingAttachments((prev) => ({ ...prev, [c.id]: null }));
        setComposerVersion((prev) => ({ ...prev, [c.id]: (prev[c.id] || 0) + 1 }));
        // Met à jour l'aperçu dans la liste de gauche sans re-fetch complet.
        setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, messages: [data.message] } : x)));
        // sendMail() (voir src/lib/mailer.ts) renvoie maintenant explicitement si l'email est
        // réellement parti, avec le message d'erreur SMTP brut — sans ça, un échec silencieux
        // donnait l'impression que la réponse était bien envoyée (bug remonté par Adriel).
        if (!data.emailSent) {
          setEmailWarning((prev) => ({ ...prev, [c.id]: data.emailError || t("clients.emailFailedWarning") }));
        }
      } else {
        // Avant : une réponse non-2xx (ex: 500 serveur) était ignorée en silence — le brouillon
        // restait affiché et rien ne prévenait Adriel que l'envoi avait échoué ("je clique sur
        // envoyer, rien ne se passe"). On affiche maintenant le message d'erreur renvoyé par
        // l'API (voir handleApiError côté serveur) dans le même bandeau que les échecs d'email.
        setEmailWarning((prev) => ({ ...prev, [c.id]: data.error || t("clients.sendFailedError") }));
      }
    } finally {
      setReplySending((prev) => ({ ...prev, [c.id]: false }));
    }
  }

  // Ctrl/Cmd+Entrée pour envoyer (pas Entrée seule, qui doit rester disponible pour les
  // retours à la ligne et les listes dans un composeur en texte enrichi).
  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLDivElement>, c: ClientDTO) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendReply(c);
    }
  }

  const q = search.trim().toLowerCase();
  const sortedClients = [...clients]
    .filter((c) => {
      if (filter === "prospect" && c.status !== "PROSPECT") return false;
      if (filter === "client" && c.status !== "CLIENT") return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    })
    // Conversation la plus récemment active en premier, comme dans une vraie messagerie —
    // pas juste l'ordre de création du client.
    .sort((a, b) => {
      const at = new Date(a.messages[0]?.createdAt || a.createdAt).getTime();
      const bt = new Date(b.messages[0]?.createdAt || b.createdAt).getTime();
      return bt - at;
    });

  const selected = clients.find((c) => c.id === selectedId) || null;

  return (
    // -mb-8 : annule le padding-bottom de "main" (voir dashboard/layout.tsx, p-8 partagé par
    // toutes les pages du panel) pour que la zone messagerie vienne quasiment toucher le pied
    // de page au lieu de laisser sa marge habituelle — demande explicite d'Adriel, propre à
    // cette page ; les autres pages gardent le padding normal puisqu'elles ne touchent pas à
    // cette marge négative.
    <div className="-mb-8">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onAttachmentSelected} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold">{t("clients.title")}</h1>
        <button type="button" onClick={() => setShowAddForm((v) => !v)} className="btn-secondary text-sm">
          {showAddForm ? t("billing.confirmDowngrade.cancel") : t("common.add")}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("clients.nameLabel")}</label>
            <input
              required
              className="input"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("clients.emailLabel")}</label>
            <input
              required
              type="email"
              className="input"
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("clients.phoneLabel")}</label>
            <input
              className="input"
              value={addForm.phone}
              onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
            />
          </div>
          <button type="submit" disabled={addLoading} className="btn-primary">
            {t("common.add")}
          </button>
        </form>
      )}

      {/* Hauteur FIXE (pas flex-1) : demande explicite d'Adriel — un flex-1 qui varie avec
          l'écran donnait un comportement imprévisible et pouvait, combiné aux bandeaux
          au-dessus (quota, vérification email...), faire dépasser la fenêtre visible et
          déclencher un scroll de la PAGE entière en plus du scroll interne du fil de
          discussion. Une valeur fixe généreuse (mais raisonnable) évite ce double scroll :
          seuls la liste de conversations et le fil défilent, jamais la page. */}
      <div className="mt-4 flex h-[620px] overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* Colonne gauche : liste des conversations. Sur mobile, façon WhatsApp (demande
            d'Adriel, 12/08/2026) : liste seule tant qu'aucune conversation n'est choisie,
            masquée dès qu'on en sélectionne une (le fil prend alors tout l'écran) — avant,
            les deux colonnes se battaient pour la largeur et le fil débordait hors champ. À
            partir de md, comportement desktop inchangé : les deux colonnes toujours visibles
            côte à côte. */}
        <div
          className={`w-full shrink-0 flex-col border-r border-gray-100 md:flex md:max-w-xs ${
            selected ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="space-y-2 border-b border-gray-100 p-3">
            <input
              type="search"
              placeholder={t("clients.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full text-sm"
            />
            <div className="flex gap-1.5">
              {(["all", "prospect", "client"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    filter === f
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {f === "prospect" ? t("clients.filterProspect") : f === "client" ? t("clients.filterClient") : t("clients.filterAll")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sortedClients.length === 0 && <p className="p-6 text-center text-sm text-gray-400">{t("clients.empty")}</p>}
            {sortedClients.map((c) => {
              const lastMessage = c.messages[0];
              const preview = lastMessage ? (isHtmlEmpty(lastMessage.body) ? t("clients.attachment.label") : lastMessage.body.replace(/<[^>]*>/g, " ").trim()) : c.notes || c.email;
              const isSelected = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectClient(c)}
                  className={`flex w-full items-start gap-3 border-b border-gray-50 p-3 text-left transition-colors ${
                    isSelected ? "bg-brand-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      c.status === "PROSPECT" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm ${c.unreadMessage ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                        {c.name}
                      </p>
                      {lastMessage && (
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {previewDateFormatter.format(new Date(lastMessage.createdAt))}
                        </span>
                      )}
                    </div>
                    <p className={`truncate text-xs ${c.unreadMessage ? "text-gray-700" : "text-gray-400"}`}>{preview}</p>
                  </div>
                  {c.unreadMessage && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Colonne droite : fil de la conversation sélectionnée. Cachée sur mobile tant que
            rien n'est sélectionné (voir commentaire ci-dessus), toujours visible à partir de
            md. */}
        <div className={`flex-1 flex-col bg-gray-50 md:flex ${selected ? "flex" : "hidden md:flex"}`}>
          {!selected ? (
            <div className="hidden flex-1 items-center justify-center text-sm text-gray-400 md:flex">
              {t("clients.selectConversation")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-white p-4">
                <div className="flex min-w-0 items-center gap-1">
                  {/* Bouton retour façon WhatsApp — mobile uniquement, revient à la liste au
                      lieu de désélectionner sans rien afficher (il n'y a alors plus de colonne
                      liste visible en dessous de md). */}
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label={t("clients.backToList")}
                    title={t("clients.backToList")}
                    className="-ml-1.5 mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 md:hidden"
                  >
                    <IconArrowLeftClients />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{selected.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {selected.email}
                      {selected.phone ? ` · ${selected.phone}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      selected.status === "PROSPECT" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {selected.status === "PROSPECT" ? t("clients.status.prospect") : t("clients.status.client")}
                  </span>
                  {selected.status === "PROSPECT" && (
                    <button type="button" onClick={() => validateProspect(selected)} className="btn-primary text-xs">
                      {t("clients.validate")}
                    </button>
                  )}
                  <button type="button" onClick={() => openEditModal(selected)} className="btn-secondary text-xs">
                    {t("clients.edit")}
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {/* Historique pré-migration (ancien blob texte, plus alimenté) — affiché en
                    lecture seule au-dessus du fil structuré s'il en reste. */}
                {selected.notes && (
                  <div className="mb-2 rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("clients.legacyNotes")}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{selected.notes}</p>
                  </div>
                )}

                {threadLoading[selected.id] && !threads[selected.id] && <p className="text-sm text-gray-400">{t("gm.loading")}</p>}

                {threads[selected.id]?.length === 0 && <p className="text-sm text-gray-400">{t("clients.thread.empty")}</p>}

                {threads[selected.id]?.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        m.direction === "OUTBOUND" ? "bg-brand-600 text-white" : "border border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      {/* OUTBOUND = HTML saisi via RichTextEditor par le studio (contenu
                          auteur, rendu direct). INBOUND = texte brut d'un visiteur anonyme du
                          formulaire de contact — JAMAIS rendu comme HTML (risque XSS stocké),
                          affiché en texte échappé par React comme avant. */}
                      {!isHtmlEmpty(m.body) &&
                        (m.direction === "OUTBOUND" ? (
                          <div
                            className="[&_a]:underline [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc"
                            dangerouslySetInnerHTML={{ __html: m.body }}
                          />
                        ) : (
                          <p className="whitespace-pre-line">{m.body}</p>
                        ))}

                      {m.attachments?.map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`mt-1.5 flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                            m.direction === "OUTBOUND"
                              ? "border-white/30 text-white hover:bg-white/10"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          📎 <span className="truncate">{a.name}</span>
                          <span className={m.direction === "OUTBOUND" ? "text-brand-100" : "text-gray-400"}>
                            ({formatFileSize(a.size)})
                          </span>
                        </a>
                      ))}

                      <p
                        className={`mt-1 flex items-center gap-1 text-[11px] ${
                          m.direction === "OUTBOUND" ? "text-brand-100" : "text-gray-400"
                        }`}
                      >
                        {bubbleDateFormatter.format(new Date(m.createdAt))}
                        {m.emailFailed && (
                          <span title={t("clients.emailFailedWarning")}>
                            <IconWarning className="h-3 w-3 text-red-200" />
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                {/* Sentinelle invisible : cible du scroll automatique vers le bas (voir
                    l'useEffect plus haut) — plus fiable qu'un calcul manuel de scrollTop,
                    fonctionne même si la hauteur des bulles change (pièce jointe, texte
                    multi-lignes, etc.). */}
                <div ref={threadEndRef} />
              </div>

              {/* Répondre envoie un vrai email à selected.email (celle du formulaire de
                  contact), pas juste une note interne — voir POST /api/clients/[id]/messages.
                  Ctrl/Cmd+Entrée = envoyer (Entrée seule reste un retour à la ligne, texte
                  enrichi oblige). */}
              <div className="border-t border-gray-100 bg-white p-3">
                {emailWarning[selected.id] && (
                  <p className="mb-2 text-xs font-medium text-red-600">{emailWarning[selected.id]}</p>
                )}
                {attachmentError[selected.id] && (
                  <p className="mb-2 text-xs font-medium text-red-600">{attachmentError[selected.id]}</p>
                )}
                {pendingAttachments[selected.id] && (
                  <div className="mb-2 flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                    📎 <span className="truncate">{pendingAttachments[selected.id]!.name}</span>
                    <span className="text-gray-400">({formatFileSize(pendingAttachments[selected.id]!.size)})</span>
                    <button
                      type="button"
                      onClick={() => setPendingAttachments((prev) => ({ ...prev, [selected.id]: null }))}
                      className="ml-auto text-gray-400 hover:text-gray-700"
                      title={t("clients.attachment.remove")}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => pickAttachment(selected.id)}
                    title={t("clients.attachment.add")}
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"
                  >
                    📎
                  </button>
                  <div className="flex-1">
                    <RichTextEditor
                      key={`${selected.id}:${composerVersion[selected.id] || 0}`}
                      value={replyDrafts[selected.id] || ""}
                      onChange={(html) => setReplyDrafts((prev) => ({ ...prev, [selected.id]: html }))}
                      onKeyDown={(e) => handleComposerKeyDown(e, selected)}
                      placeholder={t("clients.reply.placeholder")}
                      minHeightClassName="min-h-[120px]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      replySending[selected.id] ||
                      (isHtmlEmpty(replyDrafts[selected.id] || "") && !pendingAttachments[selected.id])
                    }
                    onClick={() => sendReply(selected)}
                    className="btn-primary mb-0.5 shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {replySending[selected.id] ? t("clients.reply.sending") : t("clients.reply.send")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={!!editingClient}
        onClose={() => setEditingClient(null)}
        title={t("clients.editModal.title")}
        footer={
          <>
            <button type="button" onClick={() => setEditingClient(null)} className="btn-secondary text-sm">
              {t("billing.confirmDowngrade.cancel")}
            </button>
            <button type="submit" form="edit-client-form" disabled={editLoading} className="btn-primary text-sm">
              {editLoading ? t("clients.reply.sending") : t("common.save")}
            </button>
          </>
        }
      >
        <form id="edit-client-form" onSubmit={handleEditSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("clients.nameLabel")}</label>
            <input
              required
              className="input w-full"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("clients.emailLabel")}</label>
            <input
              required
              type="email"
              className="input w-full"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("clients.phoneLabel")}</label>
            <input
              className="input w-full"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("clients.notesLabel")}</label>
            <textarea
              className="input w-full"
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </div>
          {editError && <p className="text-xs font-medium text-red-600">{editError}</p>}
        </form>
      </Modal>
    </div>
  );
}

function IconArrowLeftClients() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
