import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaClock, FaEye, FaPlay, FaSearch, FaStethoscope } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorConsultationItem } from '../../../types';
import { age, initiales } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import s from './Consultations.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

const p2 = (n: number) => String(n).padStart(2, '0');
/** Heure telle qu'enregistrée (UTC, comme Laravel) */
export const heure = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};
export const jour = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

/** Avatar patient (photo ou initiales) */
export function AvatarPatient({ patient }: { patient: DoctorConsultationItem['patient'] }) {
  const [erreur, setErreur] = useState(false);
  const url = patient.imgUrl ? (patient.imgUrl.startsWith('http') ? patient.imgUrl : uploadUrl('patient', patient.imgUrl)) : null;
  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
  return url && !erreur ? (
    <img src={url} alt="" className={s.avatar} onError={() => setErreur(true)} />
  ) : (
    <span className={`${s.avatar} ${s.initiales} ${feminin ? s.feminin : ''}`}>{initiales(patient.nom)}</span>
  );
}

interface Props {
  surtitre: string;
  titre: string;
  description: string;
  charger: () => Promise<DoctorConsultationItem[]>;
  /** historique : affiche date complète, issue et documents */
  historique?: boolean;
  /** actualisation automatique (file d'attente) */
  actualiser?: boolean;
  videTitre: string;
  videTexte: string;
  icone?: IconType;
}

/**
 * MÉDECIN > CONSULTATIONS : liste commune (Nouvelles, Tous les patients, Historique)
 * Tableau centré, sans colonne N°, recherche instantanée.
 */
export default function ListeConsultations({ surtitre, titre, description, charger, historique, actualiser, videTitre, videTexte, icone: Icone = FaStethoscope }: Props) {
  const [liste, setListe] = useState<DoctorConsultationItem[] | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    let actif = true;
    const lire = () =>
      charger()
        .then((l) => actif && setListe(l))
        .catch((e) => {
          if (!actif) return;
          setListe((prev) => prev ?? []);
          alerte.echec(`Impossible de charger les consultations : ${messageErreur(e)}`);
        });
    lire();
    const minuterie = actualiser ? setInterval(lire, 15000) : undefined;
    return () => {
      actif = false;
      if (minuterie) clearInterval(minuterie);
    };
  }, [charger, actualiser]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!liste || !q) return liste ?? [];
    return liste.filter((x) => [x.patient.nom, x.patient.code, x.code, x.motif, x.prestation].some((v) => v.toLowerCase().includes(q)));
  }, [liste, recherche]);
  const pg = usePagination(filtrees);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>{surtitre}</p>
          <h1 className={c.titre}>{titre}</h1>
        </div>
      </header>

      <section className={c.bloc}>
        <div className={s.barre}>
          <p className={s.description}>
            {description}
            {liste && <span className={s.compte}>{liste.length}</span>}
          </p>
          <label className={s.recherche}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Patient, code, motif…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher" />
          </label>
        </div>

        {liste && liste.length === 0 ? (
          <div className={s.vide}>
            <Icone aria-hidden="true" />
            <strong>{videTitre}</strong>
            <p>{videTexte}</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">{historique ? 'Date' : 'Arrivée'}</th>
                  <th scope="col">Prestation</th>
                  <th scope="col">Motif</th>
                  <th scope="col">{historique ? 'Issue' : 'Statut'}</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!liste && (
                  <tr>
                    <td colSpan={6} className={c.vide}>
                      Chargement…
                    </td>
                  </tr>
                )}
                {liste && filtrees.length === 0 && (
                  <tr>
                    <td colSpan={6} className={c.vide}>
                      Aucune consultation ne correspond à votre recherche.
                    </td>
                  </tr>
                )}
                {pg.lignes.map((x, i) => (
                  <motion.tr key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                    <td>
                      <span className={s.patient}>
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
                      {historique ? (
                        <span className={s.empile}>
                          <strong>{jour(x.creeLe)}</strong>
                          <small>{heure(x.creeLe)}</small>
                        </span>
                      ) : (
                        <span className={`${c.badge} ${c.badgeNeutre}`}>
                          <FaClock aria-hidden="true" /> {jour(x.creeLe) === jour(new Date().toISOString()) ? heure(x.creeLe) : `${jour(x.creeLe)} ${heure(x.creeLe)}`}
                        </span>
                      )}
                    </td>
                    <td>{x.prestation}</td>
                    <td className={s.motif}>{x.motif}</td>
                    <td>
                      <span className={s.statuts}>
                        {x.urgence && <span className={`${c.badge} ${s.badgeUrgence}`}>Urgence</span>}
                        {historique ? (
                          x.terminee ? (
                            <span className={`${c.badge} ${c.badgeOk}`}>{x.issue ?? 'Terminée'}</span>
                          ) : (
                            <span className={`${c.badge} ${s.badgeAttente}`}>Non terminée</span>
                          )
                        ) : (
                          <span className={`${c.badge} ${c.badgeOk}`}>Constantes prises</span>
                        )}
                        {historique && (x.documents.ordonnance || x.documents.examen || x.documents.arret || x.documents.hospitalisation) && (
                          <small className={s.documents}>
                            {[x.documents.ordonnance && 'Ordonnance', x.documents.examen && 'Examens', x.documents.arret && 'Arrêt', x.documents.hospitalisation && 'Hospitalisation']
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        )}
                      </span>
                    </td>
                    <td>
                      <Link to={`/medecin/consultations/${x.id}`} className={`${x.terminee ? c.secondaire : c.principal} ${s.action}`}>
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
