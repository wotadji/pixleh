import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { platformFeatureToggleSchema } from "@/lib/validators";

/** Bascule une fonctionnalité plateforme on/off, identifiée par sa clé stable (voir key). */
export async function PATCH(req: Request, { params }: { params: { key: string } }) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = platformFeatureToggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.platformFeature.findUnique({ where: { key: params.key } });
    if (!existing) throw new AccessError("Fonctionnalité introuvable.", 404);

    const feature = await prisma.platformFeature.update({
      where: { key: params.key },
      data: { enabled: parsed.data.enabled },
    });
    return NextResponse.json({ feature });
  } catch (e) {
    return handleApiError(e);
  }
}
