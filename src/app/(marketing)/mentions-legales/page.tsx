import { LegalPageLayout } from "@/components/marketing/LegalPageLayout";

export const metadata = { title: "Mentions légales — pixleh" };

export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout title="Mentions légales" updatedAt="20 juillet 2026">
      <h2>Éditeur du site</h2>
      <p>
        Le site et le service pixleh (ci-après « pixleh » ou « le Service ») sont édités par
        Groupe Lehwu :
      </p>
      <ul>
        <li>Groupe Lehwu</li>
        <li>[Forme juridique — ex. auto-entreprise, SAS, SARL — à compléter]</li>
        <li>[Adresse du siège social à compléter]</li>
        <li>[Numéro SIRET à compléter]</li>
        <li>[Numéro de TVA intracommunautaire, le cas échéant, à compléter]</li>
        <li>Email de contact : [email de contact à compléter]</li>
      </ul>
      <p>Directeur de la publication : [nom du responsable à compléter].</p>

      <h2>Hébergement</h2>
      <p>
        Le Service est hébergé par : [nom et adresse de l'hébergeur à compléter — hébergeur web
        pour l'application, et hébergeur du stockage des fichiers (SFTP ou équivalent) si
        distinct].
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La structure générale du site pixleh, ainsi que les textes, graphismes, images, sons
        et vidéos qui le composent, sont la propriété de l'éditeur ou de ses partenaires, sauf
        mention contraire. Toute reproduction, représentation, modification ou adaptation, totale
        ou partielle, sans autorisation préalable, est interdite.
      </p>
      <p>
        Les photographies, vidéos et autres contenus déposés par les studios utilisateurs du
        Service (« Studios ») dans leurs galeries restent la propriété exclusive de ces Studios ou
        de leurs clients, selon les termes convenus entre eux. pixleh n'acquiert aucun droit
        de propriété sur ces contenus — voir les Conditions Générales d'Utilisation pour le détail
        de la licence d'hébergement accordée à pixleh afin de pouvoir techniquement stocker et
        afficher ces contenus.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le traitement des données personnelles réalisé via pixleh est décrit dans la{" "}
        <a href="/confidentialite" className="underline">
          Politique de confidentialité
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative au Service ou au présent document, vous pouvez nous
        contacter à l'adresse suivante : [email de contact à compléter].
      </p>
    </LegalPageLayout>
  );
}
