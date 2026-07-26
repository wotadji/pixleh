import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";
import AzureADProvider from "next-auth/providers/azure-ad";
import FacebookProvider from "next-auth/providers/facebook";
import AppleProvider from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { provisionStudioWithOwner } from "@/lib/provisionStudio";

/**
 * Fournisseur LinkedIn "maison" : LinkedInProvider intégré à next-auth v4.24 cible encore
 * l'ancienne API REST (champs localizedFirstName/profilePicture...), dépréciée par LinkedIn
 * mi-2023 au profit de "Sign In with LinkedIn using OpenID Connect". On définit donc un
 * provider OIDC générique pointant vers le well-known LinkedIn plutôt que l'intégration
 * obsolète — LinkedIn ne renvoie alors que sub/name/email/picture, ce qui suffit ici.
 */
function LinkedInOIDCProvider(clientId: string, clientSecret: string) {
  return {
    id: "linkedin",
    name: "LinkedIn",
    type: "oauth" as const,
    wellKnown: "https://www.linkedin.com/oauth/.well-known/openid-configuration",
    authorization: { params: { scope: "openid profile email" } },
    idToken: true,
    clientId,
    clientSecret,
    profile(profile: Record<string, any>) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
      };
    },
  };
}

/**
 * Fournisseurs Social Login (OAuth/OIDC) — chacun n'est activé que si ses variables d'env
 * sont renseignées (voir .env.example), pour ne jamais casser le build/démarrage tant
 * qu'Adriel n'a pas créé l'app correspondante côté Google/GitHub/etc. Le endpoint public
 * NextAuth /api/auth/providers reflète automatiquement cette liste — voir
 * src/components/auth/SocialLoginButtons.tsx qui s'en sert pour n'afficher que les
 * boutons réellement utilisables.
 */
const oauthProviders: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  oauthProviders.push(
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  oauthProviders.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      // "common" (par défaut) accepte aussi bien les comptes Microsoft personnels que les
      // comptes professionnels/scolaires Azure AD — le plus adapté à un SaaS grand public.
      tenantId: process.env.AZURE_AD_TENANT_ID || "common",
    })
  );
}

if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  oauthProviders.push(
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    })
  );
}

if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  oauthProviders.push(
    LinkedInOIDCProvider(process.env.LINKEDIN_CLIENT_ID, process.env.LINKEDIN_CLIENT_SECRET) as any
  );
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  oauthProviders.push(
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID,
      // Apple exige que le client secret soit lui-même un JWT signé (ES256), à régénérer
      // manuellement au maximum tous les 6 mois — voir .env.example pour la marche à suivre.
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    })
  );
}

/**
 * Enregistre (ou met à jour) le lien entre un User existant et un compte OAuth externe.
 * Utilisé aussi bien pour lier un nouveau fournisseur à un compte déjà existant que pour
 * le tout premier compte créé via ce fournisseur (voir callback signIn ci-dessous).
 */
async function linkOAuthAccount(userId: string, account: any) {
  await prisma.account.create({
    data: {
      userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      refresh_token: account.refresh_token as string | undefined,
      access_token: account.access_token as string | undefined,
      expires_at: account.expires_at as number | undefined,
      token_type: account.token_type as string | undefined,
      scope: account.scope as string | undefined,
      id_token: account.id_token as string | undefined,
      session_state: typeof account.session_state === "string" ? account.session_state : undefined,
    },
  });
}

/**
 * Configuration NextAuth pour l'espace studio (photographe + équipe).
 * Les clients finaux (visiteurs de galerie) n'utilisent PAS ce système :
 * ils passent par /api/gallery-access qui pose un cookie signé propre à la galerie
 * (voir src/lib/gallery-session.ts).
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email et mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();
        // Limite par COMPTE (pas par IP, peu fiable à récupérer correctement dans le
        // contexte NextAuth selon le proxy) : bloque le brute force ciblé sur un email
        // donné tout en laissant une vraie marge d'erreur de frappe (10 essais / 15 min).
        // NextAuth v4 ne transmet pas le message précis d'une erreur levée dans authorize()
        // au client (il remonte en générique "CredentialsSignin", voir login/page.tsx qui
        // affiche "Email ou mot de passe incorrect." dans tous les cas) — c'est acceptable
        // ici : ne pas révéler qu'un compte est temporairement bloqué évite d'indiquer à un
        // attaquant que l'email existe et qu'il est activement ciblé.
        const limited = rateLimit(`login:${email}`, 10, 15 * 60 * 1000);
        if (!limited.allowed) {
          throw new Error("Trop de tentatives de connexion. Réessayez dans quelques minutes.");
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { studio: true },
        });
        // !user.passwordHash : compte créé uniquement via Social Login (Google, GitHub...),
        // jamais de mot de passe défini. On renvoie null comme pour "mauvais mot de passe"
        // plutôt qu'un message dédié : un message différent révélerait à un attaquant que
        // cet email existe et par quel moyen s'y connecter (même principe que le
        // rate-limiting ci-dessus, qui évite déjà de révéler qu'un email est ciblé).
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          studioId: user.studioId,
          studioSlug: user.studio.slug,
          role: user.role,
        };
      },
    }),
    ...oauthProviders,
  ],
  callbacks: {
    /**
     * Appelé pour toute tentative de connexion — pour les fournisseurs OAuth (pas
     * "credentials", déjà géré dans authorize() ci-dessus), c'est ici qu'on fait la
     * liaison/création de compte : on ne peut pas utiliser le PrismaAdapter standard de
     * NextAuth (il ne sait créer qu'un User isolé, alors qu'un nouvel utilisateur ici doit
     * aussi obtenir un Studio — voir provisionStudioWithOwner). On mute `user` en place :
     * cette même référence est ensuite reçue par le callback jwt() ci-dessous, c'est ce qui
     * permet de lui injecter le vrai id/studioId/role venant de la base plutôt que ceux
     * (sans rapport) renvoyés par le fournisseur OAuth.
     */
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;
      if (!user?.email) return false;

      const email = user.email.toLowerCase().trim();

      // 1) Ce fournisseur est-il déjà lié à un compte pixleh ?
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        include: { user: { include: { studio: { select: { slug: true } } } } },
      });
      if (existingAccount) {
        Object.assign(user, {
          id: existingAccount.user.id,
          studioId: existingAccount.user.studioId,
          studioSlug: existingAccount.user.studio.slug,
          role: existingAccount.user.role,
        });
        return true;
      }

      // 2) Un compte existe déjà avec cet email (créé par mot de passe, ou via un autre
      // fournisseur) → on lie ce nouveau fournisseur à ce compte au lieu d'en créer un autre.
      const existingUser = await prisma.user.findUnique({
        where: { email },
        include: { studio: { select: { slug: true } } },
      });
      if (existingUser) {
        await linkOAuthAccount(existingUser.id, account);
        Object.assign(user, {
          id: existingUser.id,
          studioId: existingUser.studioId,
          studioSlug: existingUser.studio.slug,
          role: existingUser.role,
        });
        return true;
      }

      // 3) Tout nouveau : sauf si cette tentative vient de /login (voir SocialLoginButtons,
      // intent="login" + le cookie pixleh_oauth_intent), auquel cas on refuse plutôt que de
      // recréer silencieusement un compte — sinon, juste après avoir supprimé son compte
      // (droit à l'effacement, voir /api/account/delete), un simple clic sur "Continuer avec
      // Google" en recréait aussitôt un nouveau avec la même adresse, donnant l'illusion
      // trompeuse que le compte supprimé "fonctionnait encore".
      const intent = cookies().get("pixleh_oauth_intent")?.value;
      if (intent === "login") {
        return "/login?error=NoAccount";
      }

      // Sinon (venu de /register, ou intent absent/inconnu — comportement historique par
      // défaut) : on crée le Studio + l'utilisateur OWNER + le lien du fournisseur.
      const { studio, user: newUser } = await provisionStudioWithOwner({
        studioName: user.name ? `Studio de ${user.name}` : `Studio de ${email}`,
        ownerName: user.name || email,
        ownerEmail: email,
        passwordHash: null,
        image: user.image,
        // Adresse déjà confirmée par le fournisseur OAuth (Google, GitHub...) — pas besoin
        // de renvoyer un email de vérification en plus (voir provisionStudioWithOwner).
        oauthVerified: true,
      });
      await linkOAuthAccount(newUser.id, account);
      Object.assign(user, {
        id: newUser.id,
        studioId: studio.id,
        studioSlug: studio.slug,
        role: "OWNER",
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.studioId = (user as any).studioId;
        token.studioSlug = (user as any).studioSlug;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).studioId = token.studioId;
        (session.user as any).role = token.role;

        // Nom, email et slug du studio relus depuis la base à CHAQUE vérification de
        // session, plutôt que gardés tels quels dans le JWT (figé à la connexion) : sans
        // ça, un changement fait dans Réglages > Compte (nom, email) ou du nom du studio
        // n'apparaîtrait qu'après déconnexion/reconnexion. Le coût (une requête légère)
        // est cohérent avec le reste de l'app, qui refait déjà des requêtes similaires
        // pour vérifier les accès (voir checkGalleryAccess).
        const fresh = await prisma.user.findUnique({
          where: { id: token.userId as string },
          include: { studio: { select: { slug: true } } },
        });
        if (fresh) {
          session.user.name = fresh.name;
          session.user.email = fresh.email;
          (session.user as any).studioSlug = fresh.studio.slug;
          // Relu depuis la base à chaque requête (pas depuis le JWT) volontairement : un
          // accès admin plateforme retiré doit être coupé immédiatement, pas seulement à la
          // prochaine reconnexion — voir /admin (layout) et requirePlatformAdmin().
          (session.user as any).isPlatformAdmin = fresh.isPlatformAdmin;
        } else {
          (session.user as any).studioSlug = token.studioSlug;
          (session.user as any).isPlatformAdmin = false;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
