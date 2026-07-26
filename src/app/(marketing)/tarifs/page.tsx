import { prisma } from "@/lib/prisma";
import { getLiveFeatureKeys } from "@/lib/platformFeatures";
import { buildPlanFeatureList } from "@/lib/pricingDisplay";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingBlockRenderer } from "@/components/marketing/MarketingBlockRenderer";
import { PricingGrid, type PricingPlanItem } from "@/components/marketing/PricingGrid";
import { getPageBlocksSplit } from "@/lib/marketingBlocksQuery";
import { firstBlockIsFullBleedHero } from "@/lib/marketingBlocks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tarifs — pixleh" };

/**
 * Page tarifs publique — [S2] tâche #128. Lit directement les Plan actifs configurés par
 * Adriel depuis /admin/plans : aucun prix codé en dur ici, tout vient de la base. Le plan
 * "recommandé" est celui juste après le plan gratuit (même logique que Pixieset qui met en
 * avant un plan intermédiaire, pas le premier ni le dernier). L'en-tête (titre/texte
 * d'intro) vient des blocs éditables /admin/site — seule la grille de plans reste pilotée
 * par la base des Plan, pas par un bloc.
 */
export default async function TarifsPage() {
  const [{ before, own, after }, plans, liveFeatures] = await Promise.all([
    getPageBlocksSplit("TARIFS"),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getLiveFeatureKeys(),
  ]);

  const featuredIndex = plans.findIndex((p) => !p.isFree);
  const items: PricingPlanItem[] = plans.map((plan, i) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceMonthlyCents: plan.priceMonthlyCents,
    priceAnnualCents: plan.priceAnnualCents,
    isFree: plan.isFree,
    featured: i === featuredIndex,
    features: buildPlanFeatureList(plan, liveFeatures),
  }));

  return (
    <main>
      <MarketingHeader transparent={firstBlockIsFullBleedHero([...before, ...own])} />

      {before.map((block) => (
        <MarketingBlockRenderer key={block.id} block={block} />
      ))}

      {own.map((block) => (
        <MarketingBlockRenderer key={block.id} block={block} />
      ))}

      <section className="mx-auto max-w-6xl px-6 py-16">
        {items.length === 0 ? (
          <p className="text-center text-sm text-gray-500">
            Aucun plan disponible pour le moment.
          </p>
        ) : (
          <PricingGrid plans={items} />
        )}
      </section>

      {after.map((block) => (
        <MarketingBlockRenderer key={block.id} block={block} />
      ))}

      <MarketingFooter />
    </main>
  );
}
