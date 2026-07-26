import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PayInvoiceButton } from "@/components/site/PayInvoiceButton";

export const dynamic = "force-dynamic";

interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { studio: true, client: true },
  });
  if (!invoice) notFound();

  const lineItems = invoice.lineItems as unknown as LineItem[];

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <p className="text-sm text-gray-500">{invoice.studio.name}</p>
      <h1 className="font-serif text-2xl font-semibold">Facture {invoice.number}</h1>

      <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {lineItems.map((item, i) => (
          <div key={i} className="flex justify-between p-4 text-sm">
            <span>
              {item.description} × {item.quantity}
            </span>
            <span>{((item.unitPriceCents * item.quantity) / 100).toFixed(2)} €</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-right text-lg font-semibold">
        Total : {(invoice.totalCents / 100).toFixed(2)} €
      </p>

      {invoice.status === "PAID" ? (
        <p className="mt-6 rounded-lg bg-green-50 p-4 text-green-700">
          Cette facture a été payée{invoice.paidAt ? ` le ${invoice.paidAt.toLocaleDateString("fr-FR")}` : ""}.
        </p>
      ) : (
        <PayInvoiceButton invoiceId={invoice.id} />
      )}
    </div>
  );
}
