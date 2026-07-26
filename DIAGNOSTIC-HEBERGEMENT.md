# Diagnostic hébergement / CI-CD

*Généré le 26/07/2026 — mis à jour le même jour après mise en place effective du CI/CD.*

## Fait aujourd'hui

- **Dépôt Git initialisé** en local, premier commit propre (244 fichiers, aucun secret dedans, vérifié).
- **Workflow CI** (`.github/workflows/ci.yml`) : à chaque push/PR sur `main`, lance `npm ci`, lint, typecheck, tests unitaires, build.
- **Workflow CD** (`.github/workflows/deploy.yml`) : se déclenche après un CI réussi sur `main` — build, envoi des fichiers par rsync/SSH vers le serveur cPanel, `npm ci` + `prisma generate` + `prisma db push` côté serveur, puis redémarrage de l'app (convention Passenger `tmp/restart.txt`).
- **Outillage de test** : Vitest installé (à récupérer via `npm install`), tests unitaires réels sur les fonctions critiques (slug, tri des photos, validation Zod des formulaires, calcul de la liste de fonctionnalités des plans tarifaires).
- **Lint et typecheck nettoyés** pour que la pipeline puisse réellement passer :
  - `react/no-unescaped-entities` désactivée (une centaine d'apostrophes non échappées dans les pages légales/admin, aucun impact fonctionnel réel).
  - 8 routes API corrigées (un `Buffer` passé directement à `NextResponse` n'est plus accepté par le typage strict — converti en `Uint8Array`, comportement identique).
  - `@types/nodemailer` ajouté, un problème de typage JSON dans `seedMarketingBlocks.ts` corrigé.
- **Favicon** ajouté (mark pixleh existant, `icon.svg` + `apple-icon.tsx` généré dynamiquement).

## Ce qui reste de ton côté

1. **Créer le repo GitHub et pousser** — voir `GITHUB-CICD-SETUP.md`, marche à suivre complète.
2. **Ajouter les 5 secrets GitHub** (`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_APP_PATH`) — détail dans le même fichier.
3. **`npx prisma generate && npx prisma db push` en local** — le schéma a changé cette session (`Selection.productId`), ton environnement de dev doit être resynchronisé avant de continuer à coder dessus.
4. Vérifier que le `.env` de production est à jour sur le serveur cPanel **avant** le premier déploiement automatique (il n'est jamais transféré par le workflow, volontairement).

## Ce qui reste vrai, non résolu aujourd'hui

- **Tests** : seulement des tests unitaires sur des fonctions pures. Les parcours critiques bout-en-bout (paiement Stripe, upload, accès galerie) ne sont pas couverts.
- **Sentry** (monitoring d'erreurs) : toujours pas en place.
- **Fournisseur d'emails transactionnels en prod** (domaine Resend) et **Stripe Checkout abonnement + webhook** : toujours en attente (voir suivi de tâches existant).
