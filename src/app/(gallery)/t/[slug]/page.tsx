import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatFileSize } from "@/lib/photoSort";

export const dynamic = "force-dynamic";

/**
 * Page publique de téléchargement d'un Transfert rapide (/t/[slug]) — voir le commentaire du
 * modèle QuickTransfer dans schema.prisma. AUCUNE session requise (comme /g/[slug] ou
 * /invite/[guestSlug], mais sans même de mot de passe/email ici — le slug fait office de
 * secret, décision d'Adriel : "lien de téléchargement partageable comme wetransfert").
 *
 * Page volontairement en français uniquement (pas de LanguageProvider ici) — même choix que
 * /i/[id] (facture publique) : un lien de transfert est partagé par le studio à UNE personne
 * précise, ce n'est pas une expérience de navigation multilingue comme une galerie.
 *
 * $queryRaw plutôt que l'API Prisma typée : modèle trop récent pour le Prisma Client généré
 * du sandbox (voir le commentaire du modèle dans schema.prisma).
 */
export default async function QuickTransferPublicPage({ params }: { params: { slug: string } }) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      title: string | null;
      message: string | null;
      status: string;
      expiresAt: Date;
      studioName: string;
      studioSlug: string;
      studioLogoUrl: string | null;
    }[]
  >`
    SELECT t.id, t.title, t.message, t.status, t."expiresAt",
      s.name AS "studioName", s.slug AS "studioSlug", s."logoUrl" AS "studioLogoUrl"
    FROM "QuickTransfer" t
    JOIN "Studio" s ON s.id = t."studioId"
    WHERE t.slug = ${params.slug}
  `;
  const transfer = rows[0];
  if (!transfer) notFound();

  const frozen = transfer.status === "FROZEN" || transfer.expiresAt < new Date();

  const files = frozen
    ? []
    : await prisma.$queryRaw<{ id: string; filename: string; sizeBytes: number }[]>`
        SELECT id, filename, "sizeBytes" FROM "QuickTransferFile"
        WHERE "transferId" = ${transfer.id} ORDER BY "createdAt" ASC
      `;
  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        {transfer.studioLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={transfer.studioLogoUrl}
            alt={transfer.studioName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
            {transfer.studioName.trim().slice(0, 1).toUpperCase() || "?"}
          </div>
        )}
        <a href={`/s/${transfer.studioSlug}`} className="text-sm font-medium text-gray-700 hover:text-gray-900">
          {transfer.studioName}
        </a>
      </div>

      {frozen ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center">
          <h1 className="font-serif text-xl font-semibold text-gray-900">Ce transfert n&apos;est plus disponible</h1>
          <p className="mt-2 text-sm text-gray-600">
            Le délai de téléchargement (14 jours) est dépassé. Les fichiers ont été conservés par le
            studio — contactez {transfer.studioName} pour les récupérer.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 p-8">
          <h1 className="font-serif text-xl font-semibold text-gray-900">
            {transfer.title || "Fichiers à télécharger"}
          </h1>
          {transfer.message && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{transfer.message}</p>}

          <p className="mt-4 text-xs text-gray-400">
            {files.length} fichier{files.length > 1 ? "s" : ""} · {formatFileSize(totalBytes)}
          </p>

          {files.length > 1 && (
            <a
              href={`/api/t/${params.slug}/download-all`}
              className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-1.5 text-sm"
            >
              Tout télécharger (.zip)
            </a>
          )}

          <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-800">{f.filename}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(f.sizeBytes)}</p>
                </div>
                <a
                  href={`/api/t/${params.slug}/files/${f.id}`}
                  className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                >
                  Télécharger
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-gray-400">
        Propulsé par{" "}
        <a href="https://pixleh.com" className="hover:text-gray-600">
          pixleh
        </a>
      </p>
    </div>
  );
}
