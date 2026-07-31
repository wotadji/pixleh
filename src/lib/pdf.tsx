import React from "react";
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";
import { renderHtmlToPdf, type HtmlPdfTheme } from "@/lib/htmlToPdf";
import {
  type ContractTemplateId,
  DEFAULT_CONTRACT_TEMPLATE,
  isContractTemplateId,
} from "@/lib/contractTemplates";
import {
  type InvoiceTemplateId,
  DEFAULT_INVOICE_TEMPLATE,
  isInvoiceTemplateId,
} from "@/lib/invoiceTemplates";

const styles = StyleSheet.create({
  page: { padding: 64, fontSize: 11, fontFamily: "Helvetica", color: "#1f2937" },
  title: { fontSize: 18, fontWeight: 700 },
  section: { marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: "#666" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 64,
    right: 64,
    paddingTop: 8,
    borderTop: "1px solid #e5e7eb",
    fontSize: 9,
    color: "#9ca3af",
    textAlign: "center",
  },
  // --- Template "classic" (design professionnel initial, 31/07/2026) — partagé
  // contrats/factures via buildLetterhead() ---
  letterheadRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  logo: { width: 36, height: 36, borderRadius: 18, marginRight: 10, objectFit: "cover" },
  logoFallback: { width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: "#ffffff", fontSize: 15, fontFamily: "Times-Bold" },
  letterheadName: { fontSize: 13, fontWeight: 700, color: "#111827" },
  docTitleWrap: { alignItems: "center", marginBottom: 18 },
  docTitle: { fontFamily: "Times-Bold", fontSize: 21, textAlign: "center", color: "#111827", lineHeight: 1.35 },
  docTitleRule: { width: 60, height: 3, borderRadius: 2, marginTop: 12 },
  metaBar: {
    alignSelf: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 26,
  },
  metaBarText: { fontSize: 10, color: "#4b5563" },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 28 },
  signatureCard: { width: "47%", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, padding: 14 },
  signatureCardLabel: { fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, marginBottom: 10 },
  signatureImg: { height: 52, maxWidth: 150, objectFit: "contain", marginBottom: 6 },
  signatureImgPlaceholder: { height: 52, marginBottom: 6 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: "#d1d5db", marginBottom: 6 },
  signatureName: { fontSize: 11, fontWeight: 700, color: "#111827" },
  signatureDate: { fontSize: 9, color: "#9ca3af", marginTop: 2 },

  // --- Template "minimal" (sobre, tout Helvetica, sans couleur d'accent en en-tête) ---
  logoSquare: { width: 32, height: 32, borderRadius: 4, marginRight: 10, objectFit: "cover" },
  logoFallbackSquare: { width: 32, height: 32, borderRadius: 4, marginRight: 10, alignItems: "center", justifyContent: "center" },
  minimalStudioName: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#6b7280" },
  minimalTitle: { fontFamily: "Helvetica-Bold", fontWeight: 700, fontSize: 19, color: "#111827", marginTop: 6, marginBottom: 10 },
  minimalDivider: { height: 1, backgroundColor: "#e5e7eb", marginBottom: 24 },
  minimalMetaText: { fontSize: 9.5, color: "#9ca3af", marginBottom: 26 },
  minimalSignatureBlock: { width: "47%" },
  minimalSignatureLabel: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#9ca3af", marginBottom: 10 },

  // --- Template "elegant" (éditorial, cadre autour du titre uniquement) ---
  elegantFrame: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 30,
    alignItems: "center",
  },
  elegantLogo: { width: 30, height: 30, borderRadius: 15, marginBottom: 10, objectFit: "cover" },
  elegantLogoFallback: { width: 30, height: 30, borderRadius: 15, marginBottom: 10, alignItems: "center", justifyContent: "center" },
  elegantStudioName: { fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: "#6b7280", marginBottom: 12 },
  elegantRule: { width: 40, height: 1, backgroundColor: "#d4d4d8" },
  elegantTitle: {
    fontFamily: "Times-BoldItalic",
    fontWeight: 700,
    fontSize: 22,
    textAlign: "center",
    color: "#111827",
    lineHeight: 1.3,
    marginVertical: 14,
  },
  elegantMetaText: { fontSize: 9.5, fontFamily: "Times-Italic", color: "#6b7280", textAlign: "center", marginTop: 12 },
  elegantSignatureBlock: { width: "47%", alignItems: "center", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 12 },
  elegantSignatureLabel: { fontSize: 8.5, fontFamily: "Times-Italic", color: "#6b7280", marginBottom: 10, textAlign: "center" },
  elegantSignatureLine: { borderBottomWidth: 1, borderBottomColor: "#d1d5db", width: "70%", marginBottom: 8 },

  // --- Facture : bloc "Facturé à" + tableau de lignes + totaux + tampon payé (31/07/2026,
  // refonte pro de la facturation demandée par Adriel) ---
  invoiceMetaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  billToLabel: { fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, marginBottom: 6, color: "#9ca3af" },
  billToName: { fontSize: 11, fontWeight: 700, color: "#111827" },
  billToLine: { fontSize: 9.5, color: "#6b7280", marginTop: 2 },
  invoiceMetaBlock: { alignItems: "flex-end" },
  invoiceMetaLine: { fontSize: 9.5, color: "#6b7280", marginTop: 2 },
  tableHeaderRow: { flexDirection: "row", borderBottomWidth: 1.5, paddingBottom: 6, marginBottom: 4 },
  tableHeaderCell: { fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, color: "#9ca3af" },
  lineRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  lineDescCell: { flex: 1, fontSize: 10.5, color: "#1f2937", paddingRight: 8 },
  lineQtyCell: { width: 44, fontSize: 10.5, color: "#6b7280", textAlign: "center" },
  lineUnitCell: { width: 78, fontSize: 10.5, color: "#6b7280", textAlign: "right" },
  lineTotalCell: { width: 78, fontSize: 10.5, fontWeight: 700, color: "#111827", textAlign: "right" },
  totalsBlock: { marginTop: 16, alignSelf: "flex-end", width: 230 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalsLabel: { fontSize: 10, color: "#6b7280" },
  totalsValue: { fontSize: 10, color: "#111827" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: 1.5 },
  grandTotalLabel: { fontSize: 12, fontWeight: 700, color: "#111827" },
  grandTotalValue: { fontSize: 14, fontWeight: 700, color: "#111827" },
  balanceDueRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  balanceDueLabel: { fontSize: 10, fontWeight: 700, color: "#b45309" },
  balanceDueValue: { fontSize: 10, fontWeight: 700, color: "#b45309" },
  paidStamp: {
    position: "absolute",
    top: 68,
    right: 64,
    borderWidth: 2,
    borderColor: "#16a34a",
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
    transform: "rotate(-8deg)",
  },
  paidStampText: { fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#16a34a" },
  notesBlock: { marginTop: 26, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  notesLabel: { fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, color: "#9ca3af", marginBottom: 4 },
  notesText: { fontSize: 9.5, color: "#4b5563", lineHeight: 1.5 },
  legalMentions: { marginTop: 18, fontSize: 8, color: "#9ca3af", lineHeight: 1.5 },
});

/** Thèmes du corps HTML (titres/citations/puces/liens — voir htmlToPdf.tsx) par template.
 * `accent` (couleur de marque du studio) est injecté séparément au moment du rendu. */
const CONTRACT_TEMPLATE_HTML_THEMES: Record<ContractTemplateId, Partial<HtmlPdfTheme>> = {
  classic: {
    headingFontFamily: "Times-Bold",
    headingUnderline: true,
    bulletChar: "•",
  },
  minimal: {
    headingFontFamily: "Helvetica-Bold",
    headingUnderline: false,
    bulletChar: "–",
    bulletColor: "#6b7280",
    quoteItalic: false,
    quoteColor: "#6b7280",
    quoteBorderColor: "#d1d5db",
  },
  elegant: {
    headingFontFamily: "Times-BoldItalic",
    headingUnderline: false,
    headingAlign: "center",
    bulletChar: "–",
    bulletColor: "#6b7280",
    quoteItalic: true,
    quoteColor: "#6b7280",
    quoteBorderColor: "#d1d5db",
  },
};

function absoluteUrl(path: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

/**
 * Lettrine + titre + ligne méta partagés entre le contrat et la facture (31/07/2026, refonte
 * de la facturation demandée par Adriel : même identité visuelle sur les deux documents, 3
 * templates au choix). `metaLine` est le texte affiché sous le titre — "Fait à ..., le ..."
 * pour un contrat, "Émise le ..." pour une facture.
 */
function buildLetterhead(
  tmpl: "classic" | "minimal" | "elegant",
  params: { studioName: string; title: string; metaLine?: string | null; logoAbsoluteUrl: string | null; accent: string }
): React.ReactNode {
  const { studioName, title, metaLine, logoAbsoluteUrl, accent } = params;

  if (tmpl === "minimal") {
    return (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          {logoAbsoluteUrl ? (
            <Image src={logoAbsoluteUrl} style={styles.logoSquare} />
          ) : (
            <View style={[styles.logoFallbackSquare, { backgroundColor: "#e5e7eb" }]}>
              <Text style={{ color: "#6b7280", fontSize: 13, fontFamily: "Helvetica-Bold" }}>
                {studioName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.minimalStudioName}>{studioName}</Text>
        </View>
        <Text style={styles.minimalTitle}>{title}</Text>
        <View style={styles.minimalDivider} />
        {metaLine && <Text style={styles.minimalMetaText}>{metaLine}</Text>}
      </>
    );
  }

  if (tmpl === "elegant") {
    return (
      <View style={styles.elegantFrame}>
        {logoAbsoluteUrl ? (
          <Image src={logoAbsoluteUrl} style={styles.elegantLogo} />
        ) : (
          <View style={[styles.elegantLogoFallback, { backgroundColor: accent }]}>
            <Text style={{ color: "#ffffff", fontSize: 13, fontFamily: "Times-Bold" }}>
              {studioName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.elegantStudioName}>{studioName}</Text>
        <View style={styles.elegantRule} />
        <Text style={styles.elegantTitle}>{title}</Text>
        <View style={styles.elegantRule} />
        {metaLine && <Text style={styles.elegantMetaText}>{metaLine}</Text>}
      </View>
    );
  }

  return (
    <>
      <View style={styles.letterheadRow}>
        {logoAbsoluteUrl ? (
          <Image src={logoAbsoluteUrl} style={styles.logo} />
        ) : (
          <View style={[styles.logoFallback, { backgroundColor: accent }]}>
            <Text style={styles.logoFallbackText}>{studioName.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.letterheadName}>{studioName}</Text>
      </View>
      <View style={{ height: 2, backgroundColor: accent, marginBottom: 26 }} />

      <View style={styles.docTitleWrap}>
        <Text style={styles.docTitle}>{title}</Text>
        <View style={[styles.docTitleRule, { backgroundColor: accent }]} />
      </View>

      {metaLine && (
        <View style={styles.metaBar}>
          <Text style={styles.metaBarText}>{metaLine}</Text>
        </View>
      )}
    </>
  );
}

/** Génère le PDF d'un contrat signé (texte + image de signature). */
export async function renderContractPdf(params: {
  studioName: string;
  title: string;
  /** HTML produit par RichTextEditor.tsx (corps du contrat) — rendu via htmlToPdf.tsx pour
   * conserver la mise en forme (gras, titres, alignement, listes...) dans le PDF final,
   * au lieu du texte brut aplati utilisé auparavant. */
  bodyHtml: string;
  signedByName?: string | null;
  signedAt?: Date | null;
  signatureDataUrl?: string | null;
  /** Signature du studio, saisie à la création du contrat (voir SignatureField /
   * Contract.studioSignatureDataUrl) — affichée même si le client n'a pas encore signé. */
  studioSignatureDataUrl?: string | null;
  /** Logo du studio (Studio.logoUrl, chemin relatif — voir /api/studio-logo/[studioId]) et
   * couleur de marque (Studio.brandColor) : repris en en-tête/liserés du PDF pour un rendu
   * "à l'identité" du studio plutôt qu'un document neutre (demande d'Adriel, 31/07/2026,
   * "design professionnel"). Repli sur un cercle à l'initiale du studio si pas de logo, et
   * sur le violet pixleh si pas de couleur de marque définie. */
  studioLogoUrl?: string | null;
  brandColor?: string | null;
  /** Coordonnées du studio (StudioSettings) affichées en pied de page — demandé par Adriel
   * pour que le PDF final identifie clairement l'émetteur du contrat, même imprimé seul. */
  studioAddress?: string | null;
  studioContactEmail?: string | null;
  studioContactPhone?: string | null;
  /** Lieu de rédaction (Contract.place) — combiné à `createdAt` pour la formule d'usage
   * "Fait à {place}, le {createdAt}" (demandé par Adriel : la date de création est "un point
   * essentiel" du contrat, au même titre que la date de signature déjà affichée ci-dessous). */
  place?: string | null;
  createdAt?: Date | null;
  /** Template de mise en page choisi par le studio (Contract.template — voir
   * src/lib/contractTemplates.ts) : "classic" (lettrine + titre encadré, couleur de marque
   * bien présente), "minimal" (sobre, tout Helvetica, sans couleur en en-tête) ou "elegant"
   * (éditorial, titre encadré et centré, typographie italique). Repli sur "classic" si absent
   * ou invalide (demande d'Adriel, 31/07/2026 : "donner au studio le choix du design"). */
  template?: string | null;
}) {
  const {
    studioName,
    title,
    bodyHtml,
    signedByName,
    signedAt,
    signatureDataUrl,
    studioSignatureDataUrl,
    studioLogoUrl,
    brandColor,
    studioAddress,
    studioContactEmail,
    studioContactPhone,
    place,
    createdAt,
    template,
  } = params;
  const tmpl: ContractTemplateId = isContractTemplateId(template) ? template : DEFAULT_CONTRACT_TEMPLATE;
  const accent = brandColor || "#7c3aed";
  const logoAbsoluteUrl = studioLogoUrl ? absoluteUrl(studioLogoUrl) : null;
  const footerLine = [studioName, studioAddress, studioContactEmail, studioContactPhone]
    .filter(Boolean)
    .join(" · ");
  const madeAtLine = createdAt
    ? `Fait ${place ? `à ${place}, ` : ""}le ${createdAt.toLocaleDateString("fr-FR")}`
    : null;

  const htmlTheme: Partial<HtmlPdfTheme> = { accent, ...CONTRACT_TEMPLATE_HTML_THEMES[tmpl] };
  const bodyContent = <View style={styles.section}>{renderHtmlToPdf(bodyHtml, htmlTheme)}</View>;

  const headerBlock = buildLetterhead(tmpl, { studioName, title, metaLine: madeAtLine, logoAbsoluteUrl, accent });

  let signatureBlock: React.ReactNode = null;
  if (studioSignatureDataUrl || signedByName) {
    if (tmpl === "minimal") {
      signatureBlock = (
        <View style={styles.signatureRow} wrap={false}>
          {studioSignatureDataUrl && (
            <View style={styles.minimalSignatureBlock}>
              <Text style={styles.minimalSignatureLabel}>Signature du Prestataire</Text>
              <Image src={studioSignatureDataUrl} style={styles.signatureImg} />
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{studioName}</Text>
            </View>
          )}
          {signedByName && (
            <View style={styles.minimalSignatureBlock}>
              <Text style={styles.minimalSignatureLabel}>Signature du Client</Text>
              {signatureDataUrl ? (
                <Image src={signatureDataUrl} style={styles.signatureImg} />
              ) : (
                <View style={styles.signatureImgPlaceholder} />
              )}
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{signedByName}</Text>
              {signedAt && (
                <Text style={styles.signatureDate}>Signé le {signedAt.toLocaleString("fr-FR")}</Text>
              )}
            </View>
          )}
        </View>
      );
    } else if (tmpl === "elegant") {
      signatureBlock = (
        <View style={styles.signatureRow} wrap={false}>
          {studioSignatureDataUrl && (
            <View style={styles.elegantSignatureBlock}>
              <Text style={styles.elegantSignatureLabel}>Signature du Prestataire</Text>
              <Image src={studioSignatureDataUrl} style={styles.signatureImg} />
              <View style={styles.elegantSignatureLine} />
              <Text style={[styles.signatureName, { textAlign: "center" }]}>{studioName}</Text>
            </View>
          )}
          {signedByName && (
            <View style={styles.elegantSignatureBlock}>
              <Text style={styles.elegantSignatureLabel}>Signature du Client</Text>
              {signatureDataUrl ? (
                <Image src={signatureDataUrl} style={styles.signatureImg} />
              ) : (
                <View style={styles.signatureImgPlaceholder} />
              )}
              <View style={styles.elegantSignatureLine} />
              <Text style={[styles.signatureName, { textAlign: "center" }]}>{signedByName}</Text>
              {signedAt && (
                <Text style={[styles.signatureDate, { textAlign: "center" }]}>
                  Signé le {signedAt.toLocaleString("fr-FR")}
                </Text>
              )}
            </View>
          )}
        </View>
      );
    } else {
      signatureBlock = (
        <View style={styles.signatureRow} wrap={false}>
          {studioSignatureDataUrl && (
            <View style={styles.signatureCard}>
              <Text style={[styles.signatureCardLabel, { color: accent }]}>Signature du Prestataire</Text>
              <Image src={studioSignatureDataUrl} style={styles.signatureImg} />
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{studioName}</Text>
            </View>
          )}
          {signedByName && (
            <View style={styles.signatureCard}>
              <Text style={[styles.signatureCardLabel, { color: accent }]}>Signature du Client</Text>
              {signatureDataUrl ? (
                <Image src={signatureDataUrl} style={styles.signatureImg} />
              ) : (
                <View style={styles.signatureImgPlaceholder} />
              )}
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{signedByName}</Text>
              {signedAt && (
                <Text style={styles.signatureDate}>Signé le {signedAt.toLocaleString("fr-FR")}</Text>
              )}
            </View>
          )}
        </View>
      );
    }
  }

  const footerStyle = tmpl === "elegant" ? [styles.footer, { fontFamily: "Times-Italic" }] : styles.footer;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {headerBlock}
        {bodyContent}
        {signatureBlock}
        <Text
          style={footerStyle}
          fixed
          render={({ pageNumber, totalPages }) =>
            footerLine ? `${footerLine}   ·   Page ${pageNumber} / ${totalPages}` : `Page ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

/**
 * Génère le PDF d'une facture — refonte complète du 31/07/2026 (demande d'Adriel : amener la
 * facturation au même niveau de rigueur professionnelle que les contrats). Reprend la même
 * lettrine à 3 templates (classic/minimal/elegant, voir buildLetterhead ci-dessus), ajoute un
 * bloc "Facturé à", un tableau de lignes stylé, un récapitulatif des totaux (avec acompte déjà
 * réglé / solde dû le cas échéant), un tampon "PAYÉE" quand la facture est intégralement
 * réglée, des notes libres et les mentions légales du studio (SIRET/TVA/IBAN...) en pied de
 * page — mentions obligatoires sur une facture française, absentes du document précédent.
 */
export async function renderInvoicePdf(params: {
  studioName: string;
  number: string;
  clientName?: string | null;
  clientEmail?: string | null;
  lineItems: { description: string; quantity: number; unitPriceCents: number }[];
  totalCents: number;
  /** Déjà réglé (Invoice.amountPaidCents) — permet d'afficher un solde dû si > 0 et < total,
   * ou le tampon "PAYÉE" si >= total. */
  amountPaidCents?: number;
  paidAt?: Date | null;
  currency: string;
  dueDate?: Date | null;
  createdAt?: Date | null;
  notes?: string | null;
  studioLogoUrl?: string | null;
  brandColor?: string | null;
  studioAddress?: string | null;
  studioContactEmail?: string | null;
  studioContactPhone?: string | null;
  /** Mentions légales du studio (StudioSettings) — voir prisma/schema.prisma. */
  studioLegalForm?: string | null;
  studioSiret?: string | null;
  studioVatNumber?: string | null;
  studioVatExempt?: boolean;
  studioIban?: string | null;
  studioBic?: string | null;
  studioLegalMentions?: string | null;
  /** Template de mise en page choisi par le studio (Invoice.template — voir
   * src/lib/invoiceTemplates.ts). Repli sur "classic" si absent ou invalide. */
  template?: string | null;
  /** Taux de TVA appliqué à cette facture, en pourcentage (ex: 20 pour 20%) — demandé par
   * Adriel, 31/07/2026. null/absent = pas de TVA (comportement historique : un seul "Total").
   * Le sous-total HT n'est pas passé séparément : il est recalculé ici à partir de lineItems
   * (source de vérité unique), et le montant de TVA affiché = totalCents - sous-total, pour
   * rester exactement cohérent avec le total réellement stocké/facturé plutôt que de risquer
   * un écart d'arrondi en recalculant la TVA à partir du taux. */
  vatRate?: number | null;
}) {
  const {
    studioName,
    number,
    clientName,
    clientEmail,
    lineItems,
    totalCents,
    amountPaidCents = 0,
    paidAt,
    currency,
    dueDate,
    createdAt,
    notes,
    studioLogoUrl,
    brandColor,
    studioAddress,
    studioContactEmail,
    studioContactPhone,
    studioLegalForm,
    studioSiret,
    studioVatNumber,
    studioVatExempt,
    studioIban,
    studioBic,
    studioLegalMentions,
    template,
    vatRate,
  } = params;

  const tmpl: InvoiceTemplateId = isInvoiceTemplateId(template) ? template : DEFAULT_INVOICE_TEMPLATE;
  const accent = brandColor || "#7c3aed";
  const logoAbsoluteUrl = studioLogoUrl ? absoluteUrl(studioLogoUrl) : null;
  const footerLine = [studioName, studioAddress, studioContactEmail, studioContactPhone]
    .filter(Boolean)
    .join(" · ");
  const format = (cents: number) => `${(cents / 100).toFixed(2)} ${currency}`;
  const isPaid = amountPaidCents >= totalCents && totalCents > 0;
  const balanceDue = totalCents - amountPaidCents;
  // Sous-total HT recalculé depuis lineItems (source de vérité unique) ; le montant de TVA
  // affiché est la différence avec totalCents (TTC, stocké tel quel) plutôt qu'un recalcul à
  // partir du taux, pour rester exactement cohérent au centime près avec ce qui est facturé.
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const vatAmountCents = totalCents - subtotalCents;

  const metaLine = [
    createdAt ? `Émise le ${createdAt.toLocaleDateString("fr-FR")}` : null,
    dueDate ? `Échéance le ${dueDate.toLocaleDateString("fr-FR")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const headerBlock = buildLetterhead(tmpl, {
    studioName,
    title: `Facture ${number}`,
    metaLine: metaLine || null,
    logoAbsoluteUrl,
    accent,
  });

  const tableAccent = tmpl === "classic" ? accent : tmpl === "elegant" ? "#d4d4d8" : "#e5e7eb";
  const grandTotalFontFamily = tmpl === "elegant" ? "Times-Bold" : "Helvetica-Bold";

  const legalMentionsLines = [
    studioLegalForm,
    studioSiret ? `SIRET : ${studioSiret}` : null,
    studioVatExempt ? "TVA non applicable, art. 293 B du CGI" : studioVatNumber ? `TVA intracommunautaire : ${studioVatNumber}` : null,
    studioIban ? `IBAN : ${studioIban}${studioBic ? `  ·  BIC : ${studioBic}` : ""}` : null,
  ].filter(Boolean);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {headerBlock}

        {isPaid && (
          <View style={styles.paidStamp} fixed>
            <Text style={styles.paidStampText}>Payée</Text>
          </View>
        )}

        {(clientName || clientEmail) && (
          <View style={styles.invoiceMetaRow}>
            <View>
              <Text style={styles.billToLabel}>Facturé à</Text>
              {clientName && <Text style={styles.billToName}>{clientName}</Text>}
              {clientEmail && <Text style={styles.billToLine}>{clientEmail}</Text>}
            </View>
          </View>
        )}

        <View>
          <View style={[styles.tableHeaderRow, { borderBottomColor: tableAccent }]}>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Description</Text>
            <Text style={[styles.tableHeaderCell, { width: 44, textAlign: "center" }]}>Qté</Text>
            <Text style={[styles.tableHeaderCell, { width: 78, textAlign: "right" }]}>Prix unit.</Text>
            <Text style={[styles.tableHeaderCell, { width: 78, textAlign: "right" }]}>Total</Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={styles.lineRow} wrap={false}>
              <Text style={styles.lineDescCell}>{item.description}</Text>
              <Text style={styles.lineQtyCell}>{item.quantity}</Text>
              <Text style={styles.lineUnitCell}>{format(item.unitPriceCents)}</Text>
              <Text style={styles.lineTotalCell}>{format(item.unitPriceCents * item.quantity)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock} wrap={false}>
          {vatRate != null && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Sous-total (HT)</Text>
                <Text style={styles.totalsValue}>{format(subtotalCents)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>TVA ({vatRate}%)</Text>
                <Text style={styles.totalsValue}>{format(vatAmountCents)}</Text>
              </View>
            </>
          )}
          <View style={[styles.grandTotalRow, { borderTopColor: tableAccent }]}>
            <Text style={[styles.grandTotalLabel, { fontFamily: grandTotalFontFamily }]}>
              {vatRate != null ? "Total (TTC)" : "Total"}
            </Text>
            <Text style={[styles.grandTotalValue, { fontFamily: grandTotalFontFamily }]}>{format(totalCents)}</Text>
          </View>
          {amountPaidCents > 0 && !isPaid && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Déjà réglé</Text>
                <Text style={styles.totalsValue}>{format(amountPaidCents)}</Text>
              </View>
              <View style={styles.balanceDueRow}>
                <Text style={styles.balanceDueLabel}>Solde dû</Text>
                <Text style={styles.balanceDueValue}>{format(balanceDue)}</Text>
              </View>
            </>
          )}
          {isPaid && paidAt && (
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, { color: "#16a34a" }]}>Payée le {paidAt.toLocaleDateString("fr-FR")}</Text>
            </View>
          )}
        </View>

        {notes && (
          <View style={styles.notesBlock} wrap={false}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        {(legalMentionsLines.length > 0 || studioLegalMentions) && (
          <View style={styles.legalMentions}>
            {legalMentionsLines.length > 0 && <Text>{legalMentionsLines.join("  ·  ")}</Text>}
            {studioLegalMentions && <Text>{studioLegalMentions}</Text>}
          </View>
        )}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            footerLine ? `${footerLine}   ·   Page ${pageNumber} / ${totalPages}` : `Page ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
