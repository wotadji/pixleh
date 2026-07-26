import Link from "next/link";

/** Pied de page du site marketing pixleh (pas celui des sites publics des Studios,
 * voir Footer dans GalleryView.tsx / le site vitrine studio, qui est distinct). */
export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-100 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-gray-500 sm:flex-row">
        <p>© {new Date().getFullYear()} Groupe Lehwu</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/mentions-legales" className="hover:text-gray-800 hover:underline">
            Mentions légales
          </Link>
          <Link href="/cgu" className="hover:text-gray-800 hover:underline">
            CGU
          </Link>
          <Link href="/cgv" className="hover:text-gray-800 hover:underline">
            CGV
          </Link>
          <Link href="/confidentialite" className="hover:text-gray-800 hover:underline">
            Confidentialité
          </Link>
        </nav>
      </div>
    </footer>
  );
}
