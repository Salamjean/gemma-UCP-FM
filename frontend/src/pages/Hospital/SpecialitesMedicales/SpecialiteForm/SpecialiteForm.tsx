import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { FaCheck, FaPlus } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte } from '../../../../services/alertes';
import c from '../../../../styles/espace.module.css';
import type { SpecialiteSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './SpecialiteForm.module.css';

/** Spécialités courantes proposées en un clic (celles déjà enregistrées sont masquées) */
const SUGGESTIONS = [
  'Médecin généraliste',
  'Pédiatre',
  'Gynécologue',
  'Chirurgien',
  'Cardiologue',
  'Dermatologue',
  'Ophtalmologue',
  'ORL',
  'Neurologue',
  'Psychiatre',
  'Radiologue',
  'Anesthésiste',
  'Dentiste',
  'Urologue',
  'Rhumatologue',
  'Gastro-entérologue',
];

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

interface Props {
  initial?: SpecialiteSaisie;
  /** Noms déjà utilisés dans l'hôpital (pour masquer les suggestions et prévenir les doublons) */
  existantes: string[];
  boutonTexte: string;
  envoi: boolean;
  onEnregistrer: (data: SpecialiteSaisie) => void;
}

/**
 * HÔPITAL > SPÉCIALITÉS MÉDICALES — formulaire partagé (Ajouter / Modifier).
 * Règle Laravel (TypeDoctorRequest) : le nom est obligatoire.
 */
export default function SpecialiteForm({ initial, existantes, boutonTexte, envoi, onEnregistrer }: Props) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [verifier, setVerifier] = useState(false);

  const prises = new Set(existantes.map(sansAccent));
  const doublon = label.trim() !== '' && sansAccent(label) !== sansAccent(initial?.label ?? '') && prises.has(sansAccent(label));
  const suggestions = SUGGESTIONS.filter((s) => !prises.has(sansAccent(s)) && sansAccent(s) !== sansAccent(label));

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifier(true);
    if (!label.trim()) return void alerte.echec('Le nom de la spécialité est obligatoire.');
    if (doublon) return void alerte.echec(`La spécialité « ${label.trim()} » existe déjà.`);
    onEnregistrer({ label: label.trim(), description: description.trim() || undefined });
  };

  return (
    <form className={`${c.bloc} ${styles.formulaire}`} onSubmit={soumettre} noValidate>
      <h2 className={c.blocTitre}>Informations sur la spécialité</h2>

      <div className={styles.ligne}>
        <div className={`${styles.champ} ${(verifier && !label.trim()) || doublon ? styles.invalide : ''}`}>
          <label htmlFor="label">Nom de la spécialité <span className={styles.requis}>*</span></label>
          <input id="label" maxLength={191} placeholder="Ex. Cardiologue" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
          <AnimatePresence>
            {doublon && (
              <motion.span className={styles.erreur} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                Cette spécialité existe déjà dans votre hôpital.
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className={styles.champ}>
          <label htmlFor="description">Description <span className={styles.facultatif}>(facultatif)</span></label>
          <input id="description" maxLength={2000} placeholder="Ex. Maladies du cœur et des vaisseaux" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          <p>Spécialités courantes :</p>
          <div>
            {suggestions.map((s) => (
              <motion.button key={s} type="button" className={styles.suggestion} onClick={() => setLabel(s)} whileTap={{ scale: 0.95 }}>
                <FaPlus aria-hidden="true" /> {s}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <footer className={styles.pied}>
        <Link to={`${baseHopital()}/specialites/liste`} className={c.secondaire}>Annuler</Link>
        <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
          <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : boutonTexte}
        </motion.button>
      </footer>
    </form>
  );
}
