import { createContext, useContext } from 'react';
import { apiFormulaireConsultation, type ApiFormulaireConsultation } from '../../../../services/api';

/**
 * Le formulaire de consultation sert à deux espaces :
 *   - médecin    : /medecin/consultations/:id          (API /doctor/consultations)
 *   - infirmier  : /infirmier/consultations/medicale/:id (API /infirmier/consultations-medicales)
 */
export type EspaceConsultation = 'medecin' | 'infirmier';

export const EspaceConsultationContexte = createContext<EspaceConsultation>('medecin');

export interface OutilsEspace {
  espace: EspaceConsultation;
  api: ApiFormulaireConsultation;
  /** Racine des pages de consultation de l'espace (sans « / » final) */
  racine: string;
}

export const outilsEspace = (espace: EspaceConsultation): OutilsEspace => ({
  espace,
  api: apiFormulaireConsultation(espace),
  racine: espace === 'infirmier' ? '/infirmier/consultations/medicale' : '/medecin/consultations',
});

export const useEspaceConsultation = () => outilsEspace(useContext(EspaceConsultationContexte));
