import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaBed, FaDoorOpen, FaEye, FaProcedures, FaSearch } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorHospitalisationItem } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient } from '../Consultations/ListeConsultations';
import { FenetreLit, FenetreSortie } from './Fenetres';
import s from './Hospitalisation.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

export type StatutHospitalisation = 'en-attente' | 'en-cours' | 'historique';

export const dateFr = (iso: string | null) => {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
};

const TEXTES: Record<StatutHospitalisation, { titre: string; description: string; vide: string; videTexte: string }> = {
  'en-attente': {
    titre: 'En attente de chambre',
    description: 'Patients que vous avez hospitalisés et qui n’ont pas encore de lit.',
    vide: 'Aucun patient en attente de chambre',
    videTexte: 'Les patients hospitalisés depuis une consultation apparaîtront ici jusqu’à l’attribution d’un lit.',
  },
  'en-cours': {
    titre: 'Hospitalisations en cours',
    description: 'Patients hospitalisés en chambre sous votre responsabilité.',
    vide: 'Aucune hospitalisation en cours',
    videTexte: 'Attribuez un lit à un patient en attente pour démarrer son hospitalisation.',
  },
  historique: {
    titre: 'Historique des hospitalisations',
    description: 'Hospitalisations terminées, avec leur durée et leur motif de sortie.',
    vide: 'Aucune hospitalisation terminée',
    videTexte: 'Les hospitalisations clôturées par une sortie s’afficheront ici.',
  },
};

/**
 * MÉDECIN > HOSPITALISATION : liste commune (En attente, En cours, Historique)
 * Repris de Laravel : doctor.hospitalisation.pending_room / in_progress / history
 */
export default function ListeHospitalisations({ statut }: { statut: StatutHospitalisation }) {
  const [liste, setListe] = useState<DoctorHospitalisationItem[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [litPour, setLitPour] = useState<DoctorHospitalisationItem | null>(null);
  const [sortiePour, setSortiePour] = useState<DoctorHospitalisationItem | null>(null);
  const t = TEXTES[statut];

  const charger = useCallback(() => {
    api.doctor.hospitalisations
      .liste(statut)
      .then(setListe)
      .catch((e) => {
        setListe((x) => x ?? []);
        alerte.echec(`Impossible de charger les hospitalisations : ${messageErreur(e)}`);
      });
  }, [statut]);

  useEffect(() => {
    setListe(null);
    charger();
  }, [charger]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!liste || !q) return liste ?? [];
    return liste.filter((x) => [x.patient.nom, x.patient.code, x.code, x.diagnostic ?? '', x.lit ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [liste, recherche]);
  const pg = usePagination(filtrees);

  const cible = (x: DoctorHospitalisationItem | null) => (x ? { id: x.id, code: x.code, patient: x.patient.nom, lit: x.lit } : null);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Hospitalisation</p>
          <h1 className={c.titre}>{t.titre}</h1>
        </div>
      </header>

      <section className={c.bloc}>
        <div className={s.barre}>
          <p className={s.description}>
            {t.description}
            {liste && <span className={s.compte}>{liste.length}</span>}
          </p>
          <label className={s.recherche}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Patient, dossier, lit…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher" />
          </label>
        </div>

        {liste && liste.length === 0 ? (
          <div className={s.vide}>
            <FaProcedures aria-hidden="true" />
            <strong>{t.vide}</strong>
            <p>{t.videTexte}</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Dossier</th>
                  <th scope="col">{statut === 'historique' ? 'Période' : 'Depuis'}</th>
                  <th scope="col">Diagnostic</th>
                  <th scope="col">{statut === 'historique' ? 'Sortie' : 'Chambre'}</th>
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
                      Aucune hospitalisation ne correspond à votre recherche.
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
                      <span className={s.code}>{x.code}</span>
                    </td>
                    <td>
                      {statut === 'historique' ? (
                        <span className={s.empile}>
                          <strong>
                            {dateFr(x.debut)} → {dateFr(x.fin)}
                          </strong>
                          <small>{x.jours ?? '—'} jour(s)</small>
                        </span>
                      ) : (
                        <span className={s.empile}>
                          <strong>{dateFr(x.debut)}</strong>
                          <small>
                            {x.jours} jour{(x.jours ?? 0) > 1 ? 's' : ''}
                          </small>
                        </span>
                      )}
                    </td>
                    <td className={s.diagnostic}>{x.diagnostic ?? x.motif ?? '—'}</td>
                    <td>
                      {statut === 'historique' ? (
                        <span className={`${c.badge} ${x.motifSortie === 'Décès' ? s.badgeRouge : c.badgeOk}`}>{x.motifSortie ?? 'Sortie'}</span>
                      ) : x.lit ? (
                        <span className={s.empile}>
                          <strong>
                            <FaBed aria-hidden="true" /> {x.lit}
                          </strong>
                          {x.infirmier && <small>Inf. {x.infirmier}</small>}
                        </span>
                      ) : (
                        <span className={`${c.badge} ${s.badgeAttente}`}>En attente de chambre</span>
                      )}
                    </td>
                    <td>
                      <div className={s.actions}>
                        {statut === 'en-attente' && (
                          <button type="button" className={`${c.principal} ${s.bouton}`} onClick={() => setLitPour(x)}>
                            <FaBed aria-hidden="true" /> Attribuer un lit
                          </button>
                        )}
                        {statut === 'en-cours' && (
                          <button type="button" className={`${c.principal} ${s.bouton}`} onClick={() => setSortiePour(x)}>
                            <FaDoorOpen aria-hidden="true" /> Sortie
                          </button>
                        )}
                        <Link to={`/medecin/hospitalisation/${x.id}`} className={`${c.secondaire} ${s.bouton}`}>
                          <FaEye aria-hidden="true" /> {statut === 'historique' ? 'Voir' : 'Suivi'}
                        </Link>
                      </div>
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

      <FenetreLit
        cible={cible(litPour)}
        onFermer={() => setLitPour(null)}
        onFait={() => {
          setLitPour(null);
          charger();
        }}
      />
      <FenetreSortie
        cible={cible(sortiePour)}
        onFermer={() => setSortiePour(null)}
        onFait={() => {
          setSortiePour(null);
          charger();
        }}
      />
    </div>
  );
}
