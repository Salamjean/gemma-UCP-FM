import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaCrown, FaEdit, FaPlus, FaPowerOff, FaSearch, FaTrashAlt, FaUsers } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api, uploadUrl } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { Agent, TypeAgent } from '../../../../types';
import { AGENTS, JOURS } from '../personnel.config';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './ListeAgents.module.css';
import ExportExcel from '../../../../components/ExportExcel';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

type Action = { type: 'statut' | 'supprimer' | 'chef'; agent: Agent };

const AVATAR_DEFAUT = '/images/dashboard/avatar-doctor.png';

/**
 * HÔPITAL > PERSONNEL DE SANTÉ > LISTE (médecins, sages-femmes ou infirmiers)
 * Équivalent Laravel : hospital.doctor.index.medecin / index.sage, hospital.infirmier.index
 */
export default function ListeAgents({ type }: { type: TypeAgent }) {
  const conf = AGENTS[type];
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setAgents(null);
    setRecherche('');
    api.hospital.personnel
      .liste(type)
      .then(setAgents)
      .catch((e) => {
        setAgents([]);
        alerte.echec(`Impossible de charger la liste : ${messageErreur(e)}`);
      });
  }, [type]);

  const executer = async () => {
    if (!action) return;
    const { agent } = action;
    setEnCours(true);
    try {
      if (action.type === 'statut') {
        const r = await api.hospital.personnel.basculerStatut(type, agent.id);
        setAgents((l) => l?.map((a) => (a.id === agent.id ? { ...a, actif: r.actif } : a)) ?? null);
        alerte.succes(r.message);
      } else if (action.type === 'chef') {
        const r = await api.hospital.personnel.basculerChef(agent.id);
        setAgents((l) => l?.map((a) => (a.id === agent.id ? { ...a, chef: r.chef } : a)) ?? null);
        alerte.succes(r.message);
      } else {
        const r = await api.hospital.personnel.supprimer(type, agent.id);
        setAgents((l) => l?.filter((a) => a.id !== agent.id) ?? null);
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
    if (!agents || !q) return agents ?? [];
    return agents.filter((a) => [a.nom, a.email, a.matricule, a.contact, a.service, a.specialite].some((v) => v?.toLowerCase().includes(q)));
  }, [agents, recherche]);
  const pg = usePagination(filtres);

  const avecSpecialite = type === 'medecin';
  const colonnes = 6 + (avecSpecialite ? 1 : 0) - (type === 'regulateur' ? 1 : 0);

  const compteurs = agents
    ? [
        { icone: conf.icone, valeur: agents.length, libelle: conf.pluriel, fond: conf.fond, texte: conf.texte },
        { icone: FaCheckCircle, valeur: agents.filter((a) => a.actif).length, libelle: 'Activés', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaUsers, valeur: agents.filter((a) => !a.actif).length, libelle: 'Désactivés', fond: '#fde0e6', texte: '#c4213f' },
      ]
    : [];

  const textes =
    action &&
    {
      supprimer: {
        titre: 'Supprimer cet agent ?',
        message: `« ${action.agent.nom} » sera retiré(e) de la liste. Son historique (consultations, planning) est conservé.`,
        bouton: 'Supprimer',
        ton: 'danger' as const,
      },
      statut: action.agent.actif
        ? { titre: 'Désactiver cet agent ?', message: `« ${action.agent.nom} » ne pourra plus se connecter tant qu'il ne sera pas réactivé.`, bouton: 'Désactiver', ton: 'danger' as const }
        : { titre: 'Activer cet agent ?', message: `« ${action.agent.nom} » pourra de nouveau se connecter.`, bouton: 'Activer', ton: 'normal' as const },
      chef: action.agent.chef
        ? { titre: 'Retirer le rôle de médecin chef ?', message: `« ${action.agent.nom} » ne sera plus médecin chef.`, bouton: 'Retirer', ton: 'danger' as const }
        : { titre: 'Nommer médecin chef ?', message: `« ${action.agent.nom} » deviendra médecin chef de l'hôpital.`, bouton: 'Nommer', ton: 'normal' as const },
    }[action.type];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Personnel de santé</p>
          <h1 className={c.titre}>Liste des {conf.pluriel.toLowerCase()}</h1>
        </div>
        <Link to={`${baseHopital()}/personnel-sante/ajouter?type=${type}`} className={c.principal}>
          <FaPlus aria-hidden="true" /> Ajouter un(e) {conf.libelle.toLowerCase()}
        </Link>
        <div className={c.boutons}>
          <ExportExcel
            fichier={conf.chemin}
            titre={conf.pluriel}
            module="PERSONNEL"
            lignes={filtres}
            colonnes={[
              { titre: 'Nom', valeur: (a) => a.nom },
              { titre: 'Matricule', valeur: (a) => a.matricule },
              { titre: 'Email', valeur: (a) => a.email },
              { titre: 'Contact', valeur: (a) => a.contact },
              ...(type === 'medecin' ? [{ titre: 'Spécialité', valeur: (a: (typeof filtres)[number]) => a.specialite }] : []),
              ...(type !== 'regulateur' ? [{ titre: type === 'infirmier' ? 'Services' : 'Service', valeur: (a: (typeof filtres)[number]) => a.service }] : []),
              ...(type === 'medecin' || type === 'sage-femme' ? [{ titre: 'Actes', valeur: (a: (typeof filtres)[number]) => a.actes }] : []),
              ...(type === 'medecin' ? [{ titre: 'Médecin chef', valeur: (a: (typeof filtres)[number]) => (a.chef ? 'Oui' : 'Non') }] : []),
              { titre: 'Jours de disponibilité', valeur: (a) => a.jours.map((j) => JOURS[j]).join(', ') },
              { titre: 'Statut', valeur: (a) => (a.actif ? 'Activé' : 'Désactivé') },
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
            <input type="search" placeholder="Nom, matricule, contact, service…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un agent" />
          </label>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Matricule</th>
                {avecSpecialite && <th scope="col">Spécialité</th>}
                {type !== 'regulateur' && <th scope="col">{type === 'infirmier' ? 'Services' : 'Service'}</th>}
                <th scope="col">Disponibilités</th>
                <th scope="col">Statut</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.lignes.map((a, i) => (
                <motion.tr key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                  <td>
                    <div className={styles.agent}>
                      <img src={a.photo ? uploadUrl(conf.dossier, a.photo) : AVATAR_DEFAUT} alt="" className={styles.photo} onError={(e) => (e.currentTarget.src = AVATAR_DEFAUT)} />
                      <span className={styles.identite}>
                        <strong>
                          {a.nom}
                          {a.chef && (
                            <span className={styles.chef} title="Médecin chef">
                              <FaCrown aria-hidden="true" /> Chef
                            </span>
                          )}
                        </strong>
                        <span className={c.sousTexte}>{a.contact ?? a.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className={styles.matricule}>{a.matricule ?? '—'}</td>
                  {avecSpecialite && <td>{a.specialite ?? '—'}</td>}
                  {type !== 'regulateur' && (
                    <td>
                      {a.service ?? '—'}
                      {a.actes !== null && <span className={c.sousTexte}>{a.actes} acte{a.actes > 1 ? 's' : ''}</span>}
                    </td>
                  )}
                  <td>
                    <div className={styles.jours} aria-label={`Disponible : ${a.jours.map((j) => JOURS[j]).join(', ') || 'aucun jour'}`}>
                      {JOURS.map((j, idx) => (
                        <span key={j} className={a.jours.includes(idx) ? styles.jourActif : ''} title={j}>
                          {j.charAt(0)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`${c.badge} ${a.actif ? c.badgeOk : styles.badgeKo}`}>{a.actif ? 'Activé' : 'Désactivé'}</span>
                  </td>
                  <td>
                    <div className={c.actions}>
                      <Link to={`${baseHopital()}/personnel-sante/${type}/${a.id}/modifier`} className={`${c.icone} ${styles.iconeModifier}`} title="Modifier" aria-label={`Modifier ${a.nom}`}>
                        <FaEdit />
                      </Link>
                      {type === 'medecin' && (
                        <button
                          type="button"
                          className={`${c.icone} ${a.chef ? styles.iconeChefActif : styles.iconeChef}`}
                          title={a.chef ? 'Retirer le rôle de médecin chef' : 'Nommer médecin chef'}
                          aria-label={a.chef ? `Retirer le rôle de médecin chef à ${a.nom}` : `Nommer ${a.nom} médecin chef`}
                          onClick={() => setAction({ type: 'chef', agent: a })}
                        >
                          <FaCrown />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${c.icone} ${styles.iconeStatut}`}
                        title={a.actif ? 'Désactiver' : 'Activer'}
                        aria-label={`${a.actif ? 'Désactiver' : 'Activer'} ${a.nom}`}
                        onClick={() => setAction({ type: 'statut', agent: a })}
                      >
                        <FaPowerOff />
                      </button>
                      <button type="button" className={`${c.icone} ${c.iconeSupprimer}`} title="Supprimer" aria-label={`Supprimer ${a.nom}`} onClick={() => setAction({ type: 'supprimer', agent: a })}>
                        <FaTrashAlt />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {agents && filtres.length === 0 && (
                <tr>
                  <td colSpan={colonnes} className={c.vide}>
                    {recherche ? 'Aucun agent ne correspond à la recherche.' : 'Aucun agent pour le moment.'}
                  </td>
                </tr>
              )}
              {!agents && (
                <tr>
                  <td colSpan={colonnes} className={c.vide}>Chargement…</td>
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
