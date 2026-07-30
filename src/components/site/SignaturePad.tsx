"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useSignatureCanvasResize } from "@/lib/useSignatureCanvasResize";

type SignMode = "draw" | "upload";

// Types acceptés pour l'import d'une signature en image — mêmes formats que le reste de
// l'app (logo studio, couvertures) : JPEG et PNG uniquement (PNG recommandé pour garder un
// fond transparent dans le PDF final).
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 Mo, largement suffisant pour une signature

export function SignaturePad({ contractId }: { contractId: string }) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [mode, setMode] = useState<SignMode>("draw");
  const [name, setName] = useState("");
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Le bloc "draw" est démonté/remonté à chaque changement d'onglet (voir le ternaire plus
  // bas) : le canvas est donc toujours visible dès son montage, `active` peut rester true.
  useSignatureCanvasResize(sigRef, mode === "draw");

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
    reader.onload = () => setUploadedDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function switchMode(next: SignMode) {
    setMode(next);
    setError(null);
  }

  async function handleSign() {
    setError(null);
    if (!name.trim()) {
      setError("Merci d'indiquer votre nom.");
      return;
    }
    const signatureDataUrl =
      mode === "draw" ? sigRef.current?.getTrimmedCanvas().toDataURL("image/png") : uploadedDataUrl;
    if (mode === "draw" && (!sigRef.current || sigRef.current.isEmpty())) {
      setError("Merci de signer dans le cadre ci-dessus.");
      return;
    }
    if (mode === "upload" && !uploadedDataUrl) {
      setError("Merci d'importer une image de votre signature.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/contracts/${contractId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedByName: name, signatureDataUrl }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Erreur lors de la signature.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="mt-6 rounded-lg bg-green-50 p-4 text-green-700">
        Contrat signé avec succès. Une copie vous sera envoyée par email.
      </p>
    );
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md py-2 text-sm font-medium transition ${
      active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="mt-8">
      <input
        placeholder="Votre nom complet"
        className="input mb-3"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button type="button" onClick={() => switchMode("draw")} className={tabClass(mode === "draw")}>
          Dessiner ma signature
        </button>
        <button type="button" onClick={() => switchMode("upload")} className={tabClass(mode === "upload")}>
          Importer une image
        </button>
      </div>

      {mode === "draw" ? (
        <>
          <div className="rounded-lg border border-gray-300 bg-white">
            <SignatureCanvas
              ref={sigRef}
              penColor="black"
              canvasProps={{ width: 500, height: 180, className: "w-full" }}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => sigRef.current?.clear()} className="btn-secondary text-sm">
              Effacer
            </button>
            <button onClick={handleSign} disabled={loading} className="btn-primary text-sm">
              {loading ? "Signature..." : "Signer le contrat"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-4">
            {uploadedDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadedDataUrl} alt="Signature importée" className="max-h-40 max-w-full object-contain" />
            ) : (
              <label className="cursor-pointer text-center text-sm text-gray-500">
                <span className="text-brand-600 hover:underline">Choisir un fichier</span>
                <p className="mt-1 text-xs text-gray-400">JPEG ou PNG, 2 Mo maximum</p>
                <input type="file" accept="image/png,image/jpeg" onChange={handleFileChange} className="hidden" />
              </label>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setUploadedDataUrl(null)}
              disabled={!uploadedDataUrl}
              className="btn-secondary text-sm disabled:pointer-events-none disabled:opacity-40"
            >
              Effacer
            </button>
            <button onClick={handleSign} disabled={loading} className="btn-primary text-sm">
              {loading ? "Signature..." : "Signer le contrat"}
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
