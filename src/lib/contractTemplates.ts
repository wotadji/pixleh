/**
 * Liste des templates de mise en page disponibles pour le PDF d'un contrat (demandé par
 * Adriel, 31/07/2026 : "donner au studio le choix du design de template pour ses contrats").
 * Fichier volontairement léger (aucune dépendance à @react-pdf/renderer) pour pouvoir être
 * importé aussi bien côté serveur (src/lib/pdf.tsx) que côté client (ContractForm.tsx, pour
 * le sélecteur visuel) sans alourdir le bundle client avec la lib de génération PDF.
 */
export type ContractTemplateId = "classic" | "minimal" | "elegant";

export const CONTRACT_TEMPLATE_IDS: ContractTemplateId[] = ["classic", "minimal", "elegant"];

export const DEFAULT_CONTRACT_TEMPLATE: ContractTemplateId = "classic";

export function isContractTemplateId(value: unknown): value is ContractTemplateId {
  return typeof value === "string" && (CONTRACT_TEMPLATE_IDS as string[]).includes(value);
}
