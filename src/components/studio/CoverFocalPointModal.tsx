"use client";

import { useRef, useState } from "react";

const FRAME_WIDTH = 420; // px, cadre d'aperçu affiché à l'écran
const FRAME_HEIGHT = 260;

/**
 * Modale de repositionnement de la photo de couverture — équivalent du recadrage de la
 * photo de profil (LogoCropModal), mais non destructif : la couverture est une photo de
 * la galerie déjà utilisée ailleurs (grille, téléchargement...), donc on ne la recadre
 * pas physiquement. On enregistre juste un "point focal" (0 à 1 en x/y, relatif à
 * l'IMAGE elle-même) appliqué ensuite en `background-position` partout où la couverture
 * s'affiche (voir GalleryCover dans GalleryView.tsx) — ça fonctionne quel que soit le
 * style de couverture choisi (les 9 styles n'ont pas tous le même ratio d'affichage).
 *
 * L'image entière reste visible (object-contain) dans le cadre, avec un repère
 * déplaçable au clic/glissé pour indiquer la zone à garder visible en priorité.
 *
 * Point important : comme l'image n'a en général pas le même ratio que le cadre, elle
 * est affichée avec des bandes vides de part et d'autre (letterbox). Le clic doit donc
 * être converti par rapport à la zone RÉELLEMENT occupée par l'image dans le cadre, pas
 * par rapport au cadre entier — sinon le point enregistré ne correspond pas à l'endroit
 * cliqué une fois appliqué en `background-position` (qui, lui, n'a pas de bandes vides,
 * l'image y est toujours agrandie pour couvrir tout l'espace).
 */
export function CoverFocalPointModal({
  imageUrl,
  initialX,
  initialY,
  onCancel,
  onConfirm,
  t,
}: {
  imageUrl: string;
  initialX: number;
  initialY: number;
  onCancel: () => void;
  onConfirm: (x: number, y: number) => void;
  t: (key: string) => string;
}) {
  const [point, setPoint] = useState({ x: initialX, y: initialY });
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Rectangle réellement occupé par l'image dans le cadre (le reste, ce sont les bandes
  // vides du letterbox) — mêmes calculs que le CSS `object-fit: contain`.
  function getImageRect() {
    if (!naturalSize) return { left: 0, top: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT };
    const scale = Math.min(FRAME_WIDTH / naturalSize.w, FRAME_HEIGHT / naturalSize.h);
    const width = naturalSize.w * scale;
    const height = naturalSize.h * scale;
    return { left: (FRAME_WIDTH - width) / 2, top: (FRAME_HEIGHT - height) / 2, width, height };
  }

  function setPointFromEvent(e: React.PointerEvent) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    // Coordonnées du clic en px, dans le repère du cadre (0,0 = coin haut-gauche du cadre).
    const clickX = ((e.clientX - rect.left) / rect.width) * FRAME_WIDTH;
    const clickY = ((e.clientY - rect.top) / rect.height) * FRAME_HEIGHT;
    const img = getImageRect();
    const x = Math.min(1, Math.max(0, (clickX - img.left) / img.width));
    const y = Math.min(1, Math.max(0, (clickY - img.top) / img.height));
    setPoint({ x, y });
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setPointFromEvent(e);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    setPointFromEvent(e);
  }
  function handlePointerUp() {
    draggingRef.current = false;
  }

  const imgRect = getImageRect();
  const markerLeft = imgRect.left + point.x * imgRect.width;
  const markerTop = imgRect.top + point.y * imgRect.height;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
          {t("design.repositionCoverTitle")}
        </h2>
        <p className="mt-1 text-xs text-gray-500">{t("design.repositionCoverHint")}</p>

        <div
          ref={frameRef}
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-lg bg-gray-900"
          style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, cursor: "crosshair" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            className="pointer-events-none h-full w-full object-contain"
          />
          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)]"
            style={{ left: markerLeft, top: markerTop }}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">
            {t("settings.cancel")}
          </button>
          <button type="button" onClick={() => onConfirm(point.x, point.y)} className="btn-primary text-sm">
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
