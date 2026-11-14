import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  FaCalendarAlt,
  FaFolderOpen,
  FaHeartbeat,
  FaIdCard,
  FaPhone,
  FaRedo,
  FaSearch,
  FaStethoscope,
  FaTimes,
  FaUser,
  FaUserInjured,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type {
  InfirmierPatientDetailResponse,
  InfirmierPatientItem,
} from '../../../types';
import s from './GestionPatients.module.css';

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function calculerAge(dateNaissance: string | null): string {
  if (!dateNaissance) return '—';
  let annee: number | null = null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateNaissance);
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dateNaissance);
  if (iso) annee = Number(iso[1]);
  else if (fr) annee = Number(fr[3]);
  if (!annee || annee < 1900) return dateNaissance;
  const age = new Date().getFullYear() - annee;
  return age >= 0 ? `${age} ans` : '—';
}

/**
 * INFIRMIER > GESTION PATIENTS > VÉRIFIER / RECHERCHER
 * Équivalent Laravel : secretariat.search_hospitalisation
 */
export default function Rechercher() {
  const navigate = useNavigate();

  // Critères de recherche
  const [codePatient, setCodePatient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [numCmu, setNumCmu] = useState('');
  const [fullname, setFullname] = useState('');
  const [birthDate, setBirthDate] = useState('');

  // Résultats
  const [chargement, setChargement] = useState(false);
  const [resultats, setResultats] = useState<InfirmierPatientItem[] | null>(null);

  // Modal détail patient
  const [detailModalId, setDetailModalId] = useState<number | null>(null);
  const [patientDetail, setPatientDetail] = useState<InfirmierPatientDetailResponse | null>(null);
  const [chargementDetail, setChargementDetail] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setChargement(true);
    try {
      const res = await api.infirmier.patients.rechercher({
        code_patient: codePatient || undefined,
        telephone: telephone || undefined,
        num_cmu: numCmu || undefined,
        fullname: fullname || undefined,
        birth_date: birthDate || undefined,
      });
      setResultats(res);
    } catch (err) {
      alerte.echec(`Erreur lors de la recherche : ${messageErreur(err)}`);
    } finally {
      setChargement(false);
    }
  };

  const reinitialiser = () => {
    setCodePatient('');
    setTelephone('');
    setNumCmu('');
    setFullname('');
    setBirthDate('');
    setResultats(null);
  };

  const ouvrirDetail = async (id: number) => {
    setDetailModalId(id);
    setChargementDetail(true);
    try {
      const res = await api.infirmier.patients.detail(id);
      setPatientDetail(res);
    } catch (err) {
      alerte.echec(`Erreur de chargement du dossier : ${messageErreur(err)}`);
      setDetailModalId(null);
    } finally {
      setChargementDetail(false);
    }
  };

  return (
    <div className={c.page}>
      {/* En-tête */}
      <header className={s.entete}>
        <div className={s.enteteGauche}>
          <div className={s.iconePatient}>
            <FaSearch aria-hidden="true" />
          </div>
          <div>
            <p className={c.surtitre}>Espace Infirmier · Gestion Patients</p>
            <h1 className={c.titre} style={{ margin: 0 }}>Vérifier &amp; Rechercher un Patient</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Retrouvez rapidement un dossier médical par code DM, téléphone, CMU ou nom complet.
            </p>
          </div>
        </div>
        <div className={c.boutons}>
          <button
            type="button"
            className={c.secondaire}
            onClick={() => navigate('/infirmier/patients/liste')}
          >
            <FaUserInjured aria-hidden="true" /> Liste complète des patients
          </button>
        </div>
      </header>

      {/* Formulaire Multi-Critères de Recherche */}
      <section className={s.boiteFiltres}>
        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
          Critères de recherche du patient
        </h3>
        <p className={c.sousTexte}>Renseignez au moins un critère pour identifier le patient dans la base.</p>

        <form onSubmit={handleSearch} className={s.grilleChampsRecherche}>
          <div className={s.champRecherche}>
            <label htmlFor="dm">
              <FaFolderOpen style={{ color: 'var(--dash-blue)' }} /> N° Dossier (DM)
            </label>
            <input
              type="text"
              id="dm"
              placeholder="Ex: DM2024..."
              value={codePatient}
              onChange={(e) => setCodePatient(e.target.value)}
            />
          </div>

          <div className={s.champRecherche}>
            <label htmlFor="tel">
              <FaPhone style={{ color: '#059669' }} /> N° Téléphone
            </label>
            <input
              type="text"
              id="tel"
              placeholder="Ex: 0707..."
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>

          <div className={s.champRecherche}>
            <label htmlFor="cmu">
              <FaIdCard style={{ color: '#d97706' }} /> N° CMU
            </label>
            <input
              type="text"
              id="cmu"
              placeholder="Ex: 123456..."
              value={numCmu}
              onChange={(e) => setNumCmu(e.target.value)}
            />
          </div>

          <div className={s.champRecherche}>
            <label htmlFor="nom">
              <FaUser style={{ color: '#2563eb' }} /> Nom &amp; Prénom(s)
            </label>
            <input
              type="text"
              id="nom"
              placeholder="Ex: Kouame..."
              value={fullname}
              onChange={(e) => setFullname(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className={s.btnRecherche}
              disabled={chargement}
            >
              <FaSearch aria-hidden="true" />
              {chargement ? 'Recherche…' : 'Rechercher'}
            </button>
            {(codePatient || telephone || numCmu || fullname || birthDate || resultats) && (
              <button
                type="button"
                className={c.secondaire}
                style={{ height: 42, padding: '0 12px' }}
                onClick={reinitialiser}
                title="Effacer les critères"
              >
                <FaRedo aria-hidden="true" />
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Résultats de Recherche */}
      {resultats !== null && (
        <motion.section
          className={c.bloc}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className={c.blocTitre} style={{ margin: 0 }}>
              Résultats de la recherche ({resultats.length})
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {resultats.length} patient(s) correspondant(s)
            </span>
          </div>

          {resultats.length === 0 ? (
            <p className={c.vide}>
              Aucun patient trouvé avec ces critères de recherche.
            </p>
          ) : (
            <div className={s.grilleCartesPatients}>
              {resultats.map((p) => {
                const feminin = (p.genre ?? '').toLowerCase().startsWith('f');
                const photo = p.imgUrl
                  ? p.imgUrl.startsWith('http')
                    ? p.imgUrl
                    : uploadUrl('patient', p.imgUrl)
                  : null;

                return (
                  <div key={p.id} className={s.cartePatientResultat}>
                    {photo ? (
                      <img src={photo} alt="" className={s.avatar} style={{ width: 56, height: 56 }} />
                    ) : (
                      <span
                        className={`${s.avatarInitiales} ${feminin ? s.avatarF : ''}`}
                        style={{ width: 56, height: 56, fontSize: '1.15rem' }}
                      >
                        {initiales(p.nomComplet)}
                      </span>
                    )}

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--dash-blue)', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>
                          {p.codePatient}
                        </span>
                        {p.assure && (
                          <span className={`${c.badge} ${c.badgeVert}`} style={{ fontSize: '0.7rem' }}>
                            Assuré
                          </span>
                        )}
                      </div>

                      <h4 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                        {p.nomComplet}
                      </h4>

                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                        {p.genre ? (feminin ? 'Féminin' : 'Masculin') : 'Genre —'} · {calculerAge(p.dateNaissance)}
                      </p>

                      {p.telephone && (
                        <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <FaPhone style={{ fontSize: '0.7rem' }} /> {p.telephone}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                        <button
                          type="button"
                          className={c.secondaire}
                          style={{ height: 32, fontSize: '0.76rem', padding: '0 12px' }}
                          onClick={() => ouvrirDetail(p.id)}
                        >
                          <FaUser aria-hidden="true" /> Dossier patient
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>
      )}

      {/* =========================================================
          MODAL : FICHE DÉTAILLÉE DU PATIENT
          ========================================================= */}
      {detailModalId !== null && (
        <div className={s.modalBackdrop} onClick={() => setDetailModalId(null)}>
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className={s.iconePatient} style={{ width: 44, height: 44, fontSize: '1.2rem' }}>
                  <FaUser />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    Dossier Médical du Patient
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Informations signalétiques et historique des consultations
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={s.modalClose}
                onClick={() => setDetailModalId(null)}
                aria-label="Fermer"
              >
                <FaTimes />
              </button>
            </div>

            <div className={s.modalBody}>
              {chargementDetail || !patientDetail ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                  Chargement du dossier médical...
                </div>
              ) : (
                <>
                  {/* Coordonnées & État civil */}
                  <div style={{ background: '#ffffff', padding: 18, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <span className={c.surtitre}>N° Dossier Médical</span>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--dash-blue)', fontWeight: 800 }}>
                          {patientDetail.patient.codePatient}
                        </h4>
                      </div>
                      <span className={`${c.badge} ${patientDetail.patient.assure ? c.badgeVert : c.badgeGris}`}>
                        {patientDetail.patient.assure ? 'Patient Assuré' : 'Non Assuré'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Nom &amp; Prénoms</span>
                        <p style={{ margin: '2px 0 0', fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{patientDetail.patient.nomComplet}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Genre / Âge</span>
                        <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: '#0f172a' }}>{patientDetail.patient.genre || '—'} ({calculerAge(patientDetail.patient.dateNaissance)})</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Téléphone</span>
                        <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: '#0f172a' }}>{patientDetail.patient.telephone || '—'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Résidence actuelle</span>
                        <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: '#0f172a' }}>{patientDetail.patient.residence || '—'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>N° CMU</span>
                        <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: '#0f172a' }}>{patientDetail.patient.numCmu || '—'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>N° Assurance</span>
                        <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: '#0f172a' }}>{patientDetail.patient.numeroAssurance || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Historique des Consultations */}
                  <div>
                    <h4 style={{ margin: '0 0 10px', fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FaStethoscope style={{ color: 'var(--dash-blue)' }} />
                      Historique des Consultations ({patientDetail.consultations.length})
                    </h4>
                    <div className={c.tableWrapper}>
                      <table className={c.table}>
                        <thead>
                          <tr>
                            <th>Réf. Consultation</th>
                            <th>Date</th>
                            <th>Motif</th>
                            <th>Médecin</th>
                            <th>Dernières Constantes</th>
                            <th style={{ textAlign: 'center' }}>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patientDetail.consultations.length === 0 ? (
                            <tr>
                              <td colSpan={6} className={c.vide}>
                                Aucune consultation passée enregistrée pour ce patient.
                              </td>
                            </tr>
                          ) : (
                            patientDetail.consultations.map((cons) => (
                              <tr key={cons.id}>
                                <td><strong style={{ color: 'var(--dash-blue)' }}>{cons.code || `#${cons.id}`}</strong></td>
                                <td>{cons.date || '—'}</td>
                                <td>{cons.motif}</td>
                                <td>{cons.medecin}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '0.72rem' }}>
                                    {cons.constantes.ta && <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>TA: {cons.constantes.ta}</span>}
                                    {cons.constantes.temperature && <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>T°: {cons.constantes.temperature}°C</span>}
                                    {cons.constantes.poids && <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>P: {cons.constantes.poids}kg</span>}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`${c.badge} ${cons.statut === 'Terminée' ? c.badgeVert : c.badgeBleu}`}>
                                    {cons.statut}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={s.modalFooter}>
              <button
                type="button"
                className={c.secondaire}
                onClick={() => setDetailModalId(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
