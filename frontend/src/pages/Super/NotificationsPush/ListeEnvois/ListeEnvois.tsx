import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { FaExclamationTriangle, FaEye, FaPaperPlane, FaRedo, FaSearch, FaTrashAlt } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import Pagination from '../../../../components/Pagination';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import type { CategorieDiffusion, ResumeDiffusion, StatistiquesAppareils } from '../../../../types';
import c from '../../../../styles/espace.module.css';
import Compteurs from '../Compteurs';
import { CATEGORIES, CIBLES, dateHeure } from '../notifications.config';
import styles from './ListeEnvois.module.css';
import ExportExcel from '../../../../components/ExportExcel';

/**
 * SUPER > NOTIFICATIONS PUSH > LISTE DES ENVOIS
 * Équivalent Laravel : super.notifications.index (users/super/notifications/index.blade.php)
 * Diffusions groupées par lot ; actions : voir, relancer, supprimer.
 */
export default function ListeEnvois() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatistiquesAppareils | null>(null);
  const [diffusions, setDiffusions] = useState<ResumeDiffusion[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState('');
  const [confirmation, setConfirmation] = useState<{ type: 'relancer' | 'supprimer'; d: ResumeDiffusion } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    api.super.notifications
      .liste(recherche, categorie, page)
      .then((r) => {
        setStats(r.statistiques);
        setDiffusions(r.diffusions);
        setTotal(r.total);
        setPages(r.pages);
        if (r.page !== page) setPage(r.page);
      })
      .catch((e) => alerte.echec(`Impossible de charger les diffusions : ${messageErreur(e)}`));
  }, [recherche, categorie, page]);

  // Recherche : petite attente pendant la frappe
  useEffect(() => {
    const t = setTimeout(charger, recherche ? 300 : 0);
    return () => clearTimeout(t);
  }, [charger, recherche]);

  const executer = async () => {
    if (!confirmation) return;
    setEnCours(true);
    try {
      if (confirmation.type === 'relancer') {
        const r = await api.super.notifications.relancer(confirmation.d.lot);
        setConfirmation(null);
        (r.type === 'succes' ? alerte.succes : alerte.attention)(r.message);
      } else {
        const r = await api.super.notifications.supprimer(confirmation.d.lot);
        setConfirmation(null);
        alerte.succes(r.message);
      }
      charger();
    } catch (e) {
      setConfirmation(null);
      alerte.echec(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Notifications push & In-App</p>
          <h1 className={c.titre}>Diffusions mobiles</h1>
        </div>
        <Link to="/super/notifications-push/nouvelle" className={c.principal}>
          <FaPaperPlane aria-hidden="true" /> Nouvelle diffusion
        </Link>
        <div className={c.boutons}>
          <ExportExcel
            fichier="notifications_push"
            titre="Historique des notifications push"
            module="NOTIFICATION"
            charger={async () => {
              // Liste paginée côté serveur : toutes les pages avec la recherche et la catégorie en cours
              const premiere = await api.super.notifications.liste(recherche, categorie, 1);
              const suite = await Promise.all(Array.from({ length: Math.max(0, premiere.pages - 1) }, (_, i) => api.super.notifications.liste(recherche, categorie, i + 2)));
              return [premiere, ...suite].flatMap((r) => r.diffusions);
            }}
            colonnes={[
              { titre: 'Titre', valeur: (d) => d.titre },
              { titre: 'Message', valeur: (d) => d.message, largeur: 60 },
              { titre: 'Cible', valeur: (d) => (CIBLES[d.cible] ?? CIBLES.all).label },
              { titre: 'Destinataires', valeur: (d) => d.destinataires },
              { titre: 'Catégorie', valeur: (d) => (CATEGORIES[d.categorie as CategorieDiffusion] ?? CATEGORIES.general).label },
              { titre: "Date d'envoi", valeur: (d) => dateHeure(d.date) },
              { titre: 'Envoyé par', valeur: (d) => d.envoyePar },
              { titre: 'Push envoyés', valeur: (d) => d.push },
              { titre: 'Lus', valeur: (d) => d.lus },
            ]}
          />
        </div>
      </header>

      {stats && <Compteurs stats={stats} />}
      {stats && !stats.pushConfigure && (
        <p className={c.bandeau}>
          <FaExclamationTriangle aria-hidden="true" />
          Firebase n'est pas configuré : les diffusions sont enregistrées In-App, mais aucun push n'est envoyé aux téléphones.
        </p>
      )}

      <section className={c.bloc}>
        <div className={c.filtres}>
          <label className={`${c.champ} ${c.recherche} ${styles.rechercheChamp}`}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher un titre, un message, un patient…"
              value={recherche}
              onChange={(e) => { setRecherche(e.target.value); setPage(1); }}
              aria-label="Rechercher une diffusion"
            />
          </label>
          <select className={c.champ} value={categorie} onChange={(e) => { setCategorie(e.target.value); setPage(1); }} aria-label="Filtrer par catégorie">
            <option value="">Toutes les catégories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col">Titre & message</th>
                <th scope="col">Cible & destinataires</th>
                <th scope="col">Catégorie</th>
                <th scope="col">Date d'envoi</th>
                <th scope="col">Canaux de diffusion</th>
                <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {diffusions?.map((d, i) => {
                const cat = CATEGORIES[d.categorie as CategorieDiffusion] ?? CATEGORIES.general;
                const cible = CIBLES[d.cible] ?? CIBLES.all;
                return (
                  <motion.tr key={d.lot} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <td className={styles.colTitre}>
                      <strong>{d.titre}</strong>
                      <span className={c.sousTexte}>{d.message.length > 90 ? `${d.message.slice(0, 90)}…` : d.message}</span>
                    </td>
                    <td>
                      <span className={styles.cible}><cible.icone aria-hidden="true" /> {cible.label}</span>
                      <span className={c.sousTexte}>{d.destinataires} destinataire{d.destinataires > 1 ? 's' : ''}</span>
                    </td>
                    <td>
                      <span className={c.badge} style={{ background: cat.fond, color: cat.texte }}>
                        <cat.icone aria-hidden="true" /> {cat.label}
                      </span>
                    </td>
                    <td className={styles.date}>
                      {dateHeure(d.date)}
                      <span className={c.sousTexte}>par {d.envoyePar}</span>
                    </td>
                    <td>
                      <div className={styles.canaux}>
                        <span className={`${c.badge} ${d.push > 0 ? c.badgeOk : c.badgeNeutre}`}>Push {d.push}</span>
                        <span className={`${c.badge} ${c.badgeNeutre}`}>In-App {d.destinataires}</span>
                        <span className={`${c.badge} ${c.badgeNeutre}`}>Lus {d.lus}</span>
                      </div>
                    </td>
                    <td>
                      <div className={c.actions}>
                        <button type="button" className={`${c.icone} ${c.iconeVoir}`} title="Voir le détail" aria-label="Voir le détail" onClick={() => navigate(`/super/notifications-push/${encodeURIComponent(d.lot)}`)}>
                          <FaEye />
                        </button>
                        <button type="button" className={`${c.icone} ${c.iconeRelancer}`} title="Relancer à l'identique" aria-label="Relancer à l'identique" onClick={() => setConfirmation({ type: 'relancer', d })}>
                          <FaRedo />
                        </button>
                        <button type="button" className={`${c.icone} ${c.iconeSupprimer}`} title="Supprimer de l'historique" aria-label="Supprimer de l'historique" onClick={() => setConfirmation({ type: 'supprimer', d })}>
                          <FaTrashAlt />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
              {diffusions && diffusions.length === 0 && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    {recherche || categorie ? 'Aucune diffusion ne correspond à la recherche.' : 'Aucune diffusion pour le moment.'}
                  </td>
                </tr>
              )}
              {!diffusions && (
                <tr><td colSpan={6} className={c.vide}>Chargement…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} onChange={setPage} resume={`${total} diffusion${total > 1 ? 's' : ''}`} />
      </section>

      <ConfirmDialog
        ouvert={!!confirmation}
        titre={confirmation?.type === 'relancer' ? 'Relancer cette notification ?' : 'Supprimer cette diffusion ?'}
        message={
          confirmation?.type === 'relancer'
            ? `« ${confirmation.d.titre} » sera de nouveau envoyée ${CIBLES[confirmation.d.cible]?.label.toLowerCase() ?? ''} (nouveau lot).`
            : `La campagne « ${confirmation?.d.titre ?? ''} » et ses ${confirmation?.d.destinataires ?? 0} notification(s) In-App seront supprimées de l'historique.`
        }
        confirmer={confirmation?.type === 'relancer' ? 'Relancer' : 'Supprimer'}
        ton={confirmation?.type === 'supprimer' ? 'danger' : 'normal'}
        enCours={enCours}
        onConfirmer={executer}
        onAnnuler={() => setConfirmation(null)}
      />
    </div>
  );
}
