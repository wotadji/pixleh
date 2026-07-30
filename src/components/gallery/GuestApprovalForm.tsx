"use client";

import { useState } from "react";

interface CollectionOption {
  id: string;
  title: string;
}

/**
 * Formulaire de la page publique /approve-guest/[token] (voir GuestApprovalPage) — pas de
 * connexion requise, le token fait office de secret à usage unique. Le client choisit entre
 * un accès complet ("Tous les sets") ou une sélection précise de sets, ou refuse la demande.
 */
export function GuestApprovalForm({
  token,
  guestEmail,
  galleryTitle,
  collections,
}: {
  token: string;
  guestEmail: string;
  galleryTitle: string;
  collections: CollectionOption[];
}) {
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  function toggleSet(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function approve() {
    setLoading("approve");
    setError(null);
    const res = await fetch("/api/guest-access/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        allSets: mode === "all",
        collectionIds: mode === "selected" ? Array.from(selectedIds) : undefined,
      }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Une erreur est survenue");
      return;
    }
    setDone("approved");
  }

  async function reject() {
    if (!confirm("Refuser définitivement cette demande d'accès ?")) return;
    setLoading("reject");
    setError(null);
    const res = await fetch("/api/guest-access/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Une erreur est survenue");
      return;
    }
    setDone("rejected");
  }

  if (done === "approved") {
    return (
      <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
        Accès accordé à {guestEmail}. Un email vient de lui être envoyé.
      </p>
    );
  }
  if (done === "rejected") {
    return (
      <p className="rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-700">
        La demande d&apos;accès de {guestEmail} a été refusée.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-700">
          <strong>{guestEmail}</strong> souhaite accéder à votre galerie « {galleryTitle} ».
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            checked={mode === "all"}
            onChange={() => setMode("all")}
          />
          Tous les sets de la galerie
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            checked={mode === "selected"}
            onChange={() => setMode("selected")}
            disabled={collections.length === 0}
          />
          Seulement certains sets
        </label>

        {mode === "selected" && (
          <div className="ml-6 mt-2 space-y-1.5 border-l border-gray-200 pl-4">
            {collections.length === 0 ? (
              <p className="text-xs text-gray-500">Cette galerie n&apos;a pas encore de set.</p>
            ) : (
              collections.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSet(c.id)}
                  />
                  {c.title}
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={approve}
          disabled={
            loading !== null || (mode === "selected" && selectedIds.size === 0)
          }
          className="btn-primary text-sm"
        >
          {loading === "approve" ? "Envoi..." : "Approuver"}
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={loading !== null}
          className="btn-secondary text-sm text-red-600"
        >
          {loading === "reject" ? "Envoi..." : "Refuser"}
        </button>
      </div>
    </div>
  );
}
