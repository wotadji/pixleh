"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";

/**
 * `<input type="password">` avec un bouton "œil" pour afficher/masquer les caractères saisis,
 * comme sur les sites pro — demandé par Adriel (05/08/2026). Remplace tous les
 * `<input type="password">` bruts du projet (connexion, inscription, réinitialisation, espace
 * client, accès galerie...).
 *
 * `variant="dark"` pour les champs sur fond sombre (GalleryEntryChooser, PasswordGate — icône
 * blanche translucide) ; `"light"` (défaut) pour les formulaires classiques sur fond blanc.
 * Toutes les autres props (value, onChange, className, required, autoFocus, placeholder...)
 * sont transmises telles quelles à l'`<input>` sous-jacent.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { variant?: "light" | "dark" }
>(function PasswordInput({ className, variant = "light", ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const iconClass = variant === "dark" ? "text-white/60 hover:text-white" : "text-gray-400 hover:text-gray-600";

  return (
    <div className="relative">
      <input ref={ref} type={visible ? "text" : "password"} className={`${className || ""} pr-10`} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${iconClass}`}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
});

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.86 21.86 0 0 1 5.06-6.06M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a21.8 21.8 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
