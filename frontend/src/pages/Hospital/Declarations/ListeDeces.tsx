import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaBaby, FaEye, FaFileMedicalAlt, FaFilePdf, FaHeartbeat, FaSearch, FaPlus, FaUserInjured } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { EspaceDeclarations } from '../../../types';
import type { DeclarationDecesResume } from '../../../types';
import { baseHopital } from '../../../services/contexteHopital';
import s from './Declarations.module.css';

type FiltreDeces = 'tous' | 'patient' | 'enfant' | 'maternel';

function initiales(nom: string) {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(d: string | null) {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

function libelleGenre(g: string | null) {
  if (!g) return '—';
  const u = g.toUpperCase();
  if (u === 'M' || u.startsWith('MASC')) return 'Masculin';
  if (u === 'F' || u.startsWith('FEM') || u.startsWith('FÉM')) return 'Féminin';
  return g;
}

/**
 * HÔPITAL > DÉCLARATIONS > LISTE DES DÉCÈS
 * Équivalent Laravel : hospital.declaration.deces.index (users/hospital/declaration/deces/list.blade.php)
 */
export function ListeDeces({ espace = 'hopital' }: { espace?: EspaceDeclarations } = {}) {
  /** Hôpital : toutes les déclarations ; médecin : les siennes */
  const source = espace === 'medecin' ? api.doctor.declarations : api.hospital.declarations;
  const base = espace === 'medecin' ? '/medecin' : `${baseHopital()}`;
  const [deces, setDeces] = useState<DeclarationDecesResume[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreDeces>('tous');
  const [imgErreurs, setImgErreurs] = useState<Record<number, boolean>>({});

  useEffect(() => {
    source
      .deces()
      .then(setDeces)
      .catch((e) => {
        setDeces([]);
        alerte.echec(`Impossible de charger les déclarations de décès : ${messageErreur(e)}`);
      });
  }, []);

  const stats = useMemo(() => {
    const liste = deces ?? [];
    const total = liste.length;
    const patients = liste.filter((d) => d.personne === 'patient').length;
    const enfants = liste.filter((d) => d.personne === 'enfant').length;
    const maternels = liste.filter((d) => d.decesMaternel).length;
    return { total, patients, enfants, maternels };
  }, [deces]);

  const filtres = useMemo(() => {
    const liste = deces ?? [];
    const q = recherche.trim().toLowerCase();
    return liste.filter((d) => {
      if (filtre === 'patient' && d.personne !== 'patient') return false;
      if (filtre === 'enfant' && d.personne !== 'enfant') return false;
      if (filtre === 'maternel' && !d.decesMaternel) return false;
      if (!q) return true;
      return (
        d.reference.toLowerCase().includes(q) ||
        (d.numeroDeclaration ?? '').toLowerCase().includes(q) ||
        d.patient.nom.toLowerCase().includes(q) ||
        d.patient.code.toLowerCase().includes(q) ||
        (d.causeInitiale ?? '').toLowerCase().includes(q) ||
        (d.medecin ?? '').toLowerCase().includes(q)
      );
    });
  }, [deces, recherche, filtre]);

  const compteurs = deces
    ? [
        { icone: FaFileMedicalAlt, valeur: stats.total, libelle: 'Total décès déclarés', fond: '#fde0e6', texte: '#c4213f' },
        { icone: FaUserInjured, valeur: stats.patients, libelle: 'Patients généraux', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaBaby, valeur: stats.enfants, libelle: 'Nouveaux-nés', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaHeartbeat, valeur: stats.maternels, libelle: 'Décès maternels', fond: '#fff3df', texte: '#b56b00' },
      ]
    : [];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Déclarations · État civil</p>
          <h1 className={c.titre}>{espace === 'medecin' ? 'Mes déclarations de décès' : 'Liste des déclarations de décès'}</h1>
        </div>
        {espace === 'medecin' && (
          <div className={c.boutons}>
            <Link to="/medecin/declarations/enregistrer-deces" className={c.principal}>
              <FaPlus aria-hidden="true" /> Enregistrer un décès
            </Link>
          </div>
        )}
      </header>

      <div className={`${c.compteurs} ${s.compteurs}`}>
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
          <label className={`${c.champ} ${c.recherche} ${s.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher par N° certificat, code patient, nom, cause ou médecin…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher une déclaration de décès"
            />
          </label>

          <div className={s.onglets}>
            {(
              [
                ['tous', 'Tous', stats.total],
                ['patient', 'Patients', stats.patients],
                ['enfant', 'Nouveaux-nés', stats.enfants],
                ['maternel', 'Maternels', stats.maternels],
              ] as const
            ).map(([cle, libelle, nb]) => (
              <button key={cle} type="button" className={`${s.onglet} ${filtre === cle ? s.ongletActif : ''}`} onClick={() => setFiltre(cle)}>
                {filtre === cle && <motion.span layoutId="ongletDeces" className={s.ongletFond} />}
                <span className={s.ongletTexte}>
                  {libelle} <small>{nb}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {deces && deces.length === 0 ? (
          <div className={s.vide}>
            <FaFileMedicalAlt aria-hidden="true" />
            <strong>Aucune déclaration de décès enregistrée</strong>
            <p>Les déclarations de décès constatées au sein de votre établissement apparaîtront ici.</p>
          </div>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">N° Certificat</th>
                  <th scope="col">Personne</th>
                  <th scope="col">Code DM</th>
                  <th scope="col">Photo</th>
                  <th scope="col">Nom &amp; Prénoms</th>
                  <th scope="col">Genre</th>
                  <th scope="col">Âge</th>
                  <th scope="col">Date &amp; Heure</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((d, i) => {
                  const g = (d.genre ?? d.patient.genre ?? '').toUpperCase();
                  const estMasculin = g === 'M' || g.startsWith('MASC');
                  const urlPhoto = d.patient.imgUrl ? (d.patient.imgUrl.startsWith('http') ? d.patient.imgUrl : uploadUrl('patient', d.patient.imgUrl)) : null;
                  const afficherPhoto = urlPhoto && !imgErreurs[d.id];

                  return (
                    <motion.tr key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                      <td>
                        <span className={s.code}>{d.reference}</span>
                        {d.decesMaternel && (
                          <span className={`${c.badge} ${s.badgeDanger}`} style={{ marginLeft: 6 }}>
                            Maternel
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`${c.badge} ${d.personne === 'enfant' ? s.badgeAttention : c.badgeOk}`}>{d.personne === 'enfant' ? 'Nouveau-né' : 'Patient'}</span>
                      </td>
                      <td>
                        <span className={s.code}>{d.patient.code}</span>
                      </td>
                      <td>
                        {afficherPhoto ? (
                          <img src={urlPhoto} alt={d.patient.nom} className={s.avatar} onError={() => setImgErreurs((prev) => ({ ...prev, [d.id]: true }))} />
                        ) : (
                          <span className={s.avatarInitiales}>{initiales(d.patient.nom)}</span>
                        )}
                      </td>
                      <td>
                        {d.patient.id && espace === 'hopital' ? (
                          <Link to={`${baseHopital()}/patients/${d.patient.id}`} className={s.lienPatient}>
                            {d.patient.nom}
                          </Link>
                        ) : (
                          <strong>{d.patient.nom}</strong>
                        )}
                        {d.personne === 'enfant' && <span className={c.sousTexte}>Enfant de la patiente</span>}
                      </td>
                      <td>
                        <span className={`${c.badge} ${estMasculin ? s.genreM : s.genreF}`}>{libelleGenre(d.genre ?? d.patient.genre)}</span>
                      </td>
                      <td>
                        <strong>{d.age ? `${d.age} ans` : '—'}</strong>
                      </td>
                      <td>
                        <strong>{formatDate(d.dateDeces)}</strong>
                        {d.heureDeces && <span className={c.sousTexte}>à {d.heureDeces}</span>}
                      </td>
                      <td>
                        <div className={c.actions}>
                          <Link to={`${base}/declarations/deces/${d.id}`} className={`${c.icone} ${c.iconeVoir}`} title="Voir les détails" aria-label={`Voir la déclaration ${d.reference}`}>
                            <FaEye />
                          </Link>
                          <Link to={`${base}/declarations/deces/${d.id}?imprimer=1`} className={`${c.icone} ${s.iconeImprimer}`} title="Certificat médical de décès" aria-label={`Certificat de décès ${d.reference}`}>
                            <FaFilePdf />
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {deces && filtres.length === 0 && (
                  <tr>
                    <td colSpan={9} className={c.vide}>
                      Aucune déclaration de décès ne correspond à votre recherche.
                    </td>
                  </tr>
                )}
                {!deces && (
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
