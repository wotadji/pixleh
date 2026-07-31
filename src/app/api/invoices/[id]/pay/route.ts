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

  // vatRate n'existe pas encore dans le Prisma Client généré du sandbox (voir schema.prisma)
  // — lu à part via $queryRaw. Sans cette ligne, le Stripe Checkout ne facturait que la somme
  // des lineItems (HT) même quand une TVA était appliquée à la facture (bug remonté par
  // Adriel, 31/07/2026) : le client payait moins que le total TTC réellement dû, alors que le
  // webhook marque quand même la facture comme intégralement réglée (amountPaidCents =
  // totalCents). On ajoute donc une ligne Stripe distincte pour le montant de TVA, calculé
  // exactement comme dans renderInvoicePdf (totalCents - sous-total des lineItems), pour que
  // le montant réellement collecté corresponde toujours au TTC facturé.
  const [row] = await prisma.$queryRaw<{ vatRate: number | null }[]>`
    SELECT "vatRate" FROM "Invoice" WHERE id = ${invoice.id}
  `;
  const vatRate = row?.vatRate ?? null;
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const vatAmountCents = invoice.totalCents - subtotalCents;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: invoice.client?.email,
      line_items: [
        ...lineItems.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: invoice.currency.toLowerCase(),
            unit_amount: item.unitPriceCents,
            product_data: { name: item.description },
          },
        })),
        ...(vatRate != null && vatAmountCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: invoice.currency.toLowerCase(),
                  unit_amount: vatAmountCents,
                  product_data: { name: `TVA (${vatRate}%)` },
                },
              },
            ]
          : []),
      ],
      success_url: `${process.env.APP_URL}/i/${invoice.id}?success=1&session_id={CHECKOUT_SESSION_ID}`,
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
