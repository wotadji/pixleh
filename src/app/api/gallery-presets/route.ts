import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, handleApiError } from "@/lib/access";
import { galleryDesignSchema } from "@/lib/validators";

/**
 * Presets de réglages "Présentation" réutilisables par le studio (voir modèle GalleryPreset
 * dans schema.prisma — "Réutiliser cette mise en scène ?" dans l'onglet Présentation, chantier
 * refonte Réglages du 12/09/2026). $queryRaw/$executeRaw plutôt que l'API Prisma typée : ce
 * modèle est trop récent pour le Prisma Client généré du sandbox (même limitation que
 * GalleryCredit/GalleryClientAccess) — Adriel doit lancer `prisma generate && prisma db push`
 * localement avant que cette table soit utilisable en production.
 */

export async function GET() {
  try {
    const session = await requireStudioSession();
    const presets = await prisma.$queryRaw<
      { id: string; name: string; design: unknown }[]
    >`SELECT "id", "name", "design" FROM "GalleryPreset" WHERE "studioId" = ${session.user.studioId} ORDER BY "createdAt" DESC`;
    return NextResponse.json({ presets });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Nom du preset requis" }, { status: 400 });
    }
    // On ne stocke que les clés reconnues du design (mêmes règles que le PATCH galerie),
    // pour éviter qu'un preset embarque des données inattendues.
    const parsed = galleryDesignSchema.partial().safeParse(body.design ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const id = randomUUID();
    const designJson = JSON.stringify(parsed.data);
    await prisma.$executeRaw`
      INSERT INTO "GalleryPreset" ("id", "studioId", "name", "design", "createdAt")
      VALUES (${id}, ${session.user.studioId}, ${name}, ${designJson}::jsonb, NOW())
    `;

    return NextResponse.json({ id, name, design: parsed.data }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireStudioSession();
    const { searchParams } = new URL(req.url);
    const presetId = searchParams.get("presetId");
    if (!presetId) {
      return NextResponse.json({ error: "presetId requis" }, { status: 400 });
    }
    await prisma.$executeRaw`DELETE FROM "GalleryPreset" WHERE "id" = ${presetId} AND "studioId" = ${session.user.studioId}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
