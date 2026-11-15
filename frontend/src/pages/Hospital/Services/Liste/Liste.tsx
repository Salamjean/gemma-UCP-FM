import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaBuilding, FaCheckCircle, FaEdit, FaEye, FaPlus, FaPowerOff, FaSearch, FaStethoscope, FaTrashAlt, FaUserMd } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import { fcfa } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { ServiceHopital } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Liste.module.css';
import ExportExcel from '../../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

type Action = { type: 'statut' | 'supprimer'; service: ServiceHopital };

/** "1 000 FCFA" ou "1 000 – 33 000 FCFA" */
const fourchette = (s: ServiceHopital) => {
  if (s.prixMin === null || s.prixMax === null) return null;
  return s.prixMin === s.prixMax ? fcfa(s.prixMin) : `${s.prixMin.toLocaleString('fr-FR')} – ${fcfa(s.prixMax)}`;
};

/**
 * HÔPITAL > SERVICES > LISTE
 * Équivalent Laravel : hospital.service.index (users/hospital/service/index.blade.php)
 * Données : GET /api/hospital/services
 */
export default function Liste() {
  const [services, setServices] = useState<ServiceHopital[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.hospital.services
      .liste()
      .then(setServices)
      .catch((e) => {
        setServices([]);
        alerte.echec(`Impossible de charger les services : ${messageErreur(e)}`);
      });
  }, []);

  const executer = async () => {
    if (!action) return;
    const { type, service } = action;
    setEnCours(true);
    try {
      if (type === 'statut') {
        const r = await api.hospital.services.basculerStatut(service.id);
        setServices((l) => l?.map((s) => (s.id === service.id ? { ...s, actif: r.actif } : s)) ?? null);
        alerte.succes(r.message);
      } else {
        const r = await api.hospital.services.supprimer(service.id);
        setServices((l) => l?.filter((s) => s.id !== service.id) ?? null);
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
    if (!services || !q) return services ?? [];
    return services.filter((s) => [s.libelle, s.description].some((v) => v?.toLowerCase().includes(q)));
  }, [services, recherche]);
  const pg = usePagination(filtres);

  const compteurs = services
    ? [
        { icone: FaBuilding, valeur: services.length, libelle: 'Services ouverts', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaCheckCircle, valeur: services.filter((s) => s.actif).length, libelle: 'Services activés', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaStethoscope, valeur: services.reduce((t, s) => t + s.actes, 0), libelle: 'Actes médicaux tarifés', fond: '#fff3df', texte: '#b56b00' },
        { icone: FaUserMd, valeur: services.reduce((t, s) => t + s.agents, 0), libelle: 'Agents affectés', fond: '#efe9fd', texte: '#6a3fd6' },
      ]
    : [];

  const textes =
    action &&
    (action.type === 'supprimer'
      ? {
          titre: 'Supprimer ce service ?',
          message: `« ${action.service.libelle} » et ses ${action.service.actes} acte(s) médicaux seront supprimés de votre hôpital.`,
          bouton: 'Supprimer',
          ton: 'danger' as const,
        }
      : action.service.actif
        ? {
            titre: 'Désactiver ce service ?',
            message: `« ${action.service.libelle} » ne sera plus proposé tant qu'il ne sera pas réactivé.`,
            bouton: 'Désactiver',
            ton: 'danger' as const,
          }
        : {
            titre: 'Activer ce service ?',
            message: `« ${action.service.libelle} » sera de nouveau proposé.`,
            bouton: 'Activer',
            ton: 'normal' as const,
          });

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Services</p>
          <h1 className={c.titre}>Liste des services</h1>
        </div>
        <Link to={`${baseHopital()}/services/ajouter`} className={c.principal}>
          <FaPlus aria-hidden="true" /> Ajouter un service
        </Link>
        <div className={c.boutons}>
          <ExportExcel
            fichier="services"
            titre="Services"
            module="SERVICE"
            lignes={filtres}
            colonnes={[
              { titre: 'Service', valeur: (s) => s.libelle },
              { titre: 'Description', valeur: (s) => s.description },
              { titre: 'Actes', valeur: (s) => s.actes },
              { titre: 'Prix des actes', valeur: (s) => fourchette(s) || null },
              { titre: 'Agents', valeur: (s) => s.agents },
              { titre: 'Statut', valeur: (s) => (s.actif ? 'Activé' : 'Désactivé') },
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
            <input type="search" placeholder="Rechercher un service…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un service" />
          </label>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Actes médicaux</th>
                <th scope="col">Agents</th>
                <th scope="col">Statut</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.lignes.map((s, i) => (
                <motion.tr key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                  <td>
                    <Link to={`${baseHopital()}/services/${s.id}`} className={styles.nom}>{s.libelle}</Link>
                    {s.description && <span className={`${c.sousTexte} ${styles.description}`}>{s.description}</span>}
                  </td>
                  <td>
                    <strong>{s.actes} acte{s.actes > 1 ? 's' : ''}</strong>
                    {fourchette(s) && <span className={c.sousTexte}>{fourchette(s)}</span>}
                  </td>
                  <td>{s.agents}</td>
                  <td>
                    <span className={`${c.badge} ${s.actif ? c.badgeOk : styles.badgeKo}`}>{s.actif ? 'Activé' : 'Désactivé'}</span>
                  </td>
                  <td>
                    <div className={c.actions}>
                      <Link to={`${baseHopital()}/services/${s.id}`} className={`${c.icone} ${c.iconeVoir}`} title="Voir la fiche du service" aria-label={`Voir ${s.libelle}`}>
                        <FaEye />
                      </Link>
                      <Link to={`${baseHopital()}/services/${s.id}/modifier`} className={`${c.icone} ${styles.iconeModifier}`} title="Modifier les actes et les prix" aria-label={`Modifier ${s.libelle}`}>
                        <FaEdit />
                      </Link>
                      <button
                        type="button"
                        className={`${c.icone} ${s.actif ? styles.iconeActif : ''}`}
                        title={s.actif ? 'Désactiver' : 'Activer'}
                        aria-label={`${s.actif ? 'Désactiver' : 'Activer'} ${s.libelle}`}
                        onClick={() => setAction({ type: 'statut', service: s })}
                      >
                        <FaPowerOff />
                      </button>
                      <button
                        type="button"
                        className={`${c.icone} ${c.iconeSupprimer}`}
                        title={s.agents > 0 ? 'Des agents de santé sont affectés à ce service : suppression impossible' : 'Supprimer'}
                        aria-label={`Supprimer ${s.libelle}`}
                        disabled={s.agents > 0}
                        onClick={() => setAction({ type: 'supprimer', service: s })}
                      >
                        <FaTrashAlt />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {services && filtres.length === 0 && (
                <tr>
                  <td colSpan={5} className={c.vide}>
                    {recherche ? 'Aucun service ne correspond à la recherche.' : 'Aucun service pour le moment.'}
                  </td>
                </tr>
              )}
              {!services && (
                <tr>
                  <td colSpan={5} className={c.vide}>Chargement…</td>
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
