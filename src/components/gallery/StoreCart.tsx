"use client";

import { useState } from "react";

interface ProductDTO {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
}

export function StoreCart({ galleryId, products }: { galleryId: string; products: ProductDTO[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = products.reduce(
    (sum, p) => sum + (quantities[p.id] || 0) * p.priceCents,
    0
  );

  async function handleCheckout() {
    setError(null);
    const items = products
      .filter((p) => (quantities[p.id] || 0) > 0)
      .map((p) => ({ productId: p.id, quantity: quantities[p.id] }));

    if (items.length === 0) {
      setError("Ajoutez au moins un produit à votre panier.");
      return;
    }
    if (!customer.name || !customer.email) {
      setError("Merci de renseigner votre nom et votre email.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/cart/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryId,
        items,
        customerName: customer.name,
        customerEmail: customer.email,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Erreur lors du paiement.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold">Boutique</h1>
      <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-gray-500">{(p.priceCents / 100).toFixed(2)} €</p>
            </div>
            <input
              type="number"
              min={0}
              className="input w-20"
              value={quantities[p.id] || 0}
              onChange={(e) =>
                setQuantities({ ...quantities, [p.id]: Math.max(0, Number(e.target.value)) })
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <input
          placeholder="Votre nom"
          className="input"
          value={customer.name}
          onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
        />
        <input
          placeholder="Votre email"
          type="email"
          className="input"
          value={customer.email}
          onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-lg font-semibold">Total : {(totalCents / 100).toFixed(2)} €</p>
        <button onClick={handleCheckout} disabled={loading} className="btn-primary">
          {loading ? "Redirection..." : "Payer"}
        </button>
      </div>
    </div>
  );
}
