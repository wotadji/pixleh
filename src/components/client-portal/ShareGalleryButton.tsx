"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Copie le lien /g/[slug] dans le presse-papier — même lien que le bouton "Partager" du
 * panel studio (voir GalleryManager > handleShare), pour que le client puisse le retransmettre
 * lui-même (famille, invités...) sans repasser par le studio.
 *
 * `dense` (30/07/2026) : réduit padding/texte quand utilisé dans une carte grille étroite (voir
 * ClientGalleriesView > GalleryActions), pour que les 3 actions tiennent sur une seule ligne. */
export function ShareGalleryButton({ gallerySlug, dense }: { gallerySlug: string; dense?: boolean }) {
  const { t } = useLanguage();
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
      window.prompt(t("gm.copyLinkFallback"), url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex shrink items-center justify-center whitespace-nowrap rounded-lg border-[1.5px] border-sky-400 font-medium text-sky-700 transition-colors hover:bg-sky-50 ${
        dense ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      {copied ? t("client.galleries.linkCopied") : t("client.galleries.share")}
    </button>
  );
}
