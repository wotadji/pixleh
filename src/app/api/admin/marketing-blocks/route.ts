import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { marketingBlockSchema } from "@/lib/validators";

const PAGE_KEYS = ["HOME", "EXEMPLES", "TARIFS", "A_PROPOS"] as const;

/** Liste les blocs d'une page marketing (?page=HOME), triés par position. */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page");
    if (!page || !PAGE_KEYS.includes(page as (typeof PAGE_KEYS)[number])) {
      throw new AccessError("Paramètre ?page= manquant ou invalide.", 400);
    }
    const blocks = await prisma.marketingBlock.findMany({
      where: { page: page as (typeof PAGE_KEYS)[number] },
      orderBy: { position: "asc" },
    });
    return NextResponse.json({ blocks });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Crée un nouveau bloc, ajouté en dernière position de sa page. */
export async function POST(req: Request) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = marketingBlockSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const last = await prisma.marketingBlock.findFirst({
      where: { page: parsed.data.page },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const block = await prisma.marketingBlock.create({
      data: {
        page: parsed.data.page,
        type: parsed.data.type,
        active: parsed.data.active ?? true,
        data: parsed.data.data,
        position: (last?.position ?? -1) + 1,
      },
    });
    return NextResponse.json({ block }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
