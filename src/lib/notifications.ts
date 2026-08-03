import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMail, type SendMailResult } from "@/lib/mailer";
import { buildEmailSignature } from "@/lib/emailSignature";

/**
 * Tous les emails "système" de la plateforme pixleh (par opposition aux emails
 * studio→client envoyés depuis /dashboard/clients, voir src/app/api/clients/[id]/messages) :
 * bienvenue + vérification à l'inscription, mot de passe oublié, galerie prête, et
 * notifications au studio (nouvelle réservation/commande/facture payée). Centralisé ici
 * plutôt qu'éclaté dans chaque route pour garder un seul endroit qui connaît le HTML des
 * emails et la construction des liens `${APP_URL}/...`.
 */

function appUrl(path: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

/** Jeton hex 32 octets — utilisé pour les liens de vérification email et de réinitialisation
 * de mot de passe. Nettement plus d'entropie qu'un cuid()/randomUUID(), volontairement : ces
 * jetons donnent accès (temporairement) à une action sensible (changer le mot de passe,
 * confirmer un compte) sans autre vérification. */
export function generateSecureToken() {
  return randomBytes(32).toString("hex");
}

const BUTTON_STYLE =
  "display:inline-block;margin-top:16px;padding:11px 22px;background:#7c3aed;color:#ffffff;" +
  "font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;";

function wrapEmail(bodyHtml: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6;max-width:520px;">${bodyHtml}</div>`;
}

/**
 * Email de bienvenue à l'inscription — combine bienvenue + vérification d'adresse en UN
 * seul envoi (plutôt que deux emails séparés) : plus proche de ce que font des SaaS pro
 * (Notion, Linear...) et évite d'encombrer la boîte du nouveau studio. Si `verifyToken` est
 * omis (compte Social Login, adresse déjà confirmée par le fournisseur OAuth), l'email ne
 * contient que le message de bienvenue, sans CTA de vérification.
 */
export async function sendWelcomeEmail(params: {
  ownerName: string;
  ownerEmail: string;
  studioName: string;
  verifyToken?: string;
}) {
  const verifyBlock = params.verifyToken
    ? `<p>Confirmez votre adresse email pour activer toutes les fonctionnalités de votre compte :</p>
       <a href="${appUrl(`/api/auth/verify-email?token=${params.verifyToken}`)}" style="${BUTTON_STYLE}">Confirmer mon email</a>
       <p style="margin-top:20px;font-size:12px;color:#9ca3af;">Ce lien expire dans 48 heures.</p>`
    : "";

  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Bienvenue sur pixleh, ${escapeHtml(params.ownerName)} !</h2>
    <p>Votre studio <strong>${escapeHtml(params.studioName)}</strong> est prêt. Vous pouvez dès maintenant créer vos
    premières galeries, personnaliser votre site public et inviter vos clients.</p>
    ${verifyBlock}
  `);

  await sendMail({
    to: params.ownerEmail,
    subject: `Bienvenue sur pixleh, ${params.studioName} !`,
    text: `Bienvenue ${params.ownerName} ! Votre studio ${params.studioName} est prêt.${
      params.verifyToken ? ` Confirmez votre email : ${appUrl(`/api/auth/verify-email?token=${params.verifyToken}`)}` : ""
    }`,
    html,
  });
}

/** Renvoyé depuis Réglages si l'utilisateur n'a pas reçu/cliqué le lien de bienvenue. */
export async function sendVerificationEmail(params: { ownerName: string; ownerEmail: string; verifyToken: string }) {
  const link = appUrl(`/api/auth/verify-email?token=${params.verifyToken}`);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Confirmez votre adresse email</h2>
    <p>Bonjour ${escapeHtml(params.ownerName)},</p>
    <p>Cliquez ci-dessous pour confirmer votre adresse email sur pixleh :</p>
    <a href="${link}" style="${BUTTON_STYLE}">Confirmer mon email</a>
    <p style="margin-top:20px;font-size:12px;color:#9ca3af;">Ce lien expire dans 48 heures.</p>
  `);
  await sendMail({
    to: params.ownerEmail,
    subject: "Confirmez votre adresse email — pixleh",
    text: `Confirmez votre adresse email : ${link}`,
    html,
  });
}

export async function sendPasswordResetEmail(params: { ownerName: string; ownerEmail: string; resetToken: string }) {
  const link = appUrl(`/reset-password/${params.resetToken}`);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Réinitialisation de mot de passe</h2>
    <p>Bonjour ${escapeHtml(params.ownerName)},</p>
    <p>Vous avez demandé à réinitialiser votre mot de passe pixleh. Cliquez ci-dessous pour en choisir un nouveau :</p>
    <a href="${link}" style="${BUTTON_STYLE}">Réinitialiser mon mot de passe</a>
    <p style="margin-top:20px;font-size:12px;color:#9ca3af;">
      Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email —
      votre mot de passe reste inchangé.
    </p>
  `);
  await sendMail({
    to: params.ownerEmail,
    subject: "Réinitialisation de votre mot de passe — pixleh",
    text: `Réinitialisez votre mot de passe : ${link} (expire dans 1 heure)`,
    html,
  });
}

/** Galerie publiée (DRAFT/ARCHIVED → PUBLISHED) avec un client rattaché : le prévient que
 * ses photos sont prêtes. Le mot de passe éventuel de la galerie est inclus directement
 * (comme chez Pixieset) — c'est un code d'accès aux photos, pas un secret de compte. */
export async function sendGalleryReadyEmail(params: {
  clientName: string;
  clientEmail: string;
  galleryTitle: string;
  gallerySlug: string;
  galleryPassword: string | null;
  studio: { name: string; slug: string; logoUrl: string | null; brandColor: string | null };
  settings: { contactEmail: string | null; contactPhone: string | null } | null;
}) {
  const link = appUrl(`/g/${params.gallerySlug}`);
  const signature = buildEmailSignature(params.studio, params.settings);
  const passwordBlock = params.galleryPassword
    ? `<p style="margin-top:12px;">Mot de passe d'accès : <strong>${escapeHtml(params.galleryPassword)}</strong></p>`
    : "";

  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Vos photos sont prêtes !</h2>
    <p>Bonjour ${escapeHtml(params.clientName)},</p>
    <p><strong>${escapeHtml(params.studio.name)}</strong> vient de publier votre galerie
    « ${escapeHtml(params.galleryTitle)} ». Vous pouvez dès maintenant la consulter, sélectionner vos favoris
    et télécharger vos photos.</p>
    ${passwordBlock}
    <a href="${link}" style="${BUTTON_STYLE}">Voir ma galerie</a>
    <p style="margin-top:16px;font-size:12px;color:#9ca3af;">
      Astuce : retrouvez toutes vos galeries (même de plusieurs photographes) dans
      <a href="${appUrl("/client/login")}" style="color:#7c3aed;">votre espace client</a>.
    </p>
  `);

  // Renvoie le résultat de sendMail (plutôt qu'un simple void) pour que les appelants qui
  // déclenchent cet envoi de façon interactive (bouton "Partager au client" dans
  // GalleryManager, voir /api/galleries/[id]/share-to-client) puissent afficher un message
  // d'erreur clair si le SMTP n'est pas configuré ou si l'envoi échoue — jusqu'ici cette
  // fonction n'était appelée qu'en fire-and-forget (.catch(console.error)) depuis la
  // transition de statut PUBLISHED, où un échec silencieux était acceptable.
  return sendMail({
    to: params.clientEmail,
    subject: `Votre galerie « ${params.galleryTitle} » est prête !`,
    text: [
      `Bonjour ${params.clientName}, votre galerie « ${params.galleryTitle} » est prête : ${link}`,
      params.galleryPassword ? `Mot de passe : ${params.galleryPassword}` : "",
      `Retrouvez toutes vos galeries : ${appUrl("/client/login")}`,
      signature.text,
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: `${html}${signature.html}`,
  });
}

/** Envoyé au client quand le studio crée un contrat en le rattachant à un client (voir POST
 * /api/contracts) : contient le lien de signature (/c/[id]). Même patron que
 * sendGalleryReadyEmail (lien direct + signature de contact du studio). */
export async function sendContractSignEmail(params: {
  clientName: string;
  clientEmail: string;
  contractTitle: string;
  contractId: string;
  studio: { name: string; slug: string; logoUrl: string | null; brandColor: string | null };
  settings: { contactEmail: string | null; contactPhone: string | null } | null;
}) {
  const link = appUrl(`/c/${params.contractId}`);
  const signature = buildEmailSignature(params.studio, params.settings);

  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Un contrat à signer</h2>
    <p>Bonjour ${escapeHtml(params.clientName)},</p>
    <p><strong>${escapeHtml(params.studio.name)}</strong> vous a envoyé le contrat
    « ${escapeHtml(params.contractTitle)} » à consulter et signer en ligne.</p>
    <a href="${link}" style="${BUTTON_STYLE}">Consulter et signer</a>
  `);

  // Renvoie le résultat de sendMail (voir sendGalleryReadyEmail ci-dessus) pour que l'appelant
  // (POST /api/contracts, déclenché de façon interactive par "Créer et générer le lien")
  // puisse prévenir le studio si l'envoi échoue plutôt que de le croire réussi à tort.
  return sendMail({
    to: params.clientEmail,
    subject: `Contrat à signer — ${params.contractTitle}`,
    text: [
      `Bonjour ${params.clientName}, ${params.studio.name} vous a envoyé le contrat « ${params.contractTitle} » à consulter et signer : ${link}`,
      signature.text,
    ].join("\n\n"),
    html: `${html}${signature.html}`,
  });
}

/** Envoyé au client quand le studio crée une facture en la rattachant à un client (voir POST
 * /api/invoices) : contient le lien de paiement (/i/[id]). Même patron que
 * sendContractSignEmail (lien direct + signature de contact du studio) — refonte facturation
 * du 31/07/2026 demandée par Adriel. */
export async function sendInvoiceEmail(params: {
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  invoiceId: string;
  totalCents: number;
  currency: string;
  dueDate: Date | null;
  studio: { name: string; slug: string; logoUrl: string | null; brandColor: string | null };
  settings: { contactEmail: string | null; contactPhone: string | null } | null;
  /** Notes libres de la facture (voir Invoice.notes / InvoiceForm) — reprises telles quelles
   * dans l'email plutôt que seulement sur /i/[id] et le PDF (demande d'Adriel, 31/07/2026) :
   * en attendant Stripe Connect, un studio qui accepte les paiements par virement y indique
   * son IBAN, qui doit être visible par le client sans qu'il ait besoin de cliquer sur le
   * lien de la facture. */
  notes?: string | null;
  /** Coordonnées bancaires du studio (StudioSettings.iban/bic/bankName) — reprises
   * automatiquement dans un bloc dédié "Réglez par virement" (31/07/2026, demande d'Adriel :
   * éviter au studio de devoir retaper son IBAN dans les Notes de chaque facture). Absent ou
   * iban null → bloc omis. */
  bankDetails?: { iban: string | null; bic: string | null; bankName: string | null } | null;
}) {
  const link = appUrl(`/i/${params.invoiceId}`);
  const pdfLink = appUrl(`/api/invoices/${params.invoiceId}/pdf`);
  const signature = buildEmailSignature(params.studio, params.settings);
  const amount = formatAmount(params.totalCents, params.currency);
  const dueLine = params.dueDate ? ` — échéance le ${params.dueDate.toLocaleDateString("fr-FR")}` : "";
  const notesBlock = buildInvoiceNotesBlock(params.notes);
  const bankBlock = buildBankDetailsBlock(params.bankDetails);

  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Nouvelle facture</h2>
    <p>Bonjour ${escapeHtml(params.clientName)},</p>
    <p><strong>${escapeHtml(params.studio.name)}</strong> vous a envoyé la facture
    <strong>${escapeHtml(params.invoiceNumber)}</strong> d'un montant de <strong>${amount}</strong>${dueLine}.</p>
    ${notesBlock.html}
    ${bankBlock.html}
    <a href="${link}" style="${BUTTON_STYLE}">Consulter votre facture</a>
    <p style="margin-top:14px;font-size:13px;">
      <a href="${pdfLink}" style="color:#6b7280;text-decoration:underline;">Télécharger la facture (PDF)</a>
    </p>
  `);

  // Renvoie le résultat de sendMail (voir sendContractSignEmail ci-dessus) pour que l'appelant
  // (POST /api/invoices) puisse prévenir le studio si l'envoi échoue plutôt que de le croire
  // réussi à tort.
  return sendMail({
    to: params.clientEmail,
    subject: `Facture ${params.invoiceNumber} — ${amount}`,
    text: [
      `Bonjour ${params.clientName}, ${params.studio.name} vous a envoyé la facture ${params.invoiceNumber} (${amount})${dueLine}. Consultez votre facture ici : ${link}`,
      notesBlock.text,
      bankBlock.text,
      // Lien direct de téléchargement du PDF — demandé par Adriel, 31/07/2026 : le client
      // doit pouvoir simplement récupérer la facture (ex: pour un règlement par virement à
      // partir de l'IBAN indiqué en note) sans passer par la page de paiement en ligne.
      `Télécharger la facture (PDF) : ${pdfLink}`,
      signature.text,
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: `${html}${signature.html}`,
  });
}

/** Relance manuelle d'une facture en attente (bouton "Relancer" sur /dashboard/invoices) —
 * même contenu que sendInvoiceEmail mais formulé comme un rappel plutôt qu'un premier envoi. */
/**
 * `stage` distingue les 3 paliers de relance automatique (31/07/2026, demande d'Adriel : "un
 * send mail de rappel au client à chaque 2 jours avant, puis 1 jour avant et le jour J") du
 * bouton "Relancer" manuel existant (stage omis) — ajuste seulement le titre/objet pour rester
 * cohérent avec l'échéance réelle, le corps de l'email reste identique. Voir
 * /api/cron/invoice-reminders pour l'appelant automatique et /api/invoices/[id]/send pour le
 * bouton manuel (qui n'envoie pas de stage, comportement inchangé).
 */
export async function sendInvoiceReminderEmail(
  params: Parameters<typeof sendInvoiceEmail>[0] & { stage?: "2d" | "1d" | "due" }
) {
  const link = appUrl(`/i/${params.invoiceId}`);
  const pdfLink = appUrl(`/api/invoices/${params.invoiceId}/pdf`);
  const signature = buildEmailSignature(params.studio, params.settings);
  const amount = formatAmount(params.totalCents, params.currency);
  const dueLine = params.dueDate ? ` — échéance le ${params.dueDate.toLocaleDateString("fr-FR")}` : "";
  const notesBlock = buildInvoiceNotesBlock(params.notes);
  const bankBlock = buildBankDetailsBlock(params.bankDetails);
  const stageLabel =
    params.stage === "2d"
      ? "L'échéance approche : plus que 2 jours"
      : params.stage === "1d"
        ? "L'échéance approche : plus que 1 jour"
        : params.stage === "due"
          ? "La facture arrive à échéance aujourd'hui"
          : null;

  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Rappel : facture en attente</h2>
    <p>Bonjour ${escapeHtml(params.clientName)},</p>
    ${stageLabel ? `<p style="color:#b45309;font-weight:600;">${stageLabel}</p>` : ""}
    <p>Petit rappel : la facture <strong>${escapeHtml(params.invoiceNumber)}</strong> de
    <strong>${amount}</strong>${dueLine} envoyée par <strong>${escapeHtml(params.studio.name)}</strong>
    est toujours en attente de règlement.</p>
    ${notesBlock.html}
    ${bankBlock.html}
    <a href="${link}" style="${BUTTON_STYLE}">Consulter votre facture</a>
    <p style="margin-top:14px;font-size:13px;">
      <a href="${pdfLink}" style="color:#6b7280;text-decoration:underline;">Télécharger la facture (PDF)</a>
    </p>
  `);

  return sendMail({
    to: params.clientEmail,
    subject: `Rappel — Facture ${params.invoiceNumber} en attente (${amount})`,
    text: [
      `Bonjour ${params.clientName}, rappel : la facture ${params.invoiceNumber} (${amount})${dueLine} de ${params.studio.name} est toujours en attente de règlement. Consultez votre facture ici : ${link}`,
      notesBlock.text,
      bankBlock.text,
      `Télécharger la facture (PDF) : ${pdfLink}`,
      signature.text,
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: `${html}${signature.html}`,
  });
}

/** Bloc "Notes du studio" partagé par sendInvoiceEmail/sendInvoiceReminderEmail — voir la doc
 * du paramètre `notes` ci-dessus. Retourne des chaînes vides (pas null) pour rester simple à
 * insérer directement dans les templates HTML/texte sans conditionnelle supplémentaire côté
 * appelant. */
function buildInvoiceNotesBlock(notes?: string | null): { html: string; text: string } {
  if (!notes || !notes.trim()) return { html: "", text: "" };
  return {
    html: `<p style="background:#f9fafb;border-radius:8px;padding:12px 14px;white-space:pre-line;color:#374151;">${escapeHtml(notes)}</p>`,
    text: notes,
  };
}

/** Bloc "Réglez par virement" partagé par sendInvoiceEmail/sendInvoiceReminderEmail — reprend
 * automatiquement StudioSettings.iban/bic/bankName (31/07/2026, demande d'Adriel : remplacer le
 * copier-coller manuel de l'IBAN dans les Notes de chaque facture par un réglage unique,
 * réutilisé partout). Omis si l'IBAN n'est pas renseigné. */
function buildBankDetailsBlock(
  bank?: { iban: string | null; bic: string | null; bankName: string | null } | null
): { html: string; text: string } {
  if (!bank?.iban) return { html: "", text: "" };
  const lines = [
    { label: "IBAN", value: bank.iban },
    { label: "BIC", value: bank.bic },
    { label: "Banque", value: bank.bankName },
  ].filter((l) => l.value);

  return {
    html: `
      <div style="background:#f5f3ff;border-radius:8px;padding:12px 14px;margin-top:10px;">
        <p style="margin:0 0 6px;font-weight:600;color:#5b21b6;">Réglez par virement</p>
        ${lines.map((l) => `<p style="margin:0;color:#374151;">${l.label} : <strong>${escapeHtml(l.value as string)}</strong></p>`).join("")}
      </div>
    `,
    text: ["Réglez par virement :", ...lines.map((l) => `${l.label} : ${l.value}`)].join("\n"),
  };
}

/** Confirmation envoyée au client après un paiement réussi — demandé par Adriel, 31/07/2026 :
 * "lui dire paiement effectué et faire un email [...] et notifier qu'il va recevoir la facture
 * dans son email". Déclenchée à la fois pour le paiement en ligne (voir markInvoicePaidFromStripe
 * dans src/lib/invoicePayment.ts) et pour un règlement enregistré manuellement par le studio
 * (espèces/chèque/virement, voir /api/invoices/[id]/mark-paid — même demande d'Adriel, même
 * jour : "quand on clique sur confirmé le paiement il faut faire un send mail au client"). */
export async function sendClientInvoicePaidEmail(params: {
  clientEmail: string;
  clientName: string;
  invoiceId: string;
  invoiceNumber: string;
  totalCents: number;
  currency: string;
  studio: { name: string; slug: string; logoUrl: string | null; brandColor: string | null };
  settings: { contactEmail: string | null; contactPhone: string | null } | null;
}) {
  const link = appUrl(`/i/${params.invoiceId}`);
  const signature = buildEmailSignature(params.studio, params.settings);
  const amount = formatAmount(params.totalCents, params.currency);

  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Paiement reçu, merci !</h2>
    <p>Bonjour ${escapeHtml(params.clientName)},</p>
    <p>Nous confirmons la bonne réception de votre paiement de <strong>${amount}</strong> pour la
    facture <strong>${escapeHtml(params.invoiceNumber)}</strong> auprès de
    <strong>${escapeHtml(params.studio.name)}</strong>.</p>
    <p>Vous pouvez dès à présent consulter et télécharger votre facture acquittée depuis le lien
    ci-dessous.</p>
    <a href="${link}" style="${BUTTON_STYLE}">Voir ma facture</a>
  `);

  return sendMail({
    to: params.clientEmail,
    subject: `Paiement reçu — Facture ${params.invoiceNumber} (${amount})`,
    text: [
      `Bonjour ${params.clientName}, nous confirmons la bonne réception de votre paiement de ${amount} pour la facture ${params.invoiceNumber} auprès de ${params.studio.name}. Vous pouvez consulter et télécharger votre facture ici : ${link}`,
      signature.text,
    ].join("\n\n"),
    html: `${html}${signature.html}`,
  });
}

/** Confirme l'email d'un ClientAccount (espace Client unifié, voir /client/login) avant
 * d'activer le mot de passe qu'il vient de créer — même patron que sendVerificationEmail
 * (compte studio), lien géré par /api/client-portal/verify-email. */
export async function sendClientAccountVerificationEmail(params: {
  email: string;
  verifyToken: string;
}) {
  const link = appUrl(`/api/client-portal/verify-email?token=${params.verifyToken}`);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Confirmez votre adresse email</h2>
    <p>Cliquez ci-dessous pour confirmer votre adresse email et activer votre espace client pixleh,
    où vous retrouverez toutes vos galeries :</p>
    <a href="${link}" style="${BUTTON_STYLE}">Confirmer mon email</a>
    <p style="margin-top:20px;font-size:12px;color:#9ca3af;">Ce lien expire dans 48 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
  `);
  await sendMail({
    to: params.email,
    subject: "Confirmez votre adresse email — Mon espace pixleh",
    text: `Confirmez votre adresse email pour activer votre espace client : ${link}`,
    html,
  });
}

/**
 * Adresse à notifier côté studio (nouvelle réservation/commande/facture payée...) — même
 * priorité que /api/contact : `StudioSettings.contactEmail` en premier (réglage explicite du
 * studio), sinon repli sur l'email du premier utilisateur OWNER (toujours présent, lui).
 */
export async function resolveStudioNotifyEmail(studioId: string): Promise<string | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    include: { settings: true },
  });
  if (studio?.settings?.contactEmail) return studio.settings.contactEmail;

  const owner = await prisma.user.findFirst({ where: { studioId, role: "OWNER" } });
  return owner?.email ?? null;
}

export async function sendStudioNewBookingEmail(params: {
  studioId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  startsAt: Date;
  notes: string | null;
}) {
  const to = await resolveStudioNotifyEmail(params.studioId);
  if (!to) return;

  const dateLabel = params.startsAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Nouvelle demande de réservation</h2>
    <p><strong>${escapeHtml(params.customerName)}</strong> (${escapeHtml(params.customerEmail)}${
    params.customerPhone ? ` · ${escapeHtml(params.customerPhone)}` : ""
  }) souhaite réserver une séance le <strong>${dateLabel}</strong>.</p>
    ${params.notes ? `<p style="color:#6b7280;">« ${escapeHtml(params.notes)} »</p>` : ""}
    <a href="${appUrl("/dashboard/bookings")}" style="${BUTTON_STYLE}">Voir la demande</a>
  `);

  await sendMail({
    to,
    subject: `Nouvelle demande de réservation — ${params.customerName}`,
    text: `${params.customerName} (${params.customerEmail}) souhaite réserver le ${dateLabel}. Voir : ${appUrl("/dashboard/bookings")}`,
    html,
    replyTo: params.customerEmail,
  });
}

/** Confirmation envoyée au CLIENT (pas au studio, voir sendStudioNewBookingEmail ci-dessus)
 * après la création d'une demande de réservation depuis la vitrine publique /s/[slug]/book
 * — jusqu'ici seul le studio était notifié, le client n'avait aucune confirmation par email
 * de sa demande. La réservation reste en statut PENDING tant que le studio ne l'a pas
 * confirmée manuellement (voir /api/bookings/[id]) : l'email le précise pour éviter toute
 * confusion ("j'ai réservé" vs "ma demande est en attente"). */
export async function sendClientBookingConfirmationEmail(params: {
  customerName: string;
  customerEmail: string;
  studioName: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const dateLabel = params.startsAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Demande de réservation reçue</h2>
    <p>Bonjour ${escapeHtml(params.customerName)},</p>
    <p>Votre demande de réservation le <strong>${dateLabel}</strong> auprès de
    <strong>${escapeHtml(params.studioName)}</strong> a bien été reçue.</p>
    <p>Elle est en attente de confirmation : ${escapeHtml(params.studioName)} vous recontactera
    prochainement pour la confirmer.</p>
  `);

  return sendMail({
    to: params.customerEmail,
    subject: `Demande de réservation reçue — ${params.studioName}`,
    text: `Bonjour ${params.customerName}, votre demande de réservation le ${dateLabel} auprès de ${params.studioName} a bien été reçue. Elle est en attente de confirmation, ${params.studioName} vous recontactera prochainement.`,
    html,
  });
}

/** Nouveau visiteur sur le lien invité d'une galerie (voir /api/guest-access) — n'est
 * appelé que pour un email jamais vu sur cette galerie (première visite), pas à chaque
 * retour du même invité, pour ne pas spammer le studio. */
export async function sendStudioNewGalleryGuestEmail(params: {
  studioId: string;
  galleryId: string;
  galleryTitle: string;
  guestEmail: string;
}) {
  const to = await resolveStudioNotifyEmail(params.studioId);
  if (!to) return;

  const link = appUrl(`/dashboard/galleries/${params.galleryId}`);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Nouvel invité sur une galerie</h2>
    <p><strong>${escapeHtml(params.guestEmail)}</strong> vient d'accéder à la galerie
    « ${escapeHtml(params.galleryTitle)} » via le lien invité.</p>
    <a href="${link}" style="${BUTTON_STYLE}">Voir la galerie</a>
  `);

  await sendMail({
    to,
    subject: `Nouvel invité — ${params.galleryTitle}`,
    text: `${params.guestEmail} vient d'accéder à la galerie « ${params.galleryTitle} » via le lien invité. Voir : ${link}`,
    html,
  });
}

/**
 * Envoyé au CLIENT (Gallery.client, pas au studio) quand Gallery.requireGuestApproval est
 * actif et qu'un nouvel email demande l'accès au lien invité — voir /api/guest-access. Le
 * client choisit, sur la page pointée par le lien (pas de simple lien "un clic", pour
 * permettre le choix des sets), d'accorder l'accès à tous les sets ou seulement certains,
 * ou de refuser. N'est jamais envoyé si la galerie n'a pas de client rattaché (Gallery.client
 * nullable) — dans ce cas la demande reste PENDING indéfiniment, comportement volontaire :
 * mieux vaut bloquer que d'accorder sans personne pour valider.
 */
export async function sendClientGuestApprovalRequestEmail(params: {
  clientName: string;
  clientEmail: string;
  galleryTitle: string;
  guestEmail: string;
  approvalToken: string;
}) {
  const link = appUrl(`/approve-guest/${params.approvalToken}`);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Nouvelle demande d'accès</h2>
    <p>Bonjour ${escapeHtml(params.clientName)},</p>
    <p><strong>${escapeHtml(params.guestEmail)}</strong> souhaite accéder à votre galerie
    « ${escapeHtml(params.galleryTitle)} ». Vous pouvez choisir de lui donner accès à toutes les
    photos ou seulement à certaines, ou de refuser cette demande.</p>
    <a href="${link}" style="${BUTTON_STYLE}">Traiter la demande</a>
    <p style="margin-top:20px;font-size:12px;color:#9ca3af;">Ce lien est à usage unique et n'expire pas tant que la demande n'a pas été traitée.</p>
  `);

  await sendMail({
    to: params.clientEmail,
    subject: `Demande d'accès à « ${params.galleryTitle} »`,
    text: `${params.guestEmail} souhaite accéder à votre galerie « ${params.galleryTitle} ». Traitez la demande ici : ${link}`,
    html,
  });
}

/** Envoyé à l'invité une fois sa demande approuvée par le client — il n'était pas notifié
 * automatiquement autrement (pas de compte, pas de session active pendant l'attente). */
export async function sendGuestAccessApprovedEmail(params: {
  guestEmail: string;
  galleryTitle: string;
  guestSlug: string;
}) {
  const link = appUrl(`/invite/${params.guestSlug}`);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Accès accordé !</h2>
    <p>Votre demande d'accès à la galerie « ${escapeHtml(params.galleryTitle)} » a été acceptée.
    Vous pouvez dès maintenant la consulter.</p>
    <a href="${link}" style="${BUTTON_STYLE}">Voir la galerie</a>
  `);

  await sendMail({
    to: params.guestEmail,
    subject: `Accès accordé — ${params.galleryTitle}`,
    text: `Votre demande d'accès à la galerie « ${params.galleryTitle} » a été acceptée : ${link}`,
    html,
  });
}

/** Prévient le studio quand un client signe un contrat (voir POST /api/contracts/[id]/sign) —
 * même patron que sendStudioOrderPaidEmail/sendStudioInvoicePaidEmail : notification interne,
 * pas de lien vers la page publique de signature (le studio consulte depuis son dashboard). */
export async function sendStudioContractSignedEmail(params: {
  studioId: string;
  contractId: string;
  contractTitle: string;
  signedByName: string;
}): Promise<SendMailResult> {
  const to = await resolveStudioNotifyEmail(params.studioId);
  // `sendMail` ne lève jamais d'exception en cas d'échec (voir mailer.ts) : sans ce log, un
  // échec silencieux ici (pas d'adresse de notification, ou SMTP en échec) ne laissait
  // absolument aucune trace — symptôme rapporté par Adriel ("le studio ne reçoit pas le
  // mail"). On journalise donc explicitement les deux cas d'échec possibles.
  if (!to) {
    console.warn(
      `Email "contrat signé" non envoyé : aucune adresse de notification pour le studio ${params.studioId} ` +
        `(ni StudioSettings.contactEmail, ni utilisateur OWNER avec un email).`
    );
    return { ok: false, error: "Aucune adresse de notification configurée pour ce studio." };
  }

  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Contrat signé</h2>
    <p><strong>${escapeHtml(params.signedByName)}</strong> vient de signer le contrat
    « ${escapeHtml(params.contractTitle)} ».</p>
    <a href="${appUrl("/dashboard/contracts")}" style="${BUTTON_STYLE}">Voir le contrat</a>
  `);

  const result = await sendMail({
    to,
    subject: `Contrat signé — ${params.contractTitle}`,
    text: `${params.signedByName} vient de signer le contrat « ${params.contractTitle} ». Voir : ${appUrl("/dashboard/contracts")}`,
    html,
  });
  if (!result.ok) {
    console.error(`Email "contrat signé" non envoyé à ${to} :`, result.error);
  }
  return result;
}

export async function sendStudioOrderPaidEmail(params: {
  studioId: string;
  customerName: string;
  customerEmail: string;
  totalCents: number;
  currency: string;
}) {
  const to = await resolveStudioNotifyEmail(params.studioId);
  if (!to) return;

  const amount = formatAmount(params.totalCents, params.currency);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Nouvelle commande payée</h2>
    <p><strong>${escapeHtml(params.customerName)}</strong> (${escapeHtml(params.customerEmail)}) vient de payer une
    commande de <strong>${amount}</strong>.</p>
    <a href="${appUrl("/dashboard/orders")}" style="${BUTTON_STYLE}">Voir la commande</a>
  `);

  await sendMail({
    to,
    subject: `Commande payée — ${amount}`,
    text: `${params.customerName} (${params.customerEmail}) a payé une commande de ${amount}. Voir : ${appUrl("/dashboard/orders")}`,
    html,
  });
}

/** Confirmation envoyée au CLIENT (pas au studio, voir sendStudioOrderPaidEmail ci-dessus)
 * après le paiement réussi d'une commande d'impression (catalogue impression plateforme,
 * voir /api/cart/checkout et le webhook Stripe checkout.session.completed) — jusqu'ici seul
 * le studio était notifié, le client n'avait aucune confirmation par email de son paiement.
 * Volontairement sobre (pas de lien de suivi de commande, qui n'existe pas encore côté
 * client) : confirme juste la réception du paiement et que l'impression/expédition suit. */
export async function sendClientOrderPaidEmail(params: {
  customerEmail: string;
  customerName: string;
  studioName: string;
  totalCents: number;
  currency: string;
}) {
  const amount = formatAmount(params.totalCents, params.currency);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Paiement reçu, merci !</h2>
    <p>Bonjour ${escapeHtml(params.customerName)},</p>
    <p>Votre commande de <strong>${amount}</strong> auprès de <strong>${escapeHtml(params.studioName)}</strong>
    a bien été reçue et est en cours de traitement.</p>
    <p>Elle sera expédiée dès son impression. Vous serez recontacté(e) par
    <strong>${escapeHtml(params.studioName)}</strong> si besoin.</p>
  `);

  return sendMail({
    to: params.customerEmail,
    subject: `Paiement reçu — votre commande chez ${params.studioName}`,
    text: `Bonjour ${params.customerName}, votre commande de ${amount} auprès de ${params.studioName} a bien été reçue et est en cours de traitement. Elle sera expédiée dès son impression.`,
    html,
  });
}

export async function sendStudioInvoicePaidEmail(params: {
  studioId: string;
  invoiceNumber: string;
  clientName: string | null;
  totalCents: number;
  currency: string;
}) {
  const to = await resolveStudioNotifyEmail(params.studioId);
  if (!to) return;

  const amount = formatAmount(params.totalCents, params.currency);
  const html = wrapEmail(`
    <h2 style="color:#111827;font-size:19px;margin:0 0 12px;">Facture payée</h2>
    <p>La facture <strong>${escapeHtml(params.invoiceNumber)}</strong>${
    params.clientName ? ` (${escapeHtml(params.clientName)})` : ""
  } de <strong>${amount}</strong> vient d'être réglée.</p>
    <a href="${appUrl("/dashboard/invoices")}" style="${BUTTON_STYLE}">Voir la facture</a>
  `);

  await sendMail({
    to,
    subject: `Facture ${params.invoiceNumber} payée — ${amount}`,
    text: `La facture ${params.invoiceNumber} de ${amount} vient d'être réglée. Voir : ${appUrl("/dashboard/invoices")}`,
    html,
  });
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
