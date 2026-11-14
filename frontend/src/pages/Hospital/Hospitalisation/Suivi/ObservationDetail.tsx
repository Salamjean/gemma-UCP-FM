import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { ObservationDetail as Detail } from '../../../../types';
import { jourFr, jourHeureFr, observationEnCours } from '../hospitalisation.format';
import SoinsSuivi from './SoinsSuivi';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Suivi.module.css';

/**
 * HÔPITAL > HOSPITALISATION > DÉTAIL D'UNE MISE EN OBSERVATION (bouton "œil")
 * Équivalent Laravel : hospital.observation.detail (users/hospital/observation/detail.blade.php)
 */
export default function ObservationDetail() {
  const { id } = useParams();
  const [o, setO] = useState<Detail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    api.hospital.observations
      .detail(Number(id))
      .then(setO)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(messageErreur(e));
      });
  }, [id]);

  const retour = (
    <Link to={`${baseHopital()}/hospitalisation/observations`} className={c.secondaire}>
      <FaArrowLeft aria-hidden="true" /> Observations
    </Link>
  );

  if (!o) {
    return (
      <div className={c.page}>
        <header className={c.entete}>
          <div>
            <p className={c.surtitre}>Hospitalisation</p>
            <h1 className={c.titre}>Détail de la mise en observation</h1>
          </div>
          {retour}
        </header>
        <section className={c.bloc}>
          <p className={c.vide}>{introuvable ? 'Mise en observation introuvable.' : 'Chargement…'}</p>
        </section>
      </div>
    );
  }

  const encours = observationEnCours(o.fin);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Observation · {o.code}</p>
          <h1 className={`${c.titre} ${styles.titre}`}>
            {o.patient.nom}
            <span className={`${c.badge} ${encours ? '' : c.badgeOk}`} style={encours ? { background: '#fff3df', color: '#b56b00' } : undefined}>
              {encours ? 'En cours' : 'Terminée'}
            </span>
          </h1>
        </div>
        {retour}
      </header>

      <div className={styles.cartes}>
        {[
          { titre: 'Dossier patient', valeur: o.patient.code ?? '—', detail: o.consultation.code ? `Consultation ${o.consultation.code}` : undefined },
          { titre: 'Début', valeur: jourHeureFr(o.debut) },
          { titre: 'Durée', valeur: o.duree ?? '—' },
          { titre: 'Fin prévue', valeur: jourHeureFr(o.fin), detail: o.fin && !encours ? `Terminée le ${jourFr(o.fin)}` : undefined },
        ].map((k, i) => (
          <motion.div key={k.titre} className={styles.carte} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span>{k.titre}</span>
            <strong>{k.valeur}</strong>
            {k.detail && <small>{k.detail}</small>}
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <h2 className={c.blocTitre}>Compte rendu</h2>
        <dl className={styles.dossier}>
          <div>
            <dt>Motif de consultation</dt>
            <dd>{o.consultation.motif || '—'}</dd>
          </div>
          <div className={styles.large}>
            <dt>Observations</dt>
            <dd>{o.observations || '—'}</dd>
          </div>
          <div className={styles.large}>
            <dt>Diagnostic</dt>
            <dd>{o.diagnostic || '—'}</dd>
          </div>
        </dl>
      </section>

      <SoinsSuivi soins={o} />
    </div>
  );
}
