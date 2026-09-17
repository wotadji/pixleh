"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Mode sombre du panel studio (18/09/2026, demande d'Adriel : "je veux [...] le boutton de
 * l'apparence" dans la nouvelle barre du haut fixe — précisé ensuite : c'est bien un vrai
 * mode sombre pour TOUT le panel photographe, pas le bouton clair/sombre déjà existant à côté
 * du statut dans GalleryManager, qui lui ne change que le fond du site public d'UNE galerie).
 *
 * Contexte volontairement minimal (juste `theme` + `toggle`) : pose/retire la classe "dark" sur
 * <html> (voir tailwind.config.ts `darkMode: "class"`), et persiste le choix en localStorage
 * pour survivre à la navigation et aux rechargements — contrairement au choix de repli manuel
 * de la sidebar (voir DashboardShell), l'apparence est une vraie préférence globale de
 * l'utilisateur, pas un état ponctuel par page : ça justifie la persistance ici.
 *
 * Cette première version applique le thème à l'ossature du panel (sidebar, barre du haut,
 * fond de page) — les écrans individuels (cartes, tableaux...) restent à adapter au fil de
 * l'eau avec des classes `dark:` au fur et à mesure, comme le reste du produit.
 */
type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});

const STORAGE_KEY = "pixleh:theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Lu après le montage (comme les autres préférences localStorage de ce panel) pour éviter un
  // mismatch d'hydratation SSR (localStorage est indisponible côté serveur).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") setTheme("dark");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
