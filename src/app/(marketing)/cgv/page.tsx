import { LegalPageLayout } from "@/components/marketing/LegalPageLayout";

export const metadata = { title: "Conditions Générales de Vente — pixleh" };

export default function CgvPage() {
  return (
    <LegalPageLayout title="Conditions Générales de Vente" updatedAt="20 juillet 2026">
      <p>
        <em>
          Document à finaliser une fois la grille tarifaire de pixleh arrêtée (voir Sprint 2
          de la feuille de route produit) — la structure ci-dessous est prête à être complétée.
        </em>
      </p>

      <h2>1. Objet et champ d'application</h2>
      <p>
        Les présentes Conditions Générales de Vente (« CGV ») s'appliquent à tout abonnement au
        service pixleh souscrit par un Studio, tel que défini dans les Conditions Générales
        d'Utilisation. Le Service est destiné à des professionnels agissant dans le cadre de leur
        activité ; sauf mention contraire, les dispositions spécifiques aux consommateurs (droit
        de rétractation notamment) ne s'appliquent pas.
      </p>

      <h2>2. Offres et tarifs</h2>
      <p>
        Les formules d'abonnement, leurs fonctionnalités et leurs tarifs en vigueur sont présentés
        sur la page [lien vers la page tarifs à ajouter une fois publiée]. Les tarifs sont
        indiqués en euros, [TTC/HT à préciser selon le régime de TVA applicable]. pixleh se
        réserve le droit de modifier ses tarifs, les Studios déjà abonnés étant informés avec un
        préavis d'au moins [30 jours à confirmer] avant application.
      </p>

      <h2>3. Souscription et paiement</h2>
      <p>
        La souscription à un abonnement payant s'effectue en ligne, par carte bancaire ou tout
        autre moyen proposé, via notre prestataire de paiement Stripe. Le paiement est prélevé
        selon la périodicité choisie (mensuelle ou annuelle) et reconduit automatiquement à
        chaque échéance, sauf résiliation par le Studio avant la date de renouvellement.
      </p>

      <h2>4. Durée, renouvellement et résiliation</h2>
      <p>
        L'abonnement est souscrit pour la durée choisie lors de la commande et se renouvelle
        automatiquement par tacite reconduction pour une durée identique, sauf résiliation par le
        Studio depuis son espace de facturation, à tout moment, prenant effet à la fin de la
        période en cours (pas de remboursement au prorata sauf disposition contraire indiquée sur
        l'offre souscrite).
      </p>

      <h2>5. Facturation</h2>
      <p>
        Une facture est émise à chaque prélèvement et mise à disposition du Studio dans son espace
        de facturation. Les factures comportent les mentions légales obligatoires, notamment
        [SIRET/numéro de TVA de l'éditeur à compléter].
      </p>

      <h2>6. Absence de droit de rétractation (clients professionnels)</h2>
      <p>
        Conformément à l'article L. 221-3 du Code de la consommation, le droit de rétractation ne
        s'applique pas aux contrats conclus entre professionnels dans le cadre de leur activité.
        Le cas échéant pour un Studio agissant en dehors de son champ d'activité principal, les
        dispositions légales applicables aux consommateurs seront respectées.
      </p>

      <h2>7. Responsabilité et garanties</h2>
      <p>
        pixleh s'engage à fournir le Service avec diligence, sans garantie de résultat
        commercial pour le Studio. La responsabilité de pixleh, si elle était retenue, est
        limitée aux sommes effectivement versées par le Studio au titre des [douze / [X] à
        préciser] derniers mois.
      </p>

      <h2>8. Droit applicable et litiges</h2>
      <p>
        Les présentes CGV sont soumises au droit français. Tout litige sera soumis, à défaut de
        résolution amiable, aux tribunaux compétents du ressort du siège social de l'éditeur.
      </p>
    </LegalPageLayout>
  );
}
