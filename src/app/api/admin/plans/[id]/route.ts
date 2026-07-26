import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { planSchema } from "@/lib/validators";
import { syncPlanWithStripe } from "@/lib/stripePlanSync";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = planSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.plan.findUnique({ where: { id: params.id } });
    if (!existing) throw new AccessError("Plan introuvable.", 404);

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugTaken = await prisma.plan.findUnique({ where: { slug: parsed.data.slug } });
      if (slugTaken) throw new AccessError("Un plan avec ce slug existe déjà.", 409);
    }

    const plan = await prisma.plan.update({ where: { id: params.id }, data: parsed.data });

    // Ne recrée de nouveaux Price Stripe QUE si le tarif a réellement changé (les Price
    // Stripe sont immuables — en créer un à chaque sauvegarde, même pour un simple
    // changement de libellé, polluerait le tableau de bord Stripe sans raison).
    const priceChanged =
      existing.priceMonthlyCents !== plan.priceMonthlyCents ||
      existing.priceAnnualCents !== plan.priceAnnualCents;
    const sync = await syncPlanWithStripe(plan, { forceNewPrices: priceChanged });
    const updated = sync.synced
      ? await prisma.plan.update({
          where: { id: plan.id },
          data: {
            stripeProductId: sync.stripeProductId,
            stripePriceIdMonthly: sync.stripePriceIdMonthly,
            stripePriceIdAnnual: sync.stripePriceIdAnnual,
          },
        })
      : plan;

    return NextResponse.json({ plan: updated, stripeSync: sync });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Suppression réelle uniquement si aucun Studio n'est actuellement sur ce plan (sinon ces
 * Studios se retrouveraient avec un planId pointant sur rien) — dans ce cas, on invite à
 * désactiver le plan (`active: false`) plutôt qu'à le supprimer, ce qui le retire de la
 * page tarifs publique sans rien casser pour les abonnés existants.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const studiosOnPlan = await prisma.studio.count({ where: { planId: params.id } });
    if (studiosOnPlan > 0) {
      throw new AccessError(
        `${studiosOnPlan} studio(s) sont actuellement sur ce plan — désactivez-le plutôt que de le supprimer.`,
        409
      );
    }
    await prisma.plan.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
