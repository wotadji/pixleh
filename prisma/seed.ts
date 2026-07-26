/**
 * Jeu de données de démonstration.
 * Lancer avec : npm run prisma:seed
 */
import { PrismaClient, ProductType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const studio = await prisma.studio.upsert({
    where: { slug: "demo-studio" },
    update: {},
    create: {
      name: "Studio Démo",
      slug: "demo-studio",
      brandColor: "#7c3aed",
      users: {
        create: {
          name: "Alex Photographe",
          email: "demo@pixistudio.local",
          passwordHash,
          role: "OWNER",
        },
      },
      settings: {
        create: {
          aboutTitle: "Bienvenue chez Studio Démo",
          aboutBody: "Photographe de mariage et portrait basé à Paris.",
          contactEmail: "contact@studio-demo.local",
          watermarkEnabled: true,
          watermarkText: "Studio Démo",
          galleryExpiryDays: 90,
        },
      },
      pages: {
        create: [
          {
            type: "HOME",
            slug: "",
            title: "Accueil",
            sections: [
              { type: "hero", title: "Studio Démo", subtitle: "Capturer vos moments" },
              { type: "gallery-grid" },
            ],
          },
        ],
      },
    },
  });

  await prisma.product.createMany({
    data: [
      {
        studioId: studio.id,
        type: ProductType.DIGITAL_DOWNLOAD,
        name: "Photo numérique HD",
        priceCents: 1500,
        active: true,
      },
      {
        studioId: studio.id,
        type: ProductType.PRINT,
        name: "Tirage 20x30",
        priceCents: 2500,
        active: true,
      },
      {
        studioId: studio.id,
        type: ProductType.PACKAGE,
        name: "Pack toutes les photos HD",
        priceCents: 19900,
        active: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seed terminé. Connexion : demo@pixistudio.local / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
