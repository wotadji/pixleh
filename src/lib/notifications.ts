import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
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
  `);

  await sendMail({
    to: params.clientEmail,
    subject: `Votre galerie « ${params.galleryTitle} » est prête !`,
    text: [
      `Bonjour ${params.clientName}, votre galerie « ${params.galleryTitle} » est prête : ${link}`,
      params.galleryPassword ? `Mot de passe : ${params.galleryPassword}` : "",
      signature.text,
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: `${html}${signature.html}`,
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
