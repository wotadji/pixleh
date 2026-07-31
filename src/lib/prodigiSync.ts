/**
 * Intégration Prodigi (https://www.prodigi.com/print-api/) — fournisseur d'impression choisi
 * pour le chantier "impression pixleh" (31/07/2026, demande d'Adriel) : "Boutique — Produits"
 * pour les tirages physiques bascule du studio vers un catalogue plateforme géré en admin
 * (/admin/print-catalog, voir src/lib/printCatalog.ts), avec une marge fixée par pixleh
 * au-dessus du coût de revient réel Prodigi.
 *
 * Endpoint utilisé ici : POST /v4.0/quotes (doc officielle) — renvoie le coût de revient d'un
 * SKU Prodigi SANS créer de commande, ce qui sert uniquement à AIDER Adriel à fixer le prix de
 * vente (Product.priceCents) dans /admin/print-catalog ; ce prix reste toujours saisi/validé
 * manuellement, jamais recalculé automatiquement à partir du coût Prodigi.
 *
 * Comme syncPlanWithStripe (src/lib/stripePlanSync.ts) : dégrade proprement si
 * PRODIGI_API_KEY n'est pas configuré, plutôt que de lever une exception — le catalogue reste
 * utilisable avec un coût de revient saisi à la main en attendant qu'Adriel crée un compte
 * Prodigi (dashboard.prodigi.com) et renseigne sa clé API.
 *
 * Base sandbox par défaut (aucune vraie commande n'est jamais soumise depuis ce module — la
 * soumission réelle de commande à Prodigi est une phase 2 non construite, voir tâche #340) :
 * passer PRODIGI_API_BASE_URL=https://api.prodigi.com/v4.0 une fois prêt pour la production.
 */

const DEFAULT_BASE_URL = "https://api.sandbox.prodigi.com/v4.0";

export interface ProdigiQuoteResult {
  synced: boolean;
  /** Coût de revient d'UN exemplaire, en centimes — null si non synchronisé. */
  unitCostCents?: number;
  currency?: string;
  error?: string;
}

/**
 * Interroge le coût de revient Prodigi pour un SKU donné (1 exemplaire, sans les frais de
 * port — ceux-ci dépendent du panier complet et de la méthode d'envoi, pas pertinents pour
 * fixer un prix unitaire catalogue). `destinationCountryCode` par défaut "FR" : pixleh cible
 * d'abord le marché français, mais le coût peut varier légèrement selon le pays de livraison
 * (lab de fabrication différent) — voir Product Details de l'API Prodigi pour affiner plus tard
 * si on veut un coût par pays.
 */
export async function getProdigiQuote(params: {
  sku: string;
  destinationCountryCode?: string;
  currencyCode?: string;
}): Promise<ProdigiQuoteResult> {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    return { synced: false, error: "PRODIGI_API_KEY non configuré" };
  }

  const baseUrl = process.env.PRODIGI_API_BASE_URL || DEFAULT_BASE_URL;
  const destinationCountryCode = params.destinationCountryCode || "FR";
  const currencyCode = params.currencyCode || "EUR";

  try {
    const res = await fetch(`${baseUrl}/quotes`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        destinationCountryCode,
        currencyCode,
        items: [{ sku: params.sku, copies: 1, attributes: {}, assets: [{ printArea: "default" }] }],
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      // On remonte le détail brut renvoyé par Prodigi (outcome + éventuel message/erreurs) au
      // lieu d'un simple code HTTP — un 400 seul ne dit pas SI c'est le SKU, l'attribut requis
      // manquant (ex: finition papier) ou le pays de destination non supporté par ce produit.
      const detail =
        data?.error?.message || data?.message || (data?.outcome ? `outcome: ${data.outcome}` : null);
      return {
        synced: false,
        error: `Prodigi a répondu ${res.status}${detail ? ` — ${detail}` : ""}${
          data ? ` (${JSON.stringify(data).slice(0, 300)})` : ""
        }`,
      };
    }
    if (data.outcome !== "Created" && data.outcome !== "CreatedWithIssues") {
      return { synced: false, error: `Réponse Prodigi inattendue (${data.outcome ?? "inconnue"})` };
    }

    // On prend le premier devis (première méthode d'envoi renvoyée, aucune n'étant précisée
    // dans la requête) et son premier item (un seul SKU demandé) — voir la doc "Quote object".
    const item = data.quotes?.[0]?.items?.[0];
    const amount = item?.unitCost?.amount;
    if (!amount) {
      return { synced: false, error: "Coût de revient introuvable dans la réponse Prodigi" };
    }

    return {
      synced: true,
      unitCostCents: Math.round(parseFloat(amount) * 100),
      currency: item.unitCost.currency || currencyCode,
    };
  } catch (e) {
    console.error("Échec de synchronisation Prodigi pour le SKU", params.sku, e);
    return { synced: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
