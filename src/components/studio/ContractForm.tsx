"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { RichTextEditor } from "@/components/studio/RichTextEditor";
import { SignatureField } from "@/components/studio/SignatureField";
import { CONTRACT_TEMPLATE_IDS, DEFAULT_CONTRACT_TEMPLATE, type ContractTemplateId } from "@/lib/contractTemplates";

interface ClientOption {
  id: string;
  name: string;
}

export interface ContractFormValues {
  title: string;
  clientId: string;
  bodyHtml: string;
  studioSignatureDataUrl: string | null;
  place: string;
  template: ContractTemplateId;
}

/** Aperçu miniature (CSS pur) de chaque template — donne une idée du placement du logo, du
 * titre et du liseré avant même de générer un PDF. `accent` reprend la couleur de marque du
 * studio (Studio.brandColor) pour que l'aperçu corresponde au rendu réel. Format compact
 * (dans la sidebar, voir plus bas) plutôt que les grandes cartes utilisées initialement. */
function TemplatePreview({ id, accent }: { id: ContractTemplateId; accent: string }) {
  if (id === "minimal") {
    return (
      <div className="flex h-12 w-16 shrink-0 flex-col justify-center gap-1 rounded-md bg-gray-50 p-1.5">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-sm bg-gray-300" />
          <div className="h-0.5 w-6 rounded-sm bg-gray-300" />
        </div>
        <div className="h-1 w-2/3 rounded-sm bg-gray-700" />
        <div className="h-px w-full bg-gray-200" />
      </div>
    );
  }
  if (id === "elegant") {
    return (
      <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-gray-300 bg-gray-50 p-1">
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <div className="h-1 w-1/2 rounded-sm bg-gray-700" />
      </div>
    );
  }
  // classic
  return (
    <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-gray-50 p-1.5">
      <div className="flex items-center gap-1 self-start">
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <div className="h-0.5 w-6 rounded-sm bg-gray-300" />
      </div>
      <div className="h-1 w-2/3 rounded-sm bg-gray-700" />
      <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: accent }} />
    </div>
  );
}

/**
 * Formulaire de contrat partagé entre la création (contracts/new) et la modification
 * (contracts/[id]/edit) — extrait en composant commun pour ne pas dupliquer la mise en page
 * (titre/client, éditeur enrichi, signature studio, sidebar "Comment ça marche").
 */
export function ContractForm({
  clients,
  studioName,
  studioBrandColor,
  initial,
  submitLabel,
  submittingLabel,
  submitting,
  onSubmit,
  createdAtDisplay,
}: {
  clients: ClientOption[];
  studioName: string;
  /** Couleur de marque du studio (Studio.brandColor) — utilisée uniquement pour colorer les
   * aperçus miniatures des templates ci-dessous, repli sur le violet pixleh si absente. */
  studioBrandColor?: string | null;
  initial: ContractFormValues;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  onSubmit: (values: ContractFormValues) => void;
  /** Date de création déjà formatée (ex: "30 juillet 2026") — non éditable, affichée à titre
   * informatif uniquement (undefined en création : la date sera celle de l'enregistrement). */
  createdAtDisplay?: string;
}) {
  const { t } = useLanguage();
  const accent = studioBrandColor || "#7c3aed";
  const [form, setForm] = useState({
    title: initial.title,
    clientId: initial.clientId,
    bodyHtml: initial.bodyHtml,
    place: initial.place,
    template: initial.template || DEFAULT_CONTRACT_TEMPLATE,
  });
  const [studioSignatureDataUrl, setStudioSignatureDataUrl] = useState(initial.studioSignatureDataUrl);
  // Tant qu'une signature existe déjà (mode édition) ET n'a pas été explicitement remplacée,
  // on affiche un simple aperçu plutôt que SignatureField : celui-ci régénère automatiquement
  // une image dès le montage (onglet "Texte" pré-rempli), ce qui écraserait silencieusement
  // une signature dessinée/importée à chaque ouverture du formulaire d'édition si on le
  // montait direct.
  const [replacingSignature, setReplacingSignature] = useState(!initial.studioSignatureDataUrl);
  const [previewLoading, setPreviewLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Le textContent (pas innerHTML) sert à vérifier qu'il y a bien du contenu saisi — un
    // éditeur "vide" peut contenir un <br> ou une balise <p></p> résiduelle qui passerait
    // le required du textarea natif, d'où cette vérification manuelle avant l'envoi.
    if (!form.bodyHtml.replace(/<[^>]+>/g, "").trim()) {
      alert(t("contractForm.bodyRequired"));
      return;
    }
    onSubmit({ ...form, studioSignatureDataUrl });
  }

  /** Génère et ouvre un aperçu PDF du contrat tel qu'il est en cours de rédaction — sans
   * enregistrer quoi que ce soit (voir POST /api/contracts/preview-pdf). Demandé par Adriel,
   * 31/07/2026 : "un bouton pour l'aperçu de son contrat", pour voir le rendu réel du template
   * choisi avant de créer/enregistrer le contrat. L'onglet est ouvert de façon synchrone (avant
   * le fetch) pour éviter que le navigateur ne bloque le popup une fois la réponse arrivée.
   */
  async function handlePreview() {
    if (!form.bodyHtml.replace(/<[^>]+>/g, "").trim()) {
      alert(t("contractForm.bodyRequired"));
      return;
    }
    const previewTab = window.open("", "_blank");
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/contracts/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, studioSignatureDataUrl }),
      });
      if (!res.ok) {
        previewTab?.close();
        alert(t("common.error"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewTab) previewTab.location.href = url;
      else window.open(url, "_blank");
    } catch {
      previewTab?.close();
      alert(t("common.error"));
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("contractForm.titleLabel")}</label>
            <input
              required
              placeholder={t("contractForm.titlePlaceholder")}
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("contractForm.clientLabel")}</label>
            <select
              className="input"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            >
              <option value="">{t("common.noClientOption")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("contractForm.placeLabel")}</label>
            <input
              placeholder={t("contractForm.placePlaceholder")}
              className="input"
              value={form.place}
              onChange={(e) => setForm({ ...form, place: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("contractForm.createdAtLabel")}</label>
            <p className="input flex items-center bg-gray-50 text-gray-500">
              {createdAtDisplay || t("contractForm.createdAtOnSave")}
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("contractForm.bodyLabel")}</label>
          <RichTextEditor
            value={form.bodyHtml}
            onChange={(html) => setForm({ ...form, bodyHtml: html })}
            placeholder={t("contractForm.bodyPlaceholder")}
            minHeightClassName="min-h-[380px]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t("contractForm.studioSignatureLabel")}
          </label>
          {replacingSignature ? (
            <SignatureField defaultText={studioName} onChange={setStudioSignatureDataUrl} />
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={studioSignatureDataUrl || undefined} alt="Signature actuelle" className="h-14 max-w-[200px] object-contain" />
              <button type="button" onClick={() => setReplacingSignature(true)} className="btn-secondary ml-auto text-sm">
                {t("contractForm.replaceSignature")}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <Link href="/dashboard/contracts" className="text-sm text-gray-600 hover:text-gray-900">
            {t("contractForm.cancel")}
          </Link>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>

      <div className="h-fit space-y-6">
        <aside className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("contractForm.templateLabel")}</h2>
          <div className="mt-3 space-y-2">
            {CONTRACT_TEMPLATE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setForm({ ...form, template: id })}
                className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition ${
                  form.template === id
                    ? "border-brand-500 bg-white ring-2 ring-brand-100"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <TemplatePreview id={id} accent={accent} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{t(`contractTemplate.${id}.name`)}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                    {t(`contractTemplate.${id}.description`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading}
            className="btn-secondary mt-4 w-full text-sm"
          >
            {previewLoading ? t("contractForm.previewLoading") : t("contractForm.previewButton")}
          </button>
        </aside>

        <aside className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("contractForm.howItWorksTitle")}</h2>
          <ol className="mt-4 space-y-4">
            {[t("contractForm.step1"), t("contractForm.step2"), t("contractForm.step3")].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-gray-600">{step}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </form>
  );
}
