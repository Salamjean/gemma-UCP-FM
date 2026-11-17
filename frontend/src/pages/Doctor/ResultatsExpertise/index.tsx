import { ResultatExpertiseFiche, ResultatsExpertise } from './ResultatsExpertise';

/** Résultats d'expertise : mêmes pages pour le médecin et l'infirmier·ère (API selon l'espace) */
export const ResultatsExpertiseMedecin = () => <ResultatsExpertise espace="medecin" />;
export const ResultatExpertiseMedecin = () => <ResultatExpertiseFiche espace="medecin" />;
export const ResultatsExpertiseInfirmier = () => <ResultatsExpertise espace="infirmier" />;
export const ResultatExpertiseInfirmier = () => <ResultatExpertiseFiche espace="infirmier" />;
