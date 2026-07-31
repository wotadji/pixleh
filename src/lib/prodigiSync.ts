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

/**
 * Extrait les attributs manquants d'une réponse Prodigi "ValidationFailed" (forme observée :
 * data.failures["items[0].attributes"] = [{ code: "MissingRequiredAttributes", missingItems:
 * { attributes: [{ name, validValues }] } }]). Partagé entre getProdigiQuote (devis, phase 1) et
 * submitProdigiOrder (commande réelle, src/lib/prodigiOrder.ts, phase 2) — les deux endpoints
 * Prodigi (/quotes et /orders) renvoient la même forme d'erreur pour un attribut produit requis
 * non fourni (ex: finition papier).
 */
export function extractMissingAttributes(data: any): Array<{ name: string; validValues?: string[] }> {
  const missingAttrs: Array<{ name: string; validValues?: string[] }> = [];
  if (!data?.failures) return missingAttrs;
  for (const failureList of Object.values(data.failures) as any[]) {
    for (const failure of Array.isArray(failureList) ? failureList : []) {
      if (failure?.code === "MissingRequiredAttributes") {
        for (const attr of failure?.missingItems?.attributes ?? []) {
          if (attr?.name) missingAttrs.push(attr);
        }
      }
    }
  }
  return missingAttrs;
}

/**
 * Même extraction que extractMissingAttributes, mais indexée par item — nécessaire pour
 * submitProdigiOrder (src/lib/prodigiOrder.ts) qui soumet PLUSIEURS items en une seule commande
 * (contrairement à getProdigiQuote, un item par appel) : la clé de `data.failures` encode
 * l'index de l'item concerné (ex: "items[2].attributes"), qu'il faut préserver pour ne corriger
 * QUE l'item fautif plutôt que d'appliquer les mêmes attributs par défaut à tous.
 */
export function extractMissingAttributesByItemIndex(
  data: any
): Record<number, Array<{ name: string; validValues?: string[] }>> {
  const result: Record<number, Array<{ name: string; validValues?: string[] }>> = {};
  if (!data?.failures) return result;
  for (const [key, failureList] of Object.entries(data.failures) as [string, any[]][]) {
    const match = /^items\[(\d+)\]/.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    for (const failure of Array.isArray(failureList) ? failureList : []) {
      if (failure?.code === "MissingRequiredAttributes") {
        for (const attr of failure?.missingItems?.attributes ?? []) {
          if (attr?.name) {
            result[index] = result[index] || [];
            result[index].push(attr);
          }
        }
      }
    }
  }
  return result;
}

export interface ProdigiQuoteResult {
  synced: boolean;
  /** Coût de revient d'UN exemplaire, en centimes — null si non synchronisé. */
  unitCostCents?: number;
  currency?: string;
  error?: string;
  /** Attributs (ex: {finish: "Lustre"}) qui ont permis d'obtenir ce devis — vide si le SKU n'en
   * exige aucun. Persisté sur Product.prodigiAttributes (voir la route [id]/quote) et réutilisé
   * tel quel par la soumission de commande réelle (src/lib/prodigiOrder.ts), phase 2. */
  attributesUsed?: Record<string, string>;
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
    // Beaucoup de SKUs Prodigi exigent des attributs produit (ex: finition papier "finish" pour
    // les tirages photo, "wrap" pour les toiles, couleur de cadre...) qu'on ne connaît pas à
    // l'avance. Premier essai sans attribut ; si Prodigi répond "MissingRequiredAttributes", on
    // retente UNE fois avec la première valeur valide qu'il propose pour chaque attribut manquant
    // (ex: finish=Lustre) plutôt que d'échouer — un devis avec la finition par défaut reste un
    // coût de revient représentatif pour fixer le prix de vente.
    let attributes: Record<string, string> = {};
    let lastData: any = null;
    let lastStatus = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${baseUrl}/quotes`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCountryCode,
          currencyCode,
          items: [{ sku: params.sku, copies: 1, attributes, assets: [{ printArea: "default" }] }],
        }),
      });
      const data = await res.json().catch(() => null);
      lastData = data;
      lastStatus = res.status;

      if (res.ok && data) {
        if (data.outcome !== "Created" && data.outcome !== "CreatedWithIssues") {
          return { synced: false, error: `Réponse Prodigi inattendue (${data.outcome ?? "inconnue"})` };
        }
        // On prend le premier devis (première méthode d'envoi renvoyée, aucune n'étant précisée
        // dans la requête) et son premier item (un seul SKU demandé) — voir doc "Quote object".
        const item = data.quotes?.[0]?.items?.[0];
        const amount = item?.unitCost?.amount;
        if (!amount) {
          return { synced: false, error: "Coût de revient introuvable dans la réponse Prodigi" };
        }
        return {
          synced: true,
          unitCostCents: Math.round(parseFloat(amount) * 100),
          currency: item.unitCost.currency || currencyCode,
          attributesUsed: attributes,
        };
      }

      // Tente d'extraire les attributs manquants (forme observée : data.failures["items[0].attributes"]
      // = [{ code: "MissingRequiredAttributes", missingItems: { attributes: [{ name, validValues }] } }]).
      if (attempt === 0 && data?.outcome === "ValidationFailed" && data?.failures) {
        const missingAttrs = extractMissingAttributes(data);
        if (missingAttrs.length > 0) {
          attributes = { ...attributes };
          for (const attr of missingAttrs) {
            if (attr.validValues?.[0]) attributes[attr.name] = attr.validValues[0];
          }
          continue; // deuxième et dernière tentative avec ces attributs par défaut
        }
      }
      break;
    }

    // On remonte le détail brut renvoyé par Prodigi (outcome + éventuel message/erreurs) au lieu
    // d'un simple code HTTP — un 400 seul ne dit pas SI c'est le SKU, un attribut requis manquant
    // ou le pays de destination non supporté par ce produit.
    const detail =
      lastData?.error?.message || lastData?.message || (lastData?.outcome ? `outcome: ${lastData.outcome}` : null);
    return {
      synced: false,
      error: `Prodigi a répondu ${lastStatus}${detail ? ` — ${detail}` : ""}${
        lastData ? ` (${JSON.stringify(lastData).slice(0, 300)})` : ""
      }`,
    };
  } catch (e) {
    console.error("Échec de synchronisation Prodigi pour le SKU", params.sku, e);
    return { synced: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
