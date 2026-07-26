# Diagnostic avant hébergement (GitHub Actions / CI-CD)

*Généré le 26/07/2026*

## Ce qui est déjà solide

- Fonctionnalités : galeries, boutique, réservation, contrats/factures, site vitrine, multi-tenant, i18n (6 langues), Stripe (abonnements + quotas), messagerie client, onboarding — stack fonctionnelle très complète (230 tâches terminées).
- Sécurité de base : headers HTTP (CSP, X-Frame-Options), rate limiting, validation MIME/taille upload, pages légales (CGU/CGV/confidentialité/mentions), bandeau cookies, suppression de compte.
- `.env.example` complet et documenté (DB, auth, 6 providers OAuth, SFTP storage, Stripe).
- `package.json` propre : scripts build/lint/typecheck séparés, `engines.node >=18.18.0` fixé, `postinstall: prisma generate`.
- `.gitignore` déjà correct (node_modules, .next, .env, storage exclus).

## Ce qui bloque un passage à GitHub Actions / CI-CD

### 1. Aucun dépôt Git
Le projet n'a jamais été initialisé (`git init` jamais fait). C'est le préalable absolu — rien de ce qui suit n'est possible sans ça.

### 2. Aucun workflow CI/CD
Pas de `.github/workflows`. À créer :
- **CI** (à chaque push/PR) : `npm ci`, `lint`, `typecheck`, `build`. Les tests s'ajouteront quand ils existeront (point 4).
- **CD** (déploiement) : dépend de la décision d'hébergement ci-dessous.

### 3. Décision d'hébergement à trancher
L'app tourne aujourd'hui via `server.js`, un serveur Node persistant écrit spécifiquement pour cPanel/Passenger — ce n'est **pas** compatible tel quel avec un hébergement serverless (Vercel). Le stockage photo par défaut est SFTP (`STORAGE_DRIVER=sftp`), pas du stockage objet.

Deux options réalistes :
- **Rester sur un serveur persistant** (VPS, ou cPanel actuel) : `server.js` fonctionne tel quel. Le workflow GitHub Actions ferait un déploiement SSH (rsync/scp + restart du process) après le build.
- **Migrer vers une plateforme container/PaaS** (Railway, Render, Fly.io, etc.) : possible avec `npm run start:next` directement (pas besoin de `server.js`), mais demande d'adapter le stockage fichiers si on veut du stockage objet plutôt que SFTP.

Cette décision détermine tout le contenu du workflow CD — il faut trancher avant d'écrire le pipeline.

### 4. Aucun test automatisé
Zéro fichier `*.test.*`/`*.spec.*`. Sans tests, la CI ne peut vérifier que build/lint/typecheck — un déploiement automatique reste risqué. À minima : tester les parcours critiques (paiement, upload, accès galerie).

### 5. Pas de monitoring d'erreurs
Sentry (ou équivalent) n'est pas installé. En production automatisée (déploiements fréquents via CI/CD), c'est ce qui permet de détecter une régression rapidement.

### 6. README à réécrire
Le guide de déploiement actuel est 100% cPanel manuel — à compléter une fois la cible d'hébergement choisie.

## Actions qui restent de ton côté (hors code)

- Exécuter `npx prisma generate && npx prisma db push` en local (le schéma a encore changé cette session : `Selection.productId`).
- Fournisseur d'emails transactionnels en production (domaine Resend à vérifier).
- Stripe Checkout abonnement + webhook (encore en attente selon le suivi de tâches).

## Ordre recommandé

1. `git init` + premier commit + dépôt GitHub.
2. Choisir la cible d'hébergement (persistant vs PaaS) — voir point 3.
3. Workflow CI (lint/typecheck/build) — rapide à mettre en place, aucune dépendance.
4. Workflow CD adapté à la cible choisie.
5. Tests des parcours critiques + Sentry — en parallèle, pas bloquant pour un premier déploiement mais fortement recommandé avant d'ouvrir au public.
