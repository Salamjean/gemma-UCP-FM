import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaClipboardCheck,
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
import Chrono, { delaiExpertise } from '../../Doctor/Telemedecine/Chrono';
import FiltreType, { correspondType, FiltreStatut, type StatutTelemedecine, type TypeTelemedecine } from '../../Doctor/Telemedecine/FiltreType';
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
  // Toutes les télémédecines sont chargées ; le tableau filtre par statut (en attente par défaut)
  const filter = 'all' as const;
  const [statut, setStatut] = useState<StatutTelemedecine>('en-attente');
  const [items, setItems] = useState<InfirmierTeleconsultationItem[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    today: 0,
    upcoming: 0,
    completed: 0,
  });
  const [recherche, setRecherche] = useState('');
  // Toutes / téléconsultations / télé-expertises
  const [typeFiltre, setTypeFiltre] = useState<TypeTelemedecine>('toutes');
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
  }, []);

  const handleLancerAppel = async (item: InfirmierTeleconsultationItem) => {
    // Fenêtre d'appel vidéo LiveKit (centre d'appels de la mise en page)
    setLancementId(item.id);
    lancerAppelVideo(item.id);
    setTimeout(() => setLancementId(null), 1500);
  };

  const filtresRecherche = useMemo(() => {
    const parType = items.filter((it) => correspondType(it.type, typeFiltre) && (statut === 'terminees' ? it.terminee : !it.terminee));
    if (!recherche.trim()) return parType;
    const q = recherche.toLowerCase();
    return parType.filter(
      (it) =>
        it.patient.nom.toLowerCase().includes(q) ||
        it.patient.code.toLowerCase().includes(q) ||
        it.doctor.nom.toLowerCase().includes(q) ||
        it.doctor.hopital.toLowerCase().includes(q) ||
        (it.desiredDate && it.desiredDate.includes(q)) ||
        (it.code && it.code.toLowerCase().includes(q)),
    );
  }, [items, recherche, typeFiltre, statut]);
  // Nombre de séances par statut (avec le filtre de type)
  const parStatut = (fin: boolean) => items.filter((it) => correspondType(it.type, typeFiltre) && it.terminee === fin).length;
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
          {/* Programmation directe : rechercher le patient puis téléconsultation ou télé-expertise */}
          <button type="button" className={c.principal} onClick={() => navigate('/infirmier/teleconsultations/programmer')}>
            <FaCalendarPlus aria-hidden="true" /> Programmer
          </button>
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

          {/* Entre la recherche et le nombre de séances : téléconsultation / télé-expertise */}
          <FiltreType valeur={typeFiltre} onChange={setTypeFiltre} />

          {/* À la place du nombre de séances : statut en attente (par défaut) / terminées */}
          <FiltreStatut valeur={statut} onChange={setStatut} compteurs={{ 'en-attente': chargement ? null : parStatut(false), terminees: chargement ? null : parStatut(true) }} />
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Type</th>
                <th scope="col">Rendez-vous</th>
                <th scope="col">Motif</th>
                <th scope="col">Médecin sollicité</th>
                <th scope="col">Statut</th>
                <th scope="col">Actions</th>
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
                    {recherche ? 'Aucune séance ne correspond à votre recherche.' : statut === 'terminees' ? 'Aucune télémédecine terminée.' : 'Aucune télémédecine en attente.'}
                  </td>
                </tr>
              ) : (
                pg.lignes.map((item) => {
                  const patient = item.patient;
                  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
                  const photo = patient.imgUrl ? (patient.imgUrl.startsWith('http') ? patient.imgUrl : uploadUrl('patient', patient.imgUrl)) : null;
                  const isCallLive = !item.expertise && (item.isCallActive || ['calling', 'in_call', 'accepted'].includes(item.callStatus));
                  const isCompleted = item.terminee;
                  const enRetard = !!item.expertise?.echeance && !isCompleted && new Date(item.expertise.echeance).getTime() < Date.now();

                  return (
                    <tr key={`${item.type}-${item.id}`} style={{ background: isCallLive ? '#fffbeb' : undefined }}>
                      {/* Patient */}
                      <td>
                        <div className={s.patientCell}>
                          {photo ? (
                            <img src={photo} alt="" className={s.avatar} />
                          ) : (
                            <span className={`${s.avatarInitiales} ${feminin ? s.avatarF : ''}`}>{initiales(patient.nom)}</span>
                          )}
                          <div style={{ textAlign: 'left' }}>
                            <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>{patient.nom}</strong>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {patient.code}
                              {patient.telephone && ` · ${patient.telephone}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Type (comme chez le médecin) */}
                      <td>
                        <span className={s.typeLigne}>
                          {item.type === 'teleexpertise' ? (
                            <>
                              <span className={`${c.badge} ${s.badgeExpertise}`}>Télé-expertise {item.expertise?.externe ? 'externe' : 'interne'}</span>
                              <span className={`${c.badge} ${item.expertise?.urgente ? s.badgeUrgente : c.badgeNeutre}`}>{item.expertise?.urgente ? 'Urgente · 30 min' : '24–48 h'}</span>
                            </>
                          ) : item.type === 'urgence' ? (
                            <span className={`${c.badge} ${s.badgeUrgente}`}>Appel d’urgence</span>
                          ) : (
                            <span className={`${c.badge} ${s.badgeTeleconsultation}`}>Téléconsultation</span>
                          )}
                        </span>
                      </td>

                      {/* Rendez-vous + compte à rebours (télé-expertise : jusqu'à l'heure limite de la réponse) */}
                      <td>
                        <span className={s.empile}>
                          <strong>
                            {formatDate(item.desiredDate || item.dateConsultation)}
                            {item.desiredTime ? ` · ${item.desiredTime.slice(0, 5)}` : item.expertise?.urgente ? ' · immédiate' : ''}
                          </strong>
                          {!isCompleted && (
                            <Chrono
                              compact
                              recueLe={item.createdAt}
                              date={item.desiredDate}
                              heure={item.desiredTime}
                              echeance={item.expertise?.echeance}
                              delai={delaiExpertise(item.expertise)}
                            />
                          )}
                        </span>
                      </td>

                      {/* Motif */}
                      <td className={s.motif}>{item.motif || '—'}</td>

                      {/* Médecin sollicité */}
                      <td>
                        <span className={s.empile}>
                          <strong>
                            <FaUserMd style={{ color: '#059669' }} aria-hidden="true" /> {item.doctor.nom}
                          </strong>
                          <small>
                            <FaHospital style={{ color: '#94a3b8' }} aria-hidden="true" /> {item.doctor.hopital}
                          </small>
                        </span>
                      </td>

                      {/* Statut */}
                      <td>
                        {item.expertise?.resultatLe ? (
                          <span className={`${c.badge} ${c.badgeVert}`}>Réponse reçue</span>
                        ) : isCompleted ? (
                          <span className={`${c.badge} ${c.badgeVert}`}>Terminée</span>
                        ) : isCallLive ? (
                          <span className={`${c.badge} ${c.badgeOrange}`} style={{ animation: 'pulseAppel 1.5s infinite' }}>
                            Appel en cours
                          </span>
                        ) : enRetard ? (
                          <span className={`${c.badge} ${s.badgeUrgente}`}>En retard</span>
                        ) : (
                          <span className={`${c.badge} ${c.badgeBleu}`}>{item.expertise ? 'En attente de l’avis' : 'En attente'}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {item.expertise ? (
                            // Télé-expertise : pas d'appel, suivi du délai et du résultat de l'expert
                            <button
                              type="button"
                              className={item.expertise.resultatLe ? c.principal : c.secondaire}
                              style={{ height: 34, padding: '0 12px', fontSize: '0.78rem' }}
                              onClick={() => navigate(`/infirmier/resultats-expertise/${item.id}`)}
                            >
                              <FaClipboardCheck aria-hidden="true" /> {item.expertise.resultatLe ? 'Voir la réponse' : 'Suivre'}
                            </button>
                          ) : (
                            <>
                              {!isCompleted && (
                                <button
                                  type="button"
                                  className={`${s.btnLancerAppel} ${isCallLive ? s.btnAppelActif : ''}`}
                                  onClick={() => handleLancerAppel(item)}
                                  disabled={lancementId === item.id}
                                >
                                  <FaVideo aria-hidden="true" />
                                  {lancementId === item.id ? 'Connexion…' : isCallLive ? 'Rejoindre' : 'Appeler'}
                                </button>
                              )}
                              <button
                                type="button"
                                className={c.secondaire}
                                style={{ height: 34, padding: '0 10px', fontSize: '0.78rem' }}
                                title="Voir la fiche"
                                onClick={() => navigate(`/infirmier/consultations/formulaire/${item.id}`)}
                              >
                                <FaStethoscope aria-hidden="true" />
                              </button>
                            </>
                          )}
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
