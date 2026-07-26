"use client";

import { useEffect, useRef, useState } from "react";

const PREVIEW_WIDTH = 440; // px, largeur du cadre affiché à l'écran
const OUTPUT_WIDTH = 1600; // px, largeur du fichier exporté (avant redimensionnement/compression serveur)

/**
 * Recadrage (glisser + zoomer, export via <canvas> masqué) réutilisé du même principe que
 * LogoCropModal/BannerCropModal (dashboard studio) mais généralisé à n'importe quel ratio
 * (`aspectRatio` = largeur/hauteur), pour servir aux images des blocs du site marketing
 * (/admin/site) où le ratio varie selon le type de bloc (hero large, image texte plus
 * carrée...). Pas de dépendance i18n ici : le panel admin plateforme est en français fixe,
 * comme le reste de /admin.
 */
export function ImageCropModal({
  file,
  aspectRatio,
  title = "Recadrer l'image",
  hint = "Faites glisser pour repositionner, ajustez le zoom si besoin.",
  onCancel,
  onConfirm,
}: {
  file: File;
  aspectRatio: number;
  title?: string;
  hint?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const previewWidth = PREVIEW_WIDTH;
  const previewHeight = Math.round(PREVIEW_WIDTH / aspectRatio);
  const outputWidth = OUTPUT_WIDTH;
  const outputHeight = Math.round(OUTPUT_WIDTH / aspectRatio);

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoadError(false);
    setNaturalSize(null);
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const coverScale = naturalSize
    ? Math.max(previewWidth / naturalSize.w, previewHeight / naturalSize.h)
    : 1;
  const scale = coverScale * zoom;
  const dispW = naturalSize ? naturalSize.w * scale : 0;
  const dispH = naturalSize ? naturalSize.h * scale : 0;

  function clamp(x: number, y: number) {
    const minX = previewWidth - dispW;
    const minY = previewHeight - dispH;
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
    const outputScale = outputWidth / previewWidth;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
      0.9
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">{title}</h2>
        <p className="mt-1 text-xs text-gray-500">{hint}</p>

        <div
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-lg bg-gray-100"
          style={{ width: previewWidth, height: previewHeight, cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {imgUrl && !loadError && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              onLoad={handleImgLoad}
              onError={() => setLoadError(true)}
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
          {imgUrl && !loadError && !naturalSize && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
              Chargement de l&apos;image...
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-red-600">
              Ce fichier n&apos;a pas pu être affiché par le navigateur (format non pris en
              charge). Essayez un JPG, PNG ou WEBP.
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-gray-500">Zoom</span>
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
            Annuler
          </button>
          <button type="button" onClick={handleConfirm} disabled={!naturalSize} className="btn-primary text-sm">
            Utiliser cette image
          </button>
        </div>
      </div>
    </div>
  );
}
