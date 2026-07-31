import { redirect } from "next/navigation";
import Link from "next/link";
import { getStudioSession } from "@/lib/access";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";

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
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-gray-50 p-4">
        <div className="mb-6 px-2">
          <p className="font-serif text-lg font-semibold">pixleh</p>
          <p className="text-xs text-gray-500">Admin plateforme</p>
        </div>
        <AdminSidebarNav items={nav} />
        <div className="mt-auto border-t border-gray-200 pt-4">
          <Link href="/dashboard" className="btn-secondary block w-full text-center">
            ← Retour au dashboard studio
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
