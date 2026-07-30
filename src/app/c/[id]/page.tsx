import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { SignaturePad } from "@/components/site/SignaturePad";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  SENT: "bg-amber-50 text-amber-700",
  SIGNED: "bg-green-50 text-green-700",
  DECLINED: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "En attente de signature",
  SIGNED: "Signé",
  DECLINED: "Refusé",
};

export default async function ContractSignPage({ params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { studio: true },
  });
  if (!contract) notFound();

  // studioSignatureDataUrl et place n'existent pas encore dans le Prisma Client généré du
  // sandbox (voir commentaires sur ces champs dans schema.prisma) — lus à part via
  // $queryRaw, même workaround que Gallery.publishedAt.
  const [row] = await prisma.$queryRaw<{ studioSignatureDataUrl: string | null; place: string | null }[]>`
    SELECT "studioSignatureDataUrl", "place" FROM "Contract" WHERE id = ${contract.id}
  `;
  const studioSignatureDataUrl = row?.studioSignatureDataUrl || null;
  const place = row?.place || null;

  // La date de création est un point essentiel du contrat (formule d'usage "Fait à ..., le
  // ...", demandé par Adriel) — au même titre que la date de signature du client, affichée
  // plus bas une fois le contrat signé.
  const madeAtLine = `Fait ${place ? `à ${place}, ` : ""}le ${contract.createdAt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <Link href="/">
            <PixlehLogo size={22} />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">{contract.studio.name}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[contract.status]}`}>
              {STATUS_LABELS[contract.status]}
            </span>
          </div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-gray-900">{contract.title}</h1>
          <p className="mt-2 text-xs text-gray-400">{madeAtLine}</p>

          {/* Contenu saisi par le photographe lui-même via l'éditeur enrichi du panel studio
              (contracts/new), pas une entrée utilisateur tierce — même logique que le rendu
              "À propos" du studio (voir s/[studioSlug]/about/page.tsx). */}
          <div
            className="mt-6 rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-gray-200 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: contract.bodyHtml }}
          />

          {studioSignatureDataUrl && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-400">Signature de {contract.studio.name}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={studioSignatureDataUrl} alt={`Signature de ${contract.studio.name}`} className="mt-1 h-16" />
            </div>
          )}

          {contract.status === "SIGNED" ? (
            <div className="mt-6 rounded-xl border border-green-100 bg-green-50 p-5">
              <p className="text-sm font-medium text-green-800">Contrat signé</p>
              <p className="mt-1 text-sm text-green-700">
                Par <strong>{contract.signedByName}</strong> le{" "}
                {contract.signedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
              </p>
              {contract.signatureDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contract.signatureDataUrl} alt={`Signature de ${contract.signedByName}`} className="mt-3 h-16" />
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-900">Votre signature</p>
              <SignaturePad contractId={contract.id} />
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-100 bg-white px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center justify-between gap-3 text-xs text-gray-400 sm:flex-row">
          <p>© {new Date().getFullYear()} pixleh — Groupe Lehwu</p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            <Link href="/mentions-legales" target="_blank" className="hover:text-gray-600 hover:underline">
              Mentions légales
            </Link>
            <Link href="/cgu" target="_blank" className="hover:text-gray-600 hover:underline">
              CGU
            </Link>
            <Link href="/cgv" target="_blank" className="hover:text-gray-600 hover:underline">
              CGV
            </Link>
            <Link href="/confidentialite" target="_blank" className="hover:text-gray-600 hover:underline">
              Confidentialité
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
