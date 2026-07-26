import { NextResponse } from "next/server";
import { getStorage, buildMarketingBlockImageKey } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sert l'image d'un bloc du site marketing, sans authentification : c'est un élément
 * public de pixleh.com au même titre que /api/studio-logo pour un studio. L'URL contient
 * un `?v=` posé à l'upload (cache-busting), donc un cache long "immutable" est sûr ici.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const slot = new URL(req.url).searchParams.get("slot") || "main";
    const buffer = await getStorage().get(buildMarketingBlockImageKey(params.id, slot));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  }
}
