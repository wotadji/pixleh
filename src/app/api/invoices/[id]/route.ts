import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Consultation publique d'une facture (page de paiement côté client). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { studio: true, client: true },
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  return NextResponse.json({ invoice });
}
