import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaEye,
  FaIdCard,
  FaPhone,
  FaRedo,
  FaSearch,
  FaStethoscope,
  FaUser,
  FaUsers,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type {
  InfirmierPatientItem,
} from '../../../types';
import s from './GestionPatients.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * INFIRMIER > GESTION PATIENTS > LISTE DES PATIENTS
 * Équivalent Laravel : secretariat.patient.list (list.blade.php)
 */
export default function ListePatients() {
  const navigate = useNavigate();

  const [chargement, setChargement] = useState(true);
  const [patients, setPatients] = useState<InfirmierPatientItem[]>([]);
  const [recherche, setRecherche] = useState('');

  // Modal détail patient

  const charger = async () => {
    setChargement(true);
    try {
      const res = await api.infirmier.patients.liste();
      setPatients(res);
    } catch (e) {
      alerte.echec(`Erreur lors du chargement des patients : ${messageErreur(e)}`);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);


  const filtres = useMemo(() => {
    if (!recherche.trim()) return patients;
    const q = recherche.toLowerCase();
    return patients.filter(
      (p) =>
        p.nomComplet.toLowerCase().includes(q) ||
        p.codePatient.toLowerCase().includes(q) ||
        (p.telephone && p.telephone.includes(q)) ||
        (p.numCmu && p.numCmu.includes(q)) ||
        (p.residence && p.residence.toLowerCase().includes(q)),
    );
  }, [patients, recherche]);
  const pg = usePagination(filtres);

  return (
    <div className={c.page}>
      {/* En-tête */}
      <header className={s.entete}>
        <div className={s.enteteGauche}>
          <div className={s.iconePatient}>
            <FaUsers aria-hidden="true" />
          </div>
          <div>
            <p className={c.surtitre}>Espace Infirmier · Gestion Patients</p>
            <h1 className={c.titre} style={{ margin: 0 }}>Registre Général des Patients</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Consultez l'annuaire des patients enregistrés dans l'établissement et accédez à leurs dossiers.
            </p>
          </div>
        </div>
        <div className={c.boutons}>
          <button
            type="button"
            className={c.principal}
            onClick={() => navigate('/infirmier/patients/rechercher')}
          >
            <FaSearch aria-hidden="true" /> Vérifier / Rechercher
          </button>
          <button
            type="button"
            className={c.secondaire}
            onClick={charger}
            disabled={chargement}
          >
            <FaRedo aria-hidden="true" /> Actualiser
          </button>
        </div>
      </header>

      {/* Tableau Principal */}
      <motion.section
        className={c.bloc}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={s.barreOutils}>
          <div className={s.recherche}>
            <svg
              className={s.rechercheIcone}
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Filtrer par nom, N° dossier, téléphone ou CMU..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', color: '#64748b' }}>
            <span>
              <strong>{filtres.length}</strong> patient(s) affiché(s)
            </span>
          </div>
        </div>

        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr>
                <th>N° Dossier</th>
                <th>Patient</th>
                <th>Genre</th>
                <th>Âge</th>
                <th>Contact Tél.</th>
                <th>Résidence</th>
                <th>CMU / Assurance</th>
                <th>Inscrit le</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr>
                  <td colSpan={9} className={c.vide}>
                    Chargement de la liste des patients...
                  </td>
                </tr>
              ) : filtres.length === 0 ? (
                <tr>
                  <td colSpan={9} className={c.vide}>
                    {recherche
                      ? 'Aucun patient ne correspond à ce filtre.'
                      : 'Aucun patient enregistré dans l’établissement.'}
                  </td>
                </tr>
              ) : (
                pg.lignes.map((p) => {
                  const feminin = (p.genre ?? '').toLowerCase().startsWith('f');
                  const photo = p.imgUrl
                    ? p.imgUrl.startsWith('http')
                      ? p.imgUrl
                      : uploadUrl('patient', p.imgUrl)
                    : null;

                  return (
                    <tr key={p.id}>
                      {/* N° Dossier */}
                      <td>
                        <strong style={{ color: 'var(--dash-blue)', fontSize: '0.88rem' }}>
                          {p.codePatient}
                        </strong>
                      </td>

                      {/* Patient */}
                      <td>
                        <div className={s.patientCell}>
                          {photo ? (
                            <img src={photo} alt="" className={s.avatar} />
                          ) : (
                            <span className={`${s.avatarInitiales} ${feminin ? s.avatarF : ''}`}>
                              {initiales(p.nomComplet)}
                            </span>
                          )}
                          <div>
                            <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>
                              {p.nomComplet}
                            </strong>
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              {p.profession || 'Sans profession'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Genre */}
                      <td>
                        <span style={{ fontSize: '0.82rem', color: '#334155' }}>
                          {p.genre ? (feminin ? 'Féminin' : 'Masculin') : '—'}
                        </span>
                      </td>

                      {/* Âge */}
                      <td>
                        <span style={{ fontSize: '0.82rem', color: '#334155' }}>
                          {calculerAge(p.dateNaissance)}
                        </span>
                      </td>

                      {/* Téléphone */}
                      <td>
                        <span style={{ fontSize: '0.82rem', color: '#0f172a' }}>
                          {p.telephone || '—'}
                        </span>
                      </td>

                      {/* Résidence */}
                      <td>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          {p.residence || '—'}
                        </span>
                      </td>

                      {/* CMU / Assurance */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {p.numCmu && (
                            <span style={{ fontSize: '0.75rem', color: '#0f172a' }}>
                              CMU : <strong>{p.numCmu}</strong>
                            </span>
                          )}
                          {p.assure ? (
                            <span className={`${c.badge} ${c.badgeVert}`} style={{ fontSize: '0.68rem', width: 'fit-content' }}>
                              Assuré
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Non assuré</span>
                          )}
                        </div>
                      </td>

                      {/* Date d'inscription */}
                      <td>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {formatDate(p.createdAt)}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={c.secondaire}
                          style={{ height: 32, padding: '0 10px', fontSize: '0.78rem' }}
                          title="Consulter le dossier médical"
                          onClick={() => navigate(`/infirmier/patients/${p.id}/dossier`)}
                        >
                          <FaEye aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationTableau pagination={pg} />
      </motion.section>

      {/* =========================================================
          MODAL : FICHE DÉTAILLÉE DU PATIENT
          ========================================================= */}
    </div>
  );
}
