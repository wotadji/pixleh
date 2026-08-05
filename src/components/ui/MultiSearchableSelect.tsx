"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface MultiSearchableSelectOption {
  value: string;
  label: string;
}

/**
 * Variante multi-sélection de SearchableSelect (voir ce fichier) — même panneau
 * recherche + liste, mais chaque option est une case à cocher et le panneau reste ouvert
 * après un clic (on peut cocher plusieurs options d'affilée). Introduit pour le champ
 * "Clients additionnels" de NewGalleryForm.tsx (05/08/2026, chantier "plusieurs clients par
 * galerie") — le bouton déclencheur affiche le nombre de sélections plutôt qu'un libellé
 * unique, chaque sélection reste retirable individuellement via une petite croix sur son
 * "chip" sous le bouton.
 */
export function MultiSearchableSelect({
  values,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSearchableSelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOptions = useMemo(
    () => options.filter((o) => values.includes(o.value)),
    [options, values]
  );

  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .toLowerCase();

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((o) => normalize(o.label).includes(q)) : options;
  }, [options, query]);

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
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  function toggle(v: string) {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
    } else {
      onChange([...values, v]);
    }
  }

  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={`truncate ${selectedOptions.length ? "text-gray-900" : "text-gray-400"}`}>
          {selectedOptions.length ? `${selectedOptions.length} sélectionné(s)` : placeholder}
        </span>
        <IconChevron className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {selectedOptions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700"
            >
              {opt.label}
              <button
                type="button"
                onClick={() => remove(opt.value)}
                className="text-brand-400 hover:text-brand-700"
                aria-label={`Retirer ${opt.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-[max(100%,20rem)] max-w-[24rem] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">Aucun résultat</li>}
            {filtered.map((opt) => {
              const checked = values.includes(opt.value);
              return (
                <li key={opt.value} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      checked ? "bg-brand-50 text-brand-700" : "text-gray-700"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked ? "border-brand-600 bg-brand-600" : "border-gray-300"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="h-3 w-3">
                          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="whitespace-normal break-words leading-snug">{opt.label}</span>
                  </button>
                </li>
              );
            })}
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
