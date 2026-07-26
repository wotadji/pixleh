import { LegalPageLayout } from "@/components/marketing/LegalPageLayout";

export const metadata = { title: "Conditions Générales d'Utilisation — pixleh" };

export default function CguPage() {
  return (
    <LegalPageLayout title="Conditions Générales d'Utilisation" updatedAt="20 juillet 2026">
      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales d'Utilisation (« CGU ») définissent les règles
        d'accès et d'utilisation du service pixleh, édité par Groupe Lehwu, plateforme permettant à des photographes
        professionnels et à leurs équipes (« Studios ») de créer des galeries clients, une
        boutique en ligne, de gérer réservations, contrats et factures, et de publier un site
        vitrine. Toute création de compte Studio implique l'acceptation pleine et entière des
        présentes CGU.
      </p>

      <h2>2. Définitions</h2>
      <ul>
        <li>
          <strong>« Studio »</strong> : le professionnel (ou son équipe) qui crée un compte sur
          pixleh pour l'usage de son activité photographique.
        </li>
        <li>
          <strong>« Client final »</strong> : le client du Studio, destinataire d'une galerie,
          d'une réservation, d'un contrat ou d'une facture créée via pixleh.
        </li>
        <li>
          <strong>« Contenu »</strong> : toute photo, vidéo, texte ou autre fichier déposé par un
          Studio sur le Service.
        </li>
      </ul>

      <h2>3. Accès au service et compte</h2>
      <p>
        L'accès à l'espace de gestion du Service nécessite la création d'un compte Studio,
        associé à une adresse email et un mot de passe. Le Studio est responsable de la
        confidentialité de ses identifiants et de toute activité réalisée depuis son compte. Le
        Studio s'engage à fournir des informations exactes lors de son inscription et à les tenir
        à jour.
      </p>
      <p>
        L'accès aux galeries par les Clients finaux peut être libre, protégé par mot de passe, ou
        conditionné à la saisie d'une adresse email, selon les réglages choisis par le Studio.
      </p>

      <h2>4. Obligations de l'utilisateur</h2>
      <p>Le Studio s'engage à :</p>
      <ul>
        <li>
          ne déposer sur le Service que des Contenus dont il détient les droits nécessaires
          (droits d'auteur, droit à l'image des personnes photographiées, autorisations
          éventuelles) ;
        </li>
        <li>ne pas utiliser le Service à des fins illicites, frauduleuses ou portant atteinte aux droits de tiers ;</li>
        <li>
          ne pas déposer de Contenu à caractère illégal, notamment tout contenu portant atteinte à
          la dignité humaine, à caractère pédopornographique, diffamatoire, ou faisant l'apologie
          de crimes contre l'humanité ;
        </li>
        <li>
          respecter la réglementation applicable à la collecte de données personnelles de ses
          propres Clients finaux (voir la Politique de confidentialité pour la répartition des
          responsabilités entre pixleh et le Studio).
        </li>
      </ul>

      <h2>5. Licence sur les Contenus</h2>
      <p>
        Le Studio conserve l'intégralité de ses droits de propriété intellectuelle sur les
        Contenus qu'il dépose. Il accorde à pixleh une licence non exclusive, limitée à la
        durée de son abonnement, dans la seule mesure nécessaire à l'hébergement, au stockage, à
        l'affichage et à la transmission technique de ces Contenus dans le cadre du
        fonctionnement du Service (par exemple : génération de miniatures, application d'un
        filigrane si activé par le Studio, mise à disposition en téléchargement aux personnes
        autorisées par le Studio).
      </p>

      <h2>6. Disponibilité et évolution du service</h2>
      <p>
        pixleh met en œuvre les moyens raisonnables pour assurer un accès continu au Service,
        sans garantie de disponibilité absolue. Des interruptions peuvent survenir pour des
        opérations de maintenance, des mises à jour, ou des causes indépendantes de sa volonté.
        pixleh se réserve le droit de faire évoluer les fonctionnalités du Service.
      </p>

      <h2>7. Responsabilité</h2>
      <p>
        pixleh n'est pas éditeur des Contenus déposés par les Studios et n'exerce pas de
        contrôle a priori sur ceux-ci. Conformément à la réglementation applicable à
        l'hébergement de contenus, pixleh retirera promptement tout Contenu manifestement
        illicite qui lui serait signalé.
      </p>
      <p>
        pixleh ne saurait être tenu responsable des pertes de données résultant d'un usage
        non conforme du Service, d'une négligence du Studio (absence de sauvegarde de ses propres
        originaux en dehors du Service, par exemple), ou d'un cas de force majeure.
      </p>

      <h2>8. Suspension et résiliation</h2>
      <p>
        pixleh peut suspendre ou résilier l'accès d'un compte en cas de manquement grave aux
        présentes CGU, après notification par email sauf urgence caractérisée. Le Studio peut à
        tout moment demander la clôture de son compte et la suppression de ses données, selon les
        modalités décrites dans la Politique de confidentialité.
      </p>

      <h2>9. Modification des CGU</h2>
      <p>
        pixleh peut modifier les présentes CGU à tout moment ; toute modification substantielle
        sera notifiée aux Studios par email avant son entrée en vigueur.
      </p>

      <h2>10. Droit applicable</h2>
      <p>
        Les présentes CGU sont soumises au droit français. En cas de litige, les tribunaux
        français compétents seront saisis, après recherche d'une résolution amiable.
      </p>
    </LegalPageLayout>
  );
}
