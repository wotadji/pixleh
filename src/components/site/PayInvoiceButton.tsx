"use client";

import { useState } from "react";

export function PayInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}/pay`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Erreur lors du paiement.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="mt-6">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <button onClick={handlePay} disabled={loading} className="btn-primary w-full">
        {loading ? "Redirection..." : "Payer la facture"}
      </button>
    </div>
  );
}
