import { prisma } from "@/lib/prisma";
import { slugify, randomSuffix, isReservedStudioSlug } from "@/lib/slug";
import { generateSecureToken, sendWelcomeEmail } from "@/lib/notifications";

interface ProvisionStudioParams {
  studioName: string;
  ownerName: string;
  ownerEmail: string;
  /** null pour un compte créé via Social Login (aucun mot de passe défini). */
  passwordHash?: string | null;
  image?: string | null;
  /** true pour un compte créé via Social Login : l'adresse est déjà confirmée par le
   * fournisseur OAuth (Google, GitHub...), on la marque donc vérifiée immédiatement au lieu
   * d'envoyer un email de confirmation qui n'a pas lieu d'être. */
  oauthVerified?: boolean;
}

/**
 * Crée un nouveau Studio (tenant) avec son premier utilisateur OWNER, ses réglages par
 * défaut et sa page d'accueil — le même "kit de démarrage" que /api/auth/register, mais
 * factorisé pour être aussi appelé depuis le flux Social Login (voir signIn() dans
 * src/lib/auth.ts) : un nouvel utilisateur qui arrive via Google/GitHub/etc. doit lui
 * aussi obtenir un Studio fonctionnel dès sa première connexion, pas juste une ligne User.
 */
export async function provisionStudioWithOwner({
  studioName,
  ownerName,
  ownerEmail,
  passwordHash,
  image,
  oauthVerified,
}: ProvisionStudioParams) {
  let slug = slugify(studioName) || "studio";
  // isReservedStudioSlug évite qu'un studio obtienne un slug identique à une route système
  // (ex: "admin", "client", "tarifs"...) — indispensable depuis que la page portfolio d'une
  // galerie individuelle vit à la racine (/[studioSlug]/[gallerySlug]), voir slug.ts.
  const slugTaken =
    isReservedStudioSlug(slug) || (await prisma.studio.findUnique({ where: { slug } }));
  if (slugTaken) slug = `${slug}-${randomSuffix(4)}`;
  // Cas extrême mais possible : le slug généré (nom + suffixe aléatoire) retombe lui-même
  // sur un mot réservé ou une collision — on boucle jusqu'à en trouver un valide plutôt que
  // de risquer une exception Prisma (contrainte unique) ou une route système masquée.
  while (isReservedStudioSlug(slug) || (await prisma.studio.findUnique({ where: { slug } }))) {
    slug = `${slugify(studioName) || "studio"}-${randomSuffix(4)}`;
  }

  // Jeton de vérification email (voir /api/auth/verify-email) — généré dès la création pour
  // les comptes email/mot de passe uniquement (voir `oauthVerified` ci-dessus). Valable 48h,
  // cohérent avec la durée annoncée dans l'email de bienvenue (sendWelcomeEmail).
  const verifyToken = oauthVerified ? null : generateSecureToken();
  const verifyTokenExpiresAt = verifyToken ? new Date(Date.now() + 48 * 60 * 60 * 1000) : null;

  // Attribue explicitement le plan gratuit dès la création, plutôt que de laisser planId à
  // null en attendant un hypothétique paiement — un studio qui abandonne un paiement Stripe
  // (checkout annulé, voir /api/billing/checkout) reste ainsi clairement "sur le plan
  // gratuit" au lieu de se retrouver dans un état "aucun plan" ambigu. Ne bloque jamais la
  // création si aucun plan gratuit n'est configuré côté /admin/plans (planId reste null,
  // comportement identique à avant).
  const freePlan = await prisma.plan.findFirst({ where: { isFree: true, active: true } });

  const studio = await prisma.studio.create({
    data: {
      name: studioName,
      slug,
      planId: freePlan?.id ?? null,
      users: {
        create: {
          name: ownerName,
          email: ownerEmail.toLowerCase().trim(),
          passwordHash: passwordHash ?? null,
          role: "OWNER",
          image: image ?? null,
          emailVerified: oauthVerified ? new Date() : null,
          verifyToken,
          verifyTokenExpiresAt,
        },
      },
      settings: { create: {} },
      pages: {
        create: [
          {
            type: "HOME",
            slug: "",
            title: "Accueil",
            sections: [{ type: "hero", title: studioName, subtitle: "" }],
          },
        ],
      },
    },
    include: { users: true },
  });

  // Best-effort : une erreur d'envoi (SMTP non configuré, panne fournisseur...) ne doit
  // jamais faire échouer la création du compte — voir sendMail(), qui logge déjà l'échec
  // sans lever d'exception. On ne bloque donc pas sur `await` avec un try/catch qui ferait
  // planter toute l'inscription pour un simple souci d'email.
  sendWelcomeEmail({
    ownerName,
    ownerEmail: studio.users[0].email,
    studioName,
    verifyToken: verifyToken ?? undefined,
  }).catch((e) => console.error("Échec de l'email de bienvenue :", e));

  return { studio, user: studio.users[0] };
}
