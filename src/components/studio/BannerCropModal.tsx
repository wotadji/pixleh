"use client";

import { useEffect, useRef, useState } from "react";

const PREVIEW_WIDTH = 340; // px, largeur du cadre affiché à l'écran
const PREVIEW_HEIGHT = 160; // px, hauteur du cadre (ratio ~21:10, proche du rendu carrousel)
const OUTPUT_SCALE = 5; // résolution export = cadre × ce facteur, avant compression serveur

/**
 * Variante "bannière" (rectangle large) de LogoCropModal : même interaction (glisser +
 * zoomer dans un <canvas> masqué pour l'export), mais cadre rectangulaire plutôt que
 * circulaire — utilisée pour les images de fond du carrousel du site public, qui sont
 * larges et courtes plutôt que carrées comme le logo/photo de profil.
 */
export function BannerCropModal({
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

  const coverScale = naturalSize
    ? Math.max(PREVIEW_WIDTH / naturalSize.w, PREVIEW_HEIGHT / naturalSize.h)
    : 1;
  const scale = coverScale * zoom;
  const dispW = naturalSize ? naturalSize.w * scale : 0;
  const dispH = naturalSize ? naturalSize.h * scale : 0;

  function clamp(x: number, y: number) {
    const minX = PREVIEW_WIDTH - dispW;
    const minY = PREVIEW_HEIGHT - dispH;
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  }

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  useEffect(() => {
    if (!naturalSize) return;
    setOffset((prev) => clamp(prev.x, prev.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, naturalSize]);

  function handlePointerDown(e: React.PointerEvent) {
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
    canvas.width = PREVIEW_WIDTH * OUTPUT_SCALE;
    canvas.height = PREVIEW_HEIGHT * OUTPUT_SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      imgRef.current,
      0,
      0,
      naturalSize.w,
      naturalSize.h,
      offset.x * OUTPUT_SCALE,
      offset.y * OUTPUT_SCALE,
      dispW * OUTPUT_SCALE,
      dispH * OUTPUT_SCALE
    );
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
          {t("settings.repositionTitle")}
        </h2>
        <p className="mt-1 text-xs text-gray-500">{t("settings.repositionHint")}</p>

        <div
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-lg bg-gray-100"
          style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, cursor: "grab" }}
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
