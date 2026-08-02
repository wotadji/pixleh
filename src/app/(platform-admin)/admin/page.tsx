import { prisma } from "@/lib/prisma";
import { AdminOverviewView } from "@/components/admin/AdminOverviewView";

export default async function AdminOverviewPage() {
  const [studioCount, planCount, activeSubscriptions] = await Promise.all([
    prisma.studio.count(),
    prisma.plan.count(),
    prisma.studio.count({ where: { subscriptionStatus: "ACTIVE" } }),
  ]);

  return (
    <AdminOverviewView
      studioCount={studioCount}
      planCount={planCount}
      activeSubscriptions={activeSubscriptions}
    />
  );
}
