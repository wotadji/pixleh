import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError } from "@/lib/access";

/**
 * Liste tous les studios de la plateforme, tous propriétaires confondus — c'est la porte
 * d'entrée du "mode support" de l'admin plateforme (voir /admin/studios) : contrairement
 * au dashboard studio classique qui n'expose que les données du studio de l'utilisateur
 * connecté, ceci est volontairement transverse et réservé à isPlatformAdmin.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const studios = await prisma.studio.findMany({
      include: {
        users: { where: { role: "OWNER" }, take: 1 },
        plan: { select: { id: true, name: true, isFree: true } },
        _count: { select: { galleries: true, clients: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = studios.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      ownerName: s.users[0]?.name ?? null,
      ownerEmail: s.users[0]?.email ?? null,
      plan: s.plan,
      subscriptionStatus: s.subscriptionStatus,
      galleryCount: s._count.galleries,
      clientCount: s._count.clients,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({ studios: data });
  } catch (e) {
    return handleApiError(e);
  }
}
