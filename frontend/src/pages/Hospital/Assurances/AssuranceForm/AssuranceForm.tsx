import { motion } from 'framer-motion';
import { useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte } from '../../../../services/alertes';
import { fcfa } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { AssuranceSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './AssuranceForm.module.css';

const DESCRIPTION_MAX = 191; // type_assurances.description est un varchar(191)
const TAUX_RAPIDES = [10, 20, 30, 50, 80, 100];

interface Props {
  initial?: AssuranceSaisie;
  /** Référence (TA-xxxxx) en modification */
  reference?: string | null;
  boutonTexte: string;
  envoi: boolean;
  onEnregistrer: (data: AssuranceSaisie) => void;
}

/**
 * HÔPITAL > ASSURANCES — formulaire partagé (Ajouter / Modifier).
 * Règles Laravel (TypeAssuranceRequest) : libellé obligatoire, pourcentage entier entre 5 et 100.
 * Le pourcentage est la part payée par l'assurance : le patient paie le reste (voir AdmissionRepository).
 */
export default function AssuranceForm({ initial, reference, boutonTexte, envoi, onEnregistrer }: Props) {
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [taux, setTaux] = useState(String(initial?.reduction ?? 30));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [exemple, setExemple] = useState('10000');
  const [verifier, setVerifier] = useState(false);

  const tauxNombre = Number(taux);
  const tauxValide = /^\d+$/.test(taux) && tauxNombre >= 5 && tauxNombre <= 100;
  const tauxAffiche = tauxValide ? tauxNombre : Math.min(100, Math.max(0, tauxNombre || 0));
  const montant = Number(exemple) || 0;
  const partAssurance = Math.round((montant * tauxAffiche) / 100);
  const partPatient = montant - partAssurance;

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifier(true);
    if (!libelle.trim()) return void alerte.echec("Le libellé de l'assurance est obligatoire.");
    if (!tauxValide) return void alerte.echec('Le pourcentage doit être un nombre entier entre 5 et 100.');
    onEnregistrer({ libelle: libelle.trim(), reduction: tauxNombre, description: description.trim() || undefined });
  };

  return (
    <div className={styles.grille}>
      <form className={c.bloc} onSubmit={soumettre} noValidate>
        <h2 className={c.blocTitre}>Informations sur l'assurance</h2>

        <div className={styles.ligne}>
          <div className={`${styles.champ} ${verifier && !libelle.trim() ? styles.invalide : ''}`}>
            <label htmlFor="libelle">Libellé <span className={styles.requis}>*</span></label>
            <input id="libelle" maxLength={191} placeholder="Ex. CMU, MUGEF-CI, Allianz…" value={libelle} onChange={(e) => setLibelle(e.target.value)} autoFocus />
          </div>
          <div className={styles.champ}>
            <label htmlFor="description">Description <span className={styles.facultatif}>(facultatif)</span></label>
            <input id="description" maxLength={DESCRIPTION_MAX} placeholder="Ex. Couverture Maladie Universelle" value={description} onChange={(e) => setDescription(e.target.value)} />
            <span className={styles.compteurCar}>{description.length} / {DESCRIPTION_MAX}</span>
          </div>
        </div>

        <h2 className={`${c.blocTitre} ${styles.espace}`}>Prise en charge</h2>
        <div className={`${styles.taux} ${verifier && !tauxValide ? styles.invalide : ''}`}>
          <div className={styles.tauxHaut}>
            <label htmlFor="taux">Pourcentage pris en charge par l'assurance <span className={styles.requis}>*</span></label>
            <div className={styles.tauxSaisie}>
              <input id="taux" inputMode="numeric" value={taux} onChange={(e) => setTaux(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} aria-describedby="taux-aide" />
              <span>%</span>
            </div>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={tauxValide ? tauxNombre : 5}
            onChange={(e) => setTaux(e.target.value)}
            className={styles.curseur}
            style={{ ['--pct' as string]: `${((tauxAffiche - 5) / 95) * 100}%` }}
            aria-label="Pourcentage pris en charge"
          />
          <div className={styles.rapides}>
            {TAUX_RAPIDES.map((t) => (
              <button key={t} type="button" className={`${styles.rapide} ${tauxNombre === t ? styles.rapideActif : ''}`} onClick={() => setTaux(String(t))}>
                {t} %
              </button>
            ))}
          </div>
          <p id="taux-aide" className={styles.aide}>Entre 5 et 100 %. Le patient paie le reste du prix de l'acte.</p>
        </div>

        <footer className={styles.pied}>
          <Link to={`${baseHopital()}/assurances/liste`} className={c.secondaire}>Annuler</Link>
          <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
            <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : boutonTexte}
          </motion.button>
        </footer>
      </form>

      {/* --- Simulation en direct --- */}
      <aside className={`${c.bloc} ${styles.simulation}`} aria-label="Simulation de prise en charge">
        <p className={styles.simTitre}>Simulation</p>
        <p className={`${styles.simNom} ${libelle.trim() ? '' : styles.simVide}`}>{libelle.trim() || "Nom de l'assurance"}</p>
        {reference && <span className={styles.simRef}>Réf. {reference}</span>}

        <label className={styles.simMontant}>
          Pour un acte de
          <span>
            <input inputMode="numeric" value={exemple} onChange={(e) => setExemple(e.target.value.replace(/[^\d]/g, '').slice(0, 9))} aria-label="Montant de l'exemple en FCFA" />
            FCFA
          </span>
        </label>

        <div className={styles.barre} aria-hidden="true">
          <motion.span className={styles.barreAssurance} animate={{ width: `${tauxAffiche}%` }} transition={{ type: 'spring', stiffness: 220, damping: 28 }} />
        </div>

        <dl className={styles.parts}>
          <div>
            <dt><i className={styles.puceAssurance} /> L'assurance paie ({tauxAffiche} %)</dt>
            <dd>{fcfa(partAssurance)}</dd>
          </div>
          <div>
            <dt><i className={styles.pucePatient} /> Le patient paie ({100 - tauxAffiche} %)</dt>
            <dd>{fcfa(partPatient)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
