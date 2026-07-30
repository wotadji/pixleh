"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ClientSettingsForm } from "@/components/client-portal/ClientSettingsForm";

/** Coquille traduite de /client/settings — voir ClientGalleriesView pour la même raison
 * (useLanguage/t() n'est accessible que côté client, la page elle-même reste un Server
 * Component qui ne fait que la requête Prisma). */
export function ClientSettingsPageView({
  email,
  initialName,
  hasPassword,
}: {
  email: string;
  initialName: string | null;
  hasPassword: boolean;
}) {
  const { t } = useLanguage();

  return (
    <div className="px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold">{t("client.settings.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{email}</p>

      <div className="mt-8 max-w-md">
        <ClientSettingsForm initialName={initialName} hasPassword={hasPassword} />
      </div>
    </div>
  );
}
