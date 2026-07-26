import { describe, expect, it } from "vitest";
import { slugify, randomSuffix } from "@/lib/slug";

describe("slugify", () => {
  it("met en minuscules et remplace les espaces par des tirets", () => {
    expect(slugify("Studio Photo Paris")).toBe("studio-photo-paris");
  });

  it("retire les accents", () => {
    expect(slugify("Étude Générale")).toBe("etude-generale");
  });

  it("retire les caractères non alphanumériques sans laisser de tiret en trop", () => {
    const result = slugify("Café & Co. — 2026!");
    expect(result).toBe("cafe-co-2026");
    expect(result.startsWith("-")).toBe(false);
    expect(result.endsWith("-")).toBe(false);
    expect(result).not.toMatch(/--/);
  });

  it("utilisé pour générer le slug d'un studio à l'inscription (provisionStudio)", () => {
    expect(slugify("  Le Studio de Jean  ")).toBe("le-studio-de-jean");
  });
});

describe("randomSuffix", () => {
  it("génère une chaîne de la longueur demandée par défaut (6)", () => {
    expect(randomSuffix()).toHaveLength(6);
  });

  it("respecte une longueur personnalisée", () => {
    expect(randomSuffix(10)).toHaveLength(10);
  });

  it("ne génère jamais deux fois exactement la même valeur (probabiliste, mais utile comme garde-fou)", () => {
    const values = new Set(Array.from({ length: 20 }, () => randomSuffix()));
    expect(values.size).toBeGreaterThan(1);
  });
});
