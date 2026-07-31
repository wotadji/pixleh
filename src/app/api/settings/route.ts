import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";

export async function GET() {
  try {
    const session = await requireStudioSession();
    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { settings: true, pages: { where: { slug: "", type: "HOME" } } },
    });

    // Champs de facturation (legalForm/siret/vatNumber/vatExempt/iban/bic/
    // invoiceLegalMentions/invoiceNumberPrefix, 31/07/2026, demande d'Adriel : Réglages >
    // Facturation) n'existent pas encore dans le Prisma Client généré du sandbox (voir
    // commentaire sur StudioSettings dans schema.prisma) — lus à part via $queryRaw et
    // fusionnés dans studio.settings, même workaround que les autres champs récents.
    let studioWithBilling = studio;
    if (studio?.settings) {
      const [billingRow] = await prisma.$queryRaw<
        {
          legalForm: string | null;
          siret: string | null;
          vatNumber: string | null;
          vatExempt: boolean;
          iban: string | null;
          bic: string | null;
          bankName: string | null;
          invoiceLegalMentions: string | null;
          invoiceNumberPrefix: string | null;
        }[]
      >`
        SELECT "legalForm", siret, "vatNumber", "vatExempt", iban, bic, "bankName", "invoiceLegalMentions", "invoiceNumberPrefix"
        FROM "StudioSettings" WHERE "studioId" = ${session.user.studioId}
      `;
      studioWithBilling = {
        ...studio,
        settings: {
          ...studio.settings,
          legalForm: billingRow?.legalForm ?? null,
          siret: billingRow?.siret ?? null,
          vatNumber: billingRow?.vatNumber ?? null,
          vatExempt: billingRow?.vatExempt ?? true,
          iban: billingRow?.iban ?? null,
          bic: billingRow?.bic ?? null,
          bankName: billingRow?.bankName ?? null,
          invoiceLegalMentions: billingRow?.invoiceLegalMentions ?? null,
          invoiceNumberPrefix: billingRow?.invoiceNumberPrefix ?? null,
        },
      } as typeof studio;
    }

    // session.user.name/email sont relus depuis la base à chaque session (voir auth.ts) :
    // pas besoin d'une requête séparée, ils sont déjà à jour.
    return NextResponse.json({
      studio: studioWithBilling,
      user: { name: session.user.name, email: session.user.email },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();

    const studio = await prisma.studio.update({
      where: { id: session.user.studioId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.brandColor !== undefined && { brandColor: body.brandColor }),
      },
    });

    // Bug corrigé : la branche `create` de cet upsert ne reprenait pas les valeurs reçues
    // dans `body` — si aucune ligne StudioSettings n'existait encore pour ce studio (premier
    // enregistrement), le texte/activation du filigrane tapés par l'utilisateur étaient
    // silencieusement ignorés (une ligne vide était créée avec les valeurs par défaut du
    // schéma). `update` et `create` doivent porter les mêmes champs.
    const settingsData = {
      ...(body.aboutTitle !== undefined && { aboutTitle: body.aboutTitle }),
      ...(body.aboutBody !== undefined && { aboutBody: body.aboutBody }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      ...(body.contactPhone !== undefined && { contactPhone: body.contactPhone }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.instagramUrl !== undefined && { instagramUrl: body.instagramUrl }),
      ...(body.facebookUrl !== undefined && { facebookUrl: body.facebookUrl }),
      ...(body.watermarkText !== undefined && { watermarkText: body.watermarkText }),
      ...(body.watermarkEnabled !== undefined && { watermarkEnabled: body.watermarkEnabled }),
      ...(body.carouselSlides !== undefined && { carouselSlides: body.carouselSlides }),
    };
    const settings = await prisma.studioSettings.upsert({
      where: { studioId: session.user.studioId },
      update: settingsData,
      create: { studioId: session.user.studioId, ...settingsData },
    });

    // Champs de facturation (31/07/2026, Réglages > Facturation) n'existent pas encore dans le
    // Prisma Client généré du sandbox (voir commentaire sur StudioSettings dans schema.prisma)
    // — écrits à part via $executeRaw après l'upsert ci-dessus (qui garantit que la ligne
    // StudioSettings existe déjà, même si c'est le tout premier enregistrement), même
    // workaround que les autres champs récents (studioSignatureDataUrl, place...).
    if (body.legalForm !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET "legalForm" = ${body.legalForm} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.siret !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET siret = ${body.siret} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.vatNumber !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET "vatNumber" = ${body.vatNumber} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.vatExempt !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET "vatExempt" = ${Boolean(body.vatExempt)} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.iban !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET iban = ${body.iban} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.bic !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET bic = ${body.bic} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.bankName !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET "bankName" = ${body.bankName} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.invoiceLegalMentions !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET "invoiceLegalMentions" = ${body.invoiceLegalMentions} WHERE "studioId" = ${session.user.studioId}`;
    }
    if (body.invoiceNumberPrefix !== undefined) {
      await prisma.$executeRaw`UPDATE "StudioSettings" SET "invoiceNumberPrefix" = ${body.invoiceNumberPrefix} WHERE "studioId" = ${session.user.studioId}`;
    }

    if (body.heroTitle !== undefined || body.heroSubtitle !== undefined) {
      const existing = await prisma.page.findUnique({
        where: { studioId_slug: { studioId: session.user.studioId, slug: "" } },
      });
      const sections = [
        { type: "hero", title: body.heroTitle ?? "", subtitle: body.heroSubtitle ?? "" },
        { type: "gallery-grid" },
      ];
      if (existing) {
        await prisma.page.update({ where: { id: existing.id }, data: { sections } });
      } else {
        await prisma.page.create({
          data: { studioId: session.user.studioId, type: "HOME", slug: "", title: "Accueil", sections },
        });
      }
    }

    // Nom / email du COMPTE connecté (User) — distinct du nom du STUDIO (body.name,
    // géré plus haut) : le studio est l'entité affichée aux clients, l'utilisateur est
    // la personne qui se connecte au dashboard (utile notamment en équipe, où plusieurs
    // User peuvent partager un même Studio).
    let user: { name: string; email: string } | null = null;
    if (body.userName !== undefined || body.userEmail !== undefined) {
      const userData: { name?: string; email?: string } = {};
      if (body.userName !== undefined) {
        const name = String(body.userName).trim();
        if (!name) throw new AccessError("Le nom ne peut pas être vide.", 400);
        userData.name = name;
      }
      if (body.userEmail !== undefined) {
        const email = String(body.userEmail).toLowerCase().trim();
        if (!email) throw new AccessError("L'email ne peut pas être vide.", 400);
        if (email !== session.user.email) {
          const existing = await prisma.user.findUnique({ where: { email } });
          if (existing) throw new AccessError("Cet email est déjà utilisé par un autre compte.", 409);
        }
        userData.email = email;
      }
      user = await prisma.user.update({
        where: { id: session.user.id },
        data: userData,
        select: { name: true, email: true },
      });
    }

    return NextResponse.json({ studio, settings, user });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
