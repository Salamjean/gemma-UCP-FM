import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaBed, FaDoorOpen, FaEdit, FaPercent, FaPlus, FaPowerOff, FaSearch, FaTrashAlt, FaUserInjured } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import { fcfa } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { Chambre } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Chambres.module.css';
import ExportExcel from '../../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

type Action = { type: 'statut' | 'supprimer'; chambre: Chambre };
type Filtre = 'toutes' | 'individual' | 'collective';

/**
 * HÔPITAL > HOSPITALISATION > GESTION DES CHAMBRES
 * Équivalent Laravel : hospital.bedroom.index (users/hospital/chambre/index.blade.php)
 * Données : GET /api/hospital/chambres
 */
export default function Liste() {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [action, setAction] = useState<Action | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.hospital.chambres
      .liste()
      .then(setChambres)
      .catch((e) => {
        setChambres([]);
        alerte.echec(`Impossible de charger les chambres : ${messageErreur(e)}`);
      });
  }, []);

  const executer = async () => {
    if (!action) return;
    const { chambre } = action;
    setEnCours(true);
    try {
      if (action.type === 'statut') {
        const r = await api.hospital.chambres.basculerStatut(chambre.id);
        setChambres((l) => l?.map((x) => (x.id === chambre.id ? { ...x, actif: r.actif } : x)) ?? null);
        alerte.succes(r.message);
      } else {
        const r = await api.hospital.chambres.supprimer(chambre.id);
        setChambres((l) => l?.filter((x) => x.id !== chambre.id) ?? null);
        alerte.succes(r.message);
      }
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setAction(null);
      setEnCours(false);
    }
  };

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (chambres ?? []).filter(
      (x) => (filtre === 'toutes' || x.type === filtre) && (!q || [x.numero, x.description].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [chambres, recherche, filtre]);
  const pg = usePagination(filtres);

  const totalLits = chambres?.reduce((t, x) => t + x.lits, 0) ?? 0;
  const totalOccupes = chambres?.reduce((t, x) => t + x.occupes, 0) ?? 0;
  const compteurs = chambres
    ? [
        { icone: FaDoorOpen, valeur: String(chambres.length), libelle: 'Chambres', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaBed, valeur: String(totalLits), libelle: 'Lits au total', fond: '#efe9fd', texte: '#6a3fd6' },
        { icone: FaUserInjured, valeur: String(totalOccupes), libelle: 'Lits occupés', fond: '#fff3df', texte: '#b56b00' },
        { icone: FaPercent, valeur: totalLits ? `${Math.round((totalOccupes / totalLits) * 100)} %` : '—', libelle: "Taux d'occupation", fond: '#e3f5ee', texte: '#0b7a54' },
      ]
    : [];

  const textes =
    action &&
    (action.type === 'supprimer'
      ? {
          titre: 'Supprimer cette chambre ?',
          message: `La chambre « ${action.chambre.numero} » et ses ${action.chambre.lits} lit(s) ne seront plus proposés. L'historique des hospitalisations est conservé.`,
          bouton: 'Supprimer',
          ton: 'danger' as const,
        }
      : action.chambre.actif
        ? { titre: 'Désactiver cette chambre ?', message: `La chambre « ${action.chambre.numero} » ne sera plus proposée aux médecins tant qu'elle ne sera pas réactivée.`, bouton: 'Désactiver', ton: 'danger' as const }
        : { titre: 'Activer cette chambre ?', message: `La chambre « ${action.chambre.numero} » sera de nouveau proposée.`, bouton: 'Activer', ton: 'normal' as const });

  const FILTRES: { id: Filtre; libelle: string }[] = [
    { id: 'toutes', libelle: 'Toutes' },
    { id: 'individual', libelle: 'Individuelles' },
    { id: 'collective', libelle: 'Collectives' },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Hospitalisation</p>
          <h1 className={c.titre}>Gestion des chambres</h1>
        </div>
        <Link to={`${baseHopital()}/hospitalisation/chambres/ajouter`} className={c.principal}>
          <FaPlus aria-hidden="true" /> Ajouter une chambre
        </Link>
        <div className={c.boutons}>
          <ExportExcel
            fichier="chambres"
            titre="Chambres"
            module="HOSPITALISATION"
            lignes={filtres}
            colonnes={[
              { titre: 'Chambre', valeur: (x) => x.numero },
              { titre: 'Description', valeur: (x) => x.description },
              { titre: 'Type', valeur: (x) => (x.type === 'collective' ? 'Collective' : 'Individuelle') },
              { titre: 'Lits', valeur: (x) => x.lits },
              { titre: 'Lits occupés', valeur: (x) => x.occupes },
              { titre: 'Lits libres', valeur: (x) => x.lits - x.occupes },
              { titre: 'Prix / jour (FCFA)', valeur: (x) => x.prix },
              { titre: 'Statut', valeur: (x) => (x.actif ? 'Activée' : 'Désactivée') },
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
              <strong>{k.valeur}</strong>
              <span>{k.libelle}</span>
            </span>
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <label className={`${c.champ} ${c.recherche} ${styles.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Numéro ou description…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une chambre" />
          </label>
          <div className={styles.onglets} role="tablist" aria-label="Type de chambre">
            {FILTRES.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filtre === f.id} className={`${styles.onglet} ${filtre === f.id ? styles.ongletActif : ''}`} onClick={() => setFiltre(f.id)}>
                {filtre === f.id && <motion.span layoutId="filtre-chambres" className={styles.ongletFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span className={styles.ongletTexte}>{f.libelle}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Chambre</th>
                <th scope="col">Type</th>
                <th scope="col">Lits</th>
                <th scope="col">Prix / jour</th>
                <th scope="col">Statut</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.lignes.map((x, i) => (
                <motion.tr key={x.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                  <td>
                    <strong className={styles.numero}>{x.numero}</strong>
                    {x.description && <span className={c.sousTexte}>{x.description}</span>}
                  </td>
                  <td>
                    <span className={`${c.badge} ${x.type === 'collective' ? styles.badgeCollective : styles.badgeIndividuelle}`}>
                      {x.type === 'collective' ? 'Collective' : 'Individuelle'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.lits} title={`${x.occupes} occupé(s) sur ${x.lits}`}>
                      {Array.from({ length: Math.min(x.lits, 12) }, (_, k) => (
                        <FaBed key={k} className={k < x.occupes ? styles.litOccupe : styles.litLibre} aria-hidden="true" />
                      ))}
                      {x.lits > 12 && <small>+{x.lits - 12}</small>}
                    </div>
                    <span className={c.sousTexte}>
                      {x.lits - x.occupes} libre{x.lits - x.occupes > 1 ? 's' : ''} sur {x.lits}
                    </span>
                  </td>
                  <td className={styles.prix}>{fcfa(x.prix)}</td>
                  <td>
                    <span className={`${c.badge} ${x.actif ? c.badgeOk : styles.badgeKo}`}>{x.actif ? 'Activée' : 'Désactivée'}</span>
                  </td>
                  <td>
                    <div className={c.actions}>
                      <Link to={`${baseHopital()}/hospitalisation/chambres/${x.id}/modifier`} className={`${c.icone} ${styles.iconeModifier}`} title="Modifier la chambre et ses lits" aria-label={`Modifier la chambre ${x.numero}`}>
                        <FaEdit />
                      </Link>
                      <button type="button" className={`${c.icone} ${styles.iconeStatut}`} title={x.actif ? 'Désactiver' : 'Activer'} aria-label={`${x.actif ? 'Désactiver' : 'Activer'} la chambre ${x.numero}`} onClick={() => setAction({ type: 'statut', chambre: x })}>
                        <FaPowerOff />
                      </button>
                      <button
                        type="button"
                        className={`${c.icone} ${c.iconeSupprimer}`}
                        title={x.occupes > 0 ? 'Des lits sont occupés : suppression impossible' : 'Supprimer'}
                        aria-label={`Supprimer la chambre ${x.numero}`}
                        disabled={x.occupes > 0}
                        onClick={() => setAction({ type: 'supprimer', chambre: x })}
                      >
                        <FaTrashAlt />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {chambres && filtres.length === 0 && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    {recherche || filtre !== 'toutes' ? 'Aucune chambre ne correspond.' : 'Aucune chambre pour le moment.'}
                  </td>
                </tr>
              )}
              {!chambres && (
                <tr>
                  <td colSpan={6} className={c.vide}>Chargement…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationTableau pagination={pg} />
      </section>

      <ConfirmDialog
        ouvert={!!action}
        titre={textes?.titre ?? ''}
        message={textes?.message ?? ''}
        confirmer={textes?.bouton ?? 'Confirmer'}
        ton={textes?.ton}
        enCours={enCours}
        onConfirmer={executer}
        onAnnuler={() => setAction(null)}
      />
    </div>
  );
}
