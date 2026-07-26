import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkGalleryAccess } from "@/lib/access";
import { PasswordGate } from "@/components/gallery/PasswordGate";
import { StoreCart } from "@/components/gallery/StoreCart";

export const dynamic = "force-dynamic";

export default async function GalleryStorePage({ params }: { params: { gallerySlug: string } }) {
  const gallery = await prisma.gallery.findUnique({
    where: { slug: params.gallerySlug },
    include: { products: true },
  });
  if (!gallery || gallery.status === "DRAFT") notFound();

  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-2xl font-semibold">Galerie expirée</h1>
        <p className="mt-2 text-sm text-gray-600">
          Cette galerie n&apos;est plus disponible.
        </p>
      </div>
    );
  }

  const access = await checkGalleryAccess(gallery);
  if (!access.granted) return <PasswordGate slug={gallery.slug} title={gallery.title} />;

  const products =
    gallery.products.length > 0
      ? gallery.products
      : await prisma.product.findMany({ where: { studioId: gallery.studioId, active: true } });

  return (
    <StoreCart
      galleryId={gallery.id}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        priceCents: p.priceCents,
        currency: p.currency,
      }))}
    />
  );
}
