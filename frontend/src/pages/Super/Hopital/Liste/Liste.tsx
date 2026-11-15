import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaEdit, FaHospital, FaSearch } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api, uploadUrl } from '../../../../services/api';
import type { Hopital } from '../../../../types';
import styles from './Liste.module.css';
import ExportExcel from '../../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

const PHOTO_DEFAUT = '/images/dashboard/avatar-hospital.gif';

/** "2026-11-11T15:04:05.000Z" → "11/11/2026 - 15:04:05" (format Laravel d/m/Y - H:i:s, heure UTC comme Laravel) */
const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} - ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

/**
 * SUPER > HÔPITAL > LISTE
 * Équivalent Laravel : super.hospital.index (users/super/hospital/index.blade.php)
 * Données : GET /api/super/hopitaux
 */
export default function Liste() {
  const [hopitaux, setHopitaux] = useState<Hopital[] | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    api.super.hopitaux
      .liste()
      .then(setHopitaux)
      .catch((e) => {
        setIndisponible(true);
        alerte.echec(`Impossible de charger la liste : ${messageErreur(e)}`);
      });
  }, []);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!hopitaux || !q) return hopitaux ?? [];
    return hopitaux.filter((h) =>
      [h.label, h.reference, h.contact, h.localite, h.email].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [hopitaux, recherche]);
  const pg = usePagination(filtres);

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.titre}>Hôpitaux DMHP</h1>
          {hopitaux && (
            <p className={styles.compte}>
              {hopitaux.length} {hopitaux.length > 1 ? 'hôpitaux enregistrés' : 'hôpital enregistré'} · seuls les établissements appartenant à la DMHP
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <label className={styles.recherche}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher un hôpital"
            />
          </label>
          <ExportExcel
            fichier="hopitaux_dmhp"
            titre="Hôpitaux DMHP"
            module="HOPITAL"
            lignes={filtres}
            colonnes={[
              { titre: 'Référence', valeur: (h) => h.reference },
              { titre: 'Hôpital', valeur: (h) => h.label },
              { titre: 'Localité', valeur: (h) => h.localite },
              { titre: 'Contact', valeur: (h) => h.contact },
              { titre: 'Créé le', valeur: (h) => formatDate(h.createdAt) },
              { titre: 'Statut', valeur: (h) => (h.actif ? 'Activé' : 'Désactivé') },
              { titre: 'Téléconsultation', valeur: (h) => (h.teleconsultation ? 'Activée' : 'Désactivée') },
            ]}
          />
        </div>
      </header>

      {!hopitaux && <p className={styles.vide}>{indisponible ? 'Liste indisponible.' : 'Chargement…'}</p>}

      {hopitaux && (
        <>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Photo</th>
                <th scope="col">Référence</th>
                <th scope="col">Hôpital</th>
                <th scope="col">Contact</th>
                <th scope="col">Créé le</th>
                <th scope="col">Statut</th>
                <th scope="col">Téléconsultation</th>
                <th scope="col" className={styles.colActions}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.lignes.map((h, i) => (
                <motion.tr
                  key={h.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.04 }}
                >
                  <td>
                    <img
                      className={styles.photo}
                      src={h.imgUrl ? uploadUrl('hospital', h.imgUrl) : PHOTO_DEFAUT}
                      alt=""
                      onError={(e) => (e.currentTarget.src = PHOTO_DEFAUT)}
                    />
                  </td>
                  <td>{h.reference ?? '—'}</td>
                  <td>
                    <strong className={styles.nom}>{h.label ?? '—'}</strong>
                    {h.localite && <span className={styles.sousTexte}>{h.localite}</span>}
                  </td>
                  <td>{h.contact ?? '—'}</td>
                  <td className={styles.date}>{formatDate(h.createdAt)}</td>
                  <td>
                    <span className={`${styles.badge} ${h.actif ? styles.ok : styles.ko}`}>
                      {h.actif ? 'Activé' : 'Désactivé'}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${h.teleconsultation ? styles.ok : styles.ko}`}>
                      {h.teleconsultation ? 'Activée' : 'Désactivée'}
                    </span>
                  </td>
                  <td>
                    {/* Espace UCP-FM : ouvrir (supervision) et modifier — pas d'activation / désactivation ni de téléconsultation */}
                    <div className={styles.actionsCellule}>
                      <Link to={`/super/hopital/${h.id}`} className={styles.ouvrir} title="Ouvrir et superviser cet établissement">
                        <FaHospital aria-hidden="true" /> Ouvrir
                      </Link>
                      <Link
                        to={`/super/hopital/${h.id}/modifier`}
                        className={`${styles.icone} ${styles.iconeModifier}`}
                        title="Modifier les coordonnées"
                        aria-label="Modifier les coordonnées"
                      >
                        <FaEdit />
                      </Link>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {filtres.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.vide}>
                    {recherche ? 'Aucun hôpital ne correspond à la recherche.' : 'Liste vide...'}
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
  );
}
