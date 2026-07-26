"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

export function SignaturePad({ contractId }: { contractId: string }) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSign() {
    setError(null);
    if (!name.trim()) {
      setError("Merci d'indiquer votre nom.");
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("Merci de signer dans le cadre ci-dessus.");
      return;
    }
    setLoading(true);
    const signatureDataUrl = sigRef.current.getTrimmedCanvas().toDataURL("image/png");
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

  return (
    <div className="mt-8">
      <input
        placeholder="Votre nom complet"
        className="input mb-3"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
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
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
