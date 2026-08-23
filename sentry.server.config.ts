// Initialisation Sentry côté serveur Node (API routes, Server Components, Server Actions,
// route /api/files, webhook Stripe, cron facturation...) — chargé via src/instrumentation.ts
// (register(), runtime "nodejs"), voir ce fichier pour le détail.
//
// Tant que SENTRY_DSN n'est pas défini, `dsn` vaut undefined et le SDK ne fait rien — sûr par
// défaut en local/dev ou tant qu'Adriel n'a pas créé de compte Sentry. Voir .env.example.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
