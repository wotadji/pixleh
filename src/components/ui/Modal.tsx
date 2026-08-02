"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Largeur max (classe Tailwind) — "max-w-sm" par défaut, à élargir au cas par cas
   * (ex: "max-w-lg") pour les modales avec plus de contenu (voir duplicateConfirm). */
  widthClassName?: string;
}

/**
 * Boîte de dialogue centrée réutilisable (remplace window.prompt/confirm).
 * Fermeture au clic sur le fond, à l'appui sur Échap, ou via onClose.
 */
export function Modal({ open, onClose, title, children, footer, widthClassName = "max-w-sm" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // max-h/overflow-y-auto (02/08/2026, retour d'Adriel : "le modal dans panel admin ne se
        // presente pas bien") — les formulaires les plus longs (ex: ProductModal du catalogue
        // impression, avec toggle groupe/type de bordure/dropzone image) peuvent dépasser la
        // hauteur d'un écran plus petit ; sans limite ni défilement propre, le contenu débordait
        // du cadre blanc plutôt que de défiler à l'intérieur, cassant la mise en page. Le
        // scroll reste interne à la boîte de dialogue, jamais sur le fond assombri.
        className={`flex max-h-[90vh] w-full ${widthClassName} flex-col rounded-xl bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
