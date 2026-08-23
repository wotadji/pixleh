// Point d'entrée officiel Next.js pour brancher un outil de monitoring au démarrage du
// serveur (voir experimental.instrumentationHook: true dans next.config.js, obligatoire pour
// ce fichier sur Next.js 14 — devient stable sans flag à partir de Next.js 15). `register()`
// est appelé une fois par instance serveur démarrée, avant que la moindre requête n'arrive.
//
// On charge le bon fichier de config Sentry selon le runtime courant : le serveur Node
// "classique" (API routes, Server Components...) et le runtime Edge (src/middleware.ts)
// n'ont pas le même jeu d'API disponibles, d'où deux fichiers d'init séparés.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
