import { describe, expect, it } from "vitest";
import { registerSchema, gallerySchema, invoiceSchema, planSchema } from "@/lib/validators";

describe("registerSchema (parcours critique : inscription studio)", () => {
  it("accepte des données valides", () => {
    const result = registerSchema.safeParse({
      studioName: "Studio Test",
      name: "Jean Dupont",
      email: "jean@example.com",
      password: "motdepasse123",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un email invalide", () => {
    const result = registerSchema.safeParse({
      studioName: "Studio Test",
      name: "Jean Dupont",
      email: "pas-un-email",
      password: "motdepasse123",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un mot de passe trop court", () => {
    const result = registerSchema.safeParse({
      studioName: "Studio Test",
      name: "Jean Dupont",
      email: "jean@example.com",
      password: "1234567",
    });
    expect(result.success).toBe(false);
  });
});

describe("gallerySchema", () => {
  it("exige au moins une valeur dans defaultVisibility si le champ est fourni (jamais une galerie invisible partout)", () => {
    const result = gallerySchema.safeParse({ title: "Mariage X", defaultVisibility: [] });
    expect(result.success).toBe(false);
  });

  it("accepte une galerie minimale (titre seul)", () => {
    const result = gallerySchema.safeParse({ title: "Mariage X" });
    expect(result.success).toBe(true);
  });
});

describe("invoiceSchema (parcours critique : facturation)", () => {
  it("exige au moins une ligne de facture", () => {
    const result = invoiceSchema.safeParse({ lineItems: [] });
    expect(result.success).toBe(false);
  });

  it("accepte une facture avec des lignes valides", () => {
    const result = invoiceSchema.safeParse({
      guestClientName: "Client sans fiche CRM",
      lineItems: [{ description: "Séance photo", quantity: 1, unitPriceCents: 15000 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejette une quantité négative ou nulle", () => {
    const result = invoiceSchema.safeParse({
      lineItems: [{ description: "Séance photo", quantity: 0, unitPriceCents: 15000 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("planSchema (parcours critique : grille tarifaire admin)", () => {
  it("rejette un slug avec des majuscules ou espaces", () => {
    const result = planSchema.safeParse({
      slug: "Plan Pro",
      name: "Pro",
      priceMonthlyCents: 2900,
      priceAnnualCents: 29000,
    });
    expect(result.success).toBe(false);
  });

  it("accepte un slug valide et un prix à 0 (plan gratuit)", () => {
    const result = planSchema.safeParse({
      slug: "gratuit",
      name: "Gratuit",
      priceMonthlyCents: 0,
      priceAnnualCents: 0,
    });
    expect(result.success).toBe(true);
  });
});
