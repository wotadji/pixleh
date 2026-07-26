import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminOverviewPage() {
  const [studioCount, planCount, activeSubscriptions] = await Promise.all([
    prisma.studio.count(),
    prisma.plan.count(),
    prisma.studio.count({ where: { subscriptionStatus: "ACTIVE" } }),
  ]);

  const stats = [
    { label: "Studios inscrits", value: studioCount },
    { label: "Plans configurés", value: planCount },
    { label: "Abonnements actifs", value: activeSubscriptions },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Vue d'ensemble</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="mt-1 text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="font-medium">Studios</h2>
          <p className="mt-1 text-sm text-gray-600">
            Consulte et gère les données de n'importe quel studio inscrit (mode support) — plan,
            accès admin de ses utilisateurs, statistiques d'usage.
          </p>
          <Link href="/admin/studios" className="btn-primary mt-4 inline-block">
            Voir les studios
          </Link>
        </div>
        <div className="card">
          <h2 className="font-medium">Grille tarifaire</h2>
          <p className="mt-1 text-sm text-gray-600">
            Crée et ajuste les plans (prix, quotas de stockage/galeries/équipe) — visibles sur la page
            tarifs publique et proposés à la souscription.
          </p>
          <Link href="/admin/plans" className="btn-primary mt-4 inline-block">
            Gérer les plans
          </Link>
        </div>
      </div>
    </div>
  );
}
