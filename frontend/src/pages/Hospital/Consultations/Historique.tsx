import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaEye,
  FaFileMedical,
  FaHourglassHalf,
  FaSearch,
  FaStethoscope,
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { ConsultationHopital } from '../../../types';
import styles from './Consultations.module.css';
import { baseHopital } from '../../../services/contexteHopital';
import { formatDateFr, formatHeureFr } from './Nouvelles';

type Filtre = 'toutes' | 'terminees' | 'en-cours';

/**
 * HÔPITAL > CONSULTATIONS > HISTORIQUE
 * Équivalent Laravel : hospital.consultation.history (users/hospital/consultation/history.blade.php)
 */
export default function Historique() {
  const [consultations, setConsultations] = useState<ConsultationHopital[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');

  useEffect(() => {
    api.hospital.consultations
      .historique()
      .then(setConsultations)
      .catch((e) => {
        setConsultations([]);
        alerte.echec(`Impossible de charger l’historique : ${messageErreur(e)}`);
      });
  }, []);

  const terminees = useMemo(() => (consultations ?? []).filter((item) => item.terminee).length, [consultations]);
  const enCours = useMemo(() => (consultations ?? []).filter((item) => !item.terminee).length, [consultations]);
  const avecActes = useMemo(
    () =>
      (consultations ?? []).filter(
        (item) => (item.nbOrdonnances ?? 0) > 0 || (item.nbArrets ?? 0) > 0 || (item.nbExamens ?? 0) > 0,
      ).length,
    [consultations],
  );

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (consultations ?? []).filter((item) => {
      if (filtre === 'terminees' && !item.terminee) return false;
      if (filtre === 'en-cours' && item.terminee) return false;
      if (!q) return true;
      return [item.patient.code, item.patient.nom, item.motif, item.motifDetail, item.medecin, item.code].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [consultations, recherche, filtre]);

  const compteurs = consultations
    ? [
        { icone: FaStethoscope, valeur: consultations.length, libelle: 'Total consultations', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaCheckCircle, valeur: terminees, libelle: 'Terminées', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaHourglassHalf, valeur: enCours, libelle: 'En cours', fond: '#fff3df', texte: '#b56b00' },
        { icone: FaFileMedical, valeur: avecActes, libelle: 'Avec prescriptions / examens', fond: '#efe9fd', texte: '#6a3fd6' },
      ]
    : [];

  const FILTRES: { id: Filtre; libelle: string; n: number }[] = [
    { id: 'toutes', libelle: 'Toutes', n: consultations?.length ?? 0 },
    { id: 'terminees', libelle: 'Terminées', n: terminees },
    { id: 'en-cours', libelle: 'En cours', n: enCours },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Consultations</p>
          <h1 className={c.titre}>Historique des consultations</h1>
        </div>
      </header>

      <div className={`${c.compteurs} ${styles.compteurs}`}>
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
          <label className={`${c.champ} ${c.recherche} ${styles.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Référence patient, nom du patient, motif, médecin…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher dans l’historique"
            />
          </label>
          <div className={styles.onglets} role="tablist" aria-label="Filtrer par statut">
            {FILTRES.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filtre === f.id}
                className={`${styles.onglet} ${filtre === f.id ? styles.ongletActif : ''}`}
                onClick={() => setFiltre(f.id)}
              >
                {filtre === f.id && (
                  <motion.span layoutId="filtre-hist-cons" className={styles.ongletFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className={styles.ongletTexte}>
                  {f.libelle} <small>{f.n}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {consultations && consultations.length === 0 ? (
          <div className={styles.vide}>
            <FaStethoscope aria-hidden="true" />
            <strong>Aucune consultation dans l’historique</strong>
            <p>L’ensemble des consultations réalisées au sein de votre établissement s’affichera ici.</p>
          </div>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Date et heure</th>
                  <th scope="col">Référence</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Médecin</th>
                  <th scope="col">Statut &amp; Actes</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((item, i) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.04 }}
                  >
                    <td>
                      <strong>{formatDateFr(item.date)}</strong>
                      {item.createdAt && <span className={c.sousTexte}>{formatHeureFr(item.createdAt)}</span>}
                    </td>
                    <td className={styles.code}>{item.patient.code}</td>
                    <td>
                      {item.patient.id ? (
                        <Link to={`${baseHopital()}/patients/${item.patient.id}`} className={styles.lienPatient}>
                          {item.patient.nom}
                        </Link>
                      ) : (
                        <strong>{item.patient.nom}</strong>
                      )}
                    </td>
                    <td>
                      <strong>{item.motif}</strong>
                      {item.motifDetail && item.motifDetail !== item.motif && (
                        <span className={c.sousTexte}>{item.motifDetail}</span>
                      )}
                    </td>
                    <td>{item.medecin}</td>
                    <td>
                      <div>
                        <span className={`${c.badge} ${item.terminee ? c.badgeOk : styles.badgeEnCours}`}>
                          {item.terminee ? 'Terminée' : 'En cours'}
                        </span>
                      </div>
                      {((item.nbOrdonnances ?? 0) > 0 || (item.nbArrets ?? 0) > 0 || (item.nbExamens ?? 0) > 0) && (
                        <div className={styles.badgesGroupe}>
                          {(item.nbOrdonnances ?? 0) > 0 && (
                            <span className={`${c.badge} ${styles.badgeOrdonnance}`}>Ordonnance</span>
                          )}
                          {(item.nbArrets ?? 0) > 0 && (
                            <span className={`${c.badge} ${styles.badgeArret}`}>Arrêt de travail</span>
                          )}
                          {(item.nbExamens ?? 0) > 0 && (
                            <span className={`${c.badge} ${styles.badgeExamen}`}>Bulletin d’examen</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className={c.actions}>
                        <Link
                          to={`${baseHopital()}/consultations/${item.id}`}
                          className={`${c.icone} ${c.iconeVoir}`}
                          title="Détail de la consultation"
                          aria-label={`Voir le détail de la consultation de ${item.patient.nom}`}
                        >
                          <FaEye />
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {consultations && filtres.length === 0 && (
                  <tr>
                    <td colSpan={7} className={c.vide}>
                      Aucune consultation ne correspond à votre recherche.
                    </td>
                  </tr>
                )}
                {!consultations && (
                  <tr>
                    <td colSpan={7} className={c.vide}>
                      Chargement…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
