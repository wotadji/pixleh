import { redirect, notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStudioSession } from "@/lib/access";
import { getGallerySession } from "@/lib/gallery-session";
import { getActivePrintCatalog, getPrintCatalogVariants } from "@/lib/printCatalog";
import { PrintSelectionPageView } from "@/components/gallery/PrintSelectionPageView";

export const dynamic = "force-dynamic";

/** Parse un champ JSON stocké en texte, sans jamais planter le rendu de la page sur une valeur
 * absente/invalide (null, chaîne vide, JSON malformé...). */
function parseJsonRecord<T extends object>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Comme parseJsonRecord, mais retourne null (pas {}) sur absence/erreur — pour
 * Selection.selectedAttributes, où "aucune valeur" doit rester distinct de "objet vide". */
function parseSelectedAttributes(json: string | null | undefined): Record<string, string> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Page dédiée "Sélection impression" — chantier du 01/08/2026, demande d'Adriel : "quand on
 * clique sur imprimante, il faut un target avec une page (tu es expert en design et ux propose
 * moi une page professionnel)". Remplace l'ancienne modale (PrintSelectionPanel, superposée à
 * la galerie) : le bouton imprimante de la barre du haut (voir GalleryView.tsx) ouvre désormais
 * cette page dans un nouvel onglet (target="_blank").
 *
 * Récupère indépendamment ses propres données (comme /g/[gallerySlug]/page.tsx) plutôt que de
 * recevoir un state partagé — la sélection impression est de toute façon déjà persistée en base
 * (Selection type PRINT), donc cette page peut être ouverte/rechargée sans dépendre du state
 * React de la page galerie d'où on vient.
 */
export default async function PrintSelectionPage({ params }: { params: { gallerySlug: string } }) {
  const gallery = await prisma.gallery.findUnique({
    where: { slug: params.gallerySlug },
    include: { studio: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  });
  if (!gallery || gallery.status === "DRAFT") notFound();

  // Même détection de session que l'écran de choix (voir /g/[gallerySlug]/page.tsx) — mais SANS
  // le mode invité : la sélection impression n'a jamais été proposée aux invités (printProducts
  // vide côté page galerie), donc rien à faire ici pour eux non plus. Sans session valide, on
  // renvoie vers le lien de galerie normal, qui affichera l'écran de choix/mot de passe.
  const studioSession = await getStudioSession();
  const asStudio = Boolean(studioSession && studioSession.user.studioId === gallery.studioId);
  let clientRef: string | undefined;

  if (!asStudio) {
    const clientSession = getGallerySession(gallery.slug);
    if (clientSession && clientSession.galleryId === gallery.id) {
      clientRef = clientSession.clientRef;
    } else {
      redirect(`/g/${gallery.slug}`);
    }
  }

  const printSelections = await prisma.selection.findMany({
    where: { galleryId: gallery.id, type: "PRINT", clientRef: asStudio ? undefined : clientRef },
  });

  const photos = printSelections.length
    ? await prisma.photo.findMany({ where: { id: { in: printSelections.map((s) => s.photoId) } } })
    : [];
  const productByPhotoId = new Map(printSelections.map((s) => [s.photoId, s.productId]));

  // Selection.selectedAttributes/borderType n'existent pas encore dans le Prisma Client généré
  // du sandbox (tâche #254) — chantiers "sélection d'attribut au moment de l'achat" et "type de
  // bordure" (02/08/2026, demande d'Adriel), lus séparément via $queryRaw, même workaround que
  // le reste du catalogue impression. borderType est un choix LOCAL (voir doc
  // Product.borderOptionEnabled dans schema.prisma) : lu ici uniquement pour préremplir
  // ProductOptionsModal si le client rouvre le sélecteur d'un produit déjà assigné, jamais
  // transmis à Prodigi.
  const attributeRows = printSelections.length
    ? await prisma.$queryRaw<Array<{ photoId: string; selectedAttributes: string | null; borderType: string | null }>>`
        SELECT "photoId", "selectedAttributes", "borderType" FROM "Selection"
        WHERE "id" IN (${Prisma.join(printSelections.map((s) => s.id))})
      `
    : [];
  const attributesByPhotoId = new Map(attributeRows.map((r) => [r.photoId, r.selectedAttributes]));
  const borderTypeByPhotoId = new Map(attributeRows.map((r) => [r.photoId, r.borderType]));

  const printProducts = await getActivePrintCatalog();

  // Variantes (taille/SKU) des produits-GROUPES du catalogue — chantier "groupe de produits"
  // (02/08/2026, demande d'Adriel : "peux tu ajouter la possibilité de creer un groupe de
  // produit et a l'intérieur ajouter les SKU adéquat ?"). Chargées séparément (voir
  // getPrintCatalogVariants) et attachées à leur groupe parent ci-dessous : le client choisit
  // sa taille dans VariantSelectionModal (PrintSelectionPageView.tsx) avant assignation.
  const groupIds = printProducts.filter((p) => p.isProductGroup).map((p) => p.id);
  const variants = await getPrintCatalogVariants(groupIds);
  const variantsByGroupId = new Map<string, typeof variants>();
  for (const v of variants) {
    if (!v.groupId) continue;
    const list = variantsByGroupId.get(v.groupId) ?? [];
    list.push(v);
    variantsByGroupId.set(v.groupId, list);
  }

  return (
    <PrintSelectionPageView
      gallerySlug={gallery.slug}
      galleryId={gallery.id}
      galleryTitle={gallery.title}
      studioName={gallery.studio.name}
      studioLogoUrl={gallery.studio.logoUrl}
      photos={photos.map((p) => ({
        id: p.id,
        filename: p.filename,
        thumbUrl: `/api/files/studios/${gallery.studioId}/galleries/${gallery.id}/${p.id}/thumb.jpg?v=${p.updatedAt.getTime()}`,
        previewUrl: `/api/files/studios/${gallery.studioId}/galleries/${gallery.id}/${p.id}/preview.jpg?v=${p.updatedAt.getTime()}`,
        productId: productByPhotoId.get(p.id) ?? null,
        selectedAttributes: parseSelectedAttributes(attributesByPhotoId.get(p.id)),
        borderType: borderTypeByPhotoId.get(p.id) ?? null,
      }))}
      printProducts={printProducts.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        imageUrl: p.imageUrl,
        attributeOptions: parseJsonRecord<Record<string, string[]>>(p.prodigiAttributeOptions, {}),
        borderOptionEnabled: p.borderOptionEnabled,
        hasFrame: p.hasFrame,
        translations: parseJsonRecord<Record<string, { name?: string; description?: string }>>(
          p.translations,
          {}
        ),
        variants: p.isProductGroup
          ? (variantsByGroupId.get(p.id) ?? []).map((v) => ({
              id: v.id,
              name: v.name,
              description: v.description,
              priceCents: v.priceCents,
              currency: v.currency,
              imageUrl: v.imageUrl,
              attributeOptions: parseJsonRecord<Record<string, string[]>>(v.prodigiAttributeOptions, {}),
              borderOptionEnabled: v.borderOptionEnabled,
              hasFrame: v.hasFrame,
              translations: parseJsonRecord<Record<string, { name?: string; description?: string }>>(
                v.translations,
                {}
              ),
            }))
          : undefined,
      }))}
    />
  );
}
