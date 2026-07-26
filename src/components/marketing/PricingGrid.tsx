"use client";

import { useState } from "react";
import Link from "next/link";

export interface PricingPlanItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  isFree: boolean;
  featured: boolean;
  features: string[];
}

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function PricingGrid({ plans }: { plans: PricingPlanItem[] }) {
  const [annual, setAnnual] = useState(true);

  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm ${!annual ? "font-medium text-gray-900" : "text-gray-500"}`}>Mensuel</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual((v) => !v)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            annual ? "bg-brand-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              annual ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className={`text-sm ${annual ? "font-medium text-gray-900" : "text-gray-500"}`}>
          Annuel <span className="text-brand-600">(économisez)</span>
        </span>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {plans.map((plan) => {
          const cents = plan.isFree ? 0 : annual ? plan.priceAnnualCents : plan.priceMonthlyCents;
          return (
            <div
              key={plan.id}
              className={`card flex flex-col ${
                plan.featured ? "border-2 border-brand-600" : ""
              }`}
            >
              {plan.featured && (
                <span className="mb-3 inline-block w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
                  Recommandé
                </span>
              )}
              <h3 className="font-serif text-lg font-semibold">{plan.name}</h3>
              {plan.description && <p className="mt-1 text-sm text-gray-500">{plan.description}</p>}
              <p className="mt-4">
                <span className="text-3xl font-bold">{formatPrice(cents)}€</span>
                <span className="text-sm text-gray-500">/mois</span>
              </p>
              {!plan.isFree && annual && (
                <p className="text-xs text-gray-400">Facturé annuellement</p>
              )}
              <ul className="mt-6 flex-1 space-y-2 text-sm text-gray-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-brand-600">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/register?plan=${plan.slug}&interval=${annual ? "ANNUAL" : "MONTHLY"}`}
                className={`mt-6 text-center ${plan.featured ? "btn-primary" : "btn-secondary"}`}
              >
                {plan.isFree ? "Démarrer gratuitement" : "Choisir ce plan"}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
