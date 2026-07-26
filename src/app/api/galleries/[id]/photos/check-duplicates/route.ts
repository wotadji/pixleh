import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/**
 * Vérifie, AVANT l'upload effectif, lesquels des hashs fournis correspondent à des photos
 * déjà présentes dans cette galerie (voir Photo.contentHash) — permet au panel studio
 * d'afficher un choix (ignorer / écraser / conserver les deux) avant de lancer l'envoi,
 * plutôt que de découvrir les doublons après coup. Les hashs sont calculés côté client
 * (Web Crypto SHA-256, voir sha256Hex dans GalleryManager.tsx) pour éviter d'envoyer les
 * fichiers une première fois juste pour vérifier — le serveur re-calcule de toute façon le
 * hash de chaque fichier au moment de l'upload réel (POST /api/galleries/[id]/photos), un
 * hash annoncé ici n'est donc jamais utilisé pour autre chose qu'un aperçu de l'UI.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json().catch(() => ({}));
    const hashes: string[] = Array.isArray(body.hashes)
      ? body.hashes.filter((h: unknown): h is string => typeof h === "string" && h.length > 0)
      : [];
    if (hashes.length === 0) {
      return NextResponse.json({ duplicates: [] });
    }

    const rows = await prisma.photo.findMany({
      where: { galleryId: gallery.id, contentHash: { in: hashes } },
      select: { contentHash: true },
    });
    const duplicates = Array.from(new Set(rows.map((r) => r.contentHash).filter((h): h is string => !!h)));

    return NextResponse.json({ duplicates });
  } catch (e) {
    return handleApiError(e);
  }
}
