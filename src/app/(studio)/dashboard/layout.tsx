import { redirect } from "next/navigation";
import { getStudioSession } from "@/lib/access";
import { getQuotaStatus } from "@/lib/quotas";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/studio/DashboardShell";
import { PendingPlanCheckout } from "@/components/studio/PendingPlanCheckout";
import { CheckoutConfirm } from "@/components/studio/CheckoutConfirm";
import { DashboardFooter } from "@/components/studio/DashboardFooter";
import { QuotaAlertBanner } from "@/components/studio/QuotaAlertBanner";
import { EmailVerificationBanner } from "@/components/studio/EmailVerificationBanner";
import { OnboardingGuide } from "@/components/studio/OnboardingGuide";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getStudioSession();
  if (!session) redirect("/login");

  // Calculé ici (layout, partagé par toutes les pages du dashboard) plutôt que dans chaque
  // page, pour que l'alerte à 80% d'utilisation soit visible partout dans le panel, pas
  // seulement sur la Vue d'ensemble.
  const [quota, unreadClientsCount, currentUser, studio] = await Promise.all([
    getQuotaStatus(session.user.studioId),
    // Même logique de calcul serveur que le quota ci-dessus (plutôt qu'un fetch client dans
    // la sidebar) — alimente la bulle rouge sur le lien "Clients", visible dès le premier
    // rendu de n'importe quelle page du dashboard, pas seulement /dashboard/clients.
    prisma.client.count({ where: { studioId: session.user.studioId, unreadMessage: true } }),
    // `emailVerified` n'est pas exposé dans la session NextAuth (voir next-auth.d.ts) — lu à
    // part ici, même logique que les deux requêtes ci-dessus, pour alimenter le bandeau de
    // vérification d'email visible sur tout le panel.
    prisma.user.findUnique({ where: { id: session.user.id }, select: { emailVerified: true } }),
    // Nom du studio (30/07/2026, demande d'Adriel) : affiché sous "pixleh" dans la sidebar à
    // la place du nom de l'utilisateur — pas non plus exposé dans la session NextAuth.
    // logoUrl/settings.contactEmail ajoutés (03/08/2026) pour la pastille "profil incomplet"
    // sur la carte studio de la sidebar (voir DashboardSidebar).
    prisma.studio.findUnique({
      where: { id: session.user.studioId },
      select: { name: true, logoUrl: true, settings: { select: { contactEmail: true } } },
    }),
  ]);

  const profileIncomplete = !studio?.logoUrl || !studio?.settings?.contactEmail;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardShell
        studioName={studio?.name || ""}
        studioSlug={session.user.studioSlug}
        isPlatformAdmin={Boolean((session.user as any).isPlatformAdmin)}
        unreadClientsCount={unreadClientsCount}
        profileIncomplete={profileIncomplete}
        missingLogo={!studio?.logoUrl}
        missingContactEmail={!studio?.settings?.contactEmail}
      >
        <div className="flex flex-1 flex-col">
          <main className="flex-1 p-4 md:p-8">
            <OnboardingGuide studioId={session.user.studioId} />
            <PendingPlanCheckout />
            <CheckoutConfirm />
            <EmailVerificationBanner verified={Boolean(currentUser?.emailVerified)} />
            <QuotaAlertBanner quota={quota} />
            {children}
          </main>
          <DashboardFooter />
        </div>
      </DashboardShell>
    </div>
  );
}
