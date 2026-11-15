import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaEye, FaHospitalAlt, FaPaperclip, FaSearch, FaShareSquare } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorReferes } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient, heure, jour } from '../Consultations/ListeConsultations';
import s from './Referes.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

type Onglet = 'internes' | 'externes';
const sansDr = (n: string | null) => (n ? `Dr ${n.replace(/^dr\.?\s*/i, '')}` : '—');

/**
 * MÉDECIN > RÉFÉRÉS
 *   - « Référés à moi » : patients qu'un collègue de l'hôpital m'a adressés (référence interne) ;
 *   - « Références externes » : patients référés vers un autre établissement, visibles par tous les médecins.
 */
export default function Referes() {
  const [data, setData] = useState<DoctorReferes | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('internes');
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    api.doctor.referes
      .liste()
      .then(setData)
      .catch((e) => {
        setData({ internes: [], externes: [] });
        alerte.echec(`Impossible de charger les référés : ${messageErreur(e)}`);
      });
  }, []);

  const q = recherche.trim().toLowerCase();
  const internes = useMemo(() => (data?.internes ?? []).filter((x) => !q || [x.patient.nom, x.patient.code, x.referePar ?? '', x.motif ?? ''].some((v) => v.toLowerCase().includes(q))), [data, q]);
  const externes = useMemo(
    () => (data?.externes ?? []).filter((x) => !q || [x.patient.nom, x.patient.code, x.referePar ?? '', x.hopital ?? '', x.justification ?? ''].some((v) => v.toLowerCase().includes(q))),
    [data, q],
  );
  const aTraiter = data?.internes.filter((x) => !x.terminee).length ?? 0;

  // Tableaux : 10 lignes par page
  const pgInternes = usePagination(internes);
  const pgExternes = usePagination(externes);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Référés</p>
          <h1 className={c.titre}>Patients référés</h1>
        </div>
      </header>

      <section className={c.bloc}>
        <div className={s.barre}>
          <div className={s.onglets} role="tablist">
            <button type="button" role="tab" aria-selected={onglet === 'internes'} className={onglet === 'internes' ? s.ongletActif : ''} onClick={() => setOnglet('internes')}>
              <FaShareSquare aria-hidden="true" /> Référés à moi
              <span>{data?.internes.length ?? '·'}</span>
            </button>
            <button type="button" role="tab" aria-selected={onglet === 'externes'} className={onglet === 'externes' ? s.ongletActif : ''} onClick={() => setOnglet('externes')}>
              <FaHospitalAlt aria-hidden="true" /> Références externes
              <span>{data?.externes.length ?? '·'}</span>
            </button>
          </div>
          <label className={s.recherche}>
            <FaSearch aria-hidden="true" />
            <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Patient, médecin, établissement…" aria-label="Rechercher" />
          </label>
        </div>
        <p className={s.description}>
          {onglet === 'internes'
            ? `Patients qu’un collègue de l’hôpital vous a adressés${aTraiter ? ` · ${aTraiter} à consulter` : ''}.`
            : 'Patients référés vers un autre établissement par les médecins, avec leur dossier et les documents joints.'}
        </p>

        {!data ? (
          <p className={c.vide}>Chargement…</p>
        ) : (onglet === 'internes' ? internes : externes).length === 0 ? (
          <div className={s.vide}>
            {onglet === 'internes' ? <FaShareSquare aria-hidden="true" /> : <FaHospitalAlt aria-hidden="true" />}
            <strong>{q ? 'Aucun résultat' : onglet === 'internes' ? 'Aucun patient ne vous a été référé' : 'Aucune référence externe'}</strong>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Référé par</th>
                  {onglet === 'externes' && <th>Établissement</th>}
                  <th>Motif de la référence</th>
                  <th>Documents</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {onglet === 'internes'
                  ? pgInternes.lignes.map((x, i) => (
                      <motion.tr key={x.origineId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
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
                          <span className={s.empile}>
                            <strong>{jour(x.date)}</strong>
                            <small>{heure(x.date)}</small>
                          </span>
                        </td>
                        <td>
                          <span className={s.empile}>
                            <strong>{sansDr(x.referePar)}</strong>
                            {x.service && <small>{x.service}</small>}
                          </span>
                        </td>
                        <td className={s.texteLong}>{x.justification ?? x.motif ?? '—'}</td>
                        <td>
                          {x.documents ? (
                            <span className={s.docs}>
                              <FaPaperclip aria-hidden="true" /> {x.documents}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={s.statuts}>
                            {x.terminee ? <span className={`${c.badge} ${c.badgeOk}`}>Consulté</span> : <span className={`${c.badge} ${s.badgeAttente}`}>À consulter</span>}
                            {x.externe && <small>Référence externe</small>}
                          </span>
                        </td>
                        <td>
                          <div className={s.actions}>
                            {/* Le bouton « Consulter » est sur la fiche : le médecin lit d'abord la référence */}
                            <Link to={`/medecin/referes/${x.origineId}`} className={`${x.terminee ? c.secondaire : c.principal} ${s.bouton}`}>
                              {x.terminee ? <FaEye aria-hidden="true" /> : <FaShareSquare aria-hidden="true" />} {x.terminee ? 'Référence' : 'Voir la référence'}
                            </Link>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  : pgExternes.lignes.map((x, i) => (
                      <motion.tr key={x.origineId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
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
                          <span className={s.empile}>
                            <strong>{jour(x.date)}</strong>
                            <small>{heure(x.date)}</small>
                          </span>
                        </td>
                        <td>
                          <span className={s.empile}>
                            <strong>{sansDr(x.referePar)}</strong>
                            {x.service && <small>{x.service}</small>}
                          </span>
                        </td>
                        <td>{x.hopital ?? '—'}</td>
                        <td className={s.texteLong}>{x.justification ?? x.motif ?? '—'}</td>
                        <td>
                          {x.documents ? (
                            <span className={s.docs}>
                              <FaPaperclip aria-hidden="true" /> {x.documents}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {x.parMoi ? (
                            <span className={`${c.badge} ${c.badgeOk}`}>Pris en charge par vous</span>
                          ) : x.priseEnChargePar ? (
                            <span className={s.statuts}>
                              <span className={`${c.badge} ${c.badgeNeutre}`}>Pris en charge</span>
                              <small>Dr {x.priseEnChargePar.replace(/^dr\.?\s*/i, '')}</small>
                            </span>
                          ) : (
                            <span className={`${c.badge} ${s.badgeAttente}`}>Disponible</span>
                          )}
                        </td>
                        <td>
                          <Link to={`/medecin/referes/${x.origineId}`} className={`${c.principal} ${s.bouton}`}>
                            <FaEye aria-hidden="true" /> Voir
                          </Link>
                        </td>
                      </motion.tr>
                    ))}
              </tbody>
            </table>
          </div>
          {onglet === 'internes' ? <PaginationTableau pagination={pgInternes} /> : <PaginationTableau pagination={pgExternes} />}
          </>
        )}
      </section>
    </div>
  );
}
