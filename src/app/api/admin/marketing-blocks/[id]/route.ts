import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { marketingBlockSchema } from "@/lib/validators";
import { getStorage, buildMarketingBlockImageKey } from "@/lib/storage";

/** Modifie le contenu (`data`) et/ou la visibilité (`active`) d'un bloc — `page`/`type` ne
 * sont volontairement pas modifiables ici (voir doc du modèle MarketingBlock). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = marketingBlockSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.marketingBlock.findUnique({ where: { id: params.id } });
    if (!existing) throw new AccessError("Bloc introuvable.", 404);

    const block = await prisma.marketingBlock.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.data !== undefined && { data: parsed.data.data }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      },
    });
    return NextResponse.json({ block });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const existing = await prisma.marketingBlock.findUnique({ where: { id: params.id } });
    if (!existing) throw new AccessError("Bloc introuvable.", 404);

    await prisma.marketingBlock.delete({ where: { id: params.id } });
    // Best-effort : une image éventuellement uploadée ne doit pas rester orpheline sur le
    // stockage — jamais bloquant si elle n'existe pas ou si le storage est indisponible.
    await getStorage().delete(buildMarketingBlockImageKey(params.id)).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
