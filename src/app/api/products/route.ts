import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { productSchema } from "@/lib/validators";

export async function GET() {
  try {
    const session = await requireStudioSession();
    const products = await prisma.product.findMany({
      where: { studioId: session.user.studioId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ products });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    // Les produits d'impression (PRINT) ne sont plus créables par un studio depuis le
    // 31/07/2026 (chantier "impression pixleh/Prodigi", demande d'Adriel) — ils vivent
    // désormais uniquement dans le catalogue plateforme (/admin/print-catalog, voir
    // src/lib/printCatalog.ts), pour que pixleh en garde la main sur le fulfillment ET la
    // marge. Défense en profondeur : l'UI (dashboard/store/products) ne propose déjà plus ce
    // type dans son sélecteur, ceci bloque aussi un appel API direct.
    if (parsed.data.type === "PRINT") {
      throw new AccessError(
        "Les produits d'impression sont désormais gérés par pixleh, pas par le studio.",
        403
      );
    }
    const product = await prisma.product.create({
      data: { studioId: session.user.studioId, ...parsed.data },
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
