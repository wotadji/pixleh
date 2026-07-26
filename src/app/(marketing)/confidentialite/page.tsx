import { LegalPageLayout } from "@/components/marketing/LegalPageLayout";

export const metadata = { title: "Politique de confidentialité — pixleh" };

export default function ConfidentialitePage() {
  return (
    <LegalPageLayout title="Politique de confidentialité" updatedAt="20 juillet 2026">
      <h2>1. Responsable de traitement</h2>
      <p>
        pixleh, édité par Groupe Lehwu, [adresse à compléter], est responsable du
        traitement des données personnelles décrites ci-dessous, pour ce qui concerne la
        fourniture du Service lui-même (comptes Studio, facturation de l'abonnement).
      </p>
      <p>
        Pour les données personnelles des Clients finaux qu'un Studio collecte et traite via
        pixleh (par exemple : nom, email, favoris, remarques sur une galerie), le <strong>
        Studio est responsable de traitement</strong> et pixleh agit en tant que sous-traitant
        au sens du RGPD, dans le cadre défini par les Conditions Générales d'Utilisation. Toute
        question relative aux données d'un Client final doit d'abord être adressée au Studio
        concerné.
      </p>

      <h2>2. Données collectées</h2>
      <ul>
        <li>
          <strong>Compte Studio</strong> : nom, adresse email, mot de passe (stocké de façon
          chiffrée, jamais en clair), nom du studio, logo, coordonnées de contact éventuellement
          renseignées.
        </li>
        <li>
          <strong>Facturation</strong> : informations de paiement traitées directement par notre
          prestataire Stripe (pixleh ne stocke pas les numéros de carte bancaire).
        </li>
        <li>
          <strong>Clients finaux d'un Studio</strong> : email (accès aux galeries protégées ou
          liens invités), favoris, remarques laissées sur des photos, contenu des commandes,
          réservations ou contrats initiés via le Service.
        </li>
        <li>
          <strong>Contenus</strong> : photos et vidéos déposées par les Studios, susceptibles de
          contenir des données personnelles (visages) de tiers photographiés.
        </li>
        <li>
          <strong>Données techniques</strong> : adresse IP et journaux de connexion, à des fins de
          sécurité (voir la limitation du nombre de tentatives de connexion) et de bon
          fonctionnement du Service.
        </li>
      </ul>

      <h2>3. Finalités et bases légales</h2>
      <ul>
        <li>Fourniture et fonctionnement du Service — exécution du contrat (CGU/CGV).</li>
        <li>Facturation des abonnements — exécution du contrat et obligations comptables légales.</li>
        <li>
          Sécurité du Service (limitation des tentatives de connexion, journaux techniques) —
          intérêt légitime.
        </li>
        <li>
          Communication relative au compte (email de bienvenue, notifications liées à l'activité
          du Studio) — exécution du contrat.
        </li>
        <li>Réponse aux demandes de contact — intérêt légitime / consentement.</li>
      </ul>

      <h2>4. Destinataires des données</h2>
      <p>
        Les données sont accessibles à l'équipe pixleh dans la limite de ce qui est
        nécessaire à l'exploitation du Service, ainsi qu'aux sous-traitants suivants :
      </p>
      <ul>
        <li>Hébergeur de l'application et du stockage des fichiers ([nom à compléter]) ;</li>
        <li>Stripe (traitement des paiements) ;</li>
        <li>Prestataire d'envoi d'emails transactionnels ([nom à compléter]) ;</li>
        <li>
          le cas échéant, un outil de suivi des erreurs techniques (voir la feuille de route
          produit) — mis à jour ici dès son activation.
        </li>
      </ul>
      <p>
        Ces prestataires peuvent être situés hors de l'Union européenne (notamment Stripe, société
        américaine) ; dans ce cas, le transfert repose sur les garanties appropriées prévues par
        le RGPD (clauses contractuelles types ou équivalent).
      </p>

      <h2>5. Durée de conservation</h2>
      <p>
        Les données d'un compte Studio sont conservées pendant toute la durée d'utilisation du
        Service, puis supprimées ou anonymisées dans un délai raisonnable après la clôture du
        compte, sous réserve des durées de conservation légales applicables (obligations
        comptables et fiscales notamment). Les données des Clients finaux sont conservées selon
        les instructions du Studio responsable de traitement.
      </p>

      <h2>6. Vos droits</h2>
      <p>
        Conformément au RGPD, toute personne concernée dispose d'un droit d'accès, de
        rectification, d'effacement, de limitation, d'opposition et de portabilité de ses données.
      </p>
      <ul>
        <li>
          Pour un compte Studio : ces droits s'exercent directement depuis l'espace Réglages du
          compte, ou par email à [email de contact à compléter].
        </li>
        <li>
          Pour un Client final d'un Studio : la demande doit être adressée en priorité au Studio
          concerné, responsable de traitement de ces données ; pixleh l'assiste dans le
          traitement de cette demande en tant que sous-traitant.
        </li>
      </ul>
      <p>
        Vous disposez également du droit d'introduire une réclamation auprès de la CNIL
        (www.cnil.fr).
      </p>

      <h2>7. Sécurité</h2>
      <p>
        pixleh met en œuvre des mesures techniques et organisationnelles raisonnables pour
        protéger les données contre l'accès non autorisé, la perte ou l'altération : mots de
        passe chiffrés, isolation stricte des données entre Studios, connexions chiffrées (HTTPS),
        limitation des tentatives de connexion.
      </p>

      <h2>8. Cookies</h2>
      <p>
        pixleh utilise des cookies strictement nécessaires au fonctionnement du Service
        (maintien de la session de connexion Studio, accès à une galerie protégée par mot de
        passe). Ces cookies ne nécessitent pas de consentement au sens de la réglementation
        applicable. Tout cookie non essentiel qui viendrait à être ajouté (mesure d'audience,
        par exemple) sera soumis à votre consentement via le bandeau prévu à cet effet.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question relative à cette politique ou à l'exercice de vos droits :
        [email de contact à compléter].
      </p>
    </LegalPageLayout>
  );
}
