import Link from "next/link";

/**
 * Mise en page commune aux pages légales (mentions légales, CGU, CGV, confidentialité).
 * `draft` affiche un bandeau d'avertissement en haut de page — à retirer une fois le
 * contenu finalisé avec les vraies informations de la structure (SIRET, adresse...) et
 * idéalement relu par un professionnel du droit (voir l'audit du 20/07/2026).
 */
export function LegalPageLayout({
  title,
  updatedAt,
  draft = true,
  children,
}: {
  title: string;
  updatedAt: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
        ← Retour à l'accueil
      </Link>

      {draft && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Brouillon.</strong> Ce document contient des informations à compléter (indiquées
          entre crochets) et n'a pas encore été relu par un professionnel du droit. Ne pas
          publier ni promouvoir tant que cette mention est présente.
        </div>
      )}

      <h1 className="mt-8 font-serif text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">Dernière mise à jour : {updatedAt}</p>

      <div className="mt-8 max-w-none text-sm text-gray-700 [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        {children}
      </div>
    </main>
  );
}
