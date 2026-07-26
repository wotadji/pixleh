import { ImageResponse } from "next/og";

/**
 * Icône iOS ("ajouter à l'écran d'accueil") — générée à la volée en PNG via next/og
 * plutôt que produite avec sharp (indisponible dans le bac à sable de dev, binaire natif
 * manquant pour cette architecture) : aucune dépendance d'image supplémentaire, et le
 * rendu est mis en cache par Next comme n'importe quel fichier de métadonnées statique.
 * Reprend les couleurs du dégradé de marque (voir PixlehLogo.tsx) et l'initiale "P".
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 75%, #F97316 100%)",
          borderRadius: 36,
        }}
      >
        <span style={{ color: "#FFFFFF", fontSize: 104, fontWeight: 700 }}>P</span>
      </div>
    ),
    size
  );
}
