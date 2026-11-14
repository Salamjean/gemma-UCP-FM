import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  FaArrowLeft,
  FaBriefcase,
  FaBirthdayCake,
  FaCheckCircle,
  FaExclamationTriangle,
  FaEye,
  FaMapMarkerAlt,
  FaPhone,
  FaShieldAlt,
  FaStethoscope,
  FaUser,
  FaVenusMars,
} from 'react-icons/fa';
import { Link, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { PatientHopitalDetail } from '../../../types';
import { calculerAge, estFeminin, initialesPatient } from './Liste';
import { baseHopital } from '../../../services/contexteHopital';
import styles from './Patients.module.css';

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
};

/**
 * HÔPITAL > PATIENTS > DÉTAIL
 * Équivalent Laravel : hospital.patient.detail (users/hospital/patient/show.blade.php)
 */
export default function Detail() {
  const { id } = useParams();
  const [patient, setPatient] = useState<PatientHopitalDetail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    setPatient(null);
    setIntrouvable(false);
    api.hospital.patients
      .detail(Number(id))
      .then(setPatient)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(`Impossible de charger le dossier patient : ${messageErreur(e)}`);
      });
  }, [id]);

  if (introuvable) {
    return (
      <div className={c.page}>
        <header className={c.entete}>
          <div>
            <p className={c.surtitre}>Patients</p>
            <h1 className={c.titre}>Patient introuvable</h1>
          </div>
          <Link to={`${baseHopital()}/patients/liste`} className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Retour à la liste
          </Link>
        </header>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className={c.page}>
        <section className={c.bloc}>
          <p className={c.vide}>Chargement du dossier patient…</p>
        </section>
      </div>
    );
  }

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Patients · Fiche individuelle</p>
          <h1 className={c.titre}>Dossier patient</h1>
        </div>
        <div className={c.boutons}>
          <Link to={`${baseHopital()}/patients/liste`} className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Retour à la liste
          </Link>
        </div>
      </header>

      {/* --- Bannière d'identité --- */}
      <motion.section
        className={styles.banniere}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.profilGauche}>
          {patient.imgUrl ? (
            <img
              className={styles.grandAvatar}
              src={patient.imgUrl.startsWith('http') ? patient.imgUrl : uploadUrl('patient', patient.imgUrl)}
              alt=""
            />
          ) : (
            <div className={`${styles.grandAvatarInitiales} ${estFeminin(patient.genre) ? styles.genreF : styles.genreM}`}>
              {initialesPatient(patient.nomComplet)}
            </div>
          )}

          <div>
            <div className={styles.identiteTitre}>
              <h1>{patient.nomComplet}</h1>
              <span className={`${c.badge} ${ styles.genreM }`}>Dossier N° {patient.codePatient}</span>
              <span className={`${c.badge} ${patient.assure ? c.badgeOk : c.badgeNeutre}`}>
                <FaShieldAlt aria-hidden="true" /> {patient.assure ? 'Assuré' : 'Non assuré'}
              </span>
            </div>

            <div className={styles.metaLigne}>
              <span className={styles.metaItem}>
                <FaVenusMars aria-hidden="true" /> {patient.genre ? patient.genre.charAt(0).toUpperCase() + patient.genre.slice(1) : 'Genre non renseigné'}
              </span>
              <span>•</span>
              <span className={styles.metaItem}>
                <FaBirthdayCake aria-hidden="true" /> {calculerAge(patient.dateNaissance)}
              </span>
              <span>•</span>
              <span className={styles.metaItem}>
                <FaBriefcase aria-hidden="true" /> {patient.profession || 'Profession non renseignée'}
              </span>
              {patient.telephone && (
                <>
                  <span>•</span>
                  <span className={styles.metaItem}>
                    <FaPhone aria-hidden="true" /> {patient.telephone}
                  </span>
                </>
              )}
              {patient.residenceActuelle && (
                <>
                  <span>•</span>
                  <span className={styles.metaItem}>
                    <FaMapMarkerAlt aria-hidden="true" /> {patient.residenceActuelle}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      <div className={styles.grilleDetail}>
        {/* --- Colonne gauche : État civil, Coordonnées, Historique --- */}
        <div className={styles.colonne}>
          <section className={c.bloc}>
            <h2 className={c.blocTitre}>
              <FaUser aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
              État civil &amp; identité
            </h2>
            <div className={styles.champsGrille}>
              <div className={styles.champInfo}>
                <span>Nom</span>
                <strong>{patient.nom || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Prénom(s)</span>
                <strong>{patient.prenom || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Date de naissance</span>
                <strong>{patient.dateNaissance || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Lieu de naissance</span>
                <strong>{patient.lieuNaissance || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Pays / Nationalité</span>
                <strong>{patient.pays || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Ethnie</span>
                <strong>{patient.ethnie || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Type de pièce</span>
                <strong>{patient.typePiece || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Numéro de pièce</span>
                <strong>{patient.numeroIdentite || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Profession</span>
                <strong>{patient.profession || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Nombre d’enfants</span>
                <strong>{patient.nbreEnfants != null ? patient.nbreEnfants : '—'}</strong>
              </div>
            </div>
          </section>

          <section className={c.bloc}>
            <h2 className={c.blocTitre}>
              <FaMapMarkerAlt aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
              Coordonnées &amp; localisation
            </h2>
            <div className={styles.champsGrille}>
              <div className={styles.champInfo}>
                <span>Téléphone principal</span>
                <strong>{patient.telephone || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Téléphone secondaire</span>
                <strong>{patient.telephone2 || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Adresse e-mail</span>
                <strong>{patient.email || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Résidence actuelle</span>
                <strong>{patient.residenceActuelle || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Résidence habituelle</span>
                <strong>{patient.residenceHabituelle || '—'}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Adresse / Quartier</span>
                <strong>{patient.adresse || '—'}</strong>
              </div>
            </div>
          </section>

          <section className={c.bloc}>
            <h2 className={c.blocTitre}>
              <FaStethoscope aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
              Consultations au sein de l’établissement ({patient.consultations.length})
            </h2>
            {patient.consultations.length === 0 ? (
              <p className={c.vide}>Aucune consultation enregistrée dans cet établissement.</p>
            ) : (
              <div className={c.tableWrap}>
                <table className={`${c.table} ${c.centre}`}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Motif / Service</th>
                      <th scope="col">Médecin</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patient.consultations.map((cons) => (
                      <tr key={cons.id}>
                        <td>{formatDate(cons.date)}</td>
                        <td>{cons.motif || 'Consultation'}</td>
                        <td>{cons.medecin || '—'}</td>
                        <td>
                          <span className={`${c.badge} ${cons.terminee ? c.badgeOk : c.badgeNeutre}`}>
                            {cons.terminee ? 'Terminée' : 'En cours'}
                          </span>
                        </td>
                        <td>
                          <div className={c.actions}>
                            <Link
                              to={`${baseHopital()}/consultations/${cons.id}`}
                              className={`${c.icone} ${c.iconeVoir}`}
                              title="Détail de la consultation"
                            >
                              <FaEye />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* --- Colonne droite : Contacts d'urgence, Assurance, Infos dossier --- */}
        <div className={styles.colonne}>
          <section className={c.bloc}>
            <h2 className={c.blocTitre}>Personnes à contacter en cas d’urgence</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.urgenceCarte}>
                <div className={styles.urgenceTitre}>
                  <FaExclamationTriangle aria-hidden="true" /> Contact d’urgence N°1
                </div>
                <div className={styles.champsGrille}>
                  <div className={styles.champInfo} style={{ background: '#ffffff' }}>
                    <span>Nom &amp; Prénom(s)</span>
                    <strong>{patient.urgence1.nom || 'Non renseigné'}</strong>
                  </div>
                  <div className={styles.champInfo} style={{ background: '#ffffff' }}>
                    <span>Téléphone</span>
                    <strong>{patient.urgence1.telephone || 'Non renseigné'}</strong>
                  </div>
                  <div className={styles.champInfo} style={{ background: '#ffffff', gridColumn: '1 / -1' }}>
                    <span>Lien de parenté</span>
                    <strong>{patient.urgence1.lien || 'Non spécifié'}</strong>
                  </div>
                </div>
              </div>

              {patient.urgence2.nom && (
                <div className={styles.urgenceCarte} style={{ background: '#fffbf0', borderColor: '#fde68a' }}>
                  <div className={styles.urgenceTitre} style={{ color: '#b56b00' }}>
                    <FaExclamationTriangle aria-hidden="true" /> Contact d’urgence N°2
                  </div>
                  <div className={styles.champsGrille}>
                    <div className={styles.champInfo} style={{ background: '#ffffff' }}>
                      <span>Nom &amp; Prénom(s)</span>
                      <strong>{patient.urgence2.nom}</strong>
                    </div>
                    <div className={styles.champInfo} style={{ background: '#ffffff' }}>
                      <span>Téléphone</span>
                      <strong>{patient.urgence2.telephone || 'Non renseigné'}</strong>
                    </div>
                    <div className={styles.champInfo} style={{ background: '#ffffff', gridColumn: '1 / -1' }}>
                      <span>Lien de parenté</span>
                      <strong>{patient.urgence2.lien || 'Non spécifié'}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={c.bloc}>
            <h2 className={c.blocTitre}>
              <FaShieldAlt aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
              Couverture santé &amp; assurance
            </h2>
            <div className={styles.champsGrille}>
              <div className={styles.champInfo}>
                <span>Statut d’assurance</span>
                <strong>
                  {patient.assure ? (
                    <span style={{ color: '#0b7a54', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <FaCheckCircle /> Assuré (Oui)
                    </span>
                  ) : (
                    'Non assuré'
                  )}
                </strong>
              </div>
              <div className={styles.champInfo}>
                <span>Numéro de police / Assurance</span>
                <strong>{patient.numeroAssurance || '—'}</strong>
              </div>
            </div>
          </section>

          <section className={c.bloc}>
            <h2 className={c.blocTitre}>Informations du dossier</h2>
            <div className={styles.champsGrille}>
              <div className={styles.champInfo}>
                <span>Code dossier médical</span>
                <strong className={styles.code}>{patient.codePatient}</strong>
              </div>
              <div className={styles.champInfo}>
                <span>Création du dossier</span>
                <strong>{formatDate(patient.createdAt)}</strong>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

