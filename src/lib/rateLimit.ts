/**
 * Limiteur de débit en mémoire — fenêtre fixe par clé (email, IP, ou combinaison).
 *
 * Limite connue et assumée pour cette v1 : ce compteur vit dans la mémoire du process
 * Node. Il fonctionne correctement tant que l'app tourne sur une seule instance (c'est le
 * cas actuel — voir server.js), mais NE PROTÈGE PLUS RIEN dès qu'on scale horizontalement
 * sur plusieurs instances (chacune aurait son propre compteur, contournable en répartissant
 * les requêtes). Migrer vers un store partagé (Redis / Upstash) est nécessaire avant du
 * multi-instance — voir l'audit du 20/07/2026, section sécurité applicative.
 *
 * Un nettoyage périodique évite une fuite mémoire si l'app tourne des semaines sans
 * redémarrer : les entrées expirées sont purgées à chaque appel (coût négligeable, pas de
 * setInterval séparé à gérer).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * @param key Identifiant unique de la ressource limitée (ex: `register:${ip}`,
 *   `login:${email}`, `gallery-password:${ip}:${slug}`).
 * @param limit Nombre de requêtes autorisées par fenêtre.
 * @param windowMs Durée de la fenêtre en millisecondes.
 * @returns `allowed: false` + `retryAfterSeconds` si la limite est dépassée.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** IP du client, en tenant compte d'un éventuel proxy/reverse-proxy (Nginx, cPanel...). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
