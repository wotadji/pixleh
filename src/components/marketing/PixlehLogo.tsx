/**
 * Logo pixleh — icône "P" appareil photo (SVG fourni par Adriel, dégradé bleu → violet →
 * rose → orange) + wordmark. `showWordmark` permet de n'afficher que l'icône (favicon-like,
 * espaces restreints) ; `size` contrôle la hauteur de l'icône en pixels.
 */
export function PixlehLogo({
  showWordmark = true,
  size = 28,
  className = "",
}: {
  showWordmark?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 500 500"
        width={size}
        height={size}
        aria-hidden={showWordmark ? "true" : undefined}
        role={showWordmark ? undefined : "img"}
      >
        {!showWordmark && <title>pixleh</title>}
        <defs>
          <linearGradient id="pixlehGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="75%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>
        <path
          fill="url(#pixlehGrad)"
          d="M150 100 H280 C360 100 400 150 400 220 C400 290 350 330 280 330 H220 V400 C220 420 200 440 180 440 H150 V100 Z"
        />
        <rect x="110" y="390" width="25" height="25" fill="#8B5CF6" rx="4" />
        <rect x="110" y="425" width="25" height="25" fill="#3B82F6" rx="4" />
        <rect x="140" y="425" width="25" height="25" fill="#3B82F6" rx="4" />
        <path
          fill="#FFFFFF"
          d="M240 180 H260 L270 195 H310 C320 195 330 205 330 215 V275 C330 285 320 295 310 295 H210 C200 295 190 285 190 275 V215 C190 205 200 195 210 195 H230 L240 180 Z"
        />
        <circle cx="260" cy="245" r="25" fill="url(#pixlehGrad)" />
        <circle cx="305" cy="215" r="5" fill="url(#pixlehGrad)" />
      </svg>
      {showWordmark && <span className="font-serif text-xl font-semibold">pixleh</span>}
    </span>
  );
}
