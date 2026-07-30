"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * Formulaire Paramètres (/client/settings) : nom (libre) + changement de mot de passe
 * (ancien + nouveau + confirmation, l'ancien n'est demandé que si un mot de passe existe déjà
 * — voir PATCH /api/client-portal/account). Le champ de confirmation (ajouté le 30/07/2026 à
 * la demande d'Adriel) n'est vérifié que côté client : l'API elle-même ne connaît qu'un seul
 * `newPassword`, la confirmation sert uniquement à éviter une faute de frappe silencieuse.
 * L'email est affiché en lecture seule juste au-dessus, rendu directement par la page serveur
 * (pas dans ce composant).
 */
export function ClientSettingsForm({
  initialName,
  hasPassword,
}: {
  initialName: string | null;
  hasPassword: boolean;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initialName ?? "");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    setPwError(null);

    if (newPassword !== confirmPassword) {
      setPwStatus("error");
      setPwError(t("client.settings.password.mismatch"));
      return;
    }

    setPwStatus("saving");
    try {
      const res = await fetch("/api/client-portal/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwStatus("error");
        setPwError(data?.error || t("client.settings.password.genericError"));
        return;
      }
      setPwStatus("saved");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwStatus("idle"), 2500);
    } catch {
      setPwStatus("error");
      setPwError(t("client.settings.password.genericError"));
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={saveName} className="rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium">{t("client.settings.name.label")}</label>
        <p className="mt-0.5 text-xs text-gray-500">{t("client.settings.name.hint")}</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            className="input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("client.settings.name.placeholder")}
          />
          <button type="submit" disabled={nameStatus === "saving"} className="btn-secondary shrink-0 text-sm disabled:opacity-50">
            {nameStatus === "saving"
              ? t("client.settings.name.saving")
              : nameStatus === "saved"
                ? t("client.settings.name.saved")
                : t("client.settings.name.save")}
          </button>
        </div>
        {nameStatus === "error" && <p className="mt-2 text-xs text-red-600">{t("client.settings.name.error")}</p>}
      </form>

      <form onSubmit={changePassword} className="rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium">{t("client.settings.password.label")}</label>
        <p className="mt-0.5 text-xs text-gray-500">
          {hasPassword ? t("client.settings.password.hintChange") : t("client.settings.password.hintCreate")}
        </p>
        <div className="mt-3 space-y-2">
          {hasPassword && (
            <input
              type="password"
              className="input w-full"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t("client.settings.password.current")}
            />
          )}
          <input
            type="password"
            className="input w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("client.settings.password.new")}
          />
          <input
            type="password"
            className="input w-full"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("client.settings.password.confirm")}
          />
        </div>
        <button
          type="submit"
          disabled={pwStatus === "saving" || newPassword.length === 0}
          className="btn-secondary mt-3 text-sm disabled:opacity-50"
        >
          {pwStatus === "saving"
            ? t("client.settings.password.saving")
            : pwStatus === "saved"
              ? t("client.settings.password.saved")
              : t("client.settings.password.submit")}
        </button>
        {pwStatus === "error" && pwError && <p className="mt-2 text-xs text-red-600">{pwError}</p>}
      </form>
    </div>
  );
}
