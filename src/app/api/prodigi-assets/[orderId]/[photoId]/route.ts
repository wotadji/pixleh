import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/**
 * Sert le fichier ORIGINAL (haute résolution, nécessaire pour un tirage) d'une photo commandée,
 * à Prodigi — chantier "impression pixleh Phase 2" (01/08/2026, demande d'Adriel : "passons à la
 * phase 2"). Contrairement à /api/files/[...path] (miniatures/aperçus, réservé aux visiteurs de
 * la galerie via cookie de session), cette route est appelée serveur-à-serveur par Prodigi lui-
 * même quand il traite la commande soumise (voir src/lib/prodigiOrder.ts, assets[].url) : aucun
 * cookie de session n'est donc disponible, la protection repose sur `Order.prodigiAssetToken`
 * (token opaque généré à la première tentative de soumission) transmis en query string plutôt
 * que sur une authentification classique.
 *
 * Volontairement restreint : le token doit correspondre EXACTEMENT à celui de la commande, la
 * commande doit être payée (PAID/FULFILLED — jamais PENDING/CANCELLED/REFUNDED), et la photo
 * demandée doit réellement faire partie d'un OrderItem de cette commande (empêche de réutiliser
 * un token valide pour récupérer une photo qui n'a jamais été commandée).
 *
 * Limite connue : sert le fichier tel quel avec un Content-Type déduit de l'extension — les
 * formats HEIC/HEIF/TIFF (acceptés à l'upload, voir photoUpload.ts) ne sont pas convertis ici ;
 * si Prodigi ne sait pas traiter un de ces formats pour un SKU donné, la soumission échouera
 * côté Prodigi et remontera dans Order.prodigiError (voir /admin/orders).
 */
export async function GET(
  req: Request,
  { params }: { params: { orderId: string; photoId: string } }
) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 403 });
  }

  // Order.prodigiAssetToken n'existe pas encore dans le Prisma Client généré du sandbox (voir
  // tâche #254) — même workaround $queryRaw que le reste du catalogue impression.
  const [order] = await prisma.$queryRaw<
    Array<{ id: string; status: string; prodigiAssetToken: string | null }>
  >`SELECT "id", "status", "prodigiAssetToken" FROM "Order" WHERE "id" = ${params.orderId}`;

  if (!order || !order.prodigiAssetToken || order.prodigiAssetToken !== token) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (order.status !== "PAID" && order.status !== "FULFILLED") {
    return NextResponse.json({ error: "Commande non payée" }, { status: 403 });
  }

  const item = await prisma.orderItem.findFirst({
    where: { orderId: order.id, photoId: params.photoId },
  });
  if (!item) {
    return NextResponse.json({ error: "Photo introuvable pour cette commande" }, { status: 404 });
  }

  const photo = await prisma.photo.findUnique({ where: { id: params.photoId } });
  if (!photo) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  try {
    const storage = getStorage();
    const buffer = await storage.get(photo.storageKey);
    const ext = photo.filename.split(".").pop()?.toLowerCase() || "jpg";
    const contentType = EXT_TO_MIME[ext] || "image/jpeg";

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
  }
}
