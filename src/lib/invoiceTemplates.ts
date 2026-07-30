/**
 * Liste des templates de mise en page disponibles pour le PDF d'une facture — même mécanisme
 * que src/lib/contractTemplates.ts (demande d'Adriel, 31/07/2026 : amener la facturation au
 * même niveau de rigueur que les contrats, avec les mêmes templates visuels).
 * Fichier volontairement léger (aucune dépendance à @react-pdf/renderer) pour pouvoir être
 * importé aussi bien côté serveur (src/lib/pdf.tsx) que côté client (InvoiceForm.tsx, pour
 * le sélecteur visuel) sans alourdir le bundle client avec la lib de génération PDF.
 */
export type InvoiceTemplateId = "classic" | "minimal" | "elegant";

export const INVOICE_TEMPLATE_IDS: InvoiceTemplateId[] = ["classic", "minimal", "elegant"];

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateId = "classic";

export function isInvoiceTemplateId(value: unknown): value is InvoiceTemplateId {
  return typeof value === "string" && (INVOICE_TEMPLATE_IDS as string[]).includes(value);
}
