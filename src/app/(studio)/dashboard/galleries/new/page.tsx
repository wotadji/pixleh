import { getStudioSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { NewGalleryForm } from "@/components/studio/NewGalleryForm";

export default async function NewGalleryPage() {
  const session = await getStudioSession();

  // Tags déjà utilisés sur d'autres galeries du studio, pour l'autocomplétion du champ
  // "Catégorie / tag" dès la création — même liste que dans Réglages (voir GalleryManager).
  const tagRows = await prisma.gallery.findMany({
    where: { studioId: session!.user.studioId, categoryTag: { not: null } },
    select: { categoryTag: true },
    distinct: ["categoryTag"],
  });
  const existingTags = tagRows
    .map((r) => r.categoryTag)
    .filter((tag): tag is string => !!tag && tag.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));

  return <NewGalleryForm existingTags={existingTags} />;
}
