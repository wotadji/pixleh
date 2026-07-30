import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata = { title: "Page introuvable — pixleh" };

/**
 * 404 global du site pixleh (accueil, /a-propos, /tarifs, /exemples, dashboard studio hors
 * segment /s/[studioSlug]...) — voir aussi src/app/(public-site)/s/[studioSlug]/not-found.tsx
 * pour la version scoppée au profil public d'un studio (pas de lien "nous contacter", puisque
 * ce n'est pas à pixleh de répondre pour le compte du studio). Contenu demandé par Adriel le
 * 30/07/2026. L'email de contact reprend le même placeholder que les mentions légales
 * (voir (marketing)/mentions-legales/page.tsx) en attendant une vraie adresse.
 */
export default function NotFound() {
  return (
    <main>
      <MarketingHeader />
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="font-serif text-3xl font-semibold text-gray-900 sm:text-4xl">
          Cette page a été supprimée ou modifiée
        </h1>
        <p className="mt-4 text-gray-600">
          Vous pouvez retourner à la{" "}
          <Link href="/" className="text-brand-600 underline underline-offset-2 hover:text-brand-700">
            page d&apos;accueil
          </Link>{" "}
          ou{" "}
          <a
            href="mailto:contact@pixleh.com"
            className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            nous contacter
          </a>{" "}
          si vous ne trouvez pas ce que vous cherchez.
        </p>
      </div>
      <MarketingFooter />
    </main>
  );
}
