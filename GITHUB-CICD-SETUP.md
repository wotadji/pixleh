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
| `dev` | ton Mac (`npm run dev`) | locale (ou réutilise celle d'UAT) | aucun — juste CI |
| `uat` | sous-domaine temporaire `te.us.tempcloudsite.com` | dédiée, séparée de la prod | automatique sur push |
| `main` | ton vrai domaine | prod | automatique sur push |

**Mise en place (une fois) :**

1. cPanel → "Setup Node.js App" → crée une **2e app**, "Application root" différent (ex: `pixleh-uat`), pointant vers le sous-domaine temporaire. Dépose-y un `.env` pointant vers une base de données séparée (cPanel → Bases SQL → crée-en une deuxième).
2. Ajoute le 6e secret GitHub : `SSH_APP_PATH_UAT` = le "Application root" de cette 2e app.
3. Crée les branches :
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

## Ce que ça ne couvre pas encore

- **Prisma** : le schéma a changé cette session (`Selection.productId`) — pense à faire `npx prisma generate && npx prisma db push` en local avant de pousser, sinon ton environnement de dev ne sera plus synchro avec le code.
- **Sentry** (monitoring d'erreurs) et **tests des parcours critiques complets** (paiement, upload) restent à faire — la CI ne fait tourner que les tests unitaires ajoutés cette session (fonctions pures : slug, tri photos, validation, tarifs).
- **Premier déploiement** : le tout premier push va copier le projet sur le serveur, mais le `.env` de production doit déjà exister là-bas (il n'est jamais envoyé par le workflow, volontairement). Vérifie qu'il est à jour avant le premier push.
