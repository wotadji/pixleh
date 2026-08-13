import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, handleApiError } from "@/lib/access";
import { assertGalleryQuota } from "@/lib/quotas";
import { gallerySchema } from "@/lib/validators";
import { slugify, randomSuffix } from "@/lib/slug";
import type { SetVisibility } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireStudioSession();
    const galleries = await prisma.gallery.findMany({
      where: { studioId: session.user.studioId },
      orderBy: { createdAt: "desc" },
      include: { client: true, _count: { select: { photos: true } } },
    });
    return NextResponse.json({ galleries });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    // [S2] Tâche #127 — refuse la création si le studio est déjà au nombre maximal de
    // galeries autorisé par son plan (voir src/lib/quotas.ts, appliqué à tous les forfaits).
    await assertGalleryQuota(session.user.studioId);

    const body = await req.json();
    const parsed = gallerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    let slug = slugify(data.title);
    const existing = await prisma.gallery.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${randomSuffix(5)}`;

    // Second lien, distinct de `slug`, pour l'accès "invité" (voir /invite/[guestSlug]) —
    // généré tout de suite pour que le lien soit disponible dès la création de la galerie,
    // pas de bouton "générer" séparé à prévoir côté dashboard.
    const guestSlug = `${slug}-${randomSuffix(8)}`;

    const gallery = await prisma.gallery.create({
      data: {
        studioId: session.user.studioId,
        title: data.title,
        slug,
        guestSlug,
        clientId: data.clientId || null,
        password: data.password || null,
        allowDownload: data.allowDownload ?? true,
        downloadLimit: data.downloadLimit ?? null,
        allowFavorites: data.allowFavorites ?? true,
        showWatermark: data.showWatermark ?? true,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        categoryTag: data.categoryTag || null,
        // PORTFOLIO n'est plus une option ici (retiré du formulaire "Visible par") : la
        // visibilité portfolio est désormais gouvernée uniquement par le set "Portfolio"
        // dédié créé juste en dessous, activable indépendamment.
        defaultVisibility: (
          data.defaultVisibility?.length ? data.defaultVisibility : (["CLIENT"] as SetVisibility[])
        ).filter((v) => v !== "PORTFOLIO"),
        status: "DRAFT",
        // Set "Portfolio" par défaut, présent sur toute nouvelle galerie — inactif au
        // départ (visibility: []), le studio l'active depuis l'onglet Sets pour que les
        // photos qui y sont rangées apparaissent sur son profil public (/s/[slug]). Évite
        // au studio de devoir créer ce set manuellement à chaque fois.
        collections: {
          create: [{ title: "Portfolio", position: 0, isPortfolioDefault: true, visibility: [] }],
        },
      },
    });

    // Set "Réseaux sociaux" par défaut, présent sur toute nouvelle galerie au même titre que
    // "Portfolio" ci-dessus (12/08/2026, demande d'Adriel) — dossier de curation privé, sans
    // visibilité publique (visibility: [], jamais affiché sur pixleh.com), qui sert seulement
    // de point de départ au bouton Partager de GalleryManager. $executeRaw plutôt que l'API
    // Prisma typée : isSocialDefault est trop récent pour le Prisma Client généré du sandbox
    // (voir le commentaire sur ce champ dans schema.prisma), même limitation que
    // GalleryClientAccess ci-dessous.
    await prisma.$executeRaw`INSERT INTO "Collection" ("id", "galleryId", "title", "position", "visibility", "isPortfolioDefault", "isSocialDefault")
      VALUES (${randomUUID()}, ${gallery.id}, 'Réseaux sociaux', 1, ARRAY[]::"SetVisibility"[], false, true)`;

    // Clients additionnels (accès secondaire en lecture seule, voir modèle GalleryClientAccess
    // dans schema.prisma) — jamais le client principal, dédupliqués, et vérifiés comme
    // appartenant à ce studio avant insertion (on ne fait pas confiance à la liste d'ids
    // envoyée par le client). L'accès est créé tout de suite, mais l'email de notification
    // NE part PAS ici (demande d'Adriel, 05/08/2026 : "le send mail [...] doit se faire quand
    // on clique sur publier pas a la creation de la galerie") — il part uniquement à la
    // transition vers PUBLISHED, voir PATCH /api/galleries/[id], même moment que l'email du
    // client principal (sendGalleryReadyEmail).
    const additionalIds = Array.from(new Set(data.additionalClientIds || [])).filter(
      (id) => id && id !== data.clientId
    );
    if (additionalIds.length > 0) {
      const additionalClients = await prisma.client.findMany({
        where: { id: { in: additionalIds }, studioId: session.user.studioId },
        select: { id: true },
      });

      // $executeRaw plutôt qu'une API Prisma typée : le modèle GalleryClientAccess est trop
      // récent pour le Prisma Client généré du sandbox (voir commentaire sur ce modèle dans
      // schema.prisma) — même limitation que Gallery.publishedAt, tant qu'Adriel n'a pas
      // relancé `prisma generate && prisma db push` en local.
      for (const client of additionalClients) {
        await prisma.$executeRaw`INSERT INTO "GalleryClientAccess" ("id", "galleryId", "clientId", "createdAt")
          VALUES (${randomUUID()}, ${gallery.id}, ${client.id}, NOW())
          ON CONFLICT ("galleryId", "clientId") DO NOTHING`;
      }
    }

    // Sans ça, la page /dashboard/galleries (Server Component) reste sur la version qu'elle
    // avait en cache côté client (Next.js Router Cache) : après création, l'utilisateur est
    // redirigé vers la nouvelle galerie, mais s'il revient ensuite sur "Galeries" via un
    // <Link>, il pouvait voir l'ancienne liste (sans la galerie qu'il vient de créer) tant
    // qu'il ne rechargeait pas la page manuellement. `revalidatePath` invalide ce cache pour
    // que la prochaine visite de cette page aille rechercher les données à jour.
    revalidatePath("/dashboard/galleries");

    return NextResponse.json({ gallery }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
