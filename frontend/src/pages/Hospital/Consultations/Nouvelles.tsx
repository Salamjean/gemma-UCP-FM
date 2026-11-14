import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaCalendarDay, FaEye, FaHistory, FaHourglassHalf, FaSearch, FaStethoscope, FaUserMd } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { ConsultationHopital } from '../../../types';
import { baseHopital } from '../../../services/contexteHopital';
import styles from './Consultations.module.css';

export function formatDateFr(dateStr: string | null): string {
  if (!dateStr) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dateStr;
}

export function formatHeureFr(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * HÔPITAL > CONSULTATIONS > NOUVELLES
 * Équivalent Laravel : hospital.consultation.today (users/hospital/consultation/today.blade.php)
 */
export default function Nouvelles() {
  const [consultations, setConsultations] = useState<ConsultationHopital[] | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    api.hospital.consultations
      .nouvelles()
      .then(setConsultations)
      .catch((e) => {
        setConsultations([]);
        alerte.echec(`Impossible de charger les consultations : ${messageErreur(e)}`);
      });
  }, []);

  const aujourdhuiIso = new Date().toISOString().slice(0, 10);
  const duJour = useMemo(
    () => (consultations ?? []).filter((item) => item.date?.startsWith(aujourdhuiIso)).length,
    [consultations, aujourdhuiIso],
  );
  const nbMedecins = useMemo(
    () => new Set((consultations ?? []).map((item) => item.medecin).filter((m) => m && m !== 'Non assigné')).size,
    [consultations],
  );

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return consultations ?? [];
    return (consultations ?? []).filter((item) =>
      [item.patient.code, item.patient.nom, item.motif, item.motifDetail, item.medecin, item.code].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [consultations, recherche]);

  const compteurs = consultations
    ? [
        { icone: FaHourglassHalf, valeur: consultations.length, libelle: 'Consultations en cours', fond: '#fff3df', texte: '#b56b00' },
        { icone: FaCalendarDay, valeur: duJour, libelle: 'Aujourd’hui', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaUserMd, valeur: nbMedecins, libelle: 'Médecins mobilisés', fond: '#e3f5ee', texte: '#0b7a54' },
      ]
    : [];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Consultations</p>
          <h1 className={c.titre}>Consultations en cours</h1>
        </div>
        <div className={c.boutons}>
          <Link to={`${baseHopital()}/consultations/historique`} className={c.secondaire}>
            <FaHistory aria-hidden="true" /> Voir l’historique
          </Link>
        </div>
      </header>

      <div className={`${c.compteurs} ${styles.compteurs3}`}>
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
              aria-label="Rechercher une consultation"
            />
          </label>
        </div>

        {consultations && consultations.length === 0 ? (
          <div className={styles.vide}>
            <FaStethoscope aria-hidden="true" />
            <strong>Aucune consultation en cours</strong>
            <p>Les nouvelles consultations enregistrées au sein de votre établissement apparaîtront ici.</p>
          </div>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Référence</th>
                  <th scope="col">Nom du Patient</th>
                  <th scope="col">Date</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Agent traitant</th>
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
                      {formatDateFr(item.date)}
                      {item.createdAt && <span className={c.sousTexte}>{formatHeureFr(item.createdAt)}</span>}
                    </td>
                    <td>
                      <strong>{item.motif}</strong>
                      {item.motifDetail && item.motifDetail !== item.motif && (
                        <span className={c.sousTexte}>{item.motifDetail}</span>
                      )}
                    </td>
                    <td>{item.medecin}</td>
                    <td>
                      <div className={c.actions}>
                        <Link
                          to={`${baseHopital()}/consultations/${item.id}`}
                          className={`${c.icone} ${c.iconeVoir}`}
                          title="Détail de la consultation"
                          aria-label={`Voir la consultation de ${item.patient.nom}`}
                        >
                          <FaEye />
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {consultations && filtres.length === 0 && (
                  <tr>
                    <td colSpan={6} className={c.vide}>
                      Aucune consultation ne correspond à votre recherche.
                    </td>
                  </tr>
                )}
                {!consultations && (
                  <tr>
                    <td colSpan={6} className={c.vide}>
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
