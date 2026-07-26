import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicSiteHeader } from "@/components/public-site/PublicSiteHeader";
import { BackToTop } from "@/components/public-site/BackToTop";

export default async function PublicSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { studioSlug: string };
}) {
  const studio = await prisma.studio.findUnique({ where: { slug: params.studioSlug } });
  if (!studio) notFound();

  return (
    <div>
      <PublicSiteHeader studioName={studio.name} studioSlug={studio.slug} studioLogoUrl={studio.logoUrl} />
      {children}
      <footer className="mt-20 border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} {studio.name} — Propulsé par pixleh
      </footer>
      <BackToTop />
    </div>
  );
}
