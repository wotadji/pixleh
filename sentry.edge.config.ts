// Initialisation Sentry pour le runtime Edge (src/middleware.ts) — chargé via
// src/instrumentation.ts (register(), runtime "edge"). Séparé du config serveur "nodejs" car
// le runtime Edge n'a pas accès à toutes les API Node (voir doc Next.js sur les runtimes).
//
// Tant que SENTRY_DSN n'est pas défini, `dsn` vaut undefined et le SDK ne fait rien.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
