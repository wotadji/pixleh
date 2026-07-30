"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Éditeur de texte enrichi (gras/italique/souligné, titres, alignement, interligne, listes,
 * retrait, citation, séparateur, lien, vue source...), sans dépendance externe : repose sur
 * `contentEditable` + `document.execCommand`, encore largement supporté par tous les
 * navigateurs pour ce type de mise en forme. Stocke/retourne du HTML (utilisé pour "À propos"
 * du studio et le corps des contrats), à afficher ensuite via `dangerouslySetInnerHTML`
 * (contenu saisi par le photographe lui-même, pas une entrée utilisateur tierce).
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
  // Bascule vers un <textarea> affichant le HTML brut, éditable directement — utile pour
  // corriger/copier-coller une mise en forme précise sans dépendre des commandes du navigateur.
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");

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

  // execCommand n'a pas de commande "taille en px" — seulement 7 tailles numérotées (1 à 7)
  // qui produisent des balises <font size="N">. On passe donc par la taille 7 (la plus
  // grande, pour la retrouver facilement) puis on remplace ces balises générées par un style
  // inline en pixels, sur la sélection courante uniquement.
  function setFontSize(px: string) {
    ref.current?.focus();
    document.execCommand("fontSize", false, "7");
    ref.current?.querySelectorAll('font[size="7"]').forEach((el) => {
      el.removeAttribute("size");
      (el as HTMLElement).style.fontSize = px;
    });
    onChange(ref.current?.innerHTML || "");
  }

  function toggleSourceMode() {
    if (!sourceMode) {
      setSourceText(ref.current?.innerHTML || "");
      setSourceMode(true);
    } else {
      if (ref.current) ref.current.innerHTML = sourceText;
      onChange(sourceText);
      setSourceMode(false);
    }
  }

  const btnClass = "flex h-7 w-7 items-center justify-center rounded text-sm text-gray-600 hover:bg-gray-200";
  const selectClass =
    "h-7 rounded border-0 bg-transparent text-xs text-gray-600 hover:bg-gray-200 focus:outline-none";
  const sep = <span className="mx-1 h-4 w-px shrink-0 bg-gray-300" />;

  return (
    <div className="overflow-hidden rounded-md border border-gray-300 focus-within:border-gray-500">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
        <button
          type="button"
          title="Annuler"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("undo")}
          className={`${btnClass} disabled:opacity-30`}
        >
          ↶
        </button>
        <button
          type="button"
          title="Rétablir"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("redo")}
          className={`${btnClass} disabled:opacity-30`}
        >
          ↷
        </button>
        {sep}
        <select
          title="Format"
          defaultValue=""
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => {
            if (e.target.value) exec("formatBlock", e.target.value);
            e.target.value = "";
          }}
          className={`${selectClass} disabled:opacity-30`}
        >
          <option value="" disabled>
            Format
          </option>
          <option value="<p>">Paragraphe</option>
          <option value="<h1>">Titre 1</option>
          <option value="<h2>">Titre 2</option>
          <option value="<h3>">Titre 3</option>
        </select>
        <select
          title="Taille du texte"
          defaultValue=""
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => {
            if (e.target.value) setFontSize(e.target.value);
            e.target.value = "";
          }}
          className={`${selectClass} disabled:opacity-30`}
        >
          <option value="" disabled>
            Taille
          </option>
          <option value="10px">Très petit</option>
          <option value="12px">Petit</option>
          <option value="14px">Normal</option>
          <option value="16px">Moyen</option>
          <option value="20px">Grand</option>
          <option value="28px">Très grand</option>
        </select>
        {sep}
        <button
          type="button"
          title="Gras"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
          className={`${btnClass} font-bold disabled:opacity-30`}
        >
          B
        </button>
        <button
          type="button"
          title="Italique"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("italic")}
          className={`${btnClass} italic disabled:opacity-30`}
        >
          I
        </button>
        <button
          type="button"
          title="Souligné"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
          className={`${btnClass} underline disabled:opacity-30`}
        >
          U
        </button>
        <button
          type="button"
          title="Effacer la mise en forme"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("removeFormat")}
          className={`${btnClass} text-xs disabled:opacity-30`}
        >
          ✕
        </button>
        {sep}
        <button
          type="button"
          title="Aligner à gauche"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyLeft")}
          className={`${btnClass} text-xs disabled:opacity-30`}
        >
          G
        </button>
        <button
          type="button"
          title="Centrer"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyCenter")}
          className={`${btnClass} text-xs disabled:opacity-30`}
        >
          C
        </button>
        <button
          type="button"
          title="Aligner à droite"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyRight")}
          className={`${btnClass} text-xs disabled:opacity-30`}
        >
          D
        </button>
        <button
          type="button"
          title="Justifier"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyFull")}
          className={`${btnClass} text-xs disabled:opacity-30`}
        >
          J
        </button>
        <select
          title="Interligne"
          defaultValue=""
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => {
            if (e.target.value) setLineHeight(e.target.value);
            e.target.value = "";
          }}
          className={`${selectClass} disabled:opacity-30`}
        >
          <option value="" disabled>
            Interligne
          </option>
          <option value="1">Simple</option>
          <option value="1.5">1,5</option>
          <option value="2">Double</option>
        </select>
        {sep}
        <button
          type="button"
          title="Liste à puces"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
          className={`${btnClass} disabled:opacity-30`}
        >
          •
        </button>
        <button
          type="button"
          title="Liste numérotée"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertOrderedList")}
          className={`${btnClass} disabled:opacity-30`}
        >
          1.
        </button>
        <button
          type="button"
          title="Diminuer le retrait"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("outdent")}
          className={`${btnClass} text-xs disabled:opacity-30`}
        >
          ⇤
        </button>
        <button
          type="button"
          title="Augmenter le retrait"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("indent")}
          className={`${btnClass} text-xs disabled:opacity-30`}
        >
          ⇥
        </button>
        {sep}
        <button
          type="button"
          title="Citation"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("formatBlock", "<blockquote>")}
          className={`${btnClass} disabled:opacity-30`}
        >
          &ldquo;
        </button>
        <button
          type="button"
          title="Ligne de séparation"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertHorizontalRule")}
          className={`${btnClass} disabled:opacity-30`}
        >
          —
        </button>
        <button
          type="button"
          title="Lien"
          disabled={sourceMode}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("URL du lien :");
            if (url) exec("createLink", url);
          }}
          className={`${btnClass} disabled:opacity-30`}
        >
          🔗
        </button>
        {sep}
        <button
          type="button"
          title={sourceMode ? "Revenir à l'aperçu" : "Voir le code source"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleSourceMode}
          className={`${btnClass} ${sourceMode ? "bg-gray-200" : ""}`}
        >
          {"</>"}
        </button>
      </div>
      {sourceMode ? (
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          className={`${minHeightClassName} w-full resize-none px-3 py-2 font-mono text-xs text-gray-800 outline-none`}
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={() => onChange(ref.current?.innerHTML || "")}
          onKeyDown={onKeyDown}
          data-placeholder={placeholder}
          className={`${minHeightClassName} px-3 py-2 text-sm text-gray-800 outline-none [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-gray-300 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]`}
        />
      )}
    </div>
  );
}
