import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError } from "@/lib/access";

/** Liste toutes les fonctionnalités de la plateforme (voir /admin/features). */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const features = await prisma.platformFeature.findMany({ orderBy: { label: "asc" } });
    return NextResponse.json({ features });
  } catch (e) {
    return handleApiError(e);
  }
}
