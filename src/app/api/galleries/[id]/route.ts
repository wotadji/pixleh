import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { gallerySchema } from "@/lib/validators";
import { sendGalleryReadyEmail, sendGalleryAdditionalAccessEmail } from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: {
        client: true,
        collections: { orderBy: { position: "asc" } },
        photos: { orderBy: { position: "asc" } },
        _count: { select: { photos: true, selections: true, orders: true } },
      },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);
    return NextResponse.json({ gallery });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { client: true },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json();
    const parsed = gallerySchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    // Le design est fusionné (et non remplacé) avec l'existant : chaque appel PATCH ne
    // porte en général qu'une seule clé modifiée (ex: juste `color`), pour un aperçu
    // "live" qui sauvegarde à chaque clic dans l'éditeur.
    const existingDesign =
      gallery.design && typeof gallery.design === "object" ? (gallery.design as object) : {};
    const mergedDesign = data.design ? { ...existingDesign, ...data.design } : undefined;

    // Les galeries créées avant l'ajout du lien invité n'ont pas encore de `guestSlug` —
    // on le génère paresseusement dès qu'on en a besoin (ex: premier affichage de l'onglet
    // Réglages), plutôt que de forcer une migration de données pour les galeries existantes.
    let guestSlug = gallery.guestSlug;
    if (!guestSlug && body.ensureGuestSlug) {
      const { slugify, randomSuffix } = await import("@/lib/slug");
      guestSlug = `${slugify(gallery.title) || "galerie"}-${randomSuffix(8)}`;
    }

    // Mise en avant sur l'accueil du site public (voir GalleriesListView) : au plus 3
    // galeries à la fois par studio — on ne bloque que le passage false → true, jamais le
    // retrait, sans quoi un studio à 3 galeries déjà mises en avant ne pourrait plus jamais
    // en désélectionner une.
    const FEATURED_HOME_MAX = 3;
    if (data.featuredHome === true && !gallery.featuredHome) {
      const featuredCount = await prisma.gallery.count({
        where: { studioId: session.user.studioId, featuredHome: true },
      });
      if (featuredCount >= FEATURED_HOME_MAX) {
        return NextResponse.json(
          {
            error: `Vous ne pouvez mettre en avant que ${FEATURED_HOME_MAX} galeries maximum sur la page d'accueil. Retirez-en une avant d'en ajouter une nouvelle.`,
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.gallery.update({
      where: { id: gallery.id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.clientId !== undefined && { clientId: data.clientId }),
        ...(data.password !== undefined && { password: data.password || null }),
        ...(data.allowDownload !== undefined && { allowDownload: data.allowDownload }),
        ...(data.downloadLimit !== undefined && { downloadLimit: data.downloadLimit }),
        ...(data.allowGuestDownload !== undefined && { allowGuestDownload: data.allowGuestDownload }),
        ...(data.requireGuestApproval !== undefined && {
          requireGuestApproval: data.requireGuestApproval,
        }),
        ...(guestSlug !== gallery.guestSlug && { guestSlug }),
        ...(data.allowFavorites !== undefined && { allowFavorites: data.allowFavorites }),
        ...(data.showWatermark !== undefined && { showWatermark: data.showWatermark }),
        ...(data.expiresAt !== undefined && {
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        }),
        ...(data.eventDate !== undefined && {
          eventDate: data.eventDate ? new Date(data.eventDate) : null,
        }),
        ...(data.coverPhotoId !== undefined && { coverPhotoId: data.coverPhotoId }),
        ...(mergedDesign !== undefined && { design: mergedDesign }),
        ...(data.categoryTag !== undefined && { categoryTag: data.categoryTag || null }),
        ...(data.starred !== undefined && { starred: data.starred }),
        ...(data.featuredHome !== undefined && { featuredHome: data.featuredHome }),
        ...(data.photoSortOrder !== undefined && { photoSortOrder: data.photoSortOrder }),
        ...(data.defaultVisibility !== undefined && { defaultVisibility: data.defaultVisibility }),
        ...(body.status && { status: body.status }),
      },
    });

    // Clients additionnels (accès secondaire en lecture seule, voir modèle GalleryClientAccess
    // dans schema.prisma) — éditable depuis l'onglet Réglages après création (demandé par
    // Adriel le 11/08/2026), pas seulement à la création de la galerie (voir POST
    // /api/galleries). On calcule un diff (ajouts/retraits) plutôt que de tout supprimer puis
    // tout réinsérer, pour ne pas perdre `createdAt` sur les accès inchangés.
    let newlyAddedClients: { id: string; name: string; email: string }[] = [];
    if (data.additionalClientIds !== undefined) {
      const effectiveClientId = data.clientId !== undefined ? data.clientId : gallery.clientId;
      const requestedIds = Array.from(new Set(data.additionalClientIds)).filter(
        (id) => id && id !== effectiveClientId
      );
      // On ne fait pas confiance à la liste d'ids envoyée par le client : seuls les clients
      // appartenant réellement à ce studio sont retenus.
      const validClients = requestedIds.length
        ? await prisma.client.findMany({
            where: { id: { in: requestedIds }, studioId: session.user.studioId },
            select: { id: true, name: true, email: true },
          })
        : [];
      const validClientsById = new Map(validClients.map((c) => [c.id, c]));

      // $queryRaw/$executeRaw plutôt que l'API Prisma typée : GalleryClientAccess est trop
      // récent pour le Prisma Client généré du sandbox (voir le commentaire sur ce modèle
      // dans schema.prisma) — même limitation que Gallery.publishedAt plus bas.
      const currentRows = await prisma.$queryRaw<{ clientId: string }[]>`
        SELECT "clientId" FROM "GalleryClientAccess" WHERE "galleryId" = ${gallery.id}
      `;
      const currentIds = new Set(currentRows.map((r) => r.clientId));

      const toAdd = [...validClientsById.keys()].filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !validClientsById.has(id));

      for (const clientId of toAdd) {
        await prisma.$executeRaw`INSERT INTO "GalleryClientAccess" ("id", "galleryId", "clientId", "createdAt")
          VALUES (${randomUUID()}, ${gallery.id}, ${clientId}, NOW())
          ON CONFLICT ("galleryId", "clientId") DO NOTHING`;
      }
      for (const clientId of toRemove) {
        await prisma.$executeRaw`DELETE FROM "GalleryClientAccess" WHERE "galleryId" = ${gallery.id} AND "clientId" = ${clientId}`;
      }

      newlyAddedClients = toAdd
        .map((id) => validClientsById.get(id))
        .filter((c): c is { id: string; name: string; email: string } => !!c);
    }

    // Un client additionnel ajouté à une galerie DÉJÀ publiée doit recevoir son accès tout de
    // suite : contrairement à la création (voir POST /api/galleries), il n'y aura pas de
    // future transition vers PUBLISHED pour déclencher l'email plus bas. Si la galerie est
    // encore en brouillon, l'email partira au moment de la publication comme d'habitude (voir
    // isPublishing plus bas), pas ici.
    if (newlyAddedClients.length > 0 && gallery.status === "PUBLISHED") {
      const studio = await prisma.studio.findUnique({
        where: { id: session.user.studioId },
        include: { settings: true },
      });
      if (studio) {
        const studioInfo = { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor };
        const settingsInfo = studio.settings
          ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
          : null;
        for (const client of newlyAddedClients) {
          sendGalleryAdditionalAccessEmail({
            clientName: client.name,
            clientEmail: client.email,
            galleryTitle: updated.title,
            gallerySlug: updated.slug,
            galleryPassword: updated.password,
            studio: studioInfo,
            settings: settingsInfo,
          }).catch((e) => console.error("Échec de l'email « accès galerie » (client additionnel) :", e));
        }
      }
    }

    // Le filigrane n'est plus "gravé" dans preview.jpg : il est appliqué à la volée au
    // moment de servir l'image ou de télécharger une photo (voir /api/files et les routes
    // de téléchargement), à partir de la valeur de showWatermark ci-dessus. Aucune
    // régénération de fichier n'est donc nécessaire ici — le changement est immédiat.

    // Horodatage de publication (Gallery.publishedAt, 30/07/2026, affiché dans l'espace
    // Client) — sur chaque transition vers PUBLISHED (y compris une republication après
    // archivage), pas juste la toute première fois : c'est la date de mise à disposition la
    // plus récente qui est pertinente pour le client. Champ trop récent pour le Prisma Client
    // généré du sandbox (voir le commentaire sur Gallery.publishedAt dans schema.prisma) :
    // $executeRaw plutôt que le `data` typé de prisma.gallery.update ci-dessus.
    if (body.status === "PUBLISHED" && gallery.status !== "PUBLISHED") {
      await prisma.$executeRaw`UPDATE "Gallery" SET "publishedAt" = NOW() WHERE id = ${gallery.id}`;
    }

    // Emails "galerie prête" — uniquement sur la TRANSITION vers PUBLISHED (pas à chaque
    // sauvegarde d'une galerie déjà publiée, ex: un simple changement de design). Client
    // PRINCIPAL (Gallery.clientId) ET clients ADDITIONNELS (voir GalleryClientAccess) reçoivent
    // leur email au même moment — demande d'Adriel (05/08/2026) : "le send mail [...] doit se
    // faire quand on clique sur publier pas a la creation de la galerie" (avant ce changement,
    // les additionnels étaient notifiés dès POST /api/galleries, incohérent avec le principal).
    const isPublishing = body.status === "PUBLISHED" && gallery.status !== "PUBLISHED";
    if (isPublishing) {
      // $queryRaw : GalleryClientAccess est trop récent pour le Prisma Client généré du
      // sandbox (voir commentaire sur ce modèle dans schema.prisma).
      const additionalClients = await prisma.$queryRaw<{ name: string; email: string }[]>`
        SELECT c.name, c.email FROM "GalleryClientAccess" gca
        JOIN "Client" c ON c.id = gca."clientId"
        WHERE gca."galleryId" = ${gallery.id}
      `;

      if (gallery.client?.email || additionalClients.length > 0) {
        const studio = await prisma.studio.findUnique({
          where: { id: session.user.studioId },
          include: { settings: true },
        });
        if (studio) {
          const studioInfo = { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor };
          const settingsInfo = studio.settings
            ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
            : null;

          if (gallery.client?.email) {
            sendGalleryReadyEmail({
              clientName: gallery.client.name,
              clientEmail: gallery.client.email,
              galleryTitle: updated.title,
              gallerySlug: updated.slug,
              galleryPassword: updated.password,
              studio: studioInfo,
              settings: settingsInfo,
            }).catch((e) => console.error("Échec de l'email « galerie prête » :", e));
          }

          for (const client of additionalClients) {
            sendGalleryAdditionalAccessEmail({
              clientName: client.name,
              clientEmail: client.email,
              galleryTitle: updated.title,
              gallerySlug: updated.slug,
              galleryPassword: updated.password,
              studio: studioInfo,
              settings: settingsInfo,
            }).catch((e) => console.error("Échec de l'email « accès galerie » (client additionnel) :", e));
          }
        }
      }
    }

    // Le titre/statut/client affichés dans la liste /dashboard/galleries peuvent changer
    // ici : on invalide son cache pour que la liste soit à jour à la prochaine visite.
    revalidatePath("/dashboard/galleries");

    return NextResponse.json({ gallery: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);
    // Remarque : les fichiers sur le storage SFTP ne sont pas supprimés automatiquement
    // ici pour éviter une perte de données accidentelle. Ajoutez un job de nettoyage
    // périodique si nécessaire.
    await prisma.gallery.delete({ where: { id: gallery.id } });
    revalidatePath("/dashboard/galleries");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
