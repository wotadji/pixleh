/**
 * Logo pixleh — icône "P" appareil photo + wordmark. `showWordmark` permet de n'afficher
 * que l'icône (favicon-like, espaces restreints) ; `size` contrôle la hauteur de l'icône
 * en pixels.
 *
 * Le mark réutilise directement le fichier public/favicon `src/app/icon.svg` (au lieu de
 * dupliquer le dessin en JSX) — demande d'Adriel le 15/09/2026 après plusieurs allers-
 * retours où le mark restait trop petit/peu visible avec l'ancien SVG inline : une seule
 * source de vérité pour ce dessin, et un simple <img> dont la taille via `width`/`height`
 * est plus prévisible à ajuster qu'un SVG inline avec dégradé.
 */
export function PixlehLogo({
  showWordmark = true,
  size = 28,
  className = "",
  wordmarkClassName = "",
}: {
  showWordmark?: boolean;
  size?: number;
  className?: string;
  /** Classes additionnelles sur le texte "pixleh" (ex. `md:hidden` pour le masquer
   * en CSS sans démonter le mark, quand un même composant doit rester intégral en
   * mobile mais se replier en icône seule à partir d'un breakpoint desktop). */
  wordmarkClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/icon.svg"
        alt={showWordmark ? "" : "pixleh"}
        aria-hidden={showWordmark ? "true" : undefined}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0"
      />
      {showWordmark && <span className={`font-serif text-xl font-semibold ${wordmarkClassName}`}>pixleh</span>}
    </span>
  );
}
