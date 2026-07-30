import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sendGuestAccessApprovedEmail } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * Traite une demande d'accès invité (voir /approve-guest/[token]) — pas d'authentification
 * requise, le `approvalToken` (généré aléatoirement, 1 par demande, effacé une fois traité)
 * fait office de secret à usage unique, comme le lien de vérification email/reset password.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = rateLimit(`guest-approve:${ip}`, 20, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const { token, allSets, collectionIds } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }

  const guest = await prisma.galleryGuest.findUnique({
    where: { approvalToken: token },
    include: { gallery: { select: { id: true, title: true, guestSlug: true, studioId: true } } },
  });
  if (!guest || guest.status !== "PENDING") {
    // Déjà traité (double-clic, lien réutilisé) ou jamais existé — même message dans les
    // deux cas, pas d'info à distinguer côté client.
    return NextResponse.json(
      { error: "Cette demande a déjà été traitée ou n'existe plus." },
      { status: 410 }
    );
  }

  const useAllSets = allSets !== false; // true par défaut si absent
  const ids: string[] = useAllSets
    ? []
    : Array.isArray(collectionIds)
      ? collectionIds.filter((id: unknown): id is string => typeof id === "string")
      : [];

  await prisma.galleryGuest.update({
    where: { id: guest.id },
    data: {
      status: "APPROVED",
      approvalToken: null,
      allSetsAccess: useAllSets,
      allowedCollections: useAllSets
        ? { set: [] }
        : { set: ids.map((id) => ({ id })) },
    },
  });

  if (guest.gallery.guestSlug) {
    sendGuestAccessApprovedEmail({
      guestEmail: guest.email,
      galleryTitle: guest.gallery.title,
      guestSlug: guest.gallery.guestSlug,
    }).catch((e) => console.error("Échec de la notification d'accès accordé :", e));
  }

  return NextResponse.json({ ok: true });
}
