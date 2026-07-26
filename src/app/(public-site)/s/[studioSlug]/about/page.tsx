import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AboutPage({ params }: { params: { studioSlug: string } }) {
  const studio = await prisma.studio.findUnique({
    where: { slug: params.studioSlug },
    include: { settings: true },
  });
  if (!studio) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl font-semibold">
        {studio.settings?.aboutTitle || `À propos de ${studio.name}`}
      </h1>
      {studio.settings?.aboutBody ? (
        // aboutBody est du HTML saisi via l'éditeur enrichi de Réglages > Profil (voir
        // RichTextEditor) — contenu du photographe sur son propre profil, pas une
        // entrée d'un tiers.
        <div
          className="mt-6 leading-relaxed text-gray-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: studio.settings.aboutBody }}
        />
      ) : (
        <p className="mt-6 leading-relaxed text-gray-700">Ce studio n&apos;a pas encore rédigé sa présentation.</p>
      )}
      <div className="mt-8 flex gap-4 text-sm text-brand-600">
        {studio.settings?.instagramUrl && (
          <a href={studio.settings.instagramUrl} target="_blank" rel="noreferrer">
            Instagram
          </a>
        )}
        {studio.settings?.facebookUrl && (
          <a href={studio.settings.facebookUrl} target="_blank" rel="noreferrer">
            Facebook
          </a>
        )}
      </div>
    </div>
  );
}
