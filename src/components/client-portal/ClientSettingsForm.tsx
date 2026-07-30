"use client";

import { useState } from "react";

/**
 * Formulaire Paramètres (/client/settings) : nom (libre) + changement de mot de passe
 * (ancien + nouveau, l'ancien n'est demandé que si un mot de passe existe déjà — voir
 * PATCH /api/client-portal/account). L'email est affiché en lecture seule juste au-dessus,
 * rendu directement par la page serveur (pas dans ce composant).
 */
export function ClientSettingsForm({
  initialName,
  hasPassword,
}: {
  initialName: string | null;
  hasPassword: boolean;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pwError, setPwError] = useState<string | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameStatus("saving");
    try {
      const res = await fetch("/api/client-portal/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setNameStatus(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setNameStatus("idle"), 2000);
    } catch {
      setNameStatus("error");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwStatus("saving");
    setPwError(null);
    try {
      const res = await fetch("/api/client-portal/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwStatus("error");
        setPwError(data?.error || "Échec du changement de mot de passe.");
        return;
      }
      setPwStatus("saved");
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setPwStatus("idle"), 2500);
    } catch {
      setPwStatus("error");
      setPwError("Échec du changement de mot de passe.");
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={saveName} className="rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium">Nom</label>
        <p className="mt-0.5 text-xs text-gray-500">Affiché dans votre espace client.</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            className="input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Votre nom"
          />
          <button type="submit" disabled={nameStatus === "saving"} className="btn-secondary shrink-0 text-sm disabled:opacity-50">
            {nameStatus === "saving" ? "Enregistrement..." : nameStatus === "saved" ? "Enregistré ✓" : "Enregistrer"}
          </button>
        </div>
        {nameStatus === "error" && <p className="mt-2 text-xs text-red-600">Échec de l&apos;enregistrement.</p>}
      </form>

      <form onSubmit={changePassword} className="rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium">Mot de passe</label>
        <p className="mt-0.5 text-xs text-gray-500">
          {hasPassword
            ? "Changez le mot de passe de votre espace client."
            : "Créez un mot de passe pour votre espace client."}
        </p>
        <div className="mt-3 space-y-2">
          {hasPassword && (
            <input
              type="password"
              className="input w-full"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Mot de passe actuel"
            />
          )}
          <input
            type="password"
            className="input w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nouveau mot de passe (8 caractères minimum)"
          />
        </div>
        <button
          type="submit"
          disabled={pwStatus === "saving" || newPassword.length === 0}
          className="btn-secondary mt-3 text-sm disabled:opacity-50"
        >
          {pwStatus === "saving" ? "Enregistrement..." : pwStatus === "saved" ? "Mot de passe changé ✓" : "Changer le mot de passe"}
        </button>
        {pwStatus === "error" && pwError && <p className="mt-2 text-xs text-red-600">{pwError}</p>}
      </form>
    </div>
  );
}
