import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  FaArrowLeft,
  FaBriefcaseMedical,
  FaFileMedical,
  FaHeartbeat,
  FaNotesMedical,
  FaPrescriptionBottleAlt,
  FaStethoscope,
  FaUser,
  FaVials,
} from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { ConsultationHopitalDetail } from '../../../types';
import { calculerAge } from '../Patients/Liste';
import styles from './Consultations.module.css';
import { baseHopital, estAdminHopital } from '../../../services/contexteHopital';
import { formatDateFr, formatHeureFr } from './Nouvelles';

/**
 * HÔPITAL > CONSULTATIONS > DÉTAIL
 * Équivalent Laravel : hospital.consultation.detail (users/hospital/consultation/detail.blade.php)
 */
export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ConsultationHopitalDetail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    setData(null);
    setIntrouvable(false);
    api.hospital.consultations
      .detail(Number(id))
      .then(setData)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(`Impossible de charger la consultation : ${messageErreur(e)}`);
      });
  }, [id]);

  if (introuvable) {
    return (
      <div className={c.page}>
        <header className={c.entete}>
          <div>
            <p className={c.surtitre}>Consultations</p>
            <h1 className={c.titre}>Consultation introuvable</h1>
          </div>
          <button type="button" onClick={() => navigate(-1)} className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Retour
          </button>
        </header>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={c.page}>
        <section className={c.bloc}>
          <p className={c.vide}>Chargement de la consultation…</p>
        </section>
      </div>
    );
  }

  const { constantes: k } = data;

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Consultations · Fiche médicale</p>
          <h1 className={c.titre}>
            Consultation {data.code ? `#${data.code}` : `N° ${data.id}`}{' '}
            <span
              className={`${c.badge} ${data.terminee ? c.badgeOk : styles.badgeEnCours}`}
              style={{ verticalAlign: 'middle', marginLeft: 8 }}
            >
              {data.terminee ? 'Terminée' : 'En cours'}
            </span>
          </h1>
        </div>
        <div className={c.boutons}>
          <button type="button" onClick={() => navigate(-1)} className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Retour
          </button>
        </div>
      </header>

      <div className={styles.grilleDetail}>
        {/* --- Colonne gauche : Informations, Constantes, Diagnostic --- */}
        <div className={styles.colonne}>
          <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className={c.blocTitre}>
              <FaStethoscope aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
              Informations de la consultation
            </h2>
            <div className={styles.champsGrille}>
              <div className={styles.champInfo}>
                <span>Date &amp; Heure</span>
                <strong>
                  {formatDateFr(data.date)}
                  {data.createdAt ? ` à ${formatHeureFr(data.createdAt)}` : ''}
                </strong>
              </div>
              <div className={styles.champInfo}>
                <span>Prestation / Service</span>
                <strong>{data.service || 'Consultation générale'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Médecin / Sage-femme</span>
                <strong>{data.medecin || 'Non renseigné'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Infirmier(e)</span>
                <strong>{data.infirmier || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Issue de la consultation</span>
                <strong>{data.issue || '—'}</strong>
              </div>
              {/* Montant payé : jamais affiché à l'administration UCP-FM */}
              {!estAdminHopital() && (
                <div className={styles.champInfo}>
                  <span>Montant</span>
                  <strong>{data.montant != null ? `${data.montant.toLocaleString('fr-FR')} F CFA` : '—'}</strong>
                </div>
              )}
              {data.motif && (
                <div className={styles.champInfo} style={{ gridColumn: '1 / -1' }}>
                  <span>Motif de consultation</span>
                  <strong>{data.motif}</strong>
                </div>
              )}
            </div>
          </motion.section>

          <motion.section
            className={c.bloc}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <h2 className={c.blocTitre}>
              <FaHeartbeat aria-hidden="true" style={{ marginRight: 8, color: '#e72e4f' }} />
              Constantes vitales
            </h2>
            <div className={styles.constantesGrille}>
              <div className={styles.constanteBoite}>
                <span>Température</span>
                <strong>{k.temperature ? `${k.temperature} °C` : '—'}</strong>
              </div>
              <div className={styles.constanteBoite}>
                <span>Tension artérielle</span>
                <strong>{k.tension ? `${k.tension}` : '—'}</strong>
              </div>
              <div className={styles.constanteBoite}>
                <span>Poids</span>
                <strong>{k.poids ? `${k.poids} kg` : '—'}</strong>
              </div>
              <div className={styles.constanteBoite}>
                <span>Taille</span>
                <strong>{k.taille ? `${k.taille} cm` : '—'}</strong>
              </div>
              <div className={styles.constanteBoite}>
                <span>Pouls</span>
                <strong>{k.pouls ? `${k.pouls} bpm` : '—'}</strong>
              </div>
              <div className={styles.constanteBoite}>
                <span>Fréq. respiratoire</span>
                <strong>{k.frequenceRespiratoire ? `${k.frequenceRespiratoire} cpm` : '—'}</strong>
              </div>
            </div>
          </motion.section>

          <motion.section
            className={c.bloc}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className={c.blocTitre}>
              <FaNotesMedical aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
              Diagnostic &amp; Observation clinique
            </h2>
            <div className={styles.texteLong}>
              {data.diagnostic || 'Aucune note clinique ou diagnostic renseigné pour cette consultation.'}
            </div>
          </motion.section>
        </div>

        {/* --- Colonne droite : Patient & Actes post-consultation --- */}
        <div className={styles.colonne}>
          <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className={c.blocTitre}>
              <FaUser aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
              Patient consulté
            </h2>
            <div className={styles.champsGrille}>
              <div className={styles.champInfo}>
                <span>Nom &amp; Prénoms</span>
                <strong>{data.patient.nom}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Code Dossier</span>
                <strong className={styles.code}>{data.patient.code}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Genre</span>
                <strong>
                  {data.patient.genre
                    ? data.patient.genre.charAt(0).toUpperCase() + data.patient.genre.slice(1)
                    : '—'}
                </strong>
              </div>
              <div className={styles.champInfo}>
                <span>Âge</span>
                <strong>{calculerAge(data.patient.dateNaissance)}</strong>
              </div>
              <div className={styles.champInfo} style={{ gridColumn: '1 / -1' }}>
                <span>Téléphone</span>
                <strong>{data.patient.telephone || '—'}</strong>
              </div>
            </div>
            {data.patient.id && (
              <div style={{ marginTop: 14 }}>
                <Link to={`${baseHopital()}/patients/${data.patient.id}`} className={c.secondaire} style={{ width: '100%', justifyContent: 'center' }}>
                  Ouvrir le dossier complet du patient
                </Link>
              </div>
            )}
          </motion.section>

          <motion.section
            className={c.bloc}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
          >
            <h2 className={c.blocTitre}>
              <FaPrescriptionBottleAlt aria-hidden="true" style={{ marginRight: 8, color: '#b56b00' }} />
              Ordonnances ({data.ordonnances.length})
            </h2>
            {data.ordonnances.length === 0 ? (
              <p className={c.sousTexte}>Aucune ordonnance délivrée.</p>
            ) : (
              <div className={styles.listePost}>
                {data.ordonnances.map((o) => (
                  <div key={o.id} className={styles.elementPost}>
                    <div>
                      <strong>Ordonnance {o.type ? `(${o.type})` : ''}</strong>
                      <span className={c.sousTexte}>
                        {o.code ? `Réf. ${o.code} · ` : ''}
                        {formatDateFr(o.date)}
                      </span>
                    </div>
                    <span className={`${c.badge} ${styles.badgeOrdonnance}`}>Délivrée</span>
                  </div>
                ))}
              </div>
            )}
          </motion.section>

          <motion.section
            className={c.bloc}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className={c.blocTitre}>
              <FaVials aria-hidden="true" style={{ marginRight: 8, color: '#6a3fd6' }} />
              Bulletins d’examen ({data.examens.length})
            </h2>
            {data.examens.length === 0 ? (
              <p className={c.sousTexte}>Aucun examen prescrit.</p>
            ) : (
              <div className={styles.listePost}>
                {data.examens.map((ex) => (
                  <div key={ex.id} className={styles.elementPost}>
                    <div>
                      <strong>{ex.nature || 'Examen médical'}</strong>
                      {ex.renseignement && <span className={c.sousTexte}>{ex.renseignement}</span>}
                    </div>
                    <span className={`${c.badge} ${styles.badgeExamen}`}>{ex.code || 'Examen'}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.section>

          <motion.section
            className={c.bloc}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            <h2 className={c.blocTitre}>
              <FaBriefcaseMedical aria-hidden="true" style={{ marginRight: 8, color: '#1f6fc6' }} />
              Arrêts de travail ({data.arrets.length})
            </h2>
            {data.arrets.length === 0 ? (
              <p className={c.sousTexte}>Aucun arrêt de travail prescrit.</p>
            ) : (
              <div className={styles.listePost}>
                {data.arrets.map((ar) => (
                  <div key={ar.id} className={styles.elementPost}>
                    <div>
                      <strong>
                        Du {formatDateFr(ar.debut)} au {formatDateFr(ar.fin)}
                      </strong>
                      {ar.motif && <span className={c.sousTexte}>{ar.motif}</span>}
                    </div>
                    <span className={`${c.badge} ${styles.badgeArret}`}>
                      <FaFileMedical aria-hidden="true" /> {ar.jours ? `${ar.jours} j` : 'Arrêt'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        </div>
      </div>
    </div>
  );
}

