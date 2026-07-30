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
      {/* Contenu saisi par le photographe lui-même via l'éditeur enrichi du panel studio
          (contracts/new), pas une entrée utilisateur tierce — même logique que le rendu
          "À propos" du studio (voir s/[studioSlug]/about/page.tsx). */}
      <div
        className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm leading-relaxed text-gray-700 [&_a]:text-blue-600 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: contract.bodyHtml }}
      />

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
