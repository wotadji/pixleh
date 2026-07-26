"use client";

import { useEffect, useRef, useState } from "react";

const PREVIEW_SIZE = 260; // px, taille du cadre affiché à l'écran
const OUTPUT_SIZE = 500; // px, résolution de l'export (avant le resize/compression serveur)

/**
 * Modale de recadrage du logo/photo de profil : plutôt que de laisser le serveur
 * recadrer bêtement au centre (`fit: "cover"`, voir /api/settings/logo), on affiche
 * l'image dans un cadre circulaire que l'utilisateur peut déplacer (glisser) et zoomer
 * pour choisir exactement la zone visible — utile pour un visage ou un logo qui n'est
 * pas déjà centré/carré dans le fichier d'origine.
 *
 * Le résultat est exporté en Blob JPEG via un <canvas> masqué, reproduisant exactement
 * le cadrage visible dans l'aperçu (même position/zoom, à une résolution plus élevée) —
 * ce blob est ensuite envoyé tel quel à /api/settings/logo, qui n'a donc plus qu'à
 * ajuster la taille finale.
 */
export function LogoCropModal({
  file,
  onCancel,
  onConfirm,
  t,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  t: (key: string) => string;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const coverScale = naturalSize ? Math.max(PREVIEW_SIZE / naturalSize.w, PREVIEW_SIZE / naturalSize.h) : 1;
  const scale = coverScale * zoom;
  const dispW = naturalSize ? naturalSize.w * scale : 0;
  const dispH = naturalSize ? naturalSize.h * scale : 0;

  function clamp(x: number, y: number) {
    const minX = PREVIEW_SIZE - dispW;
    const minY = PREVIEW_SIZE - dispH;
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  }

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  // Re-clampe la position à chaque changement de zoom, pour ne jamais laisser de bande
  // vide apparaître dans le cadre (l'image doit toujours le couvrir entièrement).
  useEffect(() => {
    if (!naturalSize) return;
    setOffset((prev) => clamp(prev.x, prev.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, naturalSize]);

  function handlePointerDown(e: React.PointerEvent) {
    // `currentTarget` (le cadre) plutôt que `target` : un drag qui démarre sur l'image
    // (enfant du cadre) doit quand même capturer le pointeur sur le cadre lui-même,
    // sinon `onPointerMove` ne se déclenche plus correctement dès que le curseur sort
    // des limites de l'image affichée.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp(dragRef.current.offsetX + dx, dragRef.current.offsetY + dy));
  }
  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    if (!naturalSize || !imgRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const outputScale = OUTPUT_SIZE / PREVIEW_SIZE;
    ctx.drawImage(
      imgRef.current,
      0,
      0,
      naturalSize.w,
      naturalSize.h,
      offset.x * outputScale,
      offset.y * outputScale,
      dispW * outputScale,
      dispH * outputScale
    );
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
          {t("settings.repositionTitle")}
        </h2>
        <p className="mt-1 text-xs text-gray-500">{t("settings.repositionHint")}</p>

        <div
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-full bg-gray-100"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              onLoad={handleImgLoad}
              draggable={false}
              className="absolute select-none"
              style={{
                width: dispW || undefined,
                height: dispH || undefined,
                left: offset.x,
                top: offset.y,
              }}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-gray-500">{t("settings.zoomLabel")}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">
            {t("settings.cancel")}
          </button>
          <button type="button" onClick={handleConfirm} disabled={!naturalSize} className="btn-primary text-sm">
            {t("settings.useThisPhoto")}
          </button>
        </div>
      </div>
    </div>
  );
}
