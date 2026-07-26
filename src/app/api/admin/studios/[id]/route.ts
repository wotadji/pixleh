import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";

/** Fiche détaillée d'un studio, pour le mode support de l'admin plateforme. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const studio = await prisma.studio.findUnique({
      where: { id: params.id },
      include: {
        users: { orderBy: { role: "asc" } },
        plan: true,
        _count: {
          select: { galleries: true, clients: true, orders: true, bookings: true, contracts: true, invoices: true },
        },
      },
    });
    if (!studio) throw new AccessError("Studio introuvable.", 404);
    return NextResponse.json({ studio });
  } catch (e) {
    return handleApiError(e);
  }
}

const studioAdminUpdateSchema = z.object({
  planId: z.string().optional().nullable(),
});

/**
 * Rattache manuellement un studio à un plan depuis l'admin — utile pour offrir un plan
 * gratuitement, corriger un abonnement resté bloqué côté Stripe, etc. Ne touche PAS à
 * Stripe (pas de création/annulation d'abonnement ici) : c'est une affectation directe côté
 * pixleh, voir /api/webhooks/stripe pour la voie normale (souscription payante par le studio).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = studioAdminUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.studio.findUnique({ where: { id: params.id } });
    if (!existing) throw new AccessError("Studio introuvable.", 404);

    if (parsed.data.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
      if (!plan) throw new AccessError("Plan introuvable.", 404);
    }

    const studio = await prisma.studio.update({
      where: { id: params.id },
      data: { planId: parsed.data.planId ?? null },
      include: { plan: true },
    });
    return NextResponse.json({ studio });
  } catch (e) {
    return handleApiError(e);
  }
}
