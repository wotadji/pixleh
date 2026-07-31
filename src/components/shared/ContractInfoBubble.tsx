"use client";

import { useEffect, useRef, useState } from "react";

interface BubbleLine {
  label: string;
  value: string;
  /** Ligne secondaire (ex: solde restant) affichée en gris plutôt qu'en noir. */
  muted?: boolean;
}

/**
 * Bulle d'information sur le contrat lié à une facture — demandé par Adriel, 31/07/2026 :
 * "une bulle qui notifie le taux ou les informations de paiement du contrat quand
 * l'utilisateur a choisi de payer la facture à base d'un contrat". Réutilisée à la fois sur
 * la page publique de paiement (/i/[id], côté client qui règle la facture) et sur la liste
 * des factures du dashboard studio (à la place du simple titre au survol sur l'icône lien),
 * voir CONTRACT-303/305 et ce fichier pour la logique de calcul (agrégation facturé/payé par
 * contrat, déjà utilisée sur /dashboard/contracts).
 *
 * Composant purement présentationnel : toutes les valeurs (montants, pourcentages, libellés)
 * sont déjà formatées par l'appelant, pour rester indépendant de la devise/locale et
 * réutilisable aussi bien en contexte i18n (dashboard) qu'en texte français figé (page
 * publique, même convention que le reste de /i/[id]).
 */
export function ContractInfoBubble({
  triggerLabel,
  title,
  lines,
}: {
  triggerLabel: string;
  title: string;
  lines: BubbleLine[];
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={`flex h-4 w-4 items-center justify-center rounded-full transition ${
          open ? "text-brand-600" : "text-gray-400 hover:text-brand-600"
        }`}
      >
        <IconLinkSmall />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg">
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-gray-200 bg-white" />
          <p className="truncate text-xs font-semibold text-gray-900">{title}</p>
          <div className="mt-2 space-y-1.5">
            {lines.map((l, i) => (
              <div
                key={i}
                className={`flex items-baseline justify-between gap-3 text-xs ${l.muted ? "text-gray-400" : "text-gray-600"}`}
              >
                <span>{l.label}</span>
                <span className={`shrink-0 font-medium ${l.muted ? "text-gray-500" : "text-gray-900"}`}>
                  {l.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IconLinkSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 15l6-6" strokeLinecap="round" />
      <path d="M11 5.5l1-1a3.5 3.5 0 0 1 5 5l-1 1" strokeLinecap="round" />
      <path d="M13 18.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" strokeLinecap="round" />
    </svg>
  );
}
