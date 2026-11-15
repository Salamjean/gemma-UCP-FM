import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaEye, FaHourglassHalf, FaSearch, FaStethoscope, FaUserClock } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { ObservationResume } from '../../../../types';
import { jourHeureFr, lireDate, observationEnCours } from '../hospitalisation.format';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Suivi.module.css';
import ExportExcel from '../../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

type Filtre = 'toutes' | 'en-cours' | 'terminees';

/** Avancement d'une observation en cours (0 → 100 %) */
function avancement(debut: string, fin: string | null) {
  const a = lireDate(debut)?.getTime();
  const b = lireDate(fin)?.getTime();
  if (!a || !b || b <= a) return null;
  return Math.min(100, Math.max(0, ((Date.now() - a) / (b - a)) * 100));
}

/**
 * HÔPITAL > HOSPITALISATION > OBSERVATIONS (suivi, lecture seule)
 * Équivalent Laravel : hospital.observation.list (users/hospital/observation/list.blade.php)
 * Les mises en observation sont créées par les médecins.
 */
export default function Observations() {
  const [liste, setListe] = useState<ObservationResume[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');

  useEffect(() => {
    api.hospital.observations
      .liste()
      .then(setListe)
      .catch((e) => {
        setListe([]);
        alerte.echec(`Impossible de charger les observations : ${messageErreur(e)}`);
      });
  }, []);

  const enCours = liste?.filter((o) => observationEnCours(o.fin)) ?? [];
  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (liste ?? []).filter((o) => {
      const encours = observationEnCours(o.fin);
      return (
        (filtre === 'toutes' || (filtre === 'en-cours' ? encours : !encours)) &&
        (!q || [o.code, o.patient.nom, o.patient.code, o.diagnostic, o.consultation].some((v) => v?.toLowerCase().includes(q)))
      );
    });
  }, [liste, recherche, filtre]);
  const pg = usePagination(filtres);

  const compteurs = liste
    ? [
        { icone: FaStethoscope, valeur: liste.length, libelle: 'Mises en observation', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaUserClock, valeur: enCours.length, libelle: 'En cours', fond: '#fff3df', texte: '#b56b00' },
        { icone: FaCheckCircle, valeur: liste.length - enCours.length, libelle: 'Terminées', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaHourglassHalf, valeur: liste.filter((o) => o.diagnostic).length, libelle: 'Avec diagnostic', fond: '#efe9fd', texte: '#6a3fd6' },
      ]
    : [];

  const FILTRES: { id: Filtre; libelle: string; n: number }[] = [
    { id: 'toutes', libelle: 'Toutes', n: liste?.length ?? 0 },
    { id: 'en-cours', libelle: 'En cours', n: enCours.length },
    { id: 'terminees', libelle: 'Terminées', n: (liste?.length ?? 0) - enCours.length },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Hospitalisation</p>
          <h1 className={c.titre}>Patients en observation</h1>
        </div>
        <div className={c.boutons}>
          <ExportExcel
            fichier="observations"
            titre="Observations"
            module="HOSPITALISATION"
            lignes={filtres}
            colonnes={[
              { titre: 'Code', valeur: (o) => o.code },
              { titre: 'Patient', valeur: (o) => o.patient.nom },
              { titre: 'Code patient', valeur: (o) => o.patient.code },
              { titre: 'Début', valeur: (o) => jourHeureFr(o.debut) },
              { titre: 'Durée', valeur: (o) => o.duree },
              { titre: 'Fin prévue', valeur: (o) => jourHeureFr(o.fin) },
              { titre: 'Statut', valeur: (o) => (observationEnCours(o.fin) ? 'En cours' : 'Terminée') },
            ]}
          />
        </div>
      </header>

      <div className={`${c.compteurs} ${styles.compteurs}`}>
        {compteurs.map((k, i) => (
          <motion.div key={k.libelle} className={c.compteur} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
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
            <input type="search" placeholder="Patient, dossier, diagnostic…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une observation" />
          </label>
          <div className={styles.onglets} role="tablist" aria-label="Statut">
            {FILTRES.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filtre === f.id} className={`${styles.onglet} ${filtre === f.id ? styles.ongletActif : ''}`} onClick={() => setFiltre(f.id)}>
                {filtre === f.id && <motion.span layoutId="filtre-obs" className={styles.ongletFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span className={styles.ongletTexte}>
                  {f.libelle} <small>{f.n}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {liste && liste.length === 0 ? (
          <div className={styles.videIllustre}>
            <FaStethoscope aria-hidden="true" />
            <strong>Aucune mise en observation pour le moment</strong>
            <p>Les patients mis en observation par un médecin depuis une consultation apparaîtront ici.</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Début</th>
                  <th scope="col">Durée</th>
                  <th scope="col">Fin prévue</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((o, i) => {
                  const encours = observationEnCours(o.fin);
                  const pct = encours ? avancement(o.debut, o.fin) : null;
                  return (
                    <motion.tr key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                      <td className={styles.code}>{o.code}</td>
                      <td>
                        <Link to={`${baseHopital()}/hospitalisation/observations/${o.id}`} className={styles.lien}>{o.patient.nom}</Link>
                        {o.patient.code && <span className={c.sousTexte}>{o.patient.code}</span>}
                      </td>
                      <td className={styles.nowrap}>{jourHeureFr(o.debut)}</td>
                      <td>{o.duree ?? '—'}</td>
                      <td className={styles.nowrap}>{jourHeureFr(o.fin)}</td>
                      <td>
                        <span className={`${c.badge} ${encours ? '' : c.badgeOk}`} style={encours ? { background: '#fff3df', color: '#b56b00' } : undefined}>
                          {encours ? 'En cours' : 'Terminée'}
                        </span>
                        {pct !== null && (
                          <div className={styles.progression} title={`${Math.round(pct)} % de la durée écoulée`}>
                            <motion.span initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={c.actions}>
                          <Link to={`${baseHopital()}/hospitalisation/observations/${o.id}`} className={`${c.icone} ${c.iconeVoir}`} title="Voir le détail" aria-label={`Voir l'observation ${o.code}`}>
                            <FaEye />
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {liste && filtres.length === 0 && (
                  <tr>
                    <td colSpan={7} className={c.vide}>Aucune observation ne correspond.</td>
                  </tr>
                )}
                {!liste && (
                  <tr>
                    <td colSpan={7} className={c.vide}>Chargement…</td>
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
