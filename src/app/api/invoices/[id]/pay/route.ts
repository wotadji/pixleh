import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

/** Crée une session Stripe Checkout pour le paiement d'une facture. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { client: true },
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "Cette facture est déjà payée" }, { status: 409 });
  }

  const lineItems = invoice.lineItems as unknown as LineItem[];

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: invoice.client?.email,
      line_items: lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: item.unitPriceCents,
          product_data: { name: item.description },
        },
      })),
      success_url: `${process.env.APP_URL}/i/${invoice.id}?success=1`,
      cancel_url: `${process.env.APP_URL}/i/${invoice.id}?canceled=1`,
      metadata: { invoiceId: invoice.id },
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Paiement indisponible : vérifiez la configuration Stripe." },
      { status: 500 }
    );
  }
}
