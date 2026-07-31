import { redirect } from "next/navigation";
import Link from "next/link";
import { getStudioSession } from "@/lib/access";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";

/**
 * Espace admin plateforme — distinct du dashboard studio (/dashboard) : ici on gère pixleh
 * dans son ensemble (grille tarifaire pour l'instant, vue d'ensemble des studios plus
 * tard), pas les données d'UN studio. Réservé à User.isPlatformAdmin — voir requirePlatformAdmin()
 * pour l'équivalent côté API. Un studio "normal" (même OWNER) qui tape /admin dans l'URL
 * est renvoyé vers son dashboard, pas juste bloqué avec une page d'erreur : /admin n'a
 * simplement aucun sens pour lui.
 */
export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getStudioSession();
  if (!session) redirect("/login");
  if (!(session.user as any).isPlatformAdmin) redirect("/dashboard");

  const nav = [
    { href: "/admin", label: "Vue d'ensemble" },
    { href: "/admin/studios", label: "Studios" },
    { href: "/admin/site", label: "Contenu du site" },
    { href: "/admin/plans", label: "Plans tarifaires" },
    { href: "/admin/print-catalog", label: "Catalogue impression" },
    { href: "/admin/features", label: "Fonctionnalités" },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Redesign du 01/08/2026 (demande d'Adriel : "design pro et expert de ce sidebar") —
          même traitement que le sidebar studio (DashboardSidebar) : vrai logo en tête, badge
          d'identité distinct (fond sombre plutôt que le violet du studio, pour signaler
          visuellement qu'on est dans un contexte à privilèges élevés), icône par lien. */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-gray-50 p-4">
        <div className="mb-5 px-1">
          <PixlehLogo size={24} />
        </div>
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-900 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
            <IconShield />
          </div>
          <p className="truncate text-sm font-medium text-white">Admin plateforme</p>
        </div>

        <div className="flex-1">
          <AdminSidebarNav items={nav} />
        </div>

        <div className="mt-5 border-t border-gray-200 pt-4">
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <IconArrowLeft />
            Retour au dashboard studio
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
