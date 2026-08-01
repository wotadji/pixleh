import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkGalleryOrGuestAccess } from "@/lib/access";

type SelectionType = "FAVORITE" | "PRINT";

function parseType(value: unknown): SelectionType {
  return value === "PRINT" ? "PRINT" : "FAVORITE";
}

/**
 * Ajoute une sélection : favori (proofing) par défaut, ou photo ajoutée au panier
 * "Sélection impression" de la galerie publique si `type: "PRINT"` — même mécanisme
 * (clientRef = session client), distingué par `type` (voir schema.prisma). Le panier
 * impression n'est pas soumis à `allowFavorites` : c'est une fonctionnalité indépendante,
 * seulement conditionnée par l'existence d'un tarif d'impression côté Boutique.
 */
export async function POST(req: Request) {
  const { galleryId, photoId, note, type: rawType, productId: rawProductId } = await req.json();
  const type = parseType(rawType);
  // Le service d'impression n'a de sens que pour le panier impression — jamais stocké sur
  // un favori, même si `productId` était présent par erreur dans la requête.
  const productId = type === "PRINT" && typeof rawProductId === "string" ? rawProductId : null;
  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId } });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });
  if (type === "FAVORITE" && !gallery.allowFavorites) {
    return NextResponse.json({ error: "Favoris désactivés" }, { status: 403 });
  }

  const access = await checkGalleryOrGuestAccess(gallery);
  if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const clientRef = access.clientRef || "anonymous";
  const selection = await prisma.selection.upsert({
    where: { photoId_clientRef_type: { photoId, clientRef, type } },
    update: { note, ...(productId !== null && { productId }) },
    create: { galleryId, photoId, clientRef, type, note, productId },
  });

  return NextResponse.json({ selection }, { status: 201 });
}

/**
 * Réassigne le service d'impression (`productId`) d'un lot de photos déjà présentes dans le
 * panier impression du visiteur courant — utilisé par le panneau "Sélection impression"
 * pour déplacer une sélection de photos d'un groupe (service) à un autre en un clic, plutôt
 * que de devoir les retirer puis les rajouter une par une.
 *
 * `productId: null` désassigne les photos (demande d'Adriel, 01/08/2026 : "je veux la
 * possibilité pour une image assigné de le rendre non-assigné") — remet le lot dans le groupe
 * "Service non assigné" plutôt que de forcer un choix parmi les produits existants.
 *
 * `attributes` (objet ou null) — chantier "sélection d'attribut au moment de l'achat"
 * (02/08/2026, demande d'Adriel : "je veux construire une vraie UI de sélection d'attribut au
 * moment de l'achat") : le choix du client (ex: {"wrap":"White"}) pour le produit assigné,
 * recueilli par AttributeSelectionModal avant d'appeler cette route. Écrit via $executeRaw
 * (colonne Selection.selectedAttributes pas encore dans le Prisma Client généré du sandbox,
 * tâche #254, même workaround que le reste du catalogue impression) au lieu de
 * prisma.selection.updateMany, qui ne connaît pas cette colonne.
 */
export async function PATCH(req: Request) {
  const { galleryId, photoIds, productId, attributes } = await req.json();
  const validProductId = productId === null || typeof productId === "string";
  const validAttributes = attributes === undefined || attributes === null || typeof attributes === "object";
  if (!galleryId || !Array.isArray(photoIds) || photoIds.length === 0 || !validProductId || !validAttributes) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId } });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryOrGuestAccess(gallery);
  if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const clientRef = access.clientRef || "anonymous";
  const attributesJson = attributes && Object.keys(attributes).length > 0 ? JSON.stringify(attributes) : null;
  await prisma.$executeRaw`
    UPDATE "Selection"
    SET "productId" = ${productId}, "selectedAttributes" = ${attributesJson}
    WHERE "galleryId" = ${galleryId} AND "clientRef" = ${clientRef} AND "type" = 'PRINT'
      AND "photoId" IN (${Prisma.join(photoIds)})
  `;

  return NextResponse.json({ ok: true });
}

/** Retire un favori, ou une photo du panier impression si `type=PRINT`. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const galleryId = searchParams.get("galleryId");
  const photoId = searchParams.get("photoId");
  const type = parseType(searchParams.get("type"));
  if (!galleryId || !photoId) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId } });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryOrGuestAccess(gallery);
  if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const clientRef = access.clientRef || "anonymous";
  await prisma.selection
    .delete({ where: { photoId_clientRef_type: { photoId, clientRef, type } } })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}

/** Liste les favoris (ou le panier impression si `type=PRINT`) du visiteur courant. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const galleryId = searchParams.get("galleryId");
  const type = parseType(searchParams.get("type"));
  if (!galleryId) return NextResponse.json({ error: "galleryId manquant" }, { status: 400 });

  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId } });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryOrGuestAccess(gallery);
  if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const selections = await prisma.selection.findMany({
    where: { galleryId, type, clientRef: access.asStudio ? undefined : access.clientRef },
  });
  return NextResponse.json({ selections });
}
