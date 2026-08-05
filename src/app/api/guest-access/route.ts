import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { cookieNameFor, issueGalleryToken } from "@/lib/gallery-session";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import {
  sendStudioNewGalleryGuestEmail,
  sendClientGuestApprovalRequestEmail,
} from "@/lib/notifications";

/**
 * Équivalent de /api/gallery-access pour le lien "invité" (/invite/[guestSlug]) : pas de
 * mot de passe, juste un email. On enregistre cet email dans GalleryGuest (contrairement
 * au lien client, où l'email n'est jamais demandé) et on pose un cookie de session sur le
 * même mécanisme que le lien client (voir gallery-session.ts), scoppé au `guestSlug`
 * plutôt qu'au `slug` — les deux liens ont donc des sessions indépendantes.
 */
export async function POST(req: Request) {
  const { guestSlug, email, marketingOptIn } = await req.json();
  if (!guestSlug) return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }
  const optIn = marketingOptIn === true;

  // Évite qu'un lien invité soit utilisé pour spammer la table GalleryGuest (création en
  // masse de faux emails) — limite large pour ne pas gêner un vrai afflux d'invités.
  const ip = getClientIp(req);
  const limited = rateLimit(`guest-access:${ip}`, 30, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const gallery = await prisma.gallery.findUnique({
    where: { guestSlug },
    include: { client: true },
  });
  if (!gallery || gallery.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });
  }
  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return NextResponse.json({ error: "Cette galerie a expiré" }, { status: 410 });
  }

  // Un même email qui revient garde le même clientRef (retrouvé par email+galerie),
  // plutôt que d'en recréer un nouveau à chaque visite.
  let guest = await prisma.galleryGuest.findFirst({
    where: { galleryId: gallery.id, email: cleanEmail },
  });
  if (!guest) {
    // Approbation manuelle par le client, pilotée par Gallery.requireGuestApproval (bouton
    // dédié dans le panel studio, voir Réglages > Lien invité) — demande d'Adriel (05/08/2026) :
    // remise en place d'un réglage explicite après un essai d'approbation automatique dérivée
    // de "Visible pour mes invités" sur les sets (29/07/2026), jugé pas assez lisible pour le
    // studio ("faudra mettre un boutton pour activer ou pas si la lecture de la galerie par
    // l'invité dois etre valider par le client ou pas"). Désactivé par défaut : accès immédiat
    // dès saisie de l'email, comportement historique inchangé pour les galeries existantes.
    const needsApproval = gallery.requireGuestApproval === true;
    guest = await prisma.galleryGuest.create({
      data: {
        galleryId: gallery.id,
        email: cleanEmail,
        clientRef: randomUUID(),
        marketingOptIn: optIn,
        status: needsApproval ? "PENDING" : "APPROVED",
        approvalToken: needsApproval ? randomUUID() : null,
      },
    });
    if (needsApproval && guest.approvalToken) {
      // Best-effort — ne doit jamais faire échouer la demande d'accès (voir sendMail, qui
      // logge déjà l'échec sans lever d'exception). Si la galerie n'a pas de client rattaché
      // (Gallery.client nullable), personne ne reçoit la demande : elle reste PENDING tant
      // qu'un studio ne rattache pas un client ou ne désactive pas requireGuestApproval —
      // comportement volontaire (voir notifications.ts).
      if (gallery.client?.email) {
        sendClientGuestApprovalRequestEmail({
          clientName: gallery.client.name,
          clientEmail: gallery.client.email,
          galleryTitle: gallery.title,
          guestEmail: cleanEmail,
          approvalToken: guest.approvalToken,
        }).catch((e) => console.error("Échec de la notification d'approbation :", e));
      }
    } else {
      // Uniquement à la première visite de cet email sur CETTE galerie (voir le
      // `if (!guest)` ci-dessus), et seulement quand l'accès est immédiat (pas de sens
      // d'informer le studio d'un invité qui n'a pas encore été approuvé).
      sendStudioNewGalleryGuestEmail({
        studioId: gallery.studioId,
        galleryId: gallery.id,
        galleryTitle: gallery.title,
        guestEmail: cleanEmail,
      }).catch((e) => console.error("Échec de la notification nouvel invité :", e));
    }
  }

  // La session est toujours posée, même en attente d'approbation : c'est ce qui permet de
  // reconnaître ce visiteur à son retour (checkGuestAccess relit le statut en base à chaque
  // requête, voir src/lib/access.ts) sans lui redemander son email tant que la demande est
  // en cours de traitement.
  const token = issueGalleryToken({ galleryId: gallery.id, clientRef: guest.clientRef });

  const res = NextResponse.json({ ok: true, status: guest.status });
  res.cookies.set(cookieNameFor(guestSlug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
