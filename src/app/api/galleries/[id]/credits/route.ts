import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/**
 * Crédits prestataires d'une galerie (voir modèle GalleryCredit dans schema.prisma) —
 * affichés en pied de galerie publique (onglet Présentation du panel studio, chantier
 * refonte Réglages du 12/09/2026). $queryRaw/$executeRaw plutôt que l'API Prisma typée :
 * ce modèle est trop récent pour le Prisma Client généré du sandbox (même limitation que
 * GalleryClientAccess, voir le commentaire sur ce modèle dans schema.prisma) — Adriel doit
 * lancer `prisma generate && prisma db push` localement avant que cette table soit utilisable
 * en production.
 */

async function assertGalleryOwnership(galleryId: string, studioId: string) {
  const gallery = await prisma.gallery.findFirst({ where: { id: galleryId, studioId } });
  if (!gallery) throw new AccessError("Galerie introuvable", 404);
  return gallery;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    await assertGalleryOwnership(params.id, session.user.studioId);

    const credits = await prisma.$queryRaw<
      { id: string; role: string; name: string; url: string | null }[]
    >`SELECT "id", "role", "name", "url" FROM "GalleryCredit" WHERE "galleryId" = ${params.id} ORDER BY "position" ASC`;
    return NextResponse.json({ credits });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    await assertGalleryOwnership(params.id, session.user.studioId);

    const body = await req.json();
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
    if (!role || !name) {
      return NextResponse.json({ error: "Rôle et nom requis" }, { status: 400 });
    }

    const last = await prisma.$queryRaw<{ position: number }[]>`
      SELECT "position" FROM "GalleryCredit" WHERE "galleryId" = ${params.id} ORDER BY "position" DESC LIMIT 1
    `;
    const nextPosition = (last[0]?.position ?? -1) + 1;
    const id = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "GalleryCredit" ("id", "galleryId", "role", "name", "url", "position", "createdAt")
      VALUES (${id}, ${params.id}, ${role}, ${name}, ${url}, ${nextPosition}, NOW())
    `;

    return NextResponse.json({ id, role, name, url }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    await assertGalleryOwnership(params.id, session.user.studioId);

    const { searchParams } = new URL(req.url);
    const creditId = searchParams.get("creditId");
    if (!creditId) {
      return NextResponse.json({ error: "creditId requis" }, { status: 400 });
    }

    await prisma.$executeRaw`DELETE FROM "GalleryCredit" WHERE "id" = ${creditId} AND "galleryId" = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
