import { Dancing_Script } from "next/font/google";

/**
 * Police "manuscrite" utilisée pour la signature tapée au clavier (onglet "Texte" de
 * SignatureField, voir contracts/new) : sert à la fois pour l'aperçu CSS live et pour le
 * rendu de l'image finale sur un <canvas> (ctx.font utilise `signatureFont.style.fontFamily`).
 */
export const signatureFont = Dancing_Script({ subsets: ["latin"], weight: ["700"] });
