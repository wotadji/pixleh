"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { signatureFont } from "@/lib/fonts";

type SignMode = "type" | "upload" | "draw";

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 Mo

/** Dessine `text` avec la police manuscrite sur un canvas hors-écran et retourne un PNG
 * base64 — c'est cette image (pas le texte brut) qui est stockée/affichée/imprimée dans le
 * PDF, exactement comme une signature dessinée ou importée (voir Contract.studioSignatureDataUrl). */
async function renderTypedSignature(text: string): Promise<string | null> {
  if (!text.trim()) return null;
  const fontFamily = signatureFont.style.fontFamily;
  try {
    await document.fonts.load(`48px ${fontFamily}`);
  } catch {
    // Tant pis si le chargement explicite échoue (ex: environnement sans document.fonts) —
    // la police est de toute façon déjà injectée via le <html> par next/font.
  }
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 150;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#111827";
  ctx.font = `48px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  return canvas.toDataURL("image/png");
}

/**
 * Zone de signature à 3 méthodes — utilisée pour la signature du studio à la création d'un
 * contrat (contracts/new) : "Texte" (tapé, rendu en police manuscrite), "Importer" (image
 * JPEG/PNG) ou "Souris" (dessiné). Les 3 blocs restent montés (juste masqués en CSS) pour ne
 * pas perdre le contenu d'un onglet en passant à un autre.
 */
export function SignatureField({
  defaultText,
  onChange,
}: {
  /** Valeur initiale de l'onglet "Texte" — pré-rempli avec le nom du studio (modifiable). */
  defaultText: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const [mode, setMode] = useState<SignMode>("type");
  const [typedText, setTypedText] = useState(defaultText);
  const [typedDataUrl, setTypedDataUrl] = useState<string | null>(null);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<SignatureCanvas>(null);

  // Ne se resynchronise que si `defaultText` change côté parent (ex: le nom du studio arrive
  // après le premier rendu, une fois /api/settings résolu) — sans écraser une saisie déjà en
  // cours de l'utilisateur.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current && defaultText) {
      setTypedText(defaultText);
      hydrated.current = true;
    }
  }, [defaultText]);

  // Génère l'image du texte tapé à chaque frappe (police manuscrite) et la remonte au
  // parent si l'onglet "Texte" est actif.
  useEffect(() => {
    let cancelled = false;
    renderTypedSignature(typedText).then((url) => {
      if (cancelled) return;
      setTypedDataUrl(url);
      if (mode === "type") onChange(url);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedText]);

  function switchMode(next: SignMode) {
    setMode(next);
    setError(null);
    const value = next === "type" ? typedDataUrl : next === "upload" ? uploadedDataUrl : drawnDataUrl;
    onChange(value);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Seuls les fichiers JPEG et PNG sont acceptés.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("L'image ne doit pas dépasser 2 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setUploadedDataUrl(url);
      if (mode === "upload") onChange(url);
    };
    reader.readAsDataURL(file);
  }

  function handleDrawEnd() {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    const url = sigRef.current.getTrimmedCanvas().toDataURL("image/png");
    setDrawnDataUrl(url);
    if (mode === "draw") onChange(url);
  }

  function clearDraw() {
    sigRef.current?.clear();
    setDrawnDataUrl(null);
    if (mode === "draw") onChange(null);
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md py-2 text-sm font-medium transition ${
      active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button type="button" onClick={() => switchMode("type")} className={tabClass(mode === "type")}>
          Texte
        </button>
        <button type="button" onClick={() => switchMode("upload")} className={tabClass(mode === "upload")}>
          Importer une image
        </button>
        <button type="button" onClick={() => switchMode("draw")} className={tabClass(mode === "draw")}>
          Souris
        </button>
      </div>

      <div className={mode === "type" ? "block" : "hidden"}>
        <input
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          placeholder="Nom à afficher comme signature"
          className="input"
        />
        <div className="mt-3 flex h-24 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
          <p className={`${signatureFont.className} text-3xl text-gray-900`}>{typedText || " "}</p>
        </div>
      </div>

      <div className={mode === "upload" ? "block" : "hidden"}>
        <div className="flex min-h-[96px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-4">
          {uploadedDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedDataUrl} alt="Signature importée" className="max-h-20 max-w-full object-contain" />
          ) : (
            <label className="cursor-pointer text-center text-sm text-gray-500">
              <span className="text-brand-600 hover:underline">Choisir un fichier</span>
              <p className="mt-1 text-xs text-gray-400">JPEG ou PNG, 2 Mo maximum</p>
              <input type="file" accept="image/png,image/jpeg" onChange={handleFileChange} className="hidden" />
            </label>
          )}
        </div>
        {uploadedDataUrl && (
          <button
            type="button"
            onClick={() => {
              setUploadedDataUrl(null);
              if (mode === "upload") onChange(null);
            }}
            className="btn-secondary mt-2 text-sm"
          >
            Effacer
          </button>
        )}
      </div>

      <div className={mode === "draw" ? "block" : "hidden"}>
        <div className="rounded-lg border border-gray-300 bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="black"
            onEnd={handleDrawEnd}
            canvasProps={{ width: 500, height: 130, className: "w-full" }}
          />
        </div>
        <button type="button" onClick={clearDraw} className="btn-secondary mt-2 text-sm">
          Effacer
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
