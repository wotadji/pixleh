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

export interface ProdigiShippingQuoteResult {
  synced: boolean;
  /** Coût de PORT total pour l'ensemble du panier envoyé (tous les items expédiés ensemble en un
   * seul colis chez Prodigi), en centimes — null si non synchronisé. Distinct de
   * ProdigiQuoteResult.unitCostCents (coût de fabrication d'UN exemplaire, sans port). */
  shippingCents?: number;
  currency?: string;
  error?: string;
}

/**
 * Devis de LIVRAISON réel pour le panier complet — chantier "shipping dynamique au checkout"
 * (02/08/2026, demande d'Adriel : "mets en place un vrai calcul de shipping dynamique au moment
 * du checkout [...] affiché comme ligne Livraison séparée dans le panier"). Contrairement à
 * getProdigiQuote (un SEUL SKU, SANS le port, ne sert qu'à aider Adriel à fixer priceCents dans
 * /admin/print-catalog), cette fonction interroge le MÊME endpoint POST /v4.0/quotes mais avec
 * TOUS les items du panier en une seule requête (comme le fait réellement submitProdigiOrder à
 * la commande, voir src/lib/prodigiOrder.ts) et une destination réelle — le coût de port dépend
 * du panier complet (poids/volume cumulé) ET du pays, jamais d'un seul article isolé.
 *
 * Comme getProdigiQuote/submitProdigiOrder : dégrade proprement (ne lève jamais), et retente une
 * fois avec la première valeur valide de chaque attribut manquant si Prodigi répond
 * "ValidationFailed" (même mécanique multi-items que submitProdigiOrder, via
 * extractMissingAttributesByItemIndex).
 *
 * Retry supplémentaire sur 5xx (02/08/2026, bug remonté par Adriel : capture d'écran du panier
 * affichant "Livraison — Prodigi a répondu 503" sans aucun détail JSON) — un 5xx SANS corps JSON
 * exploitable (voir `data` toujours null dans ce cas) trahit une erreur de PASSERELLE/infra côté
 * Prodigi (gateway timeout, service indisponible), pas un rejet applicatif de notre requête
 * (qui, lui, renvoie un corps JSON avec un `outcome`) — le sandbox Prodigi (api.sandbox.prodigi.com)
 * est connu pour être ponctuellement moins stable que leur API de production. Jusqu'ici SEULE
 * l'erreur "ValidationFailed" déclenchait une nouvelle tentative : le moindre hoquet transitoire
 * du sandbox bloquait tout le checkout (fail-closed volontaire, voir doc plus haut). Ajout d'un
 * court backoff (400ms, 800ms) sur les réponses 5xx, jusqu'à MAX_ATTEMPTS tentatives au total.
 */
const MAX_ATTEMPTS = 3;

export async function getProdigiShippingQuote(params: {
  items: Array<{ sku: string; copies: number; attributes?: Record<string, string> | null }>;
  destinationCountryCode: string;
  currencyCode?: string;
}): Promise<ProdigiShippingQuoteResult> {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    return { synced: false, error: "PRODIGI_API_KEY non configuré" };
  }
  if (!params.items || params.items.length === 0) {
    return { synced: false, error: "Panier vide" };
  }

  const baseUrl = process.env.PRODIGI_API_BASE_URL || DEFAULT_BASE_URL;
  const currencyCode = params.currencyCode || "EUR";

  let items = params.items.map((it) => ({
    sku: it.sku,
    copies: it.copies,
    attributes: it.attributes ?? {},
    assets: [{ printArea: "default" }],
  }));
  let lastData: any = null;
  let lastStatus = 0;
  let attributeRetryUsed = false;

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await fetch(`${baseUrl}/quotes`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCountryCode: params.destinationCountryCode,
          currencyCode,
          items,
        }),
      });
      const data = await res.json().catch(() => null);
      lastData = data;
      lastStatus = res.status;

      if (res.ok && data) {
        if (data.outcome !== "Created" && data.outcome !== "CreatedWithIssues") {
          return { synced: false, error: `Réponse Prodigi inattendue (${data.outcome ?? "inconnue"})` };
        }
        // Forme observée de la réponse "Quote" Prodigi : quotes[0].costSummary.shipping.amount
        // (total de port pour CE devis, tous items du panier confondus) — fallback sur la somme
        // de quotes[0].shipments[].cost.amount si costSummary est absent (formes de réponse déjà
        // vues varier légèrement selon la version d'API Prodigi).
        const quote = data.quotes?.[0];
        let shippingAmountRaw: string | number | undefined = quote?.costSummary?.shipping?.amount;
        let shippingCurrency: string | undefined = quote?.costSummary?.shipping?.currency;
        if (shippingAmountRaw === undefined && Array.isArray(quote?.shipments)) {
          const sum = quote.shipments.reduce((acc: number, s: any) => {
            const amount = parseFloat(s?.cost?.amount ?? s?.amount ?? "0");
            return acc + (Number.isNaN(amount) ? 0 : amount);
          }, 0);
          if (quote.shipments.length > 0) {
            shippingAmountRaw = sum;
            shippingCurrency = quote.shipments[0]?.cost?.currency;
          }
        }
        if (shippingAmountRaw === undefined || shippingAmountRaw === null) {
          return { synced: false, error: "Coût de livraison introuvable dans la réponse Prodigi" };
        }
        const shippingAmount = parseFloat(String(shippingAmountRaw));
        if (Number.isNaN(shippingAmount)) {
          return { synced: false, error: "Coût de livraison illisible dans la réponse Prodigi" };
        }
        return {
          synced: true,
          shippingCents: Math.round(shippingAmount * 100),
          currency: shippingCurrency || currencyCode,
        };
      }

      if (!attributeRetryUsed && data?.outcome === "ValidationFailed" && data?.failures) {
        const missingByIndex = extractMissingAttributesByItemIndex(data);
        if (Object.keys(missingByIndex).length > 0) {
          items = items.map((it, idx) => {
            const missing = missingByIndex[idx];
            if (!missing) return it;
            const attributes = { ...it.attributes };
            for (const attr of missing) {
              if (attr.validValues?.[0]) attributes[attr.name] = attr.validValues[0];
            }
            return { ...it, attributes };
          });
          attributeRetryUsed = true;
          continue;
        }
      }

      // Retry sur 5xx transitoire (voir doc ci-dessus) — jamais sur 4xx (erreur définitive : clé
      // invalide, SKU inconnu, etc., que réessayer ne résoudra pas).
      if (res.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      break;
    }

    const detail =
      lastData?.error?.message || lastData?.message || (lastData?.outcome ? `outcome: ${lastData.outcome}` : null);
    return {
      synced: false,
      error: `Prodigi a répondu ${lastStatus}${detail ? ` — ${detail}` : ""}${
        lastData ? ` (${JSON.stringify(lastData).slice(0, 300)})` : ""
      }`,
    };
  } catch (e) {
    console.error("Échec du devis de livraison Prodigi", e);
    return { synced: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

export interface ProdigiProductDetailsResult {
  synced: boolean;
  /** Attributs sélectionnables du SKU, ex: {"wrap": ["Black","ImageWrap","MirrorWrap","White"]}
   * — vide si le SKU n'en a aucun. Persisté sur Product.prodigiAttributeOptions. */
  attributes?: Record<string, string[]>;
  error?: string;
}

/**
 * Interroge l'endpoint "Product Details" de Prodigi (GET /v4.0/products/{sku}) — chantier
 * "sélection d'attribut au moment de l'achat" (02/08/2026, demande d'Adriel : "je veux
 * construire une vraie UI de sélection d'attribut au moment de l'achat"). Contrairement à
 * getProdigiQuote (qui ne DÉCOUVRE les attributs requis qu'en réponse à un devis raté, et n'en
 * retient qu'UNE valeur par défaut), cet endpoint renvoie directement la liste COMPLÈTE des
 * valeurs possibles par attribut — c'est cette liste qui alimente le sélecteur proposé au
 * client (voir PrintSelectionPageView). Même patron de dégradation propre que getProdigiQuote :
 * ne lève jamais, `synced: false` + `error` si la clé API manque ou si Prodigi répond en erreur.
 */
export async function getProdigiProductDetails(sku: string): Promise<ProdigiProductDetailsResult> {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    return { synced: false, error: "PRODIGI_API_KEY non configuré" };
  }

  const baseUrl = process.env.PRODIGI_API_BASE_URL || DEFAULT_BASE_URL;

  try {
    const res = await fetch(`${baseUrl}/products/${encodeURIComponent(sku)}`, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
    });
    const data = await res.json().catch(() => null);

    if (res.ok && data?.outcome === "Ok" && data.product) {
      const attributes: Record<string, string[]> =
        data.product.attributes && typeof data.product.attributes === "object" ? data.product.attributes : {};
      return { synced: true, attributes };
    }

    const detail = data?.error?.message || data?.message || (data?.outcome ? `outcome: ${data.outcome}` : null);
    return {
      synced: false,
      error: `Prodigi a répondu ${res.status}${detail ? ` — ${detail}` : ""}`,
    };
  } catch (e) {
    console.error("Échec de récupération des attributs Prodigi pour le SKU", sku, e);
    return { synced: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
