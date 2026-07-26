"use client";

import { useEffect, useState } from "react";
import { PageSpinner } from "@/components/ui/Spinner";

interface FeatureDTO {
  id: string;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
}

export default function AdminFeaturesPage() {
  const [features, setFeatures] = useState<FeatureDTO[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/features");
    if (res.ok) {
      const data = await res.json();
      setFeatures(data.features);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(feature: FeatureDTO) {
    setPending(feature.key);
    setError(null);
    // Optimiste : on bascule tout de suite dans l'UI, on annule si l'appel échoue.
    setFeatures((prev) =>
      prev ? prev.map((f) => (f.key === feature.key ? { ...f, enabled: !f.enabled } : f)) : prev
    );
    const res = await fetch(`/api/admin/features/${feature.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !feature.enabled }),
    });
    if (!res.ok) {
      setFeatures((prev) =>
        prev ? prev.map((f) => (f.key === feature.key ? { ...f, enabled: feature.enabled } : f)) : prev
      );
      setError("Impossible de mettre à jour cette fonctionnalité.");
    }
    setPending(null);
  }

  if (!features) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Fonctionnalités</h1>
      <p className="mt-1 text-sm text-gray-500">
        Interrupteur global, indépendant des plans : une fonctionnalité désactivée ici reste
        invisible partout (page tarifs, quotas appliqués) même si elle est cochée sur un plan.
        Bascule-la une fois développée — pas besoin de repasser sur chaque plan.
      </p>

      {features.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          Aucune fonctionnalité en base — lance <code>npm run prisma:seed-features</code>.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 space-y-2">
        {features.map((feature) => (
          <div key={feature.key} className="card flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{feature.label}</p>
              {feature.description && (
                <p className="mt-1 text-sm text-gray-500">{feature.description}</p>
              )}
            </div>
            <button
              type="button"
              disabled={pending === feature.key}
              onClick={() => toggle(feature)}
              aria-pressed={feature.enabled}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                feature.enabled ? "bg-brand-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  feature.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
