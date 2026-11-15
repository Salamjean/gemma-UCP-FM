import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaBed, FaCheckCircle, FaEye, FaHospitalUser, FaProcedures, FaSearch } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { HospitalisationResume } from '../../../../types';
import { jourFr, joursTexte, nombreJours, statutHospitalisation } from '../hospitalisation.format';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Suivi.module.css';
import ExportExcel from '../../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

type Filtre = 'toutes' | 'en-cours' | 'terminees';

/**
 * HÔPITAL > HOSPITALISATION > HOSPITALISATIONS (suivi, lecture seule)
 * Équivalent Laravel : hospital.hospitalisation.list (users/hospital/hospitalisation/list.blade.php)
 * Les hospitalisations sont créées et clôturées par les médecins.
 */
export default function Hospitalisations() {
  const [liste, setListe] = useState<HospitalisationResume[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('en-cours');

  useEffect(() => {
    api.hospital.hospitalisations
      .liste()
      .then((l) => {
        setListe(l);
        if (!l.some((h) => h.enCours)) setFiltre('toutes');
      })
      .catch((e) => {
        setListe([]);
        alerte.echec(`Impossible de charger les hospitalisations : ${messageErreur(e)}`);
      });
  }, []);

  const enCours = liste?.filter((h) => h.enCours) ?? [];
  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (liste ?? []).filter(
      (h) =>
        (filtre === 'toutes' || (filtre === 'en-cours' ? h.enCours : !h.enCours)) &&
        (!q || [h.code, h.patient.nom, h.patient.code, h.medecin, h.lit, h.motif].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [liste, recherche, filtre]);
  const pg = usePagination(filtres);

  const compteurs = liste
    ? [
        { icone: FaProcedures, valeur: liste.length, libelle: 'Hospitalisations', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaHospitalUser, valeur: enCours.length, libelle: 'Patients hospitalisés', fond: '#fff3df', texte: '#b56b00' },
        { icone: FaCheckCircle, valeur: liste.length - enCours.length, libelle: 'Terminées', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaBed, valeur: enCours.filter((h) => h.lit).length, libelle: 'Lits occupés', fond: '#efe9fd', texte: '#6a3fd6' },
      ]
    : [];

  const FILTRES: { id: Filtre; libelle: string; n: number }[] = [
    { id: 'en-cours', libelle: 'En cours', n: enCours.length },
    { id: 'terminees', libelle: 'Terminées', n: (liste?.length ?? 0) - enCours.length },
    { id: 'toutes', libelle: 'Toutes', n: liste?.length ?? 0 },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Hospitalisation</p>
          <h1 className={c.titre}>Patients en hospitalisation</h1>
        </div>
        <div className={c.boutons}>
          <ExportExcel
            fichier="hospitalisations"
            titre="Hospitalisations"
            module="HOSPITALISATION"
            lignes={filtres}
            colonnes={[
              { titre: 'Dossier', valeur: (h) => h.code },
              { titre: 'Patient', valeur: (h) => h.patient.nom },
              { titre: 'Code patient', valeur: (h) => h.patient.code },
              { titre: 'Médecin', valeur: (h) => h.medecin },
              { titre: 'Chambre / lit', valeur: (h) => h.lit },
              { titre: 'Entrée', valeur: (h) => jourFr(h.debut) },
              { titre: 'Sortie', valeur: (h) => (h.fin ? jourFr(h.fin) : null) },
              { titre: 'Durée', valeur: (h) => joursTexte(h.jours ?? nombreJours(h.debut, h.fin)) },
              { titre: 'Statut', valeur: (h) => statutHospitalisation(h.statut).libelle },
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
            <input type="search" placeholder="Patient, dossier, médecin, chambre…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une hospitalisation" />
          </label>
          <div className={styles.onglets} role="tablist" aria-label="Statut">
            {FILTRES.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filtre === f.id} className={`${styles.onglet} ${filtre === f.id ? styles.ongletActif : ''}`} onClick={() => setFiltre(f.id)}>
                {filtre === f.id && <motion.span layoutId="filtre-hosp" className={styles.ongletFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span className={styles.ongletTexte}>
                  {f.libelle} <small>{f.n}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {liste && liste.length === 0 ? (
          <div className={styles.videIllustre}>
            <FaProcedures aria-hidden="true" />
            <strong>Aucune hospitalisation pour le moment</strong>
            <p>Les hospitalisations apparaîtront ici dès qu'un médecin mettra un patient en hospitalisation depuis une consultation.</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Dossier</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Médecin</th>
                  <th scope="col">Chambre</th>
                  <th scope="col">Entrée</th>
                  <th scope="col">Durée</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((h, i) => {
                  const s = statutHospitalisation(h.statut);
                  const jours = h.jours ?? nombreJours(h.debut, h.fin);
                  return (
                    <motion.tr key={h.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                      <td className={styles.code}>{h.code}</td>
                      <td>
                        <Link to={`${baseHopital()}/hospitalisation/liste/${h.id}`} className={styles.lien}>{h.patient.nom}</Link>
                        {h.patient.code && <span className={c.sousTexte}>{h.patient.code}</span>}
                      </td>
                      <td>{h.medecin ?? '—'}</td>
                      <td className={styles.nowrap}>{h.lit ?? '—'}</td>
                      <td className={styles.nowrap}>{jourFr(h.debut)}</td>
                      <td className={styles.nowrap}>
                        {joursTexte(jours)}
                        {h.fin && <span className={c.sousTexte}>jusqu'au {jourFr(h.fin)}</span>}
                      </td>
                      <td>
                        <span className={c.badge} style={{ background: s.fond, color: s.texte }}>{s.libelle}</span>
                      </td>
                      <td>
                        <div className={c.actions}>
                          <Link to={`${baseHopital()}/hospitalisation/liste/${h.id}`} className={`${c.icone} ${c.iconeVoir}`} title="Voir le détail" aria-label={`Voir l'hospitalisation ${h.code}`}>
                            <FaEye />
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {liste && filtres.length === 0 && (
                  <tr>
                    <td colSpan={8} className={c.vide}>Aucune hospitalisation ne correspond.</td>
                  </tr>
                )}
                {!liste && (
                  <tr>
                    <td colSpan={8} className={c.vide}>Chargement…</td>
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
