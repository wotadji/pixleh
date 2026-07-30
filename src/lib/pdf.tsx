import React from "react";
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";
import { renderHtmlToPdf } from "@/lib/htmlToPdf";

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
  // --- Redesign "PDF professionnel" du contrat (31/07/2026, demande d'Adriel) ---
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
});

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
  } = params;
  const accent = brandColor || "#7c3aed";
  const logoAbsoluteUrl = studioLogoUrl ? absoluteUrl(studioLogoUrl) : null;
  const footerLine = [studioName, studioAddress, studioContactEmail, studioContactPhone]
    .filter(Boolean)
    .join(" · ");
  const madeAtLine = createdAt
    ? `Fait ${place ? `à ${place}, ` : ""}le ${createdAt.toLocaleDateString("fr-FR")}`
    : null;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
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

        <View style={styles.section}>{renderHtmlToPdf(bodyHtml, accent)}</View>

        {(studioSignatureDataUrl || signedByName) && (
          <View style={styles.signatureRow}>
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
