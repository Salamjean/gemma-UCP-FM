import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaClock,
  FaFileMedical,
  FaHistory,
  FaPlay,
  FaSearch,
  FaStethoscope,
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
 * INFIRMIER > CONSULTATIONS > NOUVELLES (today)
 * Affiche la liste des consultations du jour en attente de prise de constantes
 */
export default function Nouvelles() {
  const [consultations, setConsultations] = useState<InfirmierConsultationItem[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [imgErreurs, setImgErreurs] = useState<Record<number, boolean>>({});

  const charger = () => {
    api.infirmier.consultations
      .today()
      .then(setConsultations)
      .catch((e) => {
        setConsultations([]);
        alerte.echec(`Impossible de charger les consultations : ${messageErreur(e)}`);
      });
  };

  useEffect(() => {
    charger();
    // Auto-actualisation toutes les 15 secondes
    const interval = setInterval(charger, 15000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const total = consultations?.length ?? 0;
    const enAttente = consultations?.filter((c) => !c.terminee).length ?? 0;
    const terminees = consultations?.filter((c) => c.terminee).length ?? 0;
    return { total, enAttente, terminees };
  }, [consultations]);

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

  const compteurs = [
    { icone: FaClock, valeur: stats.enAttente, libelle: 'En attente de constantes', fond: '#fff3df', texte: '#b56b00' },
    { icone: FaFileMedical, valeur: stats.terminees, libelle: 'Constantes prises ce jour', fond: '#e3f5ee', texte: '#0b7a54' },
    { icone: FaStethoscope, valeur: stats.total, libelle: 'Total consultations du jour', fond: '#eaf3fe', texte: '#1f6fc6' },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Consultations · Prise de constantes</p>
          <h1 className={c.titre}>Consultations du jour (En attente)</h1>
        </div>
        <div className={c.boutons}>
          <Link to="/infirmier/consultations/toutes" className={c.secondaire}>
            <FaUsers aria-hidden="true" /> Consultations en attente (Toutes)
          </Link>
          <Link to="/infirmier/consultations/historique" className={c.secondaire}>
            <FaHistory aria-hidden="true" /> Historique
          </Link>
        </div>
      </header>

      <div className={`${c.compteurs} ${s.compteurs3}`}>
        {compteurs.map((k, i) => (
          <motion.div
            key={k.libelle}
            className={c.compteur}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
              <k.icone aria-hidden="true" />
            </span>
            <span className={c.compteurTexte}>
              <strong>{k.valeur.toLocaleString('fr-FR')}</strong>
              <span>{k.libelle}</span>
            </span>
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <div className={s.recherche}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher par référence, nom du patient, motif..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher une consultation"
            />
          </div>
        </div>

        {consultations && consultations.length === 0 ? (
          <div className={s.vide}>
            <FaStethoscope aria-hidden="true" />
            <strong>Aucune consultation du jour</strong>
            <p>Les admissions et arrivées de patients pour aujourd’hui s’afficheront ici en direct.</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Code Patient</th>
                  <th scope="col">Photo</th>
                  <th scope="col">Nom &amp; Prénoms</th>
                  <th scope="col">Heure</th>
                  <th scope="col">Motif de la visite</th>
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
                      <td>
                        <span className={`${c.badge} ${c.badgeNeutre}`}>
                          <FaClock aria-hidden="true" /> {heureFr(item.createdAt)}
                        </span>
                      </td>
                      <td>{item.motif}</td>
                      <td>
                        {item.terminee ? (
                          <span className={`${c.badge} ${c.badgeOk}`}>Constantes prises</span>
                        ) : (
                          <span className={`${c.badge} ${s.badgeAttente}`}>En attente</span>
                        )}
                      </td>
                      <td>
                        <div className={c.actions} style={{ justifyContent: 'center' }}>
                          <Link
                            to={`/infirmier/consultations/formulaire/${item.id}`}
                            className={`${c.principal}`}
                            style={{ height: '32px', fontSize: '0.8rem', padding: '0 12px' }}
                            title="Prendre les constantes"
                          >
                            <FaPlay aria-hidden="true" /> {item.terminee ? 'Modifier' : 'Prendre constantes'}
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
                      Chargement des consultations…
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
