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
| `SSH_HOST` | l'adresse de ton serveur | cPanel → cherche "Terminal" ou "Accès SSH" dans Avancé, ou demande-la à ton hébergeur |
| `SSH_PORT` | souvent `22` (parfois un port custom chez certains hébergeurs mutualisés) | idem |
| `SSH_USER` | ton nom d'utilisateur cPanel | visible en haut à droite de cPanel |
| `SSH_PRIVATE_KEY` | la clé privée SSH correspondante | cPanel → "Accès SSH" → génère une paire de clés si tu n'en as pas encore, autorise la clé publique, colle la clé **privée** ici |
| `SSH_APP_PATH` | le chemin absolu vers le dossier de l'app sur le serveur | cPanel → "Setup Node.js App" → c'est le "Application root" de ton app pixleh |

Une fois ces 5 secrets ajoutés, chaque `git push` sur `main` déclenche automatiquement : CI (lint/typecheck/tests/build) puis, si tout passe, déploiement (build → envoi des fichiers → `npm ci` côté serveur → `prisma db push` → redémarrage de l'app).

## Ce que ça ne couvre pas encore

- **Prisma** : le schéma a changé cette session (`Selection.productId`) — pense à faire `npx prisma generate && npx prisma db push` en local avant de pousser, sinon ton environnement de dev ne sera plus synchro avec le code.
- **Sentry** (monitoring d'erreurs) et **tests des parcours critiques complets** (paiement, upload) restent à faire — la CI ne fait tourner que les tests unitaires ajoutés cette session (fonctions pures : slug, tri photos, validation, tarifs).
- **Premier déploiement** : le tout premier push va copier le projet sur le serveur, mais le `.env` de production doit déjà exister là-bas (il n'est jamais envoyé par le workflow, volontairement). Vérifie qu'il est à jour avant le premier push.
