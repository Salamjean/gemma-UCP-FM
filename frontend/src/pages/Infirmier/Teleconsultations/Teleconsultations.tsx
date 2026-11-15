import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaCalendarAlt,
  FaCalendarCheck,
  FaCalendarDay,
  FaCalendarPlus,
  FaCheckCircle,
  FaClock,
  FaHeadset,
  FaHospital,
  FaPhoneAlt,
  FaRedo,
  FaSearch,
  FaStethoscope,
  FaUser,
  FaUserMd,
  FaVideo,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierTeleconsultationItem } from '../../../types';
import { lancerAppelVideo } from '../../../components/AppelVideo';
import s from './Teleconsultations.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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
 * INFIRMIER > PROGRAMME DES TÉLÉCONSULTATIONS
 * Équivalent Laravel : infirmier.consultation.teleconsultations
 */
export default function Teleconsultations() {
  const navigate = useNavigate();

  const [chargement, setChargement] = useState(true);
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming' | 'completed'>('all');
  const [items, setItems] = useState<InfirmierTeleconsultationItem[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    today: 0,
    upcoming: 0,
    completed: 0,
  });
  const [recherche, setRecherche] = useState('');
  const [lancementId, setLancementId] = useState<number | null>(null);

  const charger = async (f = filter) => {
    setChargement(true);
    try {
      const res = await api.infirmier.teleconsultations.list(f);
      setItems(res.teleconsultations);
      setCounts(res.counts);
    } catch (e) {
      alerte.echec(`Erreur de chargement de la télémédecine : ${messageErreur(e)}`);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger(filter);
  }, [filter]);

  const handleLancerAppel = async (item: InfirmierTeleconsultationItem) => {
    // Fenêtre d'appel vidéo LiveKit (centre d'appels de la mise en page)
    setLancementId(item.id);
    lancerAppelVideo(item.id);
    setTimeout(() => setLancementId(null), 1500);
  };

  const filtresRecherche = useMemo(() => {
    if (!recherche.trim()) return items;
    const q = recherche.toLowerCase();
    return items.filter(
      (it) =>
        it.patient.nom.toLowerCase().includes(q) ||
        it.patient.code.toLowerCase().includes(q) ||
        it.doctor.nom.toLowerCase().includes(q) ||
        it.doctor.hopital.toLowerCase().includes(q) ||
        (it.desiredDate && it.desiredDate.includes(q)) ||
        (it.code && it.code.toLowerCase().includes(q)),
    );
  }, [items, recherche]);
  const pg = usePagination(filtresRecherche);

  return (
    <div className={c.page}>
      {/* En-tête */}
      <header className={s.entete}>
        <div className={s.enteteGauche}>
          <div className={s.iconeCasque}>
            <FaHeadset aria-hidden="true" />
          </div>
          <div>
            <p className={c.surtitre}>Espace Infirmier · Télémédecine</p>
            <h1 className={c.titre} style={{ margin: 0 }}>Programme de télémédecine</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              File partagée des séances de visioconférence programmées avec les médecins hospitaliers.
            </p>
          </div>
        </div>
        <div className={c.boutons}>
          <button
            type="button"
            className={c.secondaire}
            onClick={() => charger(filter)}
            disabled={chargement}
          >
            <FaRedo aria-hidden="true" /> Actualiser
          </button>
        </div>
      </header>

      {/* Cartes de statistiques et filtres d'état */}
      <div className={s.cartesGrille}>
        {/* 1. Aujourd'hui */}
        <div
          className={`${s.carteFiltre} ${filter === 'today' ? s.carteFiltreActive : ''}`}
          onClick={() => setFilter('today')}
        >
          <div className={s.carteFiltreEntete}>
            <span className={s.carteLabel}>Aujourd'hui</span>
            <div className={`${s.carteIcone} ${s.iconeViolet}`}>
              <FaCalendarDay />
            </div>
          </div>
          <div className={s.carteValeur}>
            <span className={s.carteNombre}>{counts.today}</span>
            <span className={s.carteLegende}>séance(s) ce jour</span>
          </div>
        </div>

        {/* 2. À venir */}
        <div
          className={`${s.carteFiltre} ${filter === 'upcoming' ? s.carteFiltreActive : ''}`}
          onClick={() => setFilter('upcoming')}
        >
          <div className={s.carteFiltreEntete}>
            <span className={s.carteLabel}>À Venir</span>
            <div className={`${s.carteIcone} ${s.iconeBleu}`}>
              <FaCalendarPlus />
            </div>
          </div>
          <div className={s.carteValeur}>
            <span className={s.carteNombre}>{counts.upcoming}</span>
            <span className={s.carteLegende}>programmée(s)</span>
          </div>
        </div>

        {/* 3. Toutes */}
        <div
          className={`${s.carteFiltre} ${filter === 'all' ? s.carteFiltreActive : ''}`}
          onClick={() => setFilter('all')}
        >
          <div className={s.carteFiltreEntete}>
            <span className={s.carteLabel}>Toutes</span>
            <div className={`${s.carteIcone} ${s.iconeVert}`}>
              <FaCalendarAlt />
            </div>
          </div>
          <div className={s.carteValeur}>
            <span className={s.carteNombre}>{counts.all}</span>
            <span className={s.carteLegende}>au total</span>
          </div>
        </div>

        {/* 4. Terminées */}
        <div
          className={`${s.carteFiltre} ${filter === 'completed' ? s.carteFiltreActive : ''}`}
          onClick={() => setFilter('completed')}
        >
          <div className={s.carteFiltreEntete}>
            <span className={s.carteLabel}>Terminées</span>
            <div className={`${s.carteIcone} ${s.iconeGris}`}>
              <FaCalendarCheck />
            </div>
          </div>
          <div className={s.carteValeur}>
            <span className={s.carteNombre}>{counts.completed}</span>
            <span className={s.carteLegende}>clôturée(s)</span>
          </div>
        </div>
      </div>

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
              placeholder="Rechercher par patient, N° dossier, médecin ou établissement..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', color: '#64748b' }}>
            <span>
              <strong>{filtresRecherche.length}</strong> séance(s) de télémédecine
            </span>
          </div>
        </div>

        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Date &amp; Heure</th>
                <th>Médecin Destinataire</th>
                <th>Constantes Vitales</th>
                <th>Infirmier Référent</th>
                <th style={{ textAlign: 'center' }}>Statut</th>
                <th style={{ textAlign: 'center' }}>Action Visioconférence</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr>
                  <td colSpan={7} className={c.vide}>
                    Chargement de la télémédecine en cours...
                  </td>
                </tr>
              ) : filtresRecherche.length === 0 ? (
                <tr>
                  <td colSpan={7} className={c.vide}>
                    {recherche
                      ? 'Aucune séance ne correspond à votre recherche.'
                      : 'Aucune séance de télémédecine pour ce filtre.'}
                  </td>
                </tr>
              ) : (
                pg.lignes.map((item) => {
                  const patient = item.patient;
                  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
                  const photo = patient.imgUrl
                    ? patient.imgUrl.startsWith('http')
                      ? patient.imgUrl
                      : uploadUrl('patient', patient.imgUrl)
                    : null;

                  const isCallLive = item.isCallActive || ['calling', 'in_call', 'accepted'].includes(item.callStatus);
                  const isCompleted = item.terminee;

                  return (
                    <tr key={item.id} style={{ background: isCallLive ? '#fffbeb' : undefined }}>
                      {/* Patient */}
                      <td>
                        <div className={s.patientCell}>
                          {photo ? (
                            <img src={photo} alt="" className={s.avatar} />
                          ) : (
                            <span className={`${s.avatarInitiales} ${feminin ? s.avatarF : ''}`}>
                              {initiales(patient.nom)}
                            </span>
                          )}
                          <div>
                            <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>
                              {patient.nom}
                            </strong>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              N° Dossier : <strong>{patient.code}</strong>
                              {patient.telephone && ` · ${patient.telephone}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Date & Heure */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FaCalendarAlt style={{ color: 'var(--dash-blue)' }} />
                            {formatDate(item.desiredDate || item.dateConsultation)}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FaClock style={{ color: '#94a3b8' }} />
                            {item.desiredTime || 'Non précisée'}
                          </span>
                        </div>
                      </td>

                      {/* Médecin Destinataire */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FaUserMd style={{ color: '#059669' }} />
                            {item.doctor.nom}
                          </span>
                          <span style={{ fontSize: '0.76rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FaHospital style={{ color: '#94a3b8' }} />
                            {item.doctor.hopital}
                          </span>
                        </div>
                      </td>

                      {/* Constantes Physiques */}
                      <td>
                        <div className={s.constantesGrid}>
                          {item.constantes.tensionArterielle && (
                            <span className={s.badgeConstante}>
                              TA: <strong>{item.constantes.tensionArterielle}</strong>
                            </span>
                          )}
                          {item.constantes.temperature && (
                            <span className={s.badgeConstante}>
                              T°: <strong>{item.constantes.temperature}°C</strong>
                            </span>
                          )}
                          {item.constantes.pouls && (
                            <span className={s.badgeConstante}>
                              P: <strong>{item.constantes.pouls} bpm</strong>
                            </span>
                          )}
                          {item.constantes.poids && (
                            <span className={s.badgeConstante}>
                              Poids: <strong>{item.constantes.poids} kg</strong>
                            </span>
                          )}
                          {!item.constantes.tensionArterielle &&
                            !item.constantes.temperature &&
                            !item.constantes.poids && (
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Non renseignées</span>
                            )}
                        </div>
                      </td>

                      {/* Infirmier Référent */}
                      <td>
                        <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                          {item.infirmierNom}
                        </span>
                      </td>

                      {/* Statut */}
                      <td style={{ textAlign: 'center' }}>
                        {isCompleted ? (
                          <span className={`${c.badge} ${c.badgeVert}`}>
                            Terminée
                          </span>
                        ) : isCallLive ? (
                          <span className={`${c.badge} ${c.badgeOrange}`} style={{ animation: 'pulseAppel 1.5s infinite' }}>
                            Appel en cours
                          </span>
                        ) : (
                          <span className={`${c.badge} ${c.badgeBleu}`}>
                            En attente
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {!isCompleted && (
                            <button
                              type="button"
                              className={`${s.btnLancerAppel} ${isCallLive ? s.btnAppelActif : ''}`}
                              onClick={() => handleLancerAppel(item)}
                              disabled={lancementId === item.id}
                            >
                              <FaVideo aria-hidden="true" />
                              {lancementId === item.id
                                ? 'Connexion…'
                                : isCallLive
                                  ? 'Rejoindre visioconférence'
                                  : 'Lancer l’appel'}
                            </button>
                          )}

                          <button
                            type="button"
                            className={c.secondaire}
                            style={{ height: 34, padding: '0 10px', fontSize: '0.78rem' }}
                            title="Voir la fiche de prise de constantes"
                            onClick={() => navigate(`/infirmier/consultations/formulaire/${item.id}`)}
                          >
                            <FaStethoscope aria-hidden="true" />
                          </button>
                        </div>
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
    </div>
  );
}
