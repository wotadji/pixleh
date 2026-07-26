import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContactForm } from "@/components/site/ContactForm";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: { studioSlug: string } }) {
  const studio = await prisma.studio.findUnique({
    where: { slug: params.studioSlug },
    include: { settings: true },
  });
  if (!studio) notFound();

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      {/* Carte de présentation (photo, nom, coordonnées) à la place du simple "Contactez
          {studio.name}" — reprend la photo de profil/logo déjà utilisée ailleurs sur le
          site (Réglages > Profil), avec téléphone / email / adresse en dessous. */}
      <div className="text-center">
        {studio.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={studio.logoUrl}
            alt={studio.name}
            className="mx-auto h-32 w-32 rounded-2xl object-cover"
          />
        )}
        <h1 className="mt-6 text-3xl font-bold uppercase tracking-widest text-gray-900">
          {studio.name}
        </h1>
        <div className="mx-auto mt-3 max-w-xs space-y-1.5 text-center">
          {studio.settings?.contactPhone && (
            <div className="flex items-center justify-center gap-3 text-gray-700">
              <IconPhone />
              <span>{studio.settings.contactPhone}</span>
            </div>
          )}
          {studio.settings?.contactEmail && (
            <div className="flex items-center justify-center gap-3 text-gray-700">
              <IconEnvelope />
              <span>{studio.settings.contactEmail}</span>
            </div>
          )}
          {studio.settings?.address && (
            <div className="flex items-center justify-center gap-3 text-gray-700">
              <IconMap />
              <span>{studio.settings.address}</span>
            </div>
          )}
          {studio.settings?.instagramUrl && (
            <div className="flex items-center justify-center gap-3 text-gray-700">
              <IconInstagram />
              <a
                href={studio.settings.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900"
              >
                Instagram
              </a>
            </div>
          )}
          {studio.settings?.facebookUrl && (
            <div className="flex items-center justify-center gap-3 text-gray-700">
              <IconFacebook />
              <a
                href={studio.settings.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900"
              >
                Facebook
              </a>
            </div>
          )}
        </div>
      </div>
      <ContactForm studioSlug={studio.slug} />
    </div>
  );
}

function IconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-gray-400">
      <path d="M3.5 5.5c0-1.1.9-2 2-2H8l1.5 4-2 1.5a13 13 0 006 6l1.5-2 4 1.5v2.5c0 1.1-.9 2-2 2C10.5 19 3.5 12 3.5 5.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEnvelope() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-gray-400">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 6.5l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMap() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-gray-400">
      <path d="M9 3.5L3.5 5.5v15L9 18.5l6 2 5.5-2v-15l-5.5 2-6-2z" strokeLinejoin="round" />
      <path d="M9 3.5v15M15 5.5v15" strokeLinecap="round" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-gray-400">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-gray-400">
      <path d="M15.5 3.5h-2A4 4 0 009.5 7.5v2.5H7.5v3h2v7.5h3v-7.5h2.3l.7-3H12.5V8a1 1 0 011-1h2v-3.5z" strokeLinejoin="round" />
    </svg>
  );
}
