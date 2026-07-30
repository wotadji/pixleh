import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Téléchargement du PDF final d'un contrat signé — généré et stocké lors de la signature
 * (voir /api/contracts/[id]/sign, qui écrit `pdfKey`). Accessible sans authentification,
 * comme la page de signature publique /c/[id] : dans ce produit, l'identifiant du contrat
 * (cuid non devinable) fait déjà office de jeton d'accès pour ce lien (même logique que les
 * liens de partage de galerie) — utilisé aussi bien par le studio (bouton "Télécharger" sur
 * /dashboard/contracts) que par le client (bouton sur /c/[id] une fois signé). Renvoie 404
 * tant que le contrat n'est pas signé, puisque `pdfKey` n'existe qu'à partir de ce moment.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!contract || !contract.pdfKey) {
    return NextResponse.json({ error: "Contrat introuvable ou pas encore signé" }, { status: 404 });
  }

  try {
    const buffer = await getStorage().get(contract.pdfKey);
    const filename = `${contract.title.replace(/[^\w\-]+/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
  }
}
