"use client";

import { useEffect, RefObject } from "react";
import type SignatureCanvas from "react-signature-canvas";

/**
 * Corrige le décalage classique de react-signature-canvas (signalé par Adriel : "l'ancre ne
 * se positionne pas au niveau de la souris, décalage vers la droite, et rien ne se dessine
 * en pointant vers la droite") : le canvas a une résolution interne fixe (width/height passés
 * en props, ex 500×180) mais son affichage CSS est étiré via `w-full` pour occuper toute la
 * largeur du conteneur — la librairie mappe la position de la souris aux coordonnées internes
 * du canvas sans tenir compte de cet étirement, d'où un décalage qui grandit à mesure qu'on
 * s'éloigne du bord gauche (et un tracé qui "disparaît" une fois sorti de la zone 500px
 * d'origine alors que la zone affichée est plus large).
 *
 * On redimensionne la résolution réelle du canvas pour qu'elle corresponde exactement à sa
 * taille affichée (en tenant compte du devicePixelRatio pour un tracé net sur écran Retina),
 * au montage/à l'activation et à chaque redimensionnement de la fenêtre.
 *
 * `active` : ne redimensionne que si le canvas est réellement visible (offsetWidth non nul) —
 * nécessaire quand le canvas reste monté mais masqué en CSS (`hidden`) pendant qu'un autre
 * onglet est actif, voir SignatureField.
 */
export function useSignatureCanvasResize(ref: RefObject<SignatureCanvas>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function resize() {
      const canvas = ref.current?.getCanvas();
      if (!canvas || !canvas.offsetWidth) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      ref.current?.clear();
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
