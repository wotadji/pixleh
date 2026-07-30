"use client";

import { useState } from "react";

/** Copie le lien /g/[slug] dans le presse-papier — même lien que le bouton "Partager" du
 * panel studio (voir GalleryManager > handleShare), pour que le client puisse le retransmettre
 * lui-même (famille, invités...) sans repasser par le studio. */
export function ShareGalleryButton({ gallerySlug }: { gallerySlug: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/g/${gallerySlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiez le lien :", url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-xs text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
    >
      {copied ? "Lien copié" : "Partager"}
    </button>
  );
}
