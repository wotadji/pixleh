import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SignaturePad } from "@/components/site/SignaturePad";

export const dynamic = "force-dynamic";

export default async function ContractSignPage({ params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { studio: true },
  });
  if (!contract) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-gray-500">{contract.studio.name}</p>
      <h1 className="font-serif text-2xl font-semibold">{contract.title}</h1>
      <div className="mt-6 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm leading-relaxed">
        {contract.bodyHtml}
      </div>

      {contract.status === "SIGNED" ? (
        <p className="mt-6 rounded-lg bg-green-50 p-4 text-green-700">
          Ce contrat a été signé par {contract.signedByName} le{" "}
          {contract.signedAt?.toLocaleString("fr-FR")}.
        </p>
      ) : (
        <SignaturePad contractId={contract.id} />
      )}
    </div>
  );
}
