import { defineConfig } from "vitest/config";
import path from "path";

// Config volontairement minimale : on ne teste que des fonctions pures de src/lib
// (aucun composant React, aucune requête Prisma) donc pas besoin de jsdom ni de
// plugin Next — juste l'alias "@/*" -> "./src/*" utilisé partout dans le code (voir
// tsconfig.json), reproduit ici manuellement pour éviter une dépendance
// supplémentaire (vite-tsconfig-paths) bloquée par la politique réseau du bac à
// sable de développement.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
