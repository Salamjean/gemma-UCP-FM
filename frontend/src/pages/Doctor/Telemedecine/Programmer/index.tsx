import ProgrammerTelemedecine from './ProgrammerTelemedecine';

/** Programmer une télémédecine : même page pour le médecin et l'infirmier·ère */
export const ProgrammerTelemedecineMedecin = () => <ProgrammerTelemedecine espace="medecin" />;
export const ProgrammerTelemedecineInfirmier = () => <ProgrammerTelemedecine espace="infirmier" />;
