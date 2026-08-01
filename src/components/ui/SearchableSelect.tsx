"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Ligne secondaire optionnelle affichée sous le label (ex: montant d'un contrat). */
  hint?: string;
}

/**
 * Remplaçant du `<select>` natif pour les listes longues (31/07/2026, demande d'Adriel : "quand
 * je clique sur les checklist [...] avoir une barre de recherche au dessus des <li>") — un
 * `<select>` HTML classique devient difficile à parcourir dès qu'il contient une dizaine
 * d'options à noms longs (voir la liste de contrats de InvoiceForm.tsx, qui a motivé ce
 * composant). Un clic ouvre un panneau avec un champ de recherche (filtre par sous-chaîne,
 * insensible à la casse/accents) au-dessus de la liste d'options, navigable au clavier.
 *
 * Réutilisable partout où un `<select>` id/label pose ce problème (voir composants qui
 * l'utilisent : InvoiceForm.tsx, page liste des factures). Volontairement pas un remplacement
 * de TOUS les `<select>` du projet — seulement ceux dont la liste peut devenir longue (clients,
 * contrats...), les listes courtes à choix fixes (statuts, formes juridiques...) restent en
 * `<select>` natif, plus simple et suffisant.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyOptionLabel,
  disabled,
  className,
  openUpward,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** Texte affiché quand rien n'est sélectionné (équivalent à la première <option value=""> d'un select natif). */
  placeholder: string;
  searchPlaceholder?: string;
  /** Libellé de l'option "aucune sélection" en tête de liste — omise si absente (sélection obligatoire). */
  emptyOptionLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Ouvre le panneau vers le HAUT (bottom-full) au lieu du bas (mt-1) — nécessaire quand le
   * contrôle est collé au bord bas de l'écran (ex. barre d'action fixe en bas de la page
   * PrintSelectionPageView) : le panneau s'ouvrant vers le bas par défaut se retrouve alors
   * rendu hors de l'écran, invisible bien que fonctionnellement ouvert (bug remonté par Adriel,
   * 01/08/2026 : "la barre du bas reste utilisable avec 'Choisir un produit' [mais] n'affiche
   * pas la liste de produit"). */
  openUpward?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) || null;

  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .toLowerCase();

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const base = q ? options.filter((o) => normalize(o.label).includes(q)) : options;
    return base;
  }, [options, query]);

  // Ferme le panneau au clic en dehors — même patron que les autres menus déroulants
  // personnalisés du dashboard (voir filtres de /dashboard/galleries).
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      // Focus différé au prochain tick : le champ n'existe pas encore au moment du clic qui ouvre le panneau.
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  const selectableList = emptyOptionLabel ? [{ value: "", label: emptyOptionLabel }, ...filtered] : filtered;

  function commit(v: string) {
    onChange(v);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, selectableList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = selectableList[highlighted];
      if (opt) commit(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={`truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <IconChevron className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div
          className={`absolute z-20 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg ${
            openUpward ? "bottom-full mb-1" : "mt-1"
          }`}
        >
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {selectableList.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">Aucun résultat</li>
            )}
            {selectableList.map((opt, i) => (
              <li key={opt.value || "__empty__"} role="option" aria-selected={opt.value === value}>
                <button
                  type="button"
                  onClick={() => commit(opt.value)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                    i === highlighted ? "bg-brand-50 text-brand-700" : "text-gray-700"
                  } ${opt.value === value ? "font-medium" : ""}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {"hint" in opt && (opt as SearchableSelectOption).hint && (
                    <span className="text-xs text-gray-400">{(opt as SearchableSelectOption).hint}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
