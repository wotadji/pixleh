import nodemailer from "nodemailer";

export interface SendMailResult {
  ok: boolean;
  /** Message d'erreur brut (nodemailer/SMTP) si ok=false — utile pour un diagnostic affiché
   * dans l'UI plutôt que caché dans les logs serveur (voir POST /api/clients/[id]/messages,
   * demandé par Adriel après un envoi silencieusement en échec malgré un SMTP configuré). */
  error?: string;
}

/**
 * Envoi d'emails transactionnels via le SMTP configuré (voir .env : SMTP_*).
 * Si aucun SMTP n'est configuré, la fonction échoue silencieusement en log (utile en
 * développement) plutôt que de casser le flux principal.
 *
 * Renvoie `{ ok: true }` si l'email a réellement été transmis au serveur SMTP, `{ ok: false,
 * error }` sinon (SMTP absent ou erreur d'envoi) — les appelants qui ont un moyen de le
 * signaler à l'utilisateur (ex: réponse à un client depuis le panel) doivent vérifier cette
 * valeur plutôt que de supposer que "pas d'exception levée jusqu'ici" veut dire "email reçu".
 */
export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Adresse à utiliser pour "Répondre à" — ex: l'email de contact du studio quand on
   * répond à un client depuis le panel, pour que sa réponse atterrisse chez le studio et
   * pas sur l'adresse technique SMTP_FROM. */
  replyTo?: string;
  /** Pièces jointes — voir POST /api/clients/[id]/messages (réponse à un client avec fichier
   * joint). `content` en Buffer : on a déjà le fichier en mémoire côté serveur au moment de
   * l'envoi, inutile de repasser par le stockage. */
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<SendMailResult> {
  if (!process.env.SMTP_HOST) {
    const error = "SMTP non configuré (SMTP_HOST absent) : email non envoyé.";
    console.warn(error, params.subject);
    return { ok: false, error };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  const from = process.env.SMTP_FROM || "pixleh <no-reply@localhost>";

  try {
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
      attachments: params.attachments,
    });
    return { ok: true };
  } catch (e) {
    let error = e instanceof Error ? e.message : String(e);
    // Cause la plus fréquente d'échec silencieux avec Resend : tant que le domaine d'envoi
    // n'est pas vérifié dans le dashboard Resend, l'adresse "sandbox" onboarding@resend.dev
    // ne peut envoyer QUE vers l'email du propriétaire du compte Resend — tout autre
    // destinataire (le studio, un client...) est rejeté. Repéré le 31/07/2026 en creusant
    // pourquoi l'email "contrat signé" n'atteignait jamais le studio malgré un code correct.
    if (from.includes("resend.dev")) {
      error +=
        " — Cause probable : expéditeur onboarding@resend.dev (sandbox Resend), qui ne peut " +
        "envoyer qu'à l'adresse email de votre compte Resend tant qu'aucun domaine n'est " +
        "vérifié. Vérifiez un domaine dans le dashboard Resend puis mettez à jour SMTP_FROM.";
    }
    console.error("Envoi email échoué :", error);
    return { ok: false, error };
  }
}
