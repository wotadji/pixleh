import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientPortalSession } from "@/lib/clientSession";
import { sendGuestAccessApprovedEmail } from "@/lib/notifications";
import { hasAdditionalGalleryAccess } from "@/lib/galleryClientAccess";

export const runtime = "nodejs";

/**
 * Équivalent client-portal de /api/guest-access/approve|reject, mais pour un client qui veut
 * activer/désactiver l'accès d'un invité DÉJÀ traité (pas une nouvelle demande PENDING — celle-ci
 * passe toujours par /approve-guest/[token], qui permet de choisir les sets). Ici on bascule
 * simplement APPROVED <-> REJECTED en conservant allSetsAccess/allowedCollections tels quels
 * (la sélection de sets choisie à l'approbation initiale n'est pas remise en cause par un simple
 * toggle marche/arrêt) — demandé par Adriel le 30/07/2026.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; guestId: string } }
) {
  const session = getClientPortalSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const gallery = await prisma.gallery.findUnique({
    where: { id: params.id },
    include: { client: true },
  });
  // Client principal OU additionnel (voir GalleryClientAccess) — même accès de gestion pour
  // les deux depuis cette galerie, seul le principal pilote facturation/devis/notifications.
  const isOwner = gallery?.client?.email === session.email;
  const hasAccess = isOwner || (gallery ? await hasAdditionalGalleryAccess(gallery.id, session.email) : false);
  if (!gallery || !hasAccess) {
    return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });
  }

  const guest = await prisma.galleryGuest.findFirst({
    where: { id: params.guestId, galleryId: gallery.id },
  });
  if (!guest) return NextResponse.json({ error: "Invité introuvable" }, { status: 404 });

  const body = await req.json();
  const status = body.status;
  if (status !== "APPROVED" && status !== "REJECTED") {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }
  // Une demande encore PENDING ne se bascule pas ici : elle doit passer par le flux de
  // traitement initial (choix des sets), voir /approve-guest/[token].
  if (guest.status === "PENDING") {
    return NextResponse.json(
      { error: "Cette demande doit d'abord être traitée depuis le lien reçu par email." },
      { status: 409 }
    );
  }

  const wasApproved = guest.status === "APPROVED";
  const updated = await prisma.galleryGuest.update({
    where: { id: guest.id },
    data: { status, approvalToken: null },
  });

  // On ne notifie que lors d'une réactivation (REJECTED → APPROVED) — la désactivation reste
  // silencieuse pour ne pas alerter inutilement un invité qui n'a probablement rien demandé.
  if (!wasApproved && status === "APPROVED" && gallery.guestSlug) {
    sendGuestAccessApprovedEmail({
      guestEmail: guest.email,
      galleryTitle: gallery.title,
      guestSlug: gallery.guestSlug,
    }).catch((e) => console.error("Échec de la notification d'accès accordé :", e));
  }

  return NextResponse.json({ guest: updated });
}
