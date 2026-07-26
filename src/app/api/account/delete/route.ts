import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";
import { getStripe } from "@/lib/stripe";

/**
 * Suppression définitive du compte Studio (droit à l'effacement RGPD) — voir l'audit du
 * 20/07/2026, Sprint 1. Réservée au rôle OWNER (un membre d'équipe TEAM ne doit pas
 * pouvoir supprimer tout le studio) et exige le mot de passe actuel, comme pour le
 * changement de mot de passe.
 *
 * Supprime, dans l'ordre : (1) l'abonnement et le client Stripe s'il y en a un (voir
 * cleanupStripe ci-dessous) — sans ça, un studio avec un abonnement payant en cours
 * continuait à être prélevé après la suppression de son compte, ce qu'Adriel a signalé ;
 * (2) tous les fichiers stockés du studio en un seul appel récursif (photos, vidéos, logo,
 * carrousel — tous rangés sous `studios/{studioId}`, voir
 * buildPhotoKey/buildVideoKey/buildStudioLogoKey/buildCarouselSlideKey dans storage.ts),
 * (3) la ligne Studio elle-même, dont la suppression cascade sur toutes les tables liées
 * (galeries, clients, commandes, réservations, contrats, factures, pages, articles de
 * blog...) grâce aux relations `onDelete: Cascade` du schéma Prisma.
 */
async function cleanupStripe(stripeCustomerId: string | null, stripeSubscriptionId: string | null) {
  if (!stripeCustomerId) return;
  const stripe = getStripe();

  // Résilie l'abonnement en cours en premier — c'est la partie qui compte le plus (arrêter
  // les prélèvements) : on la tente même si la suppression du Customer échoue ensuite.
  if (stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    } catch (e) {
      // Déjà résilié, ou introuvable côté Stripe — pas bloquant.
      console.error("Résiliation Stripe échouée pour le studio supprimé", stripeSubscriptionId, e);
    }
  }

  // Supprime aussi le Customer Stripe (moyens de paiement enregistrés, email, historique
  // affiché dans le dashboard Stripe...) — cohérent avec une suppression RGPD complète, pas
  // seulement l'arrêt des prélèvements.
  try {
    await stripe.customers.del(stripeCustomerId);
  } catch (e) {
    console.error("Suppression du Customer Stripe échouée pour le studio supprimé", stripeCustomerId, e);
  }
}
export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    if (session.user.role !== "OWNER") {
      throw new AccessError("Seul le propriétaire du studio peut supprimer le compte.", 403);
    }

    const { password } = await req.json();

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) throw new AccessError("Utilisateur introuvable.", 404);

    // user.passwordHash === null : compte créé uniquement via Social Login, qui n'a jamais
    // eu de mot de passe à vérifier — la session OAuth active suffit comme preuve
    // d'identité pour cette suppression (même logique que le changement de mot de passe
    // ci-dessus). Sinon, on exige et vérifie le mot de passe comme avant.
    if (user.passwordHash) {
      if (!password) throw new AccessError("Mot de passe requis.", 400);
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new AccessError("Mot de passe incorrect.", 403);
    }

    const studioId = session.user.studioId;

    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    });

    // Best-effort, comme pour le stockage ci-dessous : si Stripe est injoignable ou mal
    // configuré (ex: STRIPE_SECRET_KEY absente en dev), on supprime quand même les données
    // en base plutôt que de bloquer la demande RGPD — un abonnement encore actif côté Stripe
    // dans ce cas rare devra être résilié manuellement.
    try {
      await cleanupStripe(studio?.stripeCustomerId ?? null, studio?.stripeSubscriptionId ?? null);
    } catch (stripeError) {
      console.error("Nettoyage Stripe échoué pour le studio", studioId, stripeError);
    }

    // Best-effort : si le stockage échoue (ex: serveur SFTP injoignable), on supprime quand
    // même les données en base plutôt que de bloquer la demande RGPD — les fichiers orphelins
    // devront être nettoyés manuellement dans ce cas rare.
    try {
      await getStorage().deleteDirectory(`studios/${studioId}`);
    } catch (storageError) {
      console.error("Échec de la suppression des fichiers stockés pour le studio", studioId, storageError);
    }

    await prisma.studio.delete({ where: { id: studioId } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
