import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaBaby, FaEye, FaFemale, FaFilePdf, FaMale, FaSearch, FaUsers } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { EspaceDeclarations } from '../../../types';
import type { DeclarationNaissanceResume } from '../../../types';
import { baseHopital } from '../../../services/contexteHopital';
import s from './Declarations.module.css';
import ExportExcel from '../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

type FiltreNaissance = 'toutes' | 'M' | 'F';

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
 * HÔPITAL > DÉCLARATIONS > LISTE DES NAISSANCES
 * Équivalent Laravel : hospital.declaration.naissance.index (users/hospital/declaration/naissance/list.blade.php)
 */
export function ListeNaissances({ espace = 'hopital' }: { espace?: EspaceDeclarations } = {}) {
  /** Hôpital : toutes les déclarations ; médecin : les siennes */
  const source = espace === 'medecin' ? api.doctor.declarations : api.hospital.declarations;
  const base = espace === 'medecin' ? '/medecin' : `${baseHopital()}`;
  const [naissances, setNaissances] = useState<DeclarationNaissanceResume[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreNaissance>('toutes');
  const [imgErreurs, setImgErreurs] = useState<Record<number, boolean>>({});

  useEffect(() => {
    source
      .naissances()
      .then(setNaissances)
      .catch((e) => {
        setNaissances([]);
        alerte.echec(`Impossible de charger les déclarations de naissance : ${messageErreur(e)}`);
      });
  }, []);

  const stats = useMemo(() => {
    const liste = naissances ?? [];
    const total = liste.length;
    const garcons = liste.filter((n) => {
      const g = (n.genreEnfant ?? '').toUpperCase();
      return g === 'M' || g.startsWith('MASC');
    }).length;
    const filles = liste.filter((n) => {
      const g = (n.genreEnfant ?? '').toUpperCase();
      return g === 'F' || g.startsWith('FEM') || g.startsWith('FÉM');
    }).length;
    const multiples = liste.filter((n) => n.nombreEnfants > 1).length;
    return { total, garcons, filles, multiples };
  }, [naissances]);

  const filtrees = useMemo(() => {
    const liste = naissances ?? [];
    const q = recherche.trim().toLowerCase();
    return liste.filter((n) => {
      const g = (n.genreEnfant ?? '').toUpperCase();
      if (filtre === 'M' && !(g === 'M' || g.startsWith('MASC'))) return false;
      if (filtre === 'F' && !(g === 'F' || g.startsWith('FEM') || g.startsWith('FÉM'))) return false;
      if (!q) return true;
      return (
        n.referenceCmn.toLowerCase().includes(q) ||
        (n.referenceDn ?? '').toLowerCase().includes(q) ||
        (n.enfant.code ?? '').toLowerCase().includes(q) ||
        n.mere.nom.toLowerCase().includes(q) ||
        n.mere.code.toLowerCase().includes(q) ||
        (n.medecin ?? '').toLowerCase().includes(q)
      );
    });
  }, [naissances, recherche, filtre]);
  const pg = usePagination(filtrees);

  const compteurs = naissances
    ? [
        { icone: FaBaby, valeur: stats.total, libelle: 'Total déclarations', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaMale, valeur: stats.garcons, libelle: 'Garçons', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaFemale, valeur: stats.filles, libelle: 'Filles', fond: '#fde0e6', texte: '#c4213f' },
        { icone: FaUsers, valeur: stats.multiples, libelle: 'Naissances multiples', fond: '#fff3df', texte: '#b56b00' },
      ]
    : [];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Déclarations · État civil</p>
          <h1 className={c.titre}>{espace === 'medecin' ? 'Mes déclarations de naissance' : 'Liste des déclarations de naissance'}</h1>
        </div>
        <div className={c.boutons}>
          {espace === 'hopital' && (
            <ExportExcel
              fichier="declarations_naissances"
              titre="Déclarations de naissance"
              module="DECLARATION"
              lignes={filtrees}
              colonnes={[
                { titre: 'N° certificat (CMN)', valeur: (n) => n.referenceCmn },
                { titre: 'Référence DN', valeur: (n) => n.referenceDn },
                { titre: 'DM enfant', valeur: (n) => n.enfant.code },
                { titre: 'Mère', valeur: (n) => n.mere.nom },
                { titre: 'DM mère', valeur: (n) => n.mere.code },
                { titre: 'Genre enfant', valeur: (n) => libelleGenre(n.genreEnfant) },
                { titre: "Nombre d'enfants", valeur: (n) => n.nombreEnfants },
                { titre: 'Date de naissance', valeur: (n) => formatDate(n.dateNaissance) },
                { titre: 'Heure', valeur: (n) => n.heureNaissance },
              ]}
            />
          )}
        </div>
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
              placeholder="Rechercher par N° certificat CMN, DM enfant, nom ou code de la mère…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher une déclaration de naissance"
            />
          </label>

          <div className={s.onglets}>
            {(
              [
                ['toutes', 'Toutes', stats.total],
                ['M', 'Masculin', stats.garcons],
                ['F', 'Féminin', stats.filles],
              ] as const
            ).map(([cle, libelle, nb]) => (
              <button key={cle} type="button" className={`${s.onglet} ${filtre === cle ? s.ongletActif : ''}`} onClick={() => setFiltre(cle)}>
                {filtre === cle && <motion.span layoutId="ongletNaissance" className={s.ongletFond} />}
                <span className={s.ongletTexte}>
                  {libelle} <small>{nb}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {naissances && naissances.length === 0 ? (
          <div className={s.vide}>
            <FaBaby aria-hidden="true" />
            <strong>Aucune déclaration de naissance enregistrée</strong>
            <p>Les déclarations de naissance établies par vos praticiens apparaîtront dans ce registre.</p>
          </div>
        ) : (
          <>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">N° Certificat (CMN)</th>
                  <th scope="col">Photo</th>
                  <th scope="col">DM Enfant</th>
                  <th scope="col">Mère</th>
                  <th scope="col">Genre enfant</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Date &amp; Heure</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((n, i) => {
                  const g = (n.genreEnfant ?? '').toUpperCase();
                  const estGarcon = g === 'M' || g.startsWith('MASC');
                  const urlPhoto = n.mere.imgUrl ? (n.mere.imgUrl.startsWith('http') ? n.mere.imgUrl : uploadUrl('patient', n.mere.imgUrl)) : null;
                  const afficherPhoto = urlPhoto && !imgErreurs[n.id];

                  return (
                    <motion.tr key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                      <td>
                        <span className={s.code}>{n.referenceCmn}</span>
                        {n.referenceDn && <span className={c.sousTexte}>{n.referenceDn}</span>}
                      </td>
                      <td>
                        {afficherPhoto ? (
                          <img src={urlPhoto} alt={n.mere.nom} className={s.avatar} onError={() => setImgErreurs((prev) => ({ ...prev, [n.id]: true }))} />
                        ) : (
                          <span className={s.avatarInitiales}>{initiales(n.mere.nom)}</span>
                        )}
                      </td>
                      <td>{n.enfant.code ? <span className={s.code}>{n.enfant.code}</span> : <span className={c.sousTexte}>—</span>}</td>
                      <td>
                        {n.mere.id && espace === 'hopital' ? (
                          <Link to={`${baseHopital()}/patients/${n.mere.id}`} className={s.lienPatient}>
                            {n.mere.nom}
                          </Link>
                        ) : (
                          <strong>{n.mere.nom}</strong>
                        )}
                        <span className={c.sousTexte}>{n.mere.code}</span>
                      </td>
                      <td>
                        <span className={`${c.badge} ${estGarcon ? s.genreM : s.genreF}`}>{libelleGenre(n.genreEnfant)}</span>
                      </td>
                      <td>
                        <span className={`${c.badge} ${n.nombreEnfants > 1 ? s.badgeAttention : c.badgeNeutre}`}>
                          {n.nombreEnfants} {n.nombreEnfants > 1 ? 'enfants' : 'enfant'}
                        </span>
                      </td>
                      <td>
                        <strong>{formatDate(n.dateNaissance)}</strong>
                        {n.heureNaissance && <span className={c.sousTexte}>à {n.heureNaissance}</span>}
                      </td>
                      <td>
                        <div className={c.actions}>
                          <Link to={`${base}/declarations/naissances/${n.id}`} className={`${c.icone} ${c.iconeVoir}`} title="Voir les détails" aria-label={`Voir la déclaration ${n.referenceCmn}`}>
                            <FaEye />
                          </Link>
                          <Link
                            to={`${base}/declarations/naissances/${n.id}?imprimer=1`}
                            className={`${c.icone} ${s.iconeImprimer}`}
                            title="Certificat médical de naissance (CMN)"
                            aria-label={`Certificat CMN ${n.referenceCmn}`}
                          >
                            <FaFilePdf />
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {naissances && filtrees.length === 0 && (
                  <tr>
                    <td colSpan={8} className={c.vide}>
                      Aucune déclaration de naissance ne correspond à votre recherche.
                    </td>
                  </tr>
                )}
                {!naissances && (
                  <tr>
                    <td colSpan={8} className={c.vide}>
                      Chargement…
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
