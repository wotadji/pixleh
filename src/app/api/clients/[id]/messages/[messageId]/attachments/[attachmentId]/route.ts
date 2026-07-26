import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Téléchargement d'une pièce jointe de message client — réservé au studio propriétaire (le
 * client, lui, a reçu le fichier directement en pièce jointe de l'email envoyé au moment de
 * la réponse, voir POST /api/clients/[id]/messages : pas besoin d'exposer cette route
 * publiquement).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; messageId: string; attachmentId: string } }
) {
  try {
    const session = await requireStudioSession();
    const client = await prisma.client.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!client) throw new AccessError("Client introuvable", 404);

    const message = await prisma.clientMessage.findFirst({
      where: { id: params.messageId, clientId: client.id },
    });
    if (!message) throw new AccessError("Message introuvable", 404);

    const attachments = (message.attachments as any[]) || [];
    const attachment = attachments.find((a) => a.id === params.attachmentId);
    if (!attachment) throw new AccessError("Pièce jointe introuvable", 404);

    const buffer = await getStorage().get(attachment.key);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.name)}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
