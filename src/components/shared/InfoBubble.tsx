"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bulle d'information générique, cliquable, qui se ferme au clic extérieur ou à Échap —
 * même pattern d'interaction que ContractInfoBubble (voir ce fichier), mais avec un
 * déclencheur (`trigger`) et un contenu (`children`) entièrement libres au lieu d'une liste
 * fixe de {label, value}. Introduite pour la pastille "profil incomplet" de DashboardSidebar
 * (03/08/2026), où le déclencheur est une pastille ambre posée sur l'avatar du studio et le
 * contenu un texte + lien, ce qui ne rentrait pas dans l'API {triggerLabel, title, lines} de
 * ContractInfoBubble.
 */
export function InfoBubble({
  trigger,
  triggerLabel,
  children,
  align = "left",
  panelClassName = "w-64",
}: {
  trigger: React.ReactNode;
  /** Libellé accessible du déclencheur (aria-label). */
  triggerLabel: string;
  children: React.ReactNode;
  /** Alignement du panneau par rapport au déclencheur. */
  align?: "left" | "center";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={triggerLabel} title={triggerLabel}>
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-full z-30 mt-2 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg ${panelClassName} ${
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
          }`}
        >
          <div
            className={`absolute -top-1 h-2 w-2 rotate-45 border-l border-t border-gray-200 bg-white ${
              align === "center" ? "left-1/2 -translate-x-1/2" : "left-3"
            }`}
          />
          {children}
        </div>
      )}
    </div>
  );
}
