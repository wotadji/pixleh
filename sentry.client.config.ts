// Initialisation Sentry côté navigateur — capture les erreurs React/JS qui se produisent
// dans le navigateur du studio ou du client (galerie publique, panel photographe, espace
// client...). Chargé automatiquement par le plugin webpack de @sentry/nextjs (voir
// next.config.js) à chaque build, aucun import manuel nécessaire ailleurs dans le code.
//
// Tant que NEXT_PUBLIC_SENTRY_DSN n'est pas défini (ex : en local/dev), `dsn` vaut undefined
// et le SDK ne fait rien — aucune erreur, aucun envoi réseau, aucun risque de casser le
// développement local. Voir .env.example pour la procédure de configuration.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV,

  // 10 % des transactions en prod (suffisant pour repérer les tendances de perf sans
  // exploser le quota gratuit Sentry) ; 100 % en dev pour tout voir pendant les tests.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Replay désactivé par défaut : coûteux en quota Sentry (gratuit très limité dessus) et
  // pas indispensable pour simplement savoir qu'une erreur se produit. Peut être activé plus
  // tard (ajouter Sentry.replayIntegration() ci-dessous) si le suivi du parcours utilisateur
  // au moment du bug devient nécessaire.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Évite le bruit habituel (erreurs d'extensions navigateur, résilience réseau côté client)
  // qui ne reflète jamais un bug réel de pixleh.
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
  ],
});
