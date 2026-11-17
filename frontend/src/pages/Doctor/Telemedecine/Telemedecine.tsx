import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaSearch, FaCalendarPlus, FaEye, FaFolderOpen, FaHandHoldingMedical, FaPhoneAlt, FaPlay, FaShareSquare, FaSyncAlt, FaVideo } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { lancerAppelVideo } from '../../../components/AppelVideo';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorTelemedecineItem, DoctorTelemedecines, ExpertiseDisponible } from '../../../types';
import Chrono, { delaiExpertise } from './Chrono';
import FiltreType, { correspondType, FiltreStatut, type TypeTelemedecine } from './FiltreType';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient } from '../Consultations/ListeConsultations';
import tab from '../Consultations/Consultations.module.css';
import { libelleDate } from './CarteTelemedecine';
import s from './Telemedecine.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

const p2 = (n: number) => String(n).padStart(2, '0');
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

/** Statut d'une télémédecine : appel en cours, terminée, en retard ou en attente */
function Statut({ item }: { item: DoctorTelemedecineItem }) {
  if (item.appelEnCours && !item.terminee)
    return (
      <span className={`${c.badge} ${s.badgeAppel}`}>
        <FaVideo aria-hidden="true" /> Appel en cours
      </span>
    );
  if (item.terminee) return <span className={`${c.badge} ${c.badgeOk}`}>{item.issue ?? 'Terminée'}</span>;
  if (item.date && item.date < aujourdhui()) return <span className={`${c.badge} ${s.badgeRetard}`}>En retard</span>;
  return <span className={`${c.badge} ${s.badgeAttente}`}>En attente</span>;
}

/** Type de la demande */
/** Délai de réponse d'une télé-expertise : urgente (< 30 min) ou programmée (24 à 48 h) */
export function BadgeDelai({ urgente }: { urgente: boolean }) {
  return urgente ? <span className={`${c.badge} ${s.badgeRetard}`}>Urgente · 30 min</span> : <span className={`${c.badge} ${c.badgeNeutre}`}>24–48 h</span>;
}

export function BadgeType({ item }: { item: DoctorTelemedecineItem }) {
  if (item.type === 'teleexpertise')
    return (
      <>
        <span className={`${c.badge} ${s.badgeExpertise}`}>Télé-expertise{item.expertise ? (item.expertise.externe ? ' externe' : ' interne') : ''}</span>
        {item.expertise && <BadgeDelai urgente={item.expertise.urgente} />}
      </>
    );
  if (item.type === 'urgence') return <span className={`${c.badge} ${s.badgeRetard}`}>Appel d’urgence</span>;
  return <span className={`${c.badge} ${s.badgeType}`}>Téléconsultation</span>;
}

/**
 * MÉDECIN > TÉLÉMÉDECINE : téléconsultations, appels d'urgence et télé-expertises (internes, et externes prises en charge),
 * plus les télé-expertises externes adressées à mon service, à prendre en charge.
 *
 * MÉDECIN > TÉLÉMÉDECINE (remplace « Appels vidéo HD »)
 * Télémédecines programmées par l'infirmier (orientation « Télémédecine ») ou demandées en ligne par le patient,
 * attribuées au médecin connecté. Chaque carte ouvre le formulaire de consultation.
 */
export default function Telemedecine() {
  const [filtre, setFiltre] = useState('en-attente');
  const [data, setData] = useState<DoctorTelemedecines | null>(null);
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();
  // Télé-expertises externes de mon service, pas encore prises en charge
  const [disponibles, setDisponibles] = useState<ExpertiseDisponible[] | null>(null);
  const [prise, setPrise] = useState<number | null>(null);

  useEffect(() => {
    api.doctor.referes
      .disponibles()
      .then(setDisponibles)
      .catch(() => setDisponibles([]));
  }, [tick]);

  const prendreEnCharge = async (x: ExpertiseDisponible) => {
    if (!window.confirm(`Prendre en charge la télé-expertise de ${x.patient.nom} ? Elle vous sera attribuée.`)) return;
    setPrise(x.origineId);
    try {
      const r = await api.doctor.referes.prendreEnCharge(x.origineId);
      alerte.succes(r.message);
      navigate(`/medecin/consultations/${r.consultationId}`);
    } catch (e) {
      alerte.echec(messageErreur(e));
      setTick((t) => t + 1);
    } finally {
      setPrise(null);
    }
  };

  useEffect(() => {
    let actif = true;
    api.doctor
      .telemedecines(filtre)
      .then((d) => {
        if (actif) setData(d);
      })
      .catch((e) => {
        if (actif) alerte.echec(`Impossible de charger les télémédecines : ${messageErreur(e)}`);
      });
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [filtre, tick]);

  // Recherche + bascule Toutes / Téléconsultation / Télé-expertise
  const [recherche, setRecherche] = useState('');
  const [typeFiltre, setTypeFiltre] = useState<TypeTelemedecine>('toutes');
  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (data?.liste ?? [])
      .filter((x) => correspondType(x.type, typeFiltre))
      .filter((x) => !q || [x.patient.nom, x.patient.code, x.motif, x.infirmier ?? '', x.hopitalDemandeur ?? ''].some((v) => String(v).toLowerCase().includes(q)));
  }, [data, recherche, typeFiltre]);

  // Tableaux : 10 lignes par page
  const pg = usePagination(liste);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Télémédecine</p>
          <h1 className={c.titre}>Mes télémédecines</h1>
        </div>
        <div className={c.boutons}>
          {/* Programmation directe : rechercher le patient puis téléconsultation ou télé-expertise */}
          <Link to="/medecin/telemedecine/programmer" className={c.principal}>
            <FaCalendarPlus aria-hidden="true" /> Programmer
          </Link>
          <button type="button" className={c.secondaire} onClick={() => setTick((x) => x + 1)}>
            <FaSyncAlt aria-hidden="true" /> Actualiser
          </button>
        </div>
      </header>

      {!!disponibles?.length && (
        <section className={c.bloc}>
          <h2 className={s.titreSection}>
            <FaShareSquare aria-hidden="true" /> Télé-expertises externes à prendre en charge <span>{disponibles.length}</span>
          </h2>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Demande</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Demandée par</th>
                  <th scope="col">Documents</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {disponibles.map((x) => (
                  <tr key={x.origineId}>
                    <td>
                      <span className={tab.patient}>
                        <AvatarPatient patient={x.patient} />
                        <span>
                          <strong>{x.patient.nom}</strong>
                          <small>{x.patient.code}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <BadgeDelai urgente={x.urgente} />
                      <Chrono recueLe={x.recueLe} date={x.datePrevue} heure={x.heurePrevue} echeance={x.echeance} delai={delaiExpertise(x)} />
                    </td>
                    <td className={tab.motif}>{x.motif ?? '—'}</td>
                    <td>
                      <span className={tab.empile}>
                        <strong>{x.referePar ?? '—'}</strong>
                        {x.hopital && <small>{x.hopital}</small>}
                      </span>
                    </td>
                    <td>{x.documents}</td>
                    <td>
                      <span className={s.actionsLigne}>
                        <Link to={`/medecin/referes/${x.origineId}`} className={`${c.secondaire} ${tab.action}`}>
                          <FaFolderOpen aria-hidden="true" /> Voir
                        </Link>
                        <button type="button" className={`${c.principal} ${tab.action}`} onClick={() => prendreEnCharge(x)} disabled={prise === x.origineId}>
                          <FaHandHoldingMedical aria-hidden="true" /> {prise === x.origineId ? 'Attribution…' : 'Prendre en charge'}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={c.bloc}>
        {/* Recherche · type (téléconsultation / télé-expertise) · nombre de séances */}
        <div className={s.barreOutils}>
          <label className={s.rechercheListe}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Rechercher par patient, N° dossier, motif ou demandeur…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher" />
          </label>
          <FiltreType valeur={typeFiltre} onChange={setTypeFiltre} />
          {/* À la place du nombre de séances : statut en attente (par défaut) / terminées */}
          <FiltreStatut
            valeur={filtre === 'terminees' ? 'terminees' : 'en-attente'}
            onChange={setFiltre}
            compteurs={{ 'en-attente': data?.compteurs.enAttente ?? null, terminees: data?.compteurs.terminees ?? null }}
          />
        </div>

        {!data ? (
          <p className={c.vide}>Chargement…</p>
        ) : liste.length === 0 ? (
          <div className={s.vide}>
            <FaVideo aria-hidden="true" />
            <strong>
              {recherche || typeFiltre !== 'toutes'
                ? 'Aucune télémédecine ne correspond à ce filtre'
                : filtre === 'terminees'
                  ? 'Aucune télémédecine terminée'
                  : 'Aucune télémédecine en attente'}
            </strong>
            <p>Les téléconsultations et télé-expertises qui vous sont adressées apparaîtront ici.</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Type</th>
                  <th scope="col">Rendez-vous</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Demandée par</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((x, i) => (
                  <motion.tr key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                    <td>
                      <span className={tab.patient}>
                        <AvatarPatient patient={x.patient} />
                        <span>
                          <strong>{x.patient.nom}</strong>
                          <small>
                            {x.patient.code}
                            {age(x.patient.dateNaissance) ? ` · ${age(x.patient.dateNaissance)}` : ''}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <BadgeType item={x} />
                    </td>
                    <td>
                      <span className={tab.empile}>
                        <strong className={!x.terminee && !!x.date && x.date < aujourdhui() ? s.retard : undefined}>
                          {libelleDate(x.date)}
                          {x.heure ? ` · ${x.heure}` : ''}
                        </strong>
                        {!x.terminee && <Chrono compact recueLe={x.creeLe} date={x.date} heure={x.heure} echeance={x.expertise?.echeance} delai={delaiExpertise(x.expertise)} />}
                      </span>
                    </td>
                    <td className={tab.motif}>{x.motif}</td>
                    <td>
                      <span className={tab.empile}>
                        <strong>{x.infirmier ?? 'Demande en ligne'}</strong>
                        {x.hopitalDemandeur && <small>{x.hopitalDemandeur}</small>}
                      </span>
                    </td>
                    <td>
                      <span className={tab.statuts}>
                        {x.urgence && <span className={`${c.badge} ${tab.badgeUrgence}`}>Urgence</span>}
                        <Statut item={x} />
                      </span>
                    </td>
                    <td>
                      <span className={s.actionsLigne}>
                        {/* Télé-expertise : un seul bouton → les informations (demande, documents partagés), puis « Continuer » */}
                        {x.expertise ? (
                          <Link
                            // Résultat envoyé : page du résultat (avis, consignes, documents — complétables) ; sinon les informations de la demande
                            // Programmée (ou résultat envoyé) : page du résultat (demande + champs du résultat) ; urgente : informations puis consultation
                            to={x.expertise.resultatLe || !x.expertise.avecConsultation ? `/medecin/referes/${x.expertise.origineId}/resultat` : `/medecin/referes/${x.expertise.origineId}`}
                            className={`${x.terminee ? c.secondaire : c.principal} ${tab.action}`}
                          >
                            <FaFolderOpen aria-hidden="true" />{' '}
                            {x.expertise.resultatLe ? 'Voir le résultat' : x.terminee ? 'Voir' : x.expertise.avecConsultation ? 'Consulter les informations' : 'Joindre le résultat'}
                          </Link>
                        ) : (
                        <>
                        {!x.terminee && (
                          <button type="button" className={`${c.secondaire} ${tab.action} ${x.appelEnCours ? s.boutonAppelActif : ''}`} onClick={() => lancerAppelVideo(x.id)}>
                            <FaPhoneAlt aria-hidden="true" /> {x.appelEnCours ? 'Rejoindre' : 'Appeler'}
                          </button>
                        )}
                        <Link to={`/medecin/consultations/${x.id}`} className={`${x.terminee ? c.secondaire : c.principal} ${tab.action}`}>
                          {x.terminee ? (
                            <>
                              <FaEye aria-hidden="true" /> Voir
                            </>
                          ) : (
                            <>
                              <FaPlay aria-hidden="true" /> Consulter
                            </>
                          )}
                        </Link>
                        </>
                        )}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationTableau pagination={pg} />
          </>
        )}
      </section>
    </div>
  );
}
