import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractMissingAttributesByItemIndex } from "@/lib/prodigiSync";
import { parseShippingAddress } from "@/lib/shippingAddress";

/**
 * Soumission RÉELLE d'une commande à Prodigi (chantier "impression pixleh Phase 2", 01/08/2026,
 * demande d'Adriel : "passons à la phase 2") — jusqu'ici (voir src/lib/prodigiSync.ts) seule
 * l'estimation de coût (Quote) était implémentée ; ce module appelle POST /v4.0/orders, qui
 * engage réellement Adriel financièrement (Prodigi facture son compte) et déclenche
 * l'impression + l'expédition chez le client final. Décision d'Adriel (01/08/2026) : soumission
 * AUTOMATIQUE dès que Stripe confirme le paiement (voir webhook), pas de validation manuelle —
 * les échecs restent visibles et rejouables depuis /admin/orders (Order.prodigiStatus/prodigiError).
 *
 * Comme getProdigiQuote : dégrade proprement (ne lève jamais), écrit le résultat sur la commande
 * plutôt que de faire échouer l'appelant (le webhook Stripe ne doit jamais être bloqué par un
 * souci Prodigi, voir /api/webhooks/stripe).
 */

const DEFAULT_BASE_URL = "https://api.sandbox.prodigi.com/v4.0";

function appUrl(path: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

interface ProdigiLineItem {
  orderItemId: string;
  photoId: string;
  sku: string;
  copies: number;
  attributes: Record<string, string>;
}

export interface SubmitProdigiOrderResult {
  submitted: boolean;
  /** true si la commande n'avait aucun article du catalogue plateforme (rien à envoyer à
   * Prodigi) — distinct d'un échec, ne modifie pas prodigiStatus. */
  skipped?: boolean;
  prodigiOrderId?: string;
  error?: string;
}

/**
 * Soumet (ou re-soumet après échec) une commande payée à Prodigi. Idempotent : ne fait rien si
 * déjà prodigiStatus = "SUBMITTED". Ignore silencieusement les commandes sans aucun article du
 * catalogue plateforme (téléchargement numérique, album... rien à imprimer).
 */
export async function submitProdigiOrder(orderId: string): Promise<SubmitProdigiOrderResult> {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    return { submitted: false, error: "PRODIGI_API_KEY non configuré" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { photo: true } } },
  });
  if (!order) return { submitted: false, error: "Commande introuvable" };
  if (order.status !== "PAID" && order.status !== "FULFILLED") {
    return { submitted: false, error: "Commande non payée" };
  }

  // Order.prodigiStatus/prodigiOrderId/prodigiAssetToken n'existent pas encore dans le Prisma
  // Client généré du sandbox (tâche #254) — même workaround $queryRaw/$executeRaw que le reste
  // du catalogue impression.
  const [orderMeta] = await prisma.$queryRaw<
    Array<{ prodigiStatus: string | null; prodigiAssetToken: string | null; shippingAddress: string | null }>
  >`SELECT "prodigiStatus", "prodigiAssetToken", "shippingAddress" FROM "Order" WHERE "id" = ${orderId}`;
  if (orderMeta?.prodigiStatus === "SUBMITTED") {
    return { submitted: true, skipped: false };
  }

  const productIds = [...new Set(order.items.map((i) => i.productId))];
  if (productIds.length === 0) return { submitted: false, skipped: true };

  const products = await prisma.$queryRaw<
    Array<{ id: string; sku: string | null; platformManaged: boolean; prodigiAttributes: string | null }>
  >`SELECT "id", "sku", "platformManaged", "prodigiAttributes" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)})`;
  const productMap = new Map(products.map((p) => [p.id, p]));

  // OrderItem.attributes (choix du client au moment de l'achat) n'existe pas encore dans le
  // Prisma Client généré du sandbox (tâche #254) — chantier "sélection d'attribut au moment de
  // l'achat" (02/08/2026, demande d'Adriel : "je veux construire une vraie UI de sélection
  // d'attribut au moment de l'achat"), lu séparément via $queryRaw, même workaround que le reste
  // du catalogue impression. Prioritaire sur Product.prodigiAttributes (valeur par défaut fixe)
  // pour toute clé choisie par le client ; les attributs non proposés au choix restent sur leur
  // valeur par défaut du produit.
  const orderItemIds = order.items.map((i) => i.id);
  const itemAttributeRows = orderItemIds.length
    ? await prisma.$queryRaw<Array<{ id: string; attributes: string | null }>>`
        SELECT "id", "attributes" FROM "OrderItem" WHERE "id" IN (${Prisma.join(orderItemIds)})
      `
    : [];
  const itemAttributesMap = new Map(itemAttributeRows.map((r) => [r.id, r.attributes]));

  // Seuls les articles du catalogue plateforme (platformManaged=true) sont un service pixleh
  // via Prodigi — un téléchargement numérique/album/package du studio n'a rien à faire ici.
  const prodigiItems: ProdigiLineItem[] = [];
  for (const item of order.items) {
    const product = productMap.get(item.productId);
    if (!product?.platformManaged || !product.sku) continue;
    if (!item.photoId) {
      return {
        submitted: false,
        error: `Article catalogue "${item.productId}" sans photo associée — impossible de soumettre à Prodigi.`,
      };
    }
    let attributes: Record<string, string> = {};
    if (product.prodigiAttributes) {
      try {
        attributes = JSON.parse(product.prodigiAttributes);
      } catch {
        attributes = {};
      }
    }
    // Le choix du client (OrderItem.attributes) écrase la valeur par défaut du produit pour
    // toute clé qu'il a effectivement choisie — les clés absentes du choix client gardent leur
    // valeur par défaut ci-dessus (ex: un SKU à 2 attributs dont un seul proposé au choix).
    const chosenJson = itemAttributesMap.get(item.id);
    if (chosenJson) {
      try {
        const chosen = JSON.parse(chosenJson);
        if (chosen && typeof chosen === "object") {
          attributes = { ...attributes, ...chosen };
        }
      } catch {
        // JSON invalide : on garde la valeur par défaut du produit, pas d'échec de la commande.
      }
    }
    prodigiItems.push({
      orderItemId: item.id,
      photoId: item.photoId,
      sku: product.sku,
      copies: item.quantity,
      attributes,
    });
  }

  if (prodigiItems.length === 0) {
    return { submitted: false, skipped: true };
  }

  const shippingAddress = parseShippingAddress(orderMeta?.shippingAddress ?? order.shippingAddress);
  if (!shippingAddress) {
    const error = "Adresse de livraison manquante ou incomplète.";
    await prisma.$executeRaw`UPDATE "Order" SET "prodigiStatus" = 'FAILED', "prodigiError" = ${error} WHERE "id" = ${orderId}`;
    return { submitted: false, error };
  }

  // Token opaque servant à /api/prodigi-assets/[orderId]/[photoId] — généré une fois, réutilisé
  // aux tentatives suivantes (pas besoin d'en changer, il ne donne accès qu'aux photos DE CETTE
  // commande, déjà payée).
  let assetToken = orderMeta?.prodigiAssetToken;
  if (!assetToken) {
    assetToken = randomBytes(24).toString("hex");
    await prisma.$executeRaw`UPDATE "Order" SET "prodigiAssetToken" = ${assetToken} WHERE "id" = ${orderId}`;
  }

  const baseUrl = process.env.PRODIGI_API_BASE_URL || DEFAULT_BASE_URL;

  const buildPayload = () => ({
    recipient: {
      name: shippingAddress.name || order.customerName,
      email: order.customerEmail,
      phoneNumber: shippingAddress.phone || undefined,
      address: {
        line1: shippingAddress.line1,
        line2: shippingAddress.line2 || undefined,
        postalOrZipCode: shippingAddress.postalCode,
        townOrCity: shippingAddress.city,
        countryCode: shippingAddress.countryCode,
      },
    },
    // "Standard" : compromis délai/coût raisonnable par défaut chez Prodigi — pas encore de
    // choix de méthode d'envoi côté client dans PrintSelectionPanel (pourra être ajouté plus
    // tard si Adriel veut proposer un envoi express payant).
    shippingMethod: "Standard",
    idempotencyKey: order.id,
    metadata: { pixlehOrderId: order.id },
    items: prodigiItems.map((item) => ({
      merchantReference: item.orderItemId,
      sku: item.sku,
      copies: item.copies,
      attributes: item.attributes,
      assets: [{ printArea: "default", url: appUrl(`/api/prodigi-assets/${order.id}/${item.photoId}?token=${assetToken}`) }],
    })),
  });

  let payload = buildPayload();
  let lastData: any = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    lastData = data;
    lastStatus = res.status;

    if (res.ok && data && (data.outcome === "Created" || data.outcome === "CreatedWithIssues")) {
      const prodigiOrderId: string | undefined = data.order?.id;
      await prisma.$executeRaw`
        UPDATE "Order"
        SET "prodigiStatus" = 'SUBMITTED', "prodigiOrderId" = ${prodigiOrderId ?? null}, "prodigiError" = NULL
        WHERE "id" = ${orderId}
      `;
      return { submitted: true, prodigiOrderId };
    }

    if (attempt === 0 && data?.outcome === "ValidationFailed" && data?.failures) {
      const missingByIndex = extractMissingAttributesByItemIndex(data);
      if (Object.keys(missingByIndex).length > 0) {
        const nextItems = payload.items.map((it, idx) => {
          const missing = missingByIndex[idx];
          if (!missing) return it;
          const attributes = { ...it.attributes };
          for (const attr of missing) {
            if (attr.validValues?.[0]) attributes[attr.name] = attr.validValues[0];
          }
          return { ...it, attributes };
        });
        payload = { ...payload, items: nextItems };
        continue; // deuxième et dernière tentative avec ces attributs par défaut
      }
    }
    break;
  }

  const detail =
    lastData?.error?.message || lastData?.message || (lastData?.outcome ? `outcome: ${lastData.outcome}` : null);
  const error = `Prodigi a répondu ${lastStatus}${detail ? ` — ${detail}` : ""}${
    lastData ? ` (${JSON.stringify(lastData).slice(0, 500)})` : ""
  }`;
  await prisma.$executeRaw`UPDATE "Order" SET "prodigiStatus" = 'FAILED', "prodigiError" = ${error} WHERE "id" = ${orderId}`;
  return { submitted: false, error };
}
