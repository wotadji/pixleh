"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { RichTextEditor } from "@/components/studio/RichTextEditor";
import { SignatureField } from "@/components/studio/SignatureField";

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
}

/**
 * Formulaire de contrat partagé entre la création (contracts/new) et la modification
 * (contracts/[id]/edit) — extrait en composant commun pour ne pas dupliquer la mise en page
 * (titre/client, éditeur enrichi, signature studio, sidebar "Comment ça marche").
 */
export function ContractForm({
  clients,
  studioName,
  initial,
  submitLabel,
  submittingLabel,
  submitting,
  onSubmit,
  createdAtDisplay,
}: {
  clients: ClientOption[];
  studioName: string;
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
  const [form, setForm] = useState({
    title: initial.title,
    clientId: initial.clientId,
    bodyHtml: initial.bodyHtml,
    place: initial.place,
  });
  const [studioSignatureDataUrl, setStudioSignatureDataUrl] = useState(initial.studioSignatureDataUrl);
  // Tant qu'une signature existe déjà (mode édition) ET n'a pas été explicitement remplacée,
  // on affiche un simple aperçu plutôt que SignatureField : celui-ci régénère automatiquement
  // une image dès le montage (onglet "Texte" pré-rempli), ce qui écraserait silencieusement
  // une signature dessinée/importée à chaque ouverture du formulaire d'édition si on le
  // montait direct.
  const [replacingSignature, setReplacingSignature] = useState(!initial.studioSignatureDataUrl);

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

      <aside className="h-fit rounded-xl border border-gray-200 bg-gray-50 p-6">
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
    </form>
  );
}
