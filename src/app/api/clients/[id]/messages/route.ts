import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { sendMail } from "@/lib/mailer";
import { getStorage, buildClientMessageAttachmentKey } from "@/lib/storage";
import { serializeClientMessage } from "@/lib/clientMessages";
import { buildEmailSignature } from "@/lib/emailSignature";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 Mo — cohérent avec les autres limites d'upload de l'app.

/** Retire les balises HTML pour obtenir une version texte brut (fallback email, certains
 * clients mail n'affichent que `text`) — volontairement basique (pas de librairie), le corps
 * vient de RichTextEditor donc reste du HTML simple (gras/italique/liens/listes). */
function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Répondre à un client depuis le panel — fonctionnalité demandée par Adriel pour transformer
 * la fiche client en petite boîte de réception plutôt que d'imposer de répondre depuis sa
 * messagerie perso. Crée un ClientMessage(direction=OUTBOUND) ET envoie un vrai email à
 * `Client.email` (celle renseignée dans le formulaire de contact) — pas seulement une note
 * interne. Le `replyTo` pointe vers l'email de contact du studio (StudioSettings.contactEmail)
 * si configuré, sinon vers l'email du compte connecté, pour que si LE CLIENT répond à son
 * tour par email classique, ça atterrisse chez le studio et pas sur une adresse technique.
 *
 * Corps multipart/form-data (pas JSON) : `body` (HTML, voir RichTextEditor) + `file` optionnel
 * (une seule pièce jointe par message, 10 Mo max) — voir /dashboard/clients.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const client = await prisma.client.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!client) throw new AccessError("Client introuvable", 404);

    const formData = await req.formData();
    const bodyHtml = String(formData.get("body") || "").trim();
    // On évite `instanceof File` : la classe globale `File` n'est pas fiable dans
    // l'environnement d'exécution des Route Handlers Next.js (provoquait un
    // `ReferenceError: File is not defined` ici). Une entrée de FormData est soit une
    // chaîne, soit un fichier — exclure les chaînes suffit (voir galleries/[id]/photos/route.ts).
    const fileEntry = formData.get("file");
    const file = typeof fileEntry !== "string" && fileEntry ? (fileEntry as File) : null;
    const hasFile = !!file && file.size > 0;
    if (!bodyHtml && !hasFile) throw new AccessError("Message vide", 400);

    if (hasFile && file!.size > MAX_ATTACHMENT_BYTES) {
      throw new AccessError("Pièce jointe trop volumineuse (10 Mo maximum).", 400);
    }

    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { settings: true },
    });

    // Le message est créé d'abord (sans pièce jointe) pour obtenir un id stable utilisé dans
    // la clé de stockage — voir buildClientMessageAttachmentKey.
    let message = await prisma.clientMessage.create({
      data: { clientId: client.id, direction: "OUTBOUND", body: bodyHtml },
    });

    let attachmentBuffer: Buffer | null = null;
    let attachmentMeta: { id: string; name: string; mime: string; size: number; key: string } | null = null;

    if (hasFile) {
      const f = file!;
      attachmentBuffer = Buffer.from(await f.arrayBuffer());
      const ext = f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "bin";
      const attachmentId = randomUUID();
      const key = buildClientMessageAttachmentKey(client.studioId, message.id, attachmentId, ext);
      await getStorage().put(key, attachmentBuffer);
      attachmentMeta = {
        id: attachmentId,
        name: f.name,
        mime: f.type || "application/octet-stream",
        size: f.size,
        key,
      };
      message = await prisma.clientMessage.update({
        where: { id: message.id },
        data: { attachments: [attachmentMeta] },
      });
    }

    // Signature ajoutée uniquement à l'email envoyé (logo + coordonnées du studio, demandé par
    // Adriel) — jamais au `body` stocké/affiché dans le fil du panel, pour ne pas la répéter à
    // chaque bulle de la conversation. Voir src/lib/emailSignature.ts.
    const signature = studio
      ? buildEmailSignature(
          { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor },
          studio.settings
            ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
            : null
        )
      : null;

    // On remonte explicitement si l'email a vraiment été envoyé (voir sendMail) — le message
    // est de toute façon enregistré dans le fil même en cas d'échec, mais le studio doit
    // pouvoir VOIR que ça n'est pas parti plutôt que de croire à tort que le client a reçu
    // sa réponse (symptôme signalé par Adriel : "le client ne reçoit pas de mail"). L'erreur
    // brute est aussi remontée pour permettre un vrai diagnostic depuis l'UI.
    const result = await sendMail({
      to: client.email,
      subject: `Réponse de ${studio?.name || "votre photographe"}`,
      text: [stripHtml(bodyHtml) || "(pièce jointe)", signature?.text].filter(Boolean).join("\n\n"),
      html: bodyHtml || signature ? `${bodyHtml}${signature?.html || ""}` : undefined,
      replyTo: studio?.settings?.contactEmail || session.user.email || undefined,
      attachments:
        attachmentMeta && attachmentBuffer
          ? [{ filename: attachmentMeta.name, content: attachmentBuffer, contentType: attachmentMeta.mime }]
          : undefined,
    });

    if (!result.ok) {
      message = await prisma.clientMessage.update({ where: { id: message.id }, data: { emailFailed: true } });
    }

    return NextResponse.json(
      { message: serializeClientMessage(message), emailSent: result.ok, emailError: result.error },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}
