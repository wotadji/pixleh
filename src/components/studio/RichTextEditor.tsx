"use client";

import { useEffect, useRef } from "react";

/**
 * Éditeur de texte enrichi minimal (gras, italique, souligné, listes, lien), sans
 * dépendance externe : repose sur `contentEditable` + `document.execCommand`, encore
 * largement supporté par tous les navigateurs pour ce type de mise en forme basique.
 * Stocke/retourne du HTML (utilisé pour "À propos" du studio — Réglages > Profil), à
 * afficher ensuite via `dangerouslySetInnerHTML` (contenu saisi par le photographe
 * lui-même sur son propre profil, pas une entrée utilisateur tierce).
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  onKeyDown,
  minHeightClassName = "min-h-[90px]",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Pass-through optionnel — utilisé par le composeur de réponse client pour intercepter
   * Ctrl/Cmd+Entrée comme raccourci d'envoi (voir /dashboard/clients). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Hauteur mini de la zone éditable — réduite pour un composeur de chat compact
   * (par défaut "min-h-[90px]", pensé pour un bloc "À propos" plus long). */
  minHeightClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Ne pousse le HTML dans le DOM qu'au montage (valeur initiale chargée depuis le
  // serveur) : le resynchroniser à chaque frappe ferait sauter le curseur au début du
  // texte à chaque caractère (contentEditable + re-render = perte de la sélection).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML || "");
  }

  // Pas de execCommand standard pour l'interligne — on enveloppe tout le contenu dans un
  // conteneur unique (repéré par `data-lh` pour ne pas en créer un nouveau à chaque
  // changement) et on applique le style dessus, plutôt que par paragraphe : suffisant pour
  // un contrat (un seul interligne cohérent sur tout le document) et beaucoup plus fiable
  // qu'une manipulation de sélection avec contentEditable.
  function setLineHeight(value: string) {
    if (!ref.current) return;
    ref.current.focus();
    let wrapper = ref.current.querySelector<HTMLDivElement>("[data-lh]");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.setAttribute("data-lh", "1");
      wrapper.innerHTML = ref.current.innerHTML;
      ref.current.innerHTML = "";
      ref.current.appendChild(wrapper);
    }
    wrapper.style.lineHeight = value;
    onChange(ref.current.innerHTML);
  }

  const btnClass = "flex h-7 w-7 items-center justify-center rounded text-sm text-gray-600 hover:bg-gray-200";

  return (
    <div className="overflow-hidden rounded-md border border-gray-300 focus-within:border-gray-500">
      <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
        <button
          type="button"
          title="Gras"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
          className={`${btnClass} font-bold`}
        >
          B
        </button>
        <button
          type="button"
          title="Italique"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("italic")}
          className={`${btnClass} italic`}
        >
          I
        </button>
        <button
          type="button"
          title="Souligné"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
          className={`${btnClass} underline`}
        >
          U
        </button>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <button
          type="button"
          title="Liste à puces"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
          className={btnClass}
        >
          •
        </button>
        <button
          type="button"
          title="Liste numérotée"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertOrderedList")}
          className={btnClass}
        >
          1.
        </button>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <button
          type="button"
          title="Aligner à gauche"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyLeft")}
          className={`${btnClass} text-xs`}
        >
          G
        </button>
        <button
          type="button"
          title="Centrer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyCenter")}
          className={`${btnClass} text-xs`}
        >
          C
        </button>
        <button
          type="button"
          title="Aligner à droite"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyRight")}
          className={`${btnClass} text-xs`}
        >
          D
        </button>
        <button
          type="button"
          title="Justifier"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyFull")}
          className={`${btnClass} text-xs`}
        >
          J
        </button>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <select
          title="Interligne"
          defaultValue=""
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => {
            if (e.target.value) setLineHeight(e.target.value);
            e.target.value = "";
          }}
          className="h-7 rounded border-0 bg-transparent text-xs text-gray-600 hover:bg-gray-200 focus:outline-none"
        >
          <option value="" disabled>
            Interligne
          </option>
          <option value="1">Simple</option>
          <option value="1.5">1,5</option>
          <option value="2">Double</option>
        </select>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <button
          type="button"
          title="Lien"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("URL du lien :");
            if (url) exec("createLink", url);
          }}
          className={btnClass}
        >
          🔗
        </button>
        <button
          type="button"
          title="Effacer la mise en forme"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("removeFormat")}
          className={`${btnClass} text-xs`}
        >
          ✕
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML || "")}
        onKeyDown={onKeyDown}
        data-placeholder={placeholder}
        className={`${minHeightClassName} px-3 py-2 text-sm text-gray-800 outline-none [&_a]:text-blue-600 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]`}
      />
    </div>
  );
}
