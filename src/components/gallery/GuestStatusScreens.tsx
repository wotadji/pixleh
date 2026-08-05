/**
 * Écrans affichés à un invité dont l'accès n'est pas (encore) accordé, quand
 * Gallery.requireGuestApproval est actif — partagés entre /invite/[guestSlug] et
 * /g/[gallerySlug] (05/08/2026) : ce dernier ne vérifiait jusqu'ici QUE la présence d'un
 * cookie de session invité, jamais le statut réel de la demande (GalleryGuest.status),
 * ce qui laissait un invité PENDING atterrir sur une galerie sans aucune photo visible
 * (page blanche) plutôt que de voir un message explicite — bug remonté par Adriel.
 */
export function GuestPendingScreen({
  galleryTitle,
  client,
}: {
  galleryTitle: string;
  client: { name: string; email: string } | null;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-2xl font-semibold">Vous ne pouvez pas encore voir cette galerie</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        Merci pour votre intérêt pour « {galleryTitle} ».{" "}
        {client ? (
          <>
            <strong>{client.name}</strong> ({client.email}) doit d&apos;abord valider votre
            demande pour vous donner accès à la galerie.
          </>
        ) : (
          <>Cette galerie est soumise à l&apos;approbation de son propriétaire.</>
        )}{" "}
        Nous avons transmis votre demande et vous recevrez un email dès que l&apos;accès vous
        sera accordé.
      </p>
      <p className="mt-4 text-xs text-gray-400">
        Vous pouvez fermer cette page — inutile de la rafraîchir, vous serez prévenu(e) par email.
      </p>
    </div>
  );
}

export function GuestRejectedScreen() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-2xl font-semibold">Accès non accordé</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        Le propriétaire de cette galerie n&apos;a pas donné suite à votre demande d&apos;accès.
        Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, rapprochez-vous directement de lui.
      </p>
    </div>
  );
}
