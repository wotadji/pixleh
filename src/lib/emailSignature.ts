/**
 * Signature ajoutée en pied des emails envoyés à un client depuis /dashboard/clients
 * (demandé par Adriel : "à chaque message envoyé mettre un footer avec logo et
 * informations du photographe, comme une signature"). Volontairement en tables HTML avec
 * styles inline — c'est la seule mise en forme fiable dans la majorité des clients mail
 * (Gmail/Outlook ignorent ou cassent les balises <style> et le CSS moderne).
 *
 * N'est ajoutée qu'au HTML/texte réellement envoyé par email — jamais à `ClientMessage.body`
 * stocké en base, pour ne pas répéter la signature à chaque bulle du fil de discussion
 * affiché dans le panel (voir /dashboard/clients, ClientsPage).
 */

type SignatureStudio = {
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string | null;
};

type SignatureSettings = {
  contactEmail: string | null;
  contactPhone: string | null;
} | null;

function absoluteUrl(path: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export function buildEmailSignature(studio: SignatureStudio, settings: SignatureSettings) {
  const accent = studio.brandColor || "#7c3aed";
  const siteUrl = absoluteUrl(`/s/${studio.slug}`);
  const logoAbsoluteUrl = studio.logoUrl ? absoluteUrl(studio.logoUrl) : null;

  const contactLines = [settings?.contactPhone, settings?.contactEmail].filter(Boolean) as string[];

  const logoCell = logoAbsoluteUrl
    ? `<td style="vertical-align:top;padding-right:14px;">
         <img src="${logoAbsoluteUrl}" width="56" height="56" alt="${escapeHtml(studio.name)}"
              style="display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;" />
       </td>`
    : "";

  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        ${logoCell}
        <td style="vertical-align:top;font-size:13px;line-height:1.6;color:#374151;">
          <div style="font-weight:700;color:#111827;font-size:14px;">${escapeHtml(studio.name)}</div>
          ${contactLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
          <div style="margin-top:2px;">
            <a href="${siteUrl}" style="color:${accent};text-decoration:none;">${siteUrl.replace(/^https?:\/\//, "")}</a>
          </div>
        </td>
      </tr>
    </table>
  `.trim();

  const text = [
    "—",
    studio.name,
    ...contactLines,
    siteUrl,
  ].join("\n");

  return { html, text };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
