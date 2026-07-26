import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { serializeClientMessage } from "@/lib/clientMessages";

/**
 * GET renvoie le client accompagné de son fil de conversation (ClientMessage, le plus ancien
 * en premier) — chargé à la demande quand une fiche est dépliée dans /dashboard/clients
 * (pas dans le GET /api/clients qui liste tout le monde, pour ne pas alourdir la liste avec
 * l'historique complet de chaque client).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const client = await prisma.client.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!client) throw new AccessError("Client introuvable", 404);
    return NextResponse.json({
      client: { ...client, messages: client.messages.map(serializeClientMessage) },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Deux usages depuis /dashboard/clients (voir ClientsPage) :
 * - { unreadMessage: false } : marque le message de contact comme lu (bulle de notification
 *   de la sidebar, voir dashboard/layout.tsx).
 * - { status: "CLIENT" } : valide un PROSPECT (contact non qualifié) en vrai client — geste
 *   volontaire du studio après avoir échangé avec la personne, demandé par Adriel pour ne
 *   pas mélanger d'office les simples messages de contact à la liste de clients.
 * Les deux champs peuvent être envoyés ensemble (ex: ouvrir un message le marque lu en même
 * temps que le studio le valide).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const client = await prisma.client.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!client) throw new AccessError("Client introuvable", 404);

    const body = await req.json();
    const data: { unreadMessage?: boolean; status?: "PROSPECT" | "CLIENT" } = {};
    if (typeof body.unreadMessage === "boolean") data.unreadMessage = body.unreadMessage;
    if (body.status === "PROSPECT" || body.status === "CLIENT") data.status = body.status;

    const updated = await prisma.client.update({
      where: { id: client.id },
      data,
    });

    return NextResponse.json({ client: updated });
  } catch (e) {
    return handleApiError(e);
  }
}
