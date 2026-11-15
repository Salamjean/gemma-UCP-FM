import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaEdit, FaPercent, FaPlus, FaPowerOff, FaSearch, FaShieldAlt, FaTrashAlt, FaUsers } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { Assurance } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Liste.module.css';
import ExportExcel from '../../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

type Action = { type: 'statut' | 'supprimer'; assurance: Assurance };

/**
 * HÔPITAL > ASSURANCES > LISTE
 * Équivalent Laravel : hospital.type.assurance.index (users/hospital/type_assurance/index.blade.php)
 * Données : GET /api/hospital/assurances
 */
export default function Liste() {
  const [assurances, setAssurances] = useState<Assurance[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.hospital.assurances
      .liste()
      .then(setAssurances)
      .catch((e) => {
        setAssurances([]);
        alerte.echec(`Impossible de charger les assurances : ${messageErreur(e)}`);
      });
  }, []);

  const executer = async () => {
    if (!action) return;
    const { type, assurance } = action;
    setEnCours(true);
    try {
      if (type === 'statut') {
        const r = await api.hospital.assurances.basculerStatut(assurance.id);
        setAssurances((l) => l?.map((a) => (a.id === assurance.id ? { ...a, actif: r.actif } : a)) ?? null);
        alerte.succes(r.message);
      } else {
        const r = await api.hospital.assurances.supprimer(assurance.id);
        setAssurances((l) => l?.filter((a) => a.id !== assurance.id) ?? null);
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
    if (!assurances || !q) return assurances ?? [];
    return assurances.filter((a) => [a.libelle, a.description, a.reference].some((v) => v?.toLowerCase().includes(q)));
  }, [assurances, recherche]);
  const pg = usePagination(filtres);

  const compteurs = assurances
    ? [
        { icone: FaShieldAlt, valeur: String(assurances.length), libelle: 'Assurances', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaCheckCircle, valeur: String(assurances.filter((a) => a.actif).length), libelle: 'Assurances activées', fond: '#e3f5ee', texte: '#0b7a54' },
        {
          icone: FaPercent,
          valeur: assurances.length ? `${Math.round(assurances.reduce((t, a) => t + a.reduction, 0) / assurances.length)} %` : '—',
          libelle: 'Prise en charge moyenne',
          fond: '#fff3df',
          texte: '#b56b00',
        },
        { icone: FaUsers, valeur: assurances.reduce((t, a) => t + (a.patients ?? 0), 0).toLocaleString('fr-FR'), libelle: 'Patients couverts', fond: '#efe9fd', texte: '#6a3fd6' },
      ]
    : [];

  const textes =
    action &&
    (action.type === 'supprimer'
      ? {
          titre: 'Supprimer cette assurance ?',
          message:
            `« ${action.assurance.libelle} » ne sera plus proposée.` +
            (action.assurance.patients ? ` ${action.assurance.patients} patient(s) y sont rattachés : leur historique est conservé.` : ''),
          bouton: 'Supprimer',
          ton: 'danger' as const,
        }
      : action.assurance.actif
        ? { titre: 'Désactiver cette assurance ?', message: `« ${action.assurance.libelle} » ne sera plus proposée tant qu'elle ne sera pas réactivée.`, bouton: 'Désactiver', ton: 'danger' as const }
        : { titre: 'Activer cette assurance ?', message: `« ${action.assurance.libelle} » sera de nouveau proposée.`, bouton: 'Activer', ton: 'normal' as const });

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Assurances</p>
          <h1 className={c.titre}>Liste des assurances</h1>
        </div>
        <Link to={`${baseHopital()}/assurances/ajouter`} className={c.principal}>
          <FaPlus aria-hidden="true" /> Ajouter une assurance
        </Link>
        <div className={c.boutons}>
          <ExportExcel
            fichier="assurances"
            titre="Assurances"
            module="ASSURANCE"
            lignes={filtres}
            colonnes={[
              { titre: 'Assurance', valeur: (a) => a.libelle },
              { titre: 'Description', valeur: (a) => a.description },
              { titre: 'Référence', valeur: (a) => a.reference },
              { titre: 'Réduction (%)', valeur: (a) => a.reduction },
              { titre: 'Patients', valeur: (a) => a.patients ?? 0 },
              { titre: 'Statut', valeur: (a) => (a.actif ? 'Activée' : 'Désactivée') },
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
            <input type="search" placeholder="Rechercher une assurance…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une assurance" />
          </label>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Assurance</th>
                <th scope="col">Référence</th>
                <th scope="col">Prise en charge</th>
                <th scope="col">Patients</th>
                <th scope="col">Statut</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.lignes.map((a, i) => (
                <motion.tr key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                  <td>
                    <strong>{a.libelle}</strong>
                    {a.description && <span className={c.sousTexte}>{a.description}</span>}
                  </td>
                  <td className={styles.reference}>{a.reference ?? '—'}</td>
                  <td>
                    <div className={styles.taux}>
                      <span className={styles.tauxBarre}>
                        <motion.span initial={{ width: 0 }} animate={{ width: `${a.reduction}%` }} transition={{ delay: 0.15 + Math.min(i, 12) * 0.04, duration: 0.5 }} />
                      </span>
                      <strong>{a.reduction} %</strong>
                    </div>
                  </td>
                  <td>{a.patients ?? 0}</td>
                  <td>
                    <span className={`${c.badge} ${a.actif ? c.badgeOk : styles.badgeKo}`}>{a.actif ? 'Activée' : 'Désactivée'}</span>
                  </td>
                  <td>
                    <div className={c.actions}>
                      <Link to={`${baseHopital()}/assurances/${a.id}/modifier`} className={`${c.icone} ${c.iconeVoir}`} title="Modifier" aria-label={`Modifier ${a.libelle}`}>
                        <FaEdit />
                      </Link>
                      <button
                        type="button"
                        className={`${c.icone} ${styles.iconeStatut}`}
                        title={a.actif ? 'Désactiver' : 'Activer'}
                        aria-label={`${a.actif ? 'Désactiver' : 'Activer'} ${a.libelle}`}
                        onClick={() => setAction({ type: 'statut', assurance: a })}
                      >
                        <FaPowerOff />
                      </button>
                      <button
                        type="button"
                        className={`${c.icone} ${c.iconeSupprimer}`}
                        title="Supprimer"
                        aria-label={`Supprimer ${a.libelle}`}
                        onClick={() => setAction({ type: 'supprimer', assurance: a })}
                      >
                        <FaTrashAlt />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {assurances && filtres.length === 0 && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    {recherche ? 'Aucune assurance ne correspond à la recherche.' : 'Aucune assurance pour le moment.'}
                  </td>
                </tr>
              )}
              {!assurances && (
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
