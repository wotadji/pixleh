import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BookingForm } from "@/components/site/BookingForm";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: { studioSlug: string } }) {
  const studio = await prisma.studio.findUnique({ where: { slug: params.studioSlug } });
  if (!studio) notFound();

  const bookingTypes = await prisma.bookingType.findMany({
    where: { studioId: studio.id, active: true },
  });

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-serif text-2xl font-semibold">Réserver une séance avec {studio.name}</h1>
      <BookingForm
        studioSlug={studio.slug}
        bookingTypes={bookingTypes.map((t) => ({
          id: t.id,
          name: t.name,
          durationMinutes: t.durationMinutes,
        }))}
      />
    </div>
  );
}
