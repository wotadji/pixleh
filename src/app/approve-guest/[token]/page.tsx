import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GuestApprovalForm } from "@/components/gallery/GuestApprovalForm";

export const dynamic = "force-dynamic";

/**
 * Page publique (pas de connexion requise) pointée par le lien envoyé au client dans
 * sendClientGuestApprovalRequestEmail — voir src/lib/notifications.ts et
 * /api/guest-access/(approve|reject). Le `token` (GalleryGuest.approvalToken) est un secret
 * à usage unique, effacé dès que la demande est traitée : une fois consommé, cette page
 * n'affiche donc plus rien (lien réutilisé ou déjà traité par ailleurs).
 */
export default async function GuestApprovalPage({ params }: { params: { token: string } }) {
  const guest = await prisma.galleryGuest.findUnique({
    where: { approvalToken: params.token },
    include: {
      gallery: {
        select: {
          title: true,
          // isPortfolioDefault exclu : ce set n'est jamais proposé au client comme choix
          // d'accès invité, sa visibilité publique se gère uniquement depuis le panneau
          // studio (voir GalleryManager > togglePortfolioVisibility).
          collections: {
            where: { isPortfolioDefault: false },
            orderBy: { position: "asc" },
            select: { id: true, title: true },
          },
        },
      },
    },
  });

  if (!guest || guest.status !== "PENDING") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-2xl font-semibold">Lien expiré</h1>
        <p className="mt-2 text-sm text-gray-600">
          Cette demande d&apos;accès a déjà été traitée ou n&apos;existe plus.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-serif text-2xl font-semibold">Demande d&apos;accès</h1>
      <div className="mt-6">
        <GuestApprovalForm
          token={params.token}
          guestEmail={guest.email}
          galleryTitle={guest.gallery.title}
          collections={guest.gallery.collections}
        />
      </div>
    </div>
  );
}
