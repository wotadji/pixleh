import React from "react";
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";
import { renderHtmlToPdf, type HtmlPdfTheme } from "@/lib/htmlToPdf";
import {
  type ContractTemplateId,
  DEFAULT_CONTRACT_TEMPLATE,
  isContractTemplateId,
} from "@/lib/contractTemplates";

const styles = StyleSheet.create({
  page: { padding: 64, fontSize: 11, fontFamily: "Helvetica", color: "#1f2937" },
  title: { fontSize: 18, fontWeight: 700 },
  section: { marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: "#666" },
  table: { marginTop: 12, borderTop: "1px solid #ddd" },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottom: "1px solid #eee",
  },
  total: { marginTop: 12, fontSize: 14, fontWeight: 700, textAlign: "right" },
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
  // --- Template "classic" (design professionnel initial, 31/07/2026) ---
  letterheadRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  logo: { width: 36, height: 36, borderRadius: 18, marginRight: 10, objectFit: "cover" },
  logoFallback: { width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: "#ffffff", fontSize: 15, fontFamily: "Times-Bold" },
  letterheadName: { fontSize: 13, fontWeight: 700, color: "#111827" },
  contractTitleWrap: { alignItems: "center", marginBottom: 18 },
  contractTitle: { fontFamily: "Times-Bold", fontSize: 21, textAlign: "center", color: "#111827", lineHeight: 1.35 },
  contractTitleRule: { width: 60, height: 3, borderRadius: 2, marginTop: 12 },
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

  let headerBlock: React.ReactNode;
  if (tmpl === "minimal") {
    headerBlock = (
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
        {madeAtLine && <Text style={styles.minimalMetaText}>{madeAtLine}</Text>}
      </>
    );
  } else if (tmpl === "elegant") {
    headerBlock = (
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
        {madeAtLine && <Text style={styles.elegantMetaText}>{madeAtLine}</Text>}
      </View>
    );
  } else {
    headerBlock = (
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

        <View style={styles.contractTitleWrap}>
          <Text style={styles.contractTitle}>{title}</Text>
          <View style={[styles.contractTitleRule, { backgroundColor: accent }]} />
        </View>

        {madeAtLine && (
          <View style={styles.metaBar}>
            <Text style={styles.metaBarText}>{madeAtLine}</Text>
          </View>
        )}
      </>
    );
  }

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

/** Génère le PDF d'une facture. */
export async function renderInvoicePdf(params: {
  studioName: string;
  number: string;
  clientName?: string | null;
  clientEmail?: string | null;
  lineItems: { description: string; quantity: number; unitPriceCents: number }[];
  totalCents: number;
  currency: string;
  dueDate?: Date | null;
}) {
  const { studioName, number, clientName, clientEmail, lineItems, totalCents, currency, dueDate } =
    params;

  const format = (cents: number) => `${(cents / 100).toFixed(2)} ${currency}`;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Facture {number}</Text>
        <Text style={{ marginBottom: 16, color: "#666" }}>{studioName}</Text>

        <View style={styles.section}>
          {clientName && (
            <View style={styles.row}>
              <Text style={styles.label}>Client</Text>
              <Text>{clientName}</Text>
            </View>
          )}
          {clientEmail && (
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text>{clientEmail}</Text>
            </View>
          )}
          {dueDate && (
            <View style={styles.row}>
              <Text style={styles.label}>Échéance</Text>
              <Text>{dueDate.toLocaleDateString("fr-FR")}</Text>
            </View>
          )}
        </View>

        <View style={styles.table}>
          {lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text>
                {item.description} × {item.quantity}
              </Text>
              <Text>{format(item.unitPriceCents * item.quantity)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.total}>Total : {format(totalCents)}</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
