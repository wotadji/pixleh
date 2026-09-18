import { notFound } from "next/navigation";
import { getStudioSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { GalleryFilesExplorer } from "@/components/studio/GalleryFilesExplorer";

/**
 * Page dédiée de l'espace "Fichiers" d'une galerie (dossiers + fichiers RAW/originaux) —
 * 18/09/2026, demande d'Adriel : "dans fichier tu vois pas qu'il faut une page ?" en réponse
 * à l'ancienne modale (voir le composant retiré dans GalleryManager.tsx). Server Component
 * minimal (vérifie juste la session + la propriété de la galerie), toute la logique
 * d'organisation (dossiers, upload, renommage...) vit dans GalleryFilesExplorer, un client
 * component qui fetch tout via l'API — même pattern que /dashboard/guests ou
 * /dashboard/quick-transfers.
 */
export default async function GalleryFilesPage({ params }: { params: { id: string } }) {
  const session = await getStudioSession();
  const gallery = await prisma.gallery.findFirst({
    where: { id: params.id, studioId: session!.user.studioId },
    select: { id: true, title: true },
  });
  if (!gallery) notFound();

  return <GalleryFilesExplorer galleryId={gallery.id} galleryTitle={gallery.title} />;
}
