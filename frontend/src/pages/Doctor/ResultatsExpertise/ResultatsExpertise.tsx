import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaArrowLeft, FaClipboardCheck, FaEye, FaHospitalAlt, FaSearch, FaUserMd } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PaginationTableau, usePagination } from '../../../components/Pagination';
import { alerte, messageErreur } from '../../../services/alertes';
import { apiResultatsExpertise } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { ResultatExpertiseDetail, ResultatExpertiseItem } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient, heure, jour } from '../Consultations/ListeConsultations';
import { ContenuResultat } from '../Referes/ResultatExpert';
import Chrono, { delaiExpertise } from '../Telemedecine/Chrono';
import { BadgeDelai } from '../Telemedecine/Telemedecine';
import s from './ResultatsExpertise.module.css';

type Espace = 'medecin' | 'infirmier';
const racine = (espace: Espace) => (espace === 'infirmier' ? '/infirmier/resultats-expertise' : '/medecin/resultats-expertise');

/** État d'une télé-expertise demandée */
function BadgeEtat({ x }: { x: ResultatExpertiseItem }) {
  if (x.etat === 'recu')
    return <span className={`${c.badge} ${x.lu ? c.badgeOk : s.badgeNouveau}`}>{x.lu ? 'Réponse reçue' : 'Nouvelle réponse'}</span>;
  if (x.etat === 'termine') return <span className={`${c.badge} ${c.badgeNeutre}`}>Terminée sans réponse</span>;
  if (x.etat === 'retard') return <span className={`${c.badge} ${s.badgeRetard}`}>En retard</span>;
  return <span className={`${c.badge} ${c.badgeNeutre}`}>En attente</span>;
}

/**
 * MÉDECIN / INFIRMIER·ÈRE > RÉSULTATS D'EXPERTISE
 * Télé-expertises demandées depuis mes consultations : expert, type (urgente < 30 min / programmée 24 à 48 h),
 * compte à rebours jusqu'à l'heure limite, et résultat joint par l'expert (nouveaux résultats en premier).
 */
export function ResultatsExpertise({ espace }: { espace: Espace }) {
  const api = apiResultatsExpertise(espace);
  const [liste, setListe] = useState<ResultatExpertiseItem[] | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    let actif = true;
    const lire = () =>
      api
        .liste()
        .then((l) => actif && setListe(l))
        .catch((e) => {
          if (!actif) return;
          setListe((p) => p ?? []);
          alerte.echec(`Impossible de charger les réponses : ${messageErreur(e)}`);
        });
    lire();
    const t = setInterval(lire, 30000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [espace]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!liste || !q) return liste ?? [];
    return liste.filter((x) => [x.patient.nom, x.patient.code, x.code, x.expert ?? '', x.service ?? '', x.hopital ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [liste, recherche]);
  const pg = usePagination(filtres);
  const compte = (e: ResultatExpertiseItem['etat']) => (liste ?? []).filter((x) => x.etat === e).length;

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Télé-expertise</p>
          <h1 className={c.titre}>Réponses d’expertise</h1>
        </div>
      </header>

      <div className={s.compteurs}>
        {[
          { libelle: 'Nouvelles réponses', valeur: (liste ?? []).filter((x) => x.etat === 'recu' && !x.lu).length },
          { libelle: 'En attente', valeur: compte('attente') },
          { libelle: 'En retard', valeur: compte('retard') },
          { libelle: 'Réponses reçues', valeur: compte('recu') },
        ].map((k) => (
          <div key={k.libelle} className={s.compteur}>
            <span>{k.libelle}</span>
            <strong>{liste ? k.valeur : '—'}</strong>
          </div>
        ))}
      </div>

      <section className={c.bloc}>
        <div className={s.barre}>
          <div className={s.recherche}>
            <FaSearch aria-hidden="true" />
            <input placeholder="Rechercher par patient, expert, service…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher" />
          </div>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Demande</th>
                <th scope="col">Expert</th>
                <th scope="col">Délai</th>
                <th scope="col">État</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.lignes.map((x, i) => (
                <motion.tr key={x.origineId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                  <td>
                    <span className={s.patient}>
                      <AvatarPatient patient={x.patient} />
                      <span>
                        <strong>{x.patient.nom}</strong>
                        <small>
                          {x.patient.code} · {age(x.patient.dateNaissance) ?? 'Âge inconnu'}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={s.empile}>
                      <strong>Télé-expertise {x.externe ? 'externe' : 'interne'}</strong>
                      <small>{x.demandeLe ? `${jour(x.demandeLe)} à ${heure(x.demandeLe)}` : '—'}</small>
                    </span>
                  </td>
                  <td>
                    <span className={s.empile}>
                      <strong>{x.expert ?? (x.externe ? 'Pas encore pris en charge' : '—')}</strong>
                      <small>{[x.service, x.hopital].filter(Boolean).join(' · ') || '—'}</small>
                    </span>
                  </td>
                  <td>
                    <span className={s.empile}>
                      <BadgeDelai urgente={x.urgente} />
                      {(x.etat === 'attente' || x.etat === 'retard') && <Chrono compact recueLe={null} date={null} heure={null} echeance={x.echeance} delai={delaiExpertise(x)} />}
                    </span>
                  </td>
                  <td>
                    <span className={s.empile}>
                      <BadgeEtat x={x} />
                      {x.etat === 'recu' && x.resultatLe && <small>le {jour(x.resultatLe)} à {heure(x.resultatLe)}</small>}
                    </span>
                  </td>
                  <td>
                    <Link to={`${racine(espace)}/${x.origineId}`} className={x.etat === 'recu' && !x.lu ? c.principal : c.secondaire}>
                      <FaEye aria-hidden="true" /> {x.etat === 'recu' ? 'Voir la réponse' : 'Voir'}
                    </Link>
                  </td>
                </motion.tr>
              ))}
              {liste && filtres.length === 0 && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    {liste.length ? 'Aucune télé-expertise ne correspond à votre recherche.' : 'Aucune télé-expertise demandée pour l’instant.'}
                  </td>
                </tr>
              )}
              {!liste && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    Chargement…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationTableau pagination={pg} />
      </section>
    </div>
  );
}

/** Fiche : demande, délai, et résultat de l'expert (ouvrir la fiche marque le résultat comme lu) */
export function ResultatExpertiseFiche({ espace }: { espace: Espace }) {
  const api = apiResultatsExpertise(espace);
  const { origineId } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState<ResultatExpertiseDetail | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    api
      .detail(Number(origineId))
      .then(setD)
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible d’ouvrir la réponse : ${messageErreur(e)}`);
      });
  }, [origineId, espace]);

  const entete = (
    <header className={c.entete}>
      <div>
        <p className={c.surtitre}>Réponses d’expertise</p>
        <h1 className={c.titre}>{d ? `Télé-expertise ${d.externe ? 'externe' : 'interne'}` : 'Télé-expertise'}</h1>
      </div>
      <button type="button" className={c.secondaire} onClick={() => navigate(racine(espace))}>
        <FaArrowLeft aria-hidden="true" /> Liste
      </button>
    </header>
  );

  if (!d) {
    return (
      <div className={c.page}>
        {entete}
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Télé-expertise introuvable.' : 'Chargement…'}</p>
        </section>
      </div>
    );
  }

  return (
    <div className={c.page}>
      {entete}

      <motion.section className={`${c.bloc} ${s.bandeau}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className={s.patient}>
          <AvatarPatient patient={d.patient} />
          <span>
            <strong>{d.patient.nom}</strong>
            <small>
              {d.patient.code} · {age(d.patient.dateNaissance) ?? 'Âge inconnu'} · Consultation {d.code}
            </small>
          </span>
        </span>
        <dl className={s.resume}>
          <div>
            <dt>Expert</dt>
            <dd>
              <FaUserMd aria-hidden="true" /> {d.expert ?? (d.externe ? 'Pas encore pris en charge' : '—')}
              {d.service ? ` · ${d.service}` : ''}
            </dd>
          </div>
          <div>
            <dt>Établissement</dt>
            <dd>
              <FaHospitalAlt aria-hidden="true" /> {d.hopital ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Demandée le</dt>
            <dd>{d.demandeLe ? `${jour(d.demandeLe)} à ${heure(d.demandeLe)}` : '—'}</dd>
          </div>
          <div>
            <dt>Délai</dt>
            <dd className={s.delai}>
              <BadgeDelai urgente={d.urgente} /> <BadgeEtat x={d} />
            </dd>
          </div>
        </dl>
      </motion.section>

      <section className={c.bloc}>
        <h2 className={s.titreBloc}>
          <FaClipboardCheck aria-hidden="true" /> Réponse de l’expert
        </h2>
        {d.motif && <p className={s.motif}>Motif de la demande : {d.motif}</p>}
        {d.etat === 'recu' ? (
          <ContenuResultat
            avis={d.avis}
            conduite={d.conduite}
            le={d.resultatLe}
            dansDelai={d.dansDelai}
            documents={d.documentsResultat}
            telecharger={(x) => api.telecharger(d.origineId, x.id, x.nom)}
          />
        ) : d.etat === 'termine' ? (
          <div className={s.attente}>
            <p>L’expert a terminé sa consultation sans joindre de réponse.</p>
          </div>
        ) : (
          <div className={s.attente}>
            <p>
              {d.etat === 'retard'
                ? 'L’heure limite de la réponse est dépassée : la réponse n’est pas encore arrivée.'
                : 'La réponse n’est pas encore arrivée. Elle apparaîtra ici dès que l’expert l’aura envoyé.'}
            </p>
            <Chrono recueLe={d.demandeLe} date={null} heure={null} echeance={d.echeance} delai={delaiExpertise(d)} />
          </div>
        )}
      </section>
    </div>
  );
}
