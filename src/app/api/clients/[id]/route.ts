import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { serializeClientMessage } from "@/lib/clientMessages";
import { clientSchema } from "@/lib/validators";

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
 * Plusieurs usages depuis /dashboard/clients (voir ClientsPage), combinables dans un seul
 * appel :
 * - { unreadMessage: false } : marque le message de contact comme lu (bulle de notification
 *   de la sidebar, voir dashboard/layout.tsx).
 * - { status: "CLIENT" } : valide un PROSPECT (contact non qualifié) en vrai client — geste
 *   volontaire du studio après avoir échangé avec la personne, demandé par Adriel pour ne
 *   pas mélanger d'office les simples messages de contact à la liste de clients.
 * - { name, email, phone, notes } : édition des coordonnées du client (bouton "Modifier",
 *   demande d'Adriel le 05/08/2026) — validé par le même clientSchema que la création
 *   (POST /api/clients), tous les champs optionnels ici pour ne modifier que ce qui est
 *   envoyé. L'email reste unique par studio (@@unique([studioId, email]) côté schéma) : une
 *   collision renvoie une 409 explicite plutôt qu'une 500 brute.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const client = await prisma.client.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!client) throw new AccessError("Client introuvable", 404);

    const body = await req.json();
    const data: {
      unreadMessage?: boolean;
      status?: "PROSPECT" | "CLIENT";
      name?: string;
      email?: string;
      phone?: string | null;
      notes?: string | null;
    } = {};
    if (typeof body.unreadMessage === "boolean") data.unreadMessage = body.unreadMessage;
    if (body.status === "PROSPECT" || body.status === "CLIENT") data.status = body.status;

    const editFields = clientSchema.partial().safeParse(body);
    if (!editFields.success) {
      return NextResponse.json({ error: editFields.error.flatten() }, { status: 400 });
    }
    if (editFields.data.name !== undefined) data.name = editFields.data.name;
    if (editFields.data.email !== undefined) data.email = editFields.data.email;
    if (editFields.data.phone !== undefined) data.phone = editFields.data.phone;
    if (editFields.data.notes !== undefined) data.notes = editFields.data.notes;

    const updated = await prisma.client.update({
      where: { id: client.id },
      data,
    });

    return NextResponse.json({ client: updated });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Un client avec cet email existe déjà." }, { status: 409 });
    }
    return handleApiError(e);
  }
}
