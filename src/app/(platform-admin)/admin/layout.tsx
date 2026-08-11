import { redirect } from "next/navigation";
import { getStudioSession } from "@/lib/access";
import { AdminShell } from "@/components/admin/AdminShell";

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
    // "Commandes" ajouté le 01/08/2026 (demande d'Adriel) : vue transverse à tous les studios,
    // avec filtre par studio — voir /api/admin/orders. Complète /dashboard/orders (vue studio
    // sur ses propres commandes), ne la remplace pas.
    { href: "/admin/orders", label: "Commandes" },
    // "Invités" ajouté le 05/08/2026 (demande d'Adriel) — vue transverse aux GalleryGuest de
    // tous les studios, avec filtre par studio (voir /api/admin/guests). Complète
    // /dashboard/guests (vue studio sur ses propres invités), ne la remplace pas.
    { href: "/admin/guests", label: "Invités" },
    { href: "/admin/site", label: "Contenu du site" },
    { href: "/admin/plans", label: "Plans tarifaires" },
    { href: "/admin/print-catalog", label: "Catalogue impression" },
    { href: "/admin/features", label: "Fonctionnalités" },
  ];

  // Sidebar responsive (tiroir mobile/tablette, statique à partir de md) — même
  // comportement que le dashboard studio (DashboardShell/DashboardSidebar), demande
  // d'Adriel du 12/08/2026 : "applique le meme comportement de sidebar du panel du studio
  // a celui de l'administrateur". Logique déplacée dans AdminShell (Client Component,
  // porte l'état ouvert/fermé) + AdminSidebar — ce layout reste un Server Component qui ne
  // fait que l'auth et calcule les entrées de nav.
  return <AdminShell nav={nav}>{children}</AdminShell>;
}
