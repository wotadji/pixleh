# pixleh

Plateforme SaaS pour photographes (clone fonctionnel de Pixieset) : galeries clients avec
proofing, boutique en ligne, réservation, contrats signés électroniquement, facturation et
site vitrine public — le tout multi-studios (chaque photographe a son propre espace).

## Ce qui est inclus (v1)

- **Comptes multi-tenant** : un photographe crée son "studio", gère ses clients (CRM léger).
- **Galeries & proofing** : upload par lot (drag & drop), miniatures + aperçus générés
  automatiquement, filigrane configurable, galeries protégées par mot de passe, favoris client,
  téléchargement HD avec quota optionnel, téléchargement groupé en ZIP.
- **Boutique** : catalogue de produits (téléchargements, tirages, packs), panier, paiement Stripe.
- **Réservation** : page publique de prise de rendez-vous, types de séance configurables,
  confirmation manuelle par le studio.
- **Contrats** : rédaction, envoi d'un lien de signature, signature électronique (pad tactile),
  génération d'un PDF final.
- **Factures** : création de facture avec lignes détaillées, lien de paiement Stripe, PDF.
- **Site vitrine** : page d'accueil (portfolio), page à propos, blog, page de contact, page de
  réservation — un site public par studio (`/s/{slug}`).
- **Stockage** : toutes les photos et PDF sont envoyés sur **votre serveur de fichiers via SFTP**
  (pas de dépendance à un service cloud tiers).

## Ce qui n'est PAS inclus (à construire si besoin)

Un vrai clone complet de Pixieset est un produit qu'une équipe développe sur plusieurs mois.
Cette base couvre les parcours essentiels avec du code fonctionnel, mais il manque encore :
constructeur de site drag & drop avancé, intégration avec des laboratoires photo (impression
physique automatisée type WHCC/Bay Photo), applications mobiles, calendrier de disponibilité
en temps réel avec synchronisation Google/Outlook, gestion fine des rôles d'équipe, multi-devises
avancé, système de notation/commentaires sur galerie, éditeur d'albums. La structure du code
(voir `prisma/schema.prisma` et `src/lib/`) est pensée pour que ces briques s'ajoutent proprement.

## Stack technique

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Prisma ORM** — PostgreSQL par défaut, MySQL supporté (une ligne à changer)
- **NextAuth** pour l'espace studio, session JWT signée dédiée pour les clients de galerie
- **SFTP** (`ssh2-sftp-client`) pour le stockage de fichiers, **sharp** pour le traitement d'image
- **Stripe** pour tous les paiements (boutique + factures)
- **@react-pdf/renderer** pour les PDF (contrats, factures)

---

## 1. Prérequis sur votre hébergement

Vous avez indiqué : hébergement mutualisé cPanel, base de données MySQL/PostgreSQL illimitée,
serveur de fichiers illimité en SFTP. Voici ce qu'il faut vérifier avant de déployer :

1. **Node.js disponible sur cPanel** : dans cPanel, cherchez **"Setup Node.js App"**
   (fourni par Cloud Linux / Passenger). C'est ce qui permet de faire tourner une application
   Node.js (comme Next.js) sur un hébergement mutualisé. Si cette option n'existe pas chez votre
   hébergeur, il faudra soit demander son activation, soit migrer vers un VPS (voir section 6).
2. **Version Node.js ≥ 18.18** disponible dans le sélecteur.
3. **Accès SSH** (recommandé) pour lancer les commandes `npm install`, `npx prisma db push`, etc.
   À défaut, le terminal web de cPanel fonctionne aussi mais est plus lent.
4. **Base de données** : créez une base MySQL ou PostgreSQL depuis cPanel ("MySQL Databases" ou
   "PostgreSQL Databases"), avec un utilisateur dédié ayant tous les droits sur cette base.
5. **Compte SFTP** : soit votre compte cPanel principal, soit un compte FTP/SFTP dédié
   ("FTP Accounts" dans cPanel) pointant vers un dossier réservé au stockage des photos
   (ex : `/home/USER/pixistudio-storage`), en dehors de `public_html` pour éviter tout accès direct.

## 2. Choisir MySQL ou PostgreSQL

Le schéma (`prisma/schema.prisma`) fonctionne à l'identique avec les deux moteurs.

- **PostgreSQL (recommandé)** : gère nativement `Json` et les gros volumes plus finement.
  Laissez `provider = "postgresql"` dans `prisma/schema.prisma`.
- **MySQL** : changez `provider = "postgresql"` en `provider = "mysql"` dans
  `prisma/schema.prisma`, puis adaptez `DATABASE_URL` dans `.env` au format
  `mysql://USER:PASSWORD@HOST:3306/pixistudio`.

## 3. Installation

En local (pour développer/tester) ou en SSH sur votre serveur :

```bash
cd pixistudio
npm install
cp .env.example .env
# Remplissez .env : DATABASE_URL, NEXTAUTH_SECRET, SFTP_*, STRIPE_*, SMTP_*, APP_URL

npx prisma db push          # crée les tables dans votre base à partir du schéma
npm run prisma:seed         # optionnel : jeu de données de démo (compte demo@pixistudio.local / password123)

npm run build                # build de production
```

> **Hébergement mutualisé (droits limités)** : si votre utilisateur de base de données n'a pas le
> droit de créer une base ("permission denied to create database", erreur P3014), utilisez
> `npx prisma db push` plutôt que `npx prisma migrate dev`/`migrate deploy`. `db push` synchronise
> directement le schéma sans passer par une "shadow database" temporaire, ce qui fonctionne même
> avec des permissions restreintes. C'est l'approche recommandée pour ce projet tant que vous
> n'avez pas de base secondaire dédiée aux migrations.

Générer un `NEXTAUTH_SECRET` sûr :

```bash
openssl rand -base64 32
```

## 4. Déploiement sur cPanel (Node.js Selector / Passenger)

1. Uploadez le dossier `pixistudio` (sans `node_modules`, sans `.next`) dans un répertoire
   **hors de `public_html`**, par exemple `/home/USER/pixistudio`.
2. Dans cPanel → **Setup Node.js App** → **Create Application** :
   - *Node.js version* : la plus récente disponible ≥ 18.18
   - *Application mode* : Production
   - *Application root* : `pixistudio`
   - *Application URL* : votre domaine ou sous-domaine
   - *Application startup file* : `server.js` (le serveur personnalisé fourni, compatible Passenger)
3. Cliquez **Create**, puis ouvrez le terminal Node fourni par cPanel (bouton "Run NPM Install"
   ou terminal SSH avec l'environnement Node chargé via `source /home/USER/nodevenv/pixistudio/18/bin/activate`) :
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   npm run build
   ```
4. Renseignez toutes les variables d'environnement (`.env`) directement dans l'interface
   **"Setup Node.js App" → Environment variables**, ou déposez un fichier `.env` à la racine
   de l'application (le serveur le charge automatiquement via Next.js).
5. Cliquez **Restart** dans l'interface Node.js Selector.
6. Le domaine configuré doit maintenant afficher la page d'accueil de pixleh.

> Passenger redémarre l'application à chaque déploiement. Pour publier une mise à jour :
> uploadez les nouveaux fichiers, relancez `npm install && npm run build` si nécessaire, puis
> cliquez **Restart** dans cPanel.

## 5. Configuration du stockage de fichiers (SFTP)

Dans `.env` :

```
SFTP_HOST=ftp.votredomaine.com
SFTP_PORT=22
SFTP_USERNAME=votre-compte-sftp
SFTP_PASSWORD=votre-mot-de-passe
SFTP_ROOT_PATH=/home/USER/pixistudio-storage
```

Ce dossier ne doit **pas** être dans `public_html` : tous les fichiers sont servis via
l'application (route `/api/files/...`) qui vérifie les droits d'accès à chaque requête
(mot de passe de galerie, quota de téléchargement, etc.). Le mettre en accès direct
contournerait ces protections.

## 6. Paiements Stripe

1. Créez un compte sur [stripe.com](https://stripe.com), récupérez vos clés API
   (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`) dans le tableau de bord.
2. Ajoutez un endpoint webhook pointant vers `https://votredomaine.com/api/webhooks/stripe`,
   écoutant l'événement `checkout.session.completed`. Copiez le secret de signature dans
   `STRIPE_WEBHOOK_SECRET`.
3. Tant que ces clés ne sont pas renseignées, la boutique et le paiement de factures
   affichent une erreur explicite plutôt que de planter silencieusement.

## 7. Emails transactionnels

Renseignez `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` dans `.env`
(la plupart des hébergeurs mutualisés fournissent un compte email avec accès SMTP).
Sans configuration, les emails (ex : notification de formulaire de contact) sont simplement
ignorés avec un avertissement en log — le reste de l'application continue de fonctionner.

## 8. Tâches périodiques (cron)

Depuis cPanel → **Cron Jobs**, ajoutez une tâche quotidienne qui appelle
`/api/cron/invoice-reminders` : elle envoie un rappel de paiement au client 2 jours avant
l'échéance, 1 jour avant, et le jour même (une seule fois par palier et par facture), et fait
passer une facture en retard au statut « En retard ».

1. Définissez `CRON_SECRET` dans les variables d'environnement (voir `.env.example`,
   `openssl rand -hex 24` pour en générer une).
2. Dans cPanel → Cron Jobs, ajoutez une commande exécutée une fois par jour (ex : tous les jours
   à 8h) :
   ```
   curl -s "https://votredomaine.com/api/cron/invoice-reminders?secret=VOTRE_CRON_SECRET"
   ```

D'autres tâches de maintenance (ex : archivage automatique des galeries expirées) peuvent être
ajoutées sur le même principe : une route API dédiée, appelée par `curl` depuis un cron, protégée
par une clé secrète.

## 9. Alternative : VPS avec Docker

Si votre hébergeur active finalement un accès VPS/Docker, vous pouvez ignorer `server.js`
et lancer directement :

```bash
npm run build
npm run start:next   # équivalent à `next start`, avec un reverse proxy (nginx) devant
```

## 10. Catalogue impression (Prodigi)

Depuis le panel Administrateur (`/admin/print-catalog`), pixleh gère un catalogue d'articles
d'impression (tirages, etc.) proposé automatiquement dans toutes les galeries de tous les
studios — c'est un service pixleh, pas un produit studio : le paiement Stripe du client va
directement au compte pixleh (les studios ne gèrent plus l'impression depuis leur panel).

1. Créez un compte sur [prodigi.com](https://www.prodigi.com), récupérez une clé API sandbox
   (gratuite, pour tester) sur `dashboard.prodigi.com`, puis une clé live une fois prêt à
   produire de vraies commandes.
2. Renseignez `PRODIGI_API_KEY` dans `.env` (et `PRODIGI_API_BASE_URL` si vous passez en live,
   voir `.env.example`).
3. Dans `/admin/print-catalog`, créez un article avec le SKU du produit Prodigi souhaité : le
   coût de revient Prodigi est récupéré automatiquement, et vous définissez librement le prix
   de vente pixleh (ex : coût 0,20 € → prix de vente 0,40 €). Le bouton « Resynchroniser »
   rafraîchit le coût de revient à tout moment.
4. Sans `PRODIGI_API_KEY`, le catalogue reste utilisable : saisissez le coût de revient à la
   main, sans resynchronisation automatique.

**Soumission réelle des commandes (Phase 2)** : dès qu'un client paie un article du catalogue
impression, la commande est **automatiquement soumise à Prodigi** pour impression et expédition
(webhook Stripe `checkout.session.completed` → `src/lib/prodigiOrder.ts`) — Prodigi facture alors
réellement votre compte. Le client renseigne son adresse de livraison directement dans le
panneau de sélection impression, avant le paiement. En cas d'échec (Prodigi indisponible,
attribut produit manquant, adresse invalide...), la commande reste visible dans `/admin/orders`
avec le détail de l'erreur et un bouton « Réessayer » — rien n'est perdu, mais rien n'est non
plus renvoyé automatiquement sans action de votre part après un échec.

---

## Limite importante de cette livraison

Le code a été rédigé intégralement dans un environnement sans accès au registre npm
(pas de `npm install` possible ici), donc **le build n'a pas pu être exécuté ni vérifié
automatiquement dans cet environnement**. Le code a été relu avec soin (types, imports,
cohérence du schéma Prisma), mais la première étape après récupération du projet doit être :

```bash
npm install
npm run typecheck
npm run build
```

Si des erreurs de compilation apparaissent (typos, versions de dépendances à ajuster), elles
seront rapides à corriger — n'hésitez pas à revenir avec le message d'erreur exact.

## Compte de démonstration (après `npm run prisma:seed`)

- URL : `/login`
- Email : `demo@pixistudio.local`
- Mot de passe : `password123`
