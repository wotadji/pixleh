# Passer sur GitHub + CI/CD — marche à suivre

Le dépôt Git local est prêt (premier commit fait, `244` fichiers, rien de sensible dedans). Les workflows CI (`.github/workflows/ci.yml`) et CD (`.github/workflows/deploy.yml`) sont écrits. Il reste 3 choses que **toi seul** peux faire : créer le repo GitHub, pousser le code, et renseigner les secrets de déploiement.

## 1. Créer le repo sur GitHub

Sur [github.com/new](https://github.com/new) : nom au choix (`pixleh` par exemple), **Private**, ne coche aucune case d'initialisation (pas de README/gitignore/licence — on a déjà tout ça localement).

## 2. Pousser le code

Dans le Terminal, sur ton Mac, dans le dossier du projet :

```bash
cd ~/Documents/ProjetPix/pixistudio
git remote add origin https://github.com/<ton-compte>/<ton-repo>.git
git push -u origin main
```

Si Git te demande de t'authentifier : GitHub n'accepte plus les mots de passe pour `git push`, il faut soit te connecter via l'app GitHub Desktop, soit créer un [token d'accès personnel](https://github.com/settings/tokens) à utiliser à la place du mot de passe.

## 3. Renseigner les secrets de déploiement

Dans le repo GitHub : **Settings → Secrets and variables → Actions → New repository secret**. Ajoute ces 5 secrets (uniquement pour le déploiement — jamais lus par le workflow CI) :

| Secret | Valeur | Où la trouver |
|---|---|---|
| `SSH_HOST` | `ssh.web17.us.cloudlogin.co` | déjà trouvé (page "Accès SSH" cPanel) |
| `SSH_PORT` | `2222` | déjà trouvé |
| `SSH_USER` | `wotadji` | déjà trouvé |
| `SSH_PASSWORD` | le mot de passe SSH | cPanel → "Accès SSH" → "Générer un mot de passe" puis "Changer le mot de passe" — colle ensuite ce même mot de passe ici |
| `SSH_APP_PATH` | le chemin absolu vers le dossier de l'app sur le serveur | cPanel → "Setup Node.js App" → clique sur l'app pixleh → c'est le "Application root" |

Le panel SSH de cet hébergeur (cloudlogin.co) ne propose que l'authentification par mot de passe, pas de gestion de clés — le workflow `deploy.yml` a été adapté en conséquence.

Une fois ces 5 secrets ajoutés, chaque `git push` sur `main` déclenche automatiquement : CI (lint/typecheck/tests/build) puis, si tout passe, déploiement (build → envoi des fichiers → `npm ci` côté serveur → `prisma db push` → redémarrage de l'app).

## 4. Flux complet : dev → UAT → prod

Trois branches, mais **deux environnements déployés seulement** — `dev` ne déploie nulle part, c'est juste ta branche de travail quotidienne (sauvegarde + vérification CI).

| Branche | Où ça vit | Base de données | Déploiement |
|---|---|---|---|
| `dev` | ton Mac (`npm run dev`) | `wotadji_pix` (existante, inchangée — on garde tes données actuelles) | aucun — juste CI |
| `uat` | sous-domaine temporaire `te.us.tempcloudsite.com` | `wotadji_pix_uat` (nouvelle, à créer) | automatique sur push |
| `main` | ton vrai domaine | `wotadji_pix_prod` (nouvelle, à créer) | automatique sur push |

Les 3 bases vivent sur le même serveur PostgreSQL cPanel (illimité chez toi) — jamais de PostgreSQL à installer en local. `wotadji_pix` reste ta base dev telle qu'elle est aujourd'hui ; assure-toi juste que son accès distant (cPanel → Bases SQL → Accès distant, autorise ton IP) est actif si ce n'est pas déjà le cas pour que `npm run dev` continue de s'y connecter comme avant.

**Mise en place (une fois) :**

1. cPanel → Bases SQL → PgSQL : crée `wotadji_pix_uat` et `wotadji_pix_prod`.
2. cPanel → "Setup Node.js App" → crée une **2e app** pour UAT, "Application root" différent (ex: `pixleh-uat`), pointant vers le sous-domaine temporaire. Dépose-y un `.env` avec `DATABASE_URL` sur `wotadji_pix_uat`.
3. Ajoute le 6e secret GitHub : `SSH_APP_PATH_UAT` = le "Application root" de cette 2e app.
4. Crée les branches :
   ```bash
   git checkout -b uat
   git push -u origin uat
   git checkout -b dev
   git push -u origin dev
   ```

**Au quotidien :**

```bash
git checkout dev
# ... tu codes, tu commits ...
git push                              # sauvegarde + CI, rien n'est déployé

# Un lot de changements est prêt à tester en conditions réelles :
git checkout uat
git merge dev
git push                              # déploie sur te.us.tempcloudsite.com

# Tout est validé sur UAT :
git checkout main
git merge uat
git push                              # déploie sur ton vrai domaine
```

## 5. Si quelqu'un d'autre travaille sur le projet

Dès qu'une 2e personne (ou une session Claude à qui tu délègues une tâche) touche au code, pousser directement sur `dev` devient risqué : conflits, personne ne voit ce qui a changé avant que ce soit fait. On ajoute un niveau : **une branche de fonctionnalité par tâche**, fusionnée dans `dev` via une Pull Request (jamais en push direct).

```bash
git checkout dev
git pull                              # récupère le dev le plus à jour
git checkout -b feature/nom-de-la-tache

# ... la personne (ou Claude) travaille, commit ...
git push -u origin feature/nom-de-la-tache
```

Puis sur GitHub : **Pull requests → New pull request**, base `dev` ← compare `feature/nom-de-la-tache`. La CI tourne automatiquement sur cette PR (déjà configuré). Tu relis le diff, et si tout va bien : **Merge pull request**. La branche de fonctionnalité peut ensuite être supprimée (bouton proposé automatiquement après la fusion).

**Pour empêcher un push direct accidentel sur `dev`/`uat`/`main`** (le tien ou celui de quelqu'un d'autre), active la protection de branche : Settings → Branches → Add branch ruleset → sélectionne les 3 branches → coche "Require a pull request before merging". Ça force tout le monde (toi y compris) à passer par une PR, ce qui garde un historique propre de qui a changé quoi et pourquoi.

## Configuration serveur spécifique à cet hébergeur (Hepsia)

Cet hébergeur ne fonctionne pas comme un cPanel classique pour Node.js — deux points ne sont **pas** dans le dépôt Git (ils vivent uniquement sur le serveur) et devront être refaits à l'identique si l'instance NodeJS ou le `.htaccess` sont un jour supprimés/recréés :

**1. `.htaccess` (reverse proxy manuel) — indispensable, sinon le domaine affiche une liste de fichiers.**

Le panel n'associe pas automatiquement un domaine à une instance Node.js sans IP dédiée (option payante). On redirige donc manuellement via `.htaccess`, à la racine de l'app (`/home/www/te.us.tempcloudsite.com/.htaccess` pour l'UAT) :

```
DirectoryIndex disabled

RewriteEngine On
RewriteCond %{REQUEST_URI} !^/\.well-known

RewriteRule ^$ http://127.0.0.1:<PORT>/ [P,L]
RewriteRule ^(.+)$ http://127.0.0.1:<PORT>/$1 [P,L]
```

Remplacer `<PORT>` par le port affiché dans Avancé → NodeJS pour cette instance. `DirectoryIndex disabled` est **crucial** : sans ça, Apache substitue silencieusement `/` par `/index.html` avant nos règles, et Next.js renvoie 404 sur la page d'accueil (bug découvert le 28/07/2026 après plusieurs heures de diagnostic — tout le reste du site fonctionnait, seule `/` était cassée).

`rsync --delete` exclut déjà `.htaccess` du transfert (voir workflows), donc un déploiement normal ne l'efface plus.

**2. pm2 au lieu du "NodeJS Selector" du panel pour garder l'app en vie.**

Le lanceur de processus intégré au panel (façon Passenger) s'est montré peu fiable en pratique : après un déploiement, il reste parfois bloqué en boucle ("Script ... failed to run too many times. Pausing for awhile.") même quand le code et le build sont corrects — `touch tmp/restart.txt` (convention Passenger) n'a d'ailleurs aucun effet réel sur ce panel. Le workflow de déploiement (`deploy-uat.yml`) gère donc le process lui-même avec **pm2** (gratuit, installé automatiquement si absent) : `pm2 start server.js --name pixleh-uat`, relancé à chaque déploiement.

Secret GitHub à ajouter : `SSH_APP_PORT_UAT` = le port de l'instance NodeJS UAT (visible dans Avancé → NodeJS). C'est ce même port qui doit être utilisé dans le `.htaccess` ci-dessus — si l'instance est un jour supprimée/recréée, le port change, il faut mettre à jour les deux (le secret GitHub et le `.htaccess`).

## Ce que ça ne couvre pas encore

- **Prisma** : le schéma a changé cette session (`Selection.productId`) — pense à faire `npx prisma generate && npx prisma db push` en local avant de pousser, sinon ton environnement de dev ne sera plus synchro avec le code.
- **Sentry** (monitoring d'erreurs) et **tests des parcours critiques complets** (paiement, upload) restent à faire — la CI ne fait tourner que les tests unitaires ajoutés cette session (fonctions pures : slug, tri photos, validation, tarifs).
- **Premier déploiement** : le tout premier push va copier le projet sur le serveur, mais le `.env` de production doit déjà exister là-bas (il n'est jamais envoyé par le workflow, volontairement). Vérifie qu'il est à jour avant le premier push.
