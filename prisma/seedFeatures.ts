/**
 * Amorce la table PlatformFeature à partir de la liste canonique dans
 * src/lib/platformFeatures.ts. Idempotent (upsert par key) : relançable sans écraser un
 * réglage `enabled` déjà modifié à la main depuis /admin/features — seuls label/description
 * sont resynchronisés, `enabled` n'est initialisé qu'à la création.
 *
 * Lancer avec : npm run prisma:seed-features
 */
import { PrismaClient } from "@prisma/client";
import { PLATFORM_FEATURES } from "../src/lib/platformFeatures";

const prisma = new PrismaClient();

async function main() {
  for (const feature of PLATFORM_FEATURES) {
    await prisma.platformFeature.upsert({
      where: { key: feature.key },
      update: { label: feature.label, description: feature.description },
      create: {
        key: feature.key,
        label: feature.label,
        description: feature.description,
        enabled: feature.defaultEnabled,
      },
    });
  }
  console.log(`${PLATFORM_FEATURES.length} fonctionnalités créées/synchronisées.`);
  console.log("Va sur /admin/features pour les activer au fur et à mesure du développement.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
