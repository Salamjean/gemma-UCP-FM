import { useEffect, useState } from 'react';
import { FaUserMd } from 'react-icons/fa';
import SelectRecherche from '../../../../components/SelectRecherche/SelectRecherche';
import { api } from '../../../../services/api';
import type { MedecinReference } from '../../../../types';
import s from './FormulaireConsultation.module.css';

/**
 * MÉDECIN > CONSULTATION > ISSUE « RÉFÉRÉ EN INTERNE »
 * Choix obligatoire (liste déroulante avec recherche) du médecin de l'hôpital à qui le patient est adressé.
 */
export default function ChoixMedecinReference({ valeur, onChange }: { valeur: number | null; onChange: (id: number | null) => void }) {
  const [medecins, setMedecins] = useState<MedecinReference[] | null>(null);

  useEffect(() => {
    api.doctor.consultations
      .medecinsReference()
      .then(setMedecins)
      .catch(() => setMedecins([]));
  }, []);

  const nomAffiche = (m: MedecinReference) => (/^dr\.?\s/i.test(m.nom) || m.sageFemme ? m.nom : `Dr ${m.nom}`);

  return (
    <div className={s.hospBloc}>
      <h3 className={s.sousTitre}>
        <FaUserMd aria-hidden="true" /> Médecin à qui vous référez <em className={s.requis}>*</em>
      </h3>
      <SelectRecherche
        id="medecin-reference"
        options={(medecins ?? []).map((m) => ({
          id: m.id,
          name: nomAffiche(m),
          detail: `${m.service} · ${m.enService ? `en service${m.creneau ? ` (${m.creneau})` : ''}` : 'hors créneau'}`,
        }))}
        value={valeur}
        onChange={onChange}
        placeholder={medecins ? (medecins.length ? '-- Choisir le médecin --' : 'Aucun autre médecin actif') : 'Chargement…'}
        placeholderRecherche="Rechercher un médecin ou un service…"
        aucunResultat="Aucun médecin ne correspond"
      />
      <p className={s.note}>Le patient apparaîtra dans ses patients du jour, avec les constantes déjà prises.</p>
    </div>
  );
}
