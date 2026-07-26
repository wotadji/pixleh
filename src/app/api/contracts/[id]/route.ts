import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Consultation publique d'un contrat (page de signature côté client). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { studio: true, client: true },
  });
  if (!contract) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 });
  return NextResponse.json({ contract });
}
