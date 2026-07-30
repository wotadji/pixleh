import React from "react";
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 12, fontWeight: 700 },
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
  signature: { marginTop: 24, width: 200, height: 80 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    paddingTop: 8,
    borderTop: "1px solid #e5e7eb",
    fontSize: 9,
    color: "#9ca3af",
    textAlign: "center",
  },
});

/** Génère le PDF d'un contrat signé (texte + image de signature). */
export async function renderContractPdf(params: {
  studioName: string;
  title: string;
  bodyText: string;
  signedByName?: string | null;
  signedAt?: Date | null;
  signatureDataUrl?: string | null;
  /** Signature du studio, saisie à la création du contrat (voir SignatureField /
   * Contract.studioSignatureDataUrl) — affichée même si le client n'a pas encore signé. */
  studioSignatureDataUrl?: string | null;
  /** Coordonnées du studio (StudioSettings) affichées en pied de page — demandé par Adriel
   * pour que le PDF final identifie clairement l'émetteur du contrat, même imprimé seul. */
  studioAddress?: string | null;
  studioContactEmail?: string | null;
  studioContactPhone?: string | null;
}) {
  const {
    studioName,
    title,
    bodyText,
    signedByName,
    signedAt,
    signatureDataUrl,
    studioSignatureDataUrl,
    studioAddress,
    studioContactEmail,
    studioContactPhone,
  } = params;
  const footerLine = [studioName, studioAddress, studioContactEmail, studioContactPhone]
    .filter(Boolean)
    .join(" · ");

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={{ marginBottom: 16, color: "#666" }}>{studioName}</Text>
        <View style={styles.section}>
          <Text>{bodyText}</Text>
        </View>
        {studioSignatureDataUrl && (
          <View style={styles.section}>
            <Text>Signé par : {studioName}</Text>
            <Image src={studioSignatureDataUrl} style={styles.signature} />
          </View>
        )}
        {signedByName && (
          <View style={styles.section}>
            <Text>Signé par : {signedByName}</Text>
            {signedAt && <Text>Le : {signedAt.toLocaleString("fr-FR")}</Text>}
            {signatureDataUrl && <Image src={signatureDataUrl} style={styles.signature} />}
          </View>
        )}
        {footerLine && (
          <Text style={styles.footer} fixed>
            {footerLine}
          </Text>
        )}
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
