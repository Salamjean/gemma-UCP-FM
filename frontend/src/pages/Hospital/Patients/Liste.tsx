import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaEye, FaFemale, FaMale, FaSearch, FaShieldAlt, FaUsers } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { PatientHopital } from '../../../types';
import { baseHopital } from '../../../services/contexteHopital';
import styles from './Patients.module.css';

type Filtre = 'tous' | 'masculin' | 'feminin' | 'assures';

/** Calcul de l'âge à partir de "dd/mm/yyyy" ou "yyyy-mm-dd" */
export function calculerAge(dateStr: string | null): string {
  if (!dateStr) return '—';
  let annee: number | null = null;
  let mois = 0;
  let jour = 1;

  const fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dateStr);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (fr) {
    jour = Number(fr[1]);
    mois = Number(fr[2]) - 1;
    annee = Number(fr[3]);
  } else if (iso) {
    annee = Number(iso[1]);
    mois = Number(iso[2]) - 1;
    jour = Number(iso[3]);
  }
  if (!annee || annee < 1900) return dateStr;

  const auj = new Date();
  let age = auj.getFullYear() - annee;
  const m = auj.getMonth() - mois;
  if (m < 0 || (m === 0 && auj.getDate() < jour)) age--;
  return age >= 0 ? `${age} ans` : '—';
}

export function initialesPatient(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function estMasculin(genre: string | null): boolean {
  const g = genre?.trim().toLowerCase() ?? '';
  return g === 'masculin' || g === 'm' || g === 'homme';
}

export function estFeminin(genre: string | null): boolean {
  const g = genre?.trim().toLowerCase() ?? '';
  return g === 'feminin' || g === 'féminin' || g === 'f' || g === 'femme';
}

/**
 * HÔPITAL > PATIENTS > LISTE
 * Équivalent Laravel : hospital.patient.index (users/hospital/patient/index.blade.php)
 */
export default function Liste() {
  const [patients, setPatients] = useState<PatientHopital[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');

  useEffect(() => {
    api.hospital.patients
      .liste()
      .then(setPatients)
      .catch((e) => {
        setPatients([]);
        alerte.echec(`Impossible de charger les patients : ${messageErreur(e)}`);
      });
  }, []);

  const hommes = useMemo(() => (patients ?? []).filter((p) => estMasculin(p.genre)).length, [patients]);
  const femmes = useMemo(() => (patients ?? []).filter((p) => estFeminin(p.genre)).length, [patients]);
  const assures = useMemo(() => (patients ?? []).filter((p) => p.assure).length, [patients]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (patients ?? []).filter((p) => {
      if (filtre === 'masculin' && !estMasculin(p.genre)) return false;
      if (filtre === 'feminin' && !estFeminin(p.genre)) return false;
      if (filtre === 'assures' && !p.assure) return false;
      if (!q) return true;
      return [p.codePatient, p.nomComplet, p.telephone, p.numeroIdentite, p.residence, p.pays, p.profession].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [patients, recherche, filtre]);

  const compteurs = patients
    ? [
        { icone: FaUsers, valeur: patients.length, libelle: 'Patients enregistrés', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaMale, valeur: hommes, libelle: 'Hommes', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaFemale, valeur: femmes, libelle: 'Femmes', fond: '#fde0e6', texte: '#c4213f' },
        { icone: FaShieldAlt, valeur: assures, libelle: 'Patients assurés', fond: '#fff3df', texte: '#b56b00' },
      ]
    : [];

  const FILTRES: { id: Filtre; libelle: string; n: number }[] = [
    { id: 'tous', libelle: 'Tous', n: patients?.length ?? 0 },
    { id: 'masculin', libelle: 'Hommes', n: hommes },
    { id: 'feminin', libelle: 'Femmes', n: femmes },
    { id: 'assures', libelle: 'Assurés', n: assures },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Patients</p>
          <h1 className={c.titre}>Liste des patients</h1>
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
              placeholder="Code patient, nom, téléphone, N° pièce, résidence…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher un patient"
            />
          </label>
          <div className={styles.onglets} role="tablist" aria-label="Filtrer les patients">
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
                  <motion.span layoutId="filtre-patients" className={styles.ongletFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className={styles.ongletTexte}>
                  {f.libelle} <small>{f.n}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {patients && patients.length === 0 ? (
          <div className={styles.vide}>
            <FaUsers aria-hidden="true" />
            <strong>Aucun patient enregistré</strong>
            <p>Les patients ayant effectué un passage ou une consultation au sein de votre établissement s’afficheront ici.</p>
          </div>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Code Patient</th>
                  <th scope="col">Photo</th>
                  <th scope="col">Nom &amp; Prénoms</th>
                  <th scope="col">Genre</th>
                  <th scope="col">Âge</th>
                  <th scope="col">Pays de naissance</th>
                  <th scope="col">N° Pièce</th>
                  <th scope="col">Adresse / Résidence</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.04 }}
                  >
                    <td className={styles.code}>{p.codePatient}</td>
                    <td>
                      {p.imgUrl ? (
                        <img
                          className={styles.avatar}
                          src={p.imgUrl.startsWith('http') ? p.imgUrl : uploadUrl('patient', p.imgUrl)}
                          alt=""
                        />
                      ) : (
                        <span className={`${styles.avatarInitiales} ${estFeminin(p.genre) ? styles.genreF : styles.genreM}`}>
                          {initialesPatient(p.nomComplet)}
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>{p.nomComplet}</strong>
                      {p.telephone && <span className={c.sousTexte}>{p.telephone}</span>}
                    </td>
                    <td>
                      <span className={`${c.badge} ${estFeminin(p.genre) ? styles.genreF : estMasculin(p.genre) ? styles.genreM : c.badgeNeutre}`}>
                        {p.genre ? p.genre.charAt(0).toUpperCase() + p.genre.slice(1) : '—'}
                      </span>
                    </td>
                    <td>{calculerAge(p.dateNaissance)}</td>
                    <td>{p.pays || '—'}</td>
                    <td>
                      {p.numeroIdentite || '—'}
                      {p.typePiece && <span className={c.sousTexte}>{p.typePiece}</span>}
                    </td>
                    <td>{p.residence || '—'}</td>
                    <td>
                      <div className={c.actions}>
                        <Link
                          to={`${baseHopital()}/patients/${p.id}`}
                          className={`${c.icone} ${c.iconeVoir}`}
                          title="Détail du patient"
                          aria-label={`Voir le dossier de ${p.nomComplet}`}
                        >
                          <FaEye />
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {patients && filtres.length === 0 && (
                  <tr>
                    <td colSpan={9} className={c.vide}>
                      Aucun patient ne correspond à votre recherche.
                    </td>
                  </tr>
                )}
                {!patients && (
                  <tr>
                    <td colSpan={9} className={c.vide}>
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
