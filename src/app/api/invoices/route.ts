import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { invoiceSchema } from "@/lib/validators";

export async function GET() {
  try {
    const session = await requireStudioSession();
    const invoices = await prisma.invoice.findMany({
      where: { studioId: session.user.studioId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ invoices });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    const parsed = invoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const year = new Date().getFullYear();
    const countThisYear = await prisma.invoice.count({
      where: { studioId: session.user.studioId, number: { startsWith: `FAC-${year}-` } },
    });
    const number = `FAC-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

    const totalCents = data.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0
    );

    const invoice = await prisma.invoice.create({
      data: {
        studioId: session.user.studioId,
        clientId: data.clientId || null,
        number,
        status: "SENT",
        lineItems: data.lineItems,
        totalCents,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
