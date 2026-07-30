import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";

export const metadata = { title: "Page introuvable — pixleh" };

/**
 * 404 global du site pixleh (accueil, /a-propos, /tarifs, /exemples, dashboard studio hors
 * segment /s/[studioSlug]...) — voir aussi src/app/(public-site)/s/[studioSlug]/not-found.tsx
 * pour la version scoppée au profil public d'un studio (pas de lien "nous contacter", puisque
 * ce n'est pas à pixleh de répondre pour le compte du studio). Contenu demandé par Adriel le
 * 30/07/2026, redesigné le même jour pour reprendre la charte pixleh : le "404" est dégradé
 * avec exactement les mêmes teintes que le logo (voir PixlehLogo.tsx, dégradé
 * bleu → violet → rose → orange), plutôt qu'une approximation Tailwind. L'email de contact
 * reprend le même placeholder que les mentions légales (voir
 * (marketing)/mentions-legales/page.tsx) en attendant une vraie adresse.
 */
export default function NotFound() {
  return (
    <main>
      <MarketingHeader />
      <div className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
        <PixlehLogo showWordmark={false} size={40} />

        <p
          className="mt-6 font-serif text-7xl font-bold leading-none sm:text-8xl"
          style={{
            backgroundImage: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 75%, #F97316 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          404
        </p>

        <h1 className="mt-6 font-serif text-2xl font-semibold text-gray-900 sm:text-3xl">
          Cette page a été supprimée ou modifiée
        </h1>
        <p className="mt-3 max-w-sm text-sm text-gray-500">
          Vous ne trouvez pas ce que vous cherchez ? Revenez à l&apos;accueil ou contactez-nous, on vous aide.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-primary">
            Retour à l&apos;accueil
          </Link>
          <a href="mailto:contact@pixleh.com" className="btn-secondary">
            Nous contacter
          </a>
        </div>
      </div>
      <MarketingFooter />
    </main>
  );
}
