import { useParams } from 'react-router-dom';
import { apiResultatsExpertise } from '../../../services/api';
import DocumentConsultation from '../Documents/DocumentConsultation';
import { ResultatExpertiseFiche, ResultatsExpertise } from './ResultatsExpertise';

/** Ordonnance / examens / arrêt de travail de l'expert, imprimables par le demandeur de la télé-expertise */
function DocumentExpertise({ espace }: { espace: 'medecin' | 'infirmier' }) {
  const { origineId } = useParams();
  const racine = espace === 'infirmier' ? '/infirmier/resultats-expertise' : '/medecin/resultats-expertise';
  return (
    <DocumentConsultation
      surtitre="Prescriptions de l’expert"
      charger={apiResultatsExpertise(espace).documentsExpert}
      lien={(type) => `${racine}/${origineId}/document/${type}`}
    />
  );
}

/** Résultats d'expertise : mêmes pages pour le médecin et l'infirmier·ère (API selon l'espace) */
export const ResultatsExpertiseMedecin = () => <ResultatsExpertise espace="medecin" />;
export const ResultatExpertiseMedecin = () => <ResultatExpertiseFiche espace="medecin" />;
export const ResultatsExpertiseInfirmier = () => <ResultatsExpertise espace="infirmier" />;
export const ResultatExpertiseInfirmier = () => <ResultatExpertiseFiche espace="infirmier" />;
export const DocumentExpertiseMedecin = () => <DocumentExpertise espace="medecin" />;
export const DocumentExpertiseInfirmier = () => <DocumentExpertise espace="infirmier" />;
