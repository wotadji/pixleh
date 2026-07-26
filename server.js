/**
 * Serveur personnalisé pour Next.js.
 *
 * Nécessaire pour un déploiement via "Setup Node.js App" de cPanel (Passenger),
 * qui attend un fichier d'entrée Node classique plutôt que la CLI `next start`.
 * Passenger fournit le port via la variable d'environnement PORT.
 *
 * En local ou sur un VPS, vous pouvez aussi lancer directement `npm run start:next`.
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`> pixleh prêt sur http://${hostname}:${port} (env: ${process.env.NODE_ENV})`);
  });
});
