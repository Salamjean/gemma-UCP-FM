import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import { fcfa } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { HospitalisationDetail as Detail } from '../../../../types';
import { jourFr, joursTexte, nombreJours, statutHospitalisation } from '../hospitalisation.format';
import SoinsSuivi from './SoinsSuivi';
import { baseHopital, estAdminHopital } from '../../../../services/contexteHopital';
import styles from './Suivi.module.css';

/**
 * HÔPITAL > HOSPITALISATION > DÉTAIL D'UNE HOSPITALISATION (bouton "œil")
 * Équivalent Laravel : hospital.hospitalisation.detail (users/hospital/hospitalisation/detail.blade.php)
 */
export default function HospitalisationDetail() {
  const { id } = useParams();
  const [h, setH] = useState<Detail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    api.hospital.hospitalisations
      .detail(Number(id))
      .then(setH)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(messageErreur(e));
      });
  }, [id]);

  const retour = (
    <Link to={`${baseHopital()}/hospitalisation/liste`} className={c.secondaire}>
      <FaArrowLeft aria-hidden="true" /> Hospitalisations
    </Link>
  );

  if (!h) {
    return (
      <div className={c.page}>
        <header className={c.entete}>
          <div>
            <p className={c.surtitre}>Hospitalisation</p>
            <h1 className={c.titre}>Détail de l'hospitalisation</h1>
          </div>
          {retour}
        </header>
        <section className={c.bloc}>
          <p className={c.vide}>{introuvable ? 'Hospitalisation introuvable.' : 'Chargement…'}</p>
        </section>
      </div>
    );
  }

  const s = statutHospitalisation(h.statut);
  const jours = h.jours ?? nombreJours(h.debut, h.fin);
  const champs: { titre: string; valeur: string | null; large?: boolean }[] = [
    { titre: "Motif d'hospitalisation", valeur: h.dossier.motif ?? h.consultation.motif },
    { titre: 'Diagnostic', valeur: h.dossier.diagnostic },
    { titre: 'Régime', valeur: h.dossier.regime },
    { titre: 'Analyses médicales', valeur: h.dossier.analyses },
    { titre: 'Sonde', valeur: h.dossier.sonde },
    { titre: 'Oxygénothérapie', valeur: h.dossier.oxygenotherapie },
    { titre: 'Volume', valeur: h.dossier.volume },
    { titre: 'Remarque', valeur: h.dossier.remarque, large: true },
    ...(h.dossier.motifSortie ? [{ titre: 'Motif de sortie', valeur: h.dossier.motifSortie, large: true }] : []),
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Hospitalisation · {h.code}</p>
          <h1 className={`${c.titre} ${styles.titre}`}>
            {h.patient.nom}
            <span className={c.badge} style={{ background: s.fond, color: s.texte }}>{s.libelle}</span>
          </h1>
        </div>
        {retour}
      </header>

      <div className={styles.cartes}>
        {[
          { titre: 'Dossier patient', valeur: h.patient.code ?? '—', detail: h.consultation.code ? `Consultation ${h.consultation.code}` : undefined },
          { titre: 'Médecin', valeur: h.medecin ?? '—' },
          { titre: 'Période', valeur: `${jourFr(h.debut)} → ${h.fin ? jourFr(h.fin) : 'en cours'}`, detail: joursTexte(jours) },
          // Montant facturé : jamais affiché à l'administration UCP-FM
          ...(estAdminHopital() ? [] : [{ titre: 'Montant', valeur: h.prix !== null ? fcfa(h.prix) : h.enCours ? 'Calculé à la sortie' : '—' }]),
        ].map((k, i) => (
          <motion.div key={k.titre} className={styles.carte} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span>{k.titre}</span>
            <strong>{k.valeur}</strong>
            {k.detail && <small>{k.detail}</small>}
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <h2 className={c.blocTitre}>Dossier d'hospitalisation</h2>
        <dl className={styles.dossier}>
          {champs.map((f) => (
            <div key={f.titre} className={f.large ? styles.large : ''}>
              <dt>{f.titre}</dt>
              <dd>{f.valeur || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={c.bloc}>
        <h2 className={c.blocTitre}>Journées d'hospitalisation</h2>
        {h.journees.length ? (
          <ol className={styles.frise}>
            {h.journees.map((j) => (
              <li key={j.id} className={`${styles.journee} ${j.statut !== 'en_cours' ? styles.journeeTerminee : ''}`}>
                <div>
                  <strong>{jourFr(j.jour)}</strong>
                  <small>{j.fin ? `au ${jourFr(j.fin)} · ${joursTexte(j.nombre || 1)}` : 'en cours'}</small>
                </div>
                <div>
                  <small>Médecin</small>
                  {j.medecin ?? '—'}
                </div>
                <div>
                  <small>Infirmier(e)</small>
                  {j.infirmier ?? '—'}
                </div>
                <div>
                  <small>Chambre</small>
                  {j.lit ?? '—'}
                </div>
                {!estAdminHopital() && <strong className={styles.journeePrix}>{j.prix !== null ? fcfa(j.prix) : <small>en cours</small>}</strong>}
              </li>
            ))}
          </ol>
        ) : (
          <p className={c.vide}>Aucune journée enregistrée par le médecin pour l'instant.</p>
        )}
      </section>

      <SoinsSuivi soins={h} />
    </div>
  );
}
