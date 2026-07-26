// En-têtes de sécurité HTTP appliqués à toutes les réponses — voir l'audit du 20/07/2026
// (Sprint 1). CSP volontairement permissive sur script-src/style-src ('unsafe-inline'
// 'unsafe-eval') car Next.js et Tailwind en dépendent en l'état actuel du projet ; le
// verrouillage complet (nonces, suppression d'unsafe-eval) est un chantier ultérieur qui
// demande de tester chaque page manuellement pour ne rien casser. Le reste (frame-ancestors,
// object-src, base-uri, form-action) protège déjà contre le clickjacking et l'injection de
// balises <object>/<base> sans aucun risque de régression fonctionnelle.
const CSP = [
  "default-src 'self'",
  // "blob:" est indispensable : les modales de recadrage (logo, carrousel, blocs marketing
  // — LogoCropModal/BannerCropModal/ImageCropModal) prévisualisent le fichier choisi via
  // URL.createObjectURL(), qui génère une URL blob:. Sans cette entrée, le CSP bloque
  // silencieusement le chargement de l'aperçu (l'<img> déclenche onError, sans erreur JS
  // visible en dehors de la console) — régression trouvée le 21/07/2026.
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: CSP },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  // Le stockage se fait sur un serveur de fichiers distant (SFTP), servi via
  // l'API interne /api/files/[...path], donc pas besoin de domaines d'images externes
  // sauf si vous exposez le serveur de fichiers directement en HTTP (voir README).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Nécessaire pour que `sharp` et `ssh2-sftp-client` fonctionnent correctement
  // en tant que dépendances serveur uniquement (non bundlées côté client).
  // Sur Next.js 15+, cette option devient `serverExternalPackages` (top-level) :
  // si vous mettez à jour Next.js, déplacez simplement ce tableau à la racine.
  experimental: {
    serverComponentsExternalPackages: ["sharp", "ssh2-sftp-client"],
  },
};

module.exports = nextConfig;
