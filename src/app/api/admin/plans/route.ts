import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { planSchema } from "@/lib/validators";
import { syncPlanWithStripe } from "@/lib/stripePlanSync";

/** Liste tous les plans, y compris désactivés (le panel admin doit pouvoir les réactiver). */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json({ plans });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = planSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const slugTaken = await prisma.plan.findUnique({ where: { slug: parsed.data.slug } });
    if (slugTaken) {
      throw new AccessError("Un plan avec ce slug existe déjà.", 409);
    }

    const plan = await prisma.plan.create({ data: parsed.data });

    // Synchronisation Stripe best-effort : un plan reste utilisable côté pixleh (quotas,
    // page tarifs) même si Stripe n'est pas encore configuré ou si l'appel échoue — voir
    // syncPlanWithStripe. Le panel admin affiche l'état de synchronisation.
    const sync = await syncPlanWithStripe(plan, { forceNewPrices: true });
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

    return NextResponse.json({ plan: updated, stripeSync: sync }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
