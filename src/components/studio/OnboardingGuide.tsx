"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** `target` = valeur de `data-onboarding-target` posée sur le lien correspondant dans
 * DashboardSidebar — sert à retrouver le bouton réel à pointer du doigt pour cette étape. */
const STEPS = [
  { target: "overview", titleKey: "onboarding.step1.title", descKey: "onboarding.step1.desc" },
  { target: "galleries", titleKey: "onboarding.step2.title", descKey: "onboarding.step2.desc" },
  { target: "clients", titleKey: "onboarding.step3.title", descKey: "onboarding.step3.desc" },
  { target: "store", titleKey: "onboarding.step4.title", descKey: "onboarding.step4.desc" },
  { target: "website", titleKey: "onboarding.step5.title", descKey: "onboarding.step5.desc" },
] as const;

function storageKey(studioId: string) {
  return `pixleh_onboarding_seen_${studioId}`;
}

/**
 * Petit guide de bienvenue en 5 étapes, affiché au studio la toute première fois qu'il
 * ouvre le dashboard (jamais revu après, sauf s'il vide son stockage local du navigateur —
 * pas de champ dédié en base pour rester léger, ce n'est qu'une visite guidée, pas une
 * donnée métier). Fermable à tout moment (✕, "Passer", ou clic hors de la bulle) : ne
 * bloque jamais l'accès au reste du panel, comme les autres bandeaux du dashboard (voir
 * EmailVerificationBanner, QuotaAlertBanner).
 *
 * Contrairement à une modale centrée générique, chaque étape repère le VRAI bouton du menu
 * qu'elle décrit (voir data-onboarding-target dans DashboardSidebar), le met en surbrillance
 * (spotlight — tout le reste s'assombrit) et affiche une bulle à côté avec une flèche qui
 * pointe dessus, pour que le studio associe immédiatement l'explication au bon endroit du
 * panel plutôt que de devoir chercher lui-même après coup.
 */
export function OnboardingGuide({ studioId }: { studioId: string }) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey(studioId))) {
        setVisible(true);
      }
    } catch {
      // localStorage indisponible (navigation privée stricte, etc.) : on n'affiche pas le
      // guide plutôt que de risquer de le montrer à chaque page faute de persistance.
    }
  }, [studioId]);

  // Repère la position du bouton ciblé par l'étape courante à chaque changement d'étape, et
  // la garde à jour au redimensionnement — le menu latéral est "sticky" (toujours dans le
  // viewport), donc pas besoin d'écouter le scroll.
  useLayoutEffect(() => {
    if (!visible) return;
    function measure() {
      const el = document.querySelector<HTMLElement>(`[data-onboarding-target="${STEPS[step].target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [visible, step]);

  function close() {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey(studioId), "1");
    } catch {
      // idem — best-effort, l'utilisateur pourra toujours refermer manuellement.
    }
  }

  if (!visible) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  // Bulle positionnée à droite du bouton visé, verticalement centrée dessus (avec une marge
  // de sécurité en haut/bas pour ne jamais sortir de l'écran sur les étapes tout en haut ou
  // tout en bas du menu).
  const tooltipTop = rect
    ? Math.min(Math.max(rect.top + rect.height / 2 - 90, 16), window.innerHeight - 260)
    : 16;
  const tooltipLeft = rect ? rect.right + 20 : 24;
  const arrowTop = rect ? Math.min(Math.max(rect.top + rect.height / 2 - tooltipTop, 20), 220) : 20;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Assombrit tout l'écran SAUF le bouton ciblé : la surbrillance est un simple carré
          transparent dont l'ombre géante (9999px) recouvre visuellement tout le reste — pas
          besoin de masque SVG pour l'effet "spotlight". */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-white transition-all duration-300"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(15, 15, 15, 0.55)",
          }}
        />
      )}

      <div
        className="absolute w-72 rounded-lg bg-white shadow-2xl transition-all duration-300"
        style={{ top: tooltipTop, left: tooltipLeft }}
        onClick={(e) => e.stopPropagation()}
      >
        {rect && (
          <div
            className="absolute -left-2 h-4 w-4 rotate-45 bg-white"
            style={{ top: arrowTop - 8 }}
          />
        )}

        <div className="relative flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
            {t("onboarding.title")}
          </p>
          <button
            onClick={close}
            aria-label={t("common.close")}
            className="flex h-5 w-5 items-center justify-center text-gray-400 hover:text-gray-700"
          >
            <IconX />
          </button>
        </div>

        <div className="relative px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-gray-900">{t(current.titleKey)}</h2>
          <p className="mt-1.5 text-sm text-gray-500">{t(current.descKey)}</p>
        </div>

        <div className="relative flex items-center justify-center gap-1.5 pb-3">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`${i + 1}/${STEPS.length}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-gray-900" : "w-1.5 bg-gray-200 hover:bg-gray-300"
              }`}
            />
          ))}
        </div>

        <div className="relative flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <button onClick={close} className="text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-700">
            {t("onboarding.skip")}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("onboarding.prev")}
              </button>
            )}
            <button
              onClick={() => (isLast ? close() : setStep((s) => s + 1))}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              {isLast ? t("onboarding.finish") : t("onboarding.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
