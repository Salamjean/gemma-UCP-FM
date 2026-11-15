import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaClock,
  FaEye,
  FaHistory,
  FaSearch,
  FaUsers,
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierConsultationItem } from '../../../types';
import s from './Consultations.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

const deux = (n: number) => String(n).padStart(2, '0');

function dateFr(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function heureFr(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}`;
}

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/**
 * INFIRMIER > CONSULTATIONS > HISTORIQUE
 * Liste des consultations passées ou dont les constantes ont été prises
 */
export default function Historique() {
  const [consultations, setConsultations] = useState<InfirmierConsultationItem[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [imgErreurs, setImgErreurs] = useState<Record<number, boolean>>({});

  useEffect(() => {
    api.infirmier.consultations
      .history()
      .then(setConsultations)
      .catch((e) => {
        setConsultations([]);
        alerte.echec(`Impossible de charger l'historique : ${messageErreur(e)}`);
      });
  }, []);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!consultations) return [];
    if (!q) return consultations;
    return consultations.filter(
      (c) =>
        c.patient.code.toLowerCase().includes(q) ||
        c.patient.nom.toLowerCase().includes(q) ||
        c.motif.toLowerCase().includes(q) ||
        (c.code ?? '').toLowerCase().includes(q) ||
        c.medecin.toLowerCase().includes(q),
    );
  }, [consultations, recherche]);
  const pg = usePagination(filtrees);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Consultations · Archives</p>
          <h1 className={c.titre}>Historique des consultations</h1>
        </div>
        <div className={c.boutons}>
          <Link to="/infirmier/consultations/nouvelles" className={c.secondaire}>
            <FaClock aria-hidden="true" /> Consultations du jour
          </Link>
          <Link to="/infirmier/consultations/toutes" className={c.secondaire}>
            <FaUsers aria-hidden="true" /> Tous les patients
          </Link>
        </div>
      </header>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <div className={s.recherche}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher par référence, nom du patient, motif, médecin..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher une consultation"
            />
          </div>
        </div>

        {consultations && consultations.length === 0 ? (
          <div className={s.vide}>
            <FaHistory aria-hidden="true" />
            <strong>Aucune consultation archivée</strong>
            <p>Les consultations passées apparaîtront ici.</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Date et Heure</th>
                  <th scope="col">Code Patient</th>
                  <th scope="col">Photo</th>
                  <th scope="col">Nom &amp; Prénoms</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((item, i) => {
                  const urlPhoto = item.patient.imgUrl
                    ? item.patient.imgUrl.startsWith('http')
                      ? item.patient.imgUrl
                      : uploadUrl('patient', item.patient.imgUrl)
                    : null;
                  const afficherPhoto = urlPhoto && !imgErreurs[item.id];
                  const feminin = (item.patient.genre ?? '').toLowerCase().startsWith('f');

                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 12) * 0.04 }}
                    >
                      <td>
                        {dateFr(item.date)}
                        <span className={c.sousTexte}>{heureFr(item.createdAt)}</span>
                      </td>
                      <td className={s.code}>{item.patient.code}</td>
                      <td>
                        {afficherPhoto ? (
                          <img
                            src={urlPhoto}
                            alt=""
                            className={s.avatar}
                            onError={() => setImgErreurs((prev) => ({ ...prev, [item.id]: true }))}
                          />
                        ) : (
                          <span className={`${s.avatarInitiales} ${feminin ? s.avatarF : ''}`}>
                            {initiales(item.patient.nom)}
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>{item.patient.nom}</strong>
                      </td>
                      <td>{item.motif}</td>
                      <td>
                        {item.terminee ? (
                          <span className={`${c.badge} ${c.badgeOk}`}>Terminée</span>
                        ) : (
                          <span className={`${c.badge} ${s.badgeAttente}`}>En attente</span>
                        )}
                        {(item.nbOrdonnances > 0 || item.nbArrets > 0 || item.nbExamens > 0) && (
                          <div className={s.badgesGroupe}>
                            {item.nbOrdonnances > 0 && (
                              <span className={`${c.badge} ${s.badgeAttente}`}>
                                Ordonnance{item.nbOrdonnances > 1 ? `s (${item.nbOrdonnances})` : ''}
                              </span>
                            )}
                            {item.nbArrets > 0 && <span className={`${c.badge} ${s.badgeInfo}`}>Arrêt de travail</span>}
                            {item.nbExamens > 0 && (
                              <span className={`${c.badge} ${c.badgeNeutre}`}>Bulletin examen</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={c.actions} style={{ justifyContent: 'center' }}>
                          <Link
                            to={`/infirmier/consultations/formulaire/${item.id}`}
                            className={c.secondaire}
                            style={{ height: '32px', fontSize: '0.8rem', padding: '0 12px' }}
                            title="Voir la fiche"
                          >
                            <FaEye aria-hidden="true" /> Fiche
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {consultations && filtrees.length === 0 && (
                  <tr>
                    <td colSpan={7} className={c.vide}>
                      Aucune consultation ne correspond à votre recherche.
                    </td>
                  </tr>
                )}
                {!consultations && (
                  <tr>
                    <td colSpan={7} className={c.vide}>
                      Chargement de l'historique…
                    </td>
                  </tr>
                )}
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
