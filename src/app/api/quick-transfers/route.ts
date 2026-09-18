import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, handleApiError } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Durée de vie d'un Transfert rapide avant gel — voir le commentaire du modèle
 * QuickTransfer dans schema.prisma (choix d'Adriel le 18/09/2026 : "2 semaines"). */
const ACTIVE_DAYS = 14;

/**
 * Transferts rapides (voir modèle QuickTransfer et /dashboard/quick-transfers) —
 * $queryRaw/$executeRaw : modèle trop récent pour le Prisma Client généré du sandbox (voir
 * le commentaire du modèle dans schema.prisma).
 */

interface QuickTransferRow {
  id: string;
  slug: string;
  title: string | null;
  message: string | null;
  recipientEmail: string | null;
  status: "ACTIVE" | "FROZEN";
  createdAt: Date;
  expiresAt: Date;
  frozenAt: Date | null;
}

export async function GET() {
  try {
    const session = await requireStudioSession();
    const transfers = await prisma.$queryRaw<(QuickTransferRow & { fileCount: bigint; totalBytes: bigint | null })[]>`
      SELECT t.id, t.slug, t.title, t.message, t."recipientEmail", t.status, t."createdAt", t."expiresAt", t."frozenAt",
        COUNT(f.id) AS "fileCount", COALESCE(SUM(f."sizeBytes"), 0) AS "totalBytes"
      FROM "QuickTransfer" t
      LEFT JOIN "QuickTransferFile" f ON f."transferId" = t.id
      WHERE t."studioId" = ${session.user.studioId}
      GROUP BY t.id
      ORDER BY t."createdAt" DESC
    `;
    return NextResponse.json({
      transfers: transfers.map((t) => ({
        id: t.id,
        slug: t.slug,
        title: t.title,
        message: t.message,
        recipientEmail: t.recipientEmail,
        // Vérification dynamique en plus du statut stocké (voir le commentaire de
        // QuickTransferStatus) : au cas où la route cron n'aurait pas encore tourné.
        status: t.status === "FROZEN" || t.expiresAt < new Date() ? "FROZEN" : "ACTIVE",
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
        fileCount: Number(t.fileCount),
        totalBytes: Number(t.totalBytes ?? 0),
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : null;
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : null;
    const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim().slice(0, 200) : null;

    const id = randomUUID();
    const slug = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$executeRaw`
      INSERT INTO "QuickTransfer" ("id", "studioId", "slug", "title", "message", "recipientEmail", "status", "createdAt", "expiresAt")
      VALUES (${id}, ${session.user.studioId}, ${slug}, ${title}, ${message}, ${recipientEmail}, 'ACTIVE', ${now}, ${expiresAt})
    `;

    return NextResponse.json(
      { transfer: { id, slug, title, message, recipientEmail, status: "ACTIVE", createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(), fileCount: 0, totalBytes: 0 } },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}
