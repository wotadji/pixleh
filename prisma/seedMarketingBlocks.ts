/**
 * Amorce le contenu des 4 pages marketing (Accueil, Exemples, Tarifs, À propos) avec des
 * blocs reproduisant ce qui était codé en dur avant l'introduction du CMS de blocs (voir
 * modèle MarketingBlock, /admin/site) — pour qu'aucune page ne se retrouve vide au premier
 * lancement, et qu'Adriel n'ait plus qu'à éditer depuis le panel admin ensuite.
 *
 * Idempotent PAR PAGE : n'insère les blocs par défaut d'une page que si elle n'en a encore
 * aucun. Si vous avez supprimé tous les blocs d'une page volontairement puis relancez ce
 * script, elle sera donc réamorcée — c'est le comportement voulu (comme pour
 * prisma/seedPlans.ts).
 *
 * Lancer avec : npm run prisma:seed-marketing
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const HOME_BLOCKS = [
  {
    type: "HERO",
    data: {
      eyebrow: "Plateforme pour photographes",
      title: "Pensé pour les photographes. Conçu pour faire grandir votre studio.",
      subtitle:
        "Galeries clients, boutique de tirages, réservation en ligne, contrats et site vitrine — tout ce qu'il faut pour gérer votre studio, réuni dans un seul outil.",
      ctaLabel: "Démarrer gratuitement",
      ctaHref: "/register",
      secondaryCtaLabel: "Voir des exemples",
      secondaryCtaHref: "/exemples",
      mediaType: "mockup",
    },
  },
  {
    type: "FEATURES",
    data: {
      eyebrow: "Tout-en-un",
      title: "Tout ce qu'il vous faut, au même endroit.",
      subtitle:
        "Une suite pensée pour couvrir chaque étape de votre activité — puissante seule, redoutable ensemble.",
      items: [
        {
          title: "Galerie client",
          desc: "Livrez vos photos dans de belles galeries privées : favoris, proofing, téléchargement HD, filigrane automatique.",
        },
        {
          title: "Boutique en ligne",
          desc: "Vendez tirages et téléchargements numériques directement depuis vos galeries, paiement sécurisé.",
        },
        {
          title: "Réservation & contrats",
          desc: "Vos clients réservent un créneau, signent leur contrat en ligne et reçoivent leur facture.",
        },
        {
          title: "Site vitrine",
          desc: "Un site portfolio professionnel avec votre propre nom de domaine, sans écrire une ligne de code.",
        },
      ],
    },
  },
  {
    type: "CATEGORIES",
    data: {
      eyebrow: "Pour chaque style",
      title: "Fait pour tous les photographes.",
      subtitle: "Du mariage au voyage en passant par le portrait, pixleh s'adapte à votre façon de travailler.",
      items: ["Mariage", "Portrait", "Famille", "Nouveau-né", "Événements", "Corporate", "Voyage", "Sport"],
    },
  },
  {
    type: "CTA",
    data: {
      title: "Commencez à utiliser pixleh dès aujourd'hui",
      subtitle: "Gratuit pour toujours. Passez à un plan supérieur quand vous en aurez besoin.",
      ctaLabel: "Démarrer gratuitement",
      ctaHref: "/register",
      showVisual: true,
    },
  },
];

const EXEMPLES_BLOCKS = [
  {
    type: "HERO",
    data: {
      eyebrow: "Exemples",
      title: "Ce que les studios créent avec pixleh",
      subtitle: "Une sélection des dernières galeries publiées par des studios utilisant pixleh.",
      mediaType: "none",
    },
  },
  {
    type: "CTA",
    data: {
      title: "Envie du même résultat pour votre studio ?",
      subtitle: "Créez votre studio pixleh et publiez vos propres galeries en quelques minutes.",
      ctaLabel: "Démarrer gratuitement",
      ctaHref: "/register",
      showVisual: true,
    },
  },
];

const TARIFS_BLOCKS = [
  {
    type: "HERO",
    data: {
      eyebrow: "Tarifs",
      title: "Commencez gratuitement, évoluez à votre rythme.",
      subtitle:
        "Tous les plans incluent un compte gratuit pour découvrir pixleh. Changez ou annulez à tout moment.",
      mediaType: "none",
    },
  },
  {
    type: "CTA",
    data: {
      title: "Prêt à essayer pixleh ?",
      subtitle: "Aucune carte bancaire requise pour démarrer.",
      ctaLabel: "Créer mon studio",
      ctaHref: "/register",
      showVisual: true,
    },
  },
];

const A_PROPOS_BLOCKS = [
  {
    type: "RICH_TEXT",
    data: {
      eyebrow: "À propos",
      title:
        "Une plateforme pensée pour que vous passiez moins de temps sur l'administratif, et plus derrière l'objectif.",
      body: [
        "Un studio de photographie ne se limite jamais à la prise de vue. Il faut aussi livrer les photos, encaisser les commandes, faire signer un contrat, relancer un client, tenir un site à jour. Chacune de ces étapes existe généralement dans un outil différent — et c'est ce cloisonnement que pixleh a été conçu pour supprimer.",
        "pixleh réunit dans un seul espace ce qui, ailleurs, prendrait cinq abonnements différents : galeries clients avec proofing et téléchargement, boutique de tirages et de fichiers numériques, réservation en ligne, contrats à signature électronique, factures, et un site vitrine à votre image. L'idée n'est pas d'empiler des fonctionnalités, mais de faire en sorte qu'un photographe puisse gérer l'intégralité de son activité sans jongler entre plusieurs plateformes ni recopier les mêmes informations trois fois.",
        "pixleh est un produit jeune, développé activement — ce qui signifie deux choses. D'abord, que nous avançons vite : chaque retour d'un studio qui utilise la plateforme influence directement ce qui est construit ensuite. Ensuite, que nous préférons annoncer une fonctionnalité une fois qu'elle fonctionne réellement plutôt que de la promettre à l'avance.",
        "pixleh est édité par Groupe Lehwu. Nous avons construit cette plateforme parce que nous pensons que les outils du quotidien d'un photographe devraient être aussi soignés que son travail lui-même : rapides, fiables, et pensés pour la relation avec ses propres clients — pas seulement pour cocher une liste de fonctionnalités.",
      ].join("\n\n"),
      imagePosition: "none",
    },
  },
  {
    type: "CTA",
    data: {
      title: "Prêt à essayer pixleh ?",
      ctaLabel: "Créer mon studio",
      ctaHref: "/register",
      showVisual: false,
    },
  },
];

interface SeedBlock {
  type: string;
  data: Record<string, unknown>;
}

const PAGES: { page: "HOME" | "EXEMPLES" | "TARIFS" | "A_PROPOS"; blocks: SeedBlock[] }[] = [
  { page: "HOME", blocks: HOME_BLOCKS },
  { page: "EXEMPLES", blocks: EXEMPLES_BLOCKS },
  { page: "TARIFS", blocks: TARIFS_BLOCKS },
  { page: "A_PROPOS", blocks: A_PROPOS_BLOCKS },
];

async function main() {
  for (const { page, blocks } of PAGES) {
    const existing = await prisma.marketingBlock.count({ where: { page } });
    if (existing > 0) {
      console.log(`${page} : déjà ${existing} bloc(s), non réamorcée.`);
      continue;
    }
    for (let i = 0; i < blocks.length; i++) {
      await prisma.marketingBlock.create({
        data: {
          page,
          type: blocks[i].type as any,
          position: i,
          data: blocks[i].data as Prisma.InputJsonValue,
        },
      });
    }
    console.log(`${page} : ${blocks.length} bloc(s) créé(s).`);
  }
  console.log("Va sur /admin/site pour les modifier.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
