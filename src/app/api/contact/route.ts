import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

/**
 * Formulaire de contact du site public. Crée un ClientMessage entrant (fil de conversation,
 * voir modèle ClientMessage) et tente d'envoyer un email de notification au studio si le
 * SMTP est configuré.
 *
 * Question d'Adriel : un message de contact fait-il automatiquement de son auteur un
 * "client" ? Réponse retenue : non — un nouveau contact démarre au statut PROSPECT (voir
 * enum ClientStatus), et n'apparaît donc pas mélangé à la vraie liste de clients tant que le
 * studio ne l'a pas validé manuellement (bouton "Valider en client", PATCH /api/clients/[id]).
 * Un client déjà validé qui réécrit reste CLIENT (on ne le rétrograde jamais). Dans les deux
 * cas, `unreadMessage` repasse à true à chaque nouveau message pour réactiver la bulle de
 * notification sur le lien "Clients" du panel, même si le studio l'avait déjà lue une fois.
 *
 * `Client.notes` n'est plus alimenté par cette route (on ne concatène plus dedans) — les
 * anciens messages qui y étaient déjà accumulés avant cette migration restent affichés en
 * lecture seule dans le panel ("Historique"), les nouveaux passent tous par ClientMessage,
 * qui permet enfin de répondre et de parcourir les échanges comme une vraie boîte de
 * réception (demandé par Adriel).
 */
export async function POST(req: Request) {
  const { studioSlug, name, email, phone, message } = await req.json();
  if (!studioSlug || !name || !email || !message) {
    return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
  }

  const studio = await prisma.studio.findUnique({
    where: { slug: studioSlug },
    include: { settings: true },
  });
  if (!studio) return NextResponse.json({ error: "Studio introuvable" }, { status: 404 });

  const existingClient = await prisma.client.findUnique({
    where: { studioId_email: { studioId: studio.id, email } },
  });

  let clientId: string;
  if (existingClient) {
    clientId = existingClient.id;
    await prisma.client.update({
      where: { id: existingClient.id },
      data: {
        // On ne renseigne le téléphone que s'il manquait encore — on n'écrase jamais une
        // valeur déjà saisie par le studio avec un champ optionnel du formulaire public.
        phone: existingClient.phone || phone || null,
        unreadMessage: true,
      },
    });
  } else {
    const created = await prisma.client.create({
      data: {
        studioId: studio.id,
        name,
        email,
        phone: phone || null,
        status: "PROSPECT",
        unreadMessage: true,
      },
    });
    clientId = created.id;
  }

  await prisma.clientMessage.create({
    data: { clientId, direction: "INBOUND", body: message },
  });

  if (studio.settings?.contactEmail) {
    await sendMail({
      to: studio.settings.contactEmail,
      subject: `Nouveau message de ${name} via votre site pixleh`,
      text: `${name} (${email}) vous a écrit :\n\n${message}`,
      // Permet de répondre directement depuis la boîte mail habituelle du studio, en plus
      // de la réponse possible depuis le panel (POST /api/clients/[id]/messages).
      replyTo: email,
    }).catch((e) => console.error("Envoi email contact échoué :", e));
  }

  return NextResponse.json({ ok: true });
}
