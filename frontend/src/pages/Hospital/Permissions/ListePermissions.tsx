import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheck, FaEye, FaPaperclip, FaSearch, FaTimes } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DemandePermission, ListePermissions as Liste, StatutPermission } from '../../../types';
import DetailPermission from './DetailPermission';
import { absentAujourdhui, heure, jour, nombreJours, ORDRE_STATUTS, STATUTS, typeAgent } from './permissions.config';
import { baseHopital, estAdminHopital } from '../../../services/contexteHopital';
import styles from './Permissions.module.css';

type Decision = { demande: DemandePermission; statut: 'agree' | 'reject' };

/**
 * HÔPITAL > PERMISSIONS > EN ATTENTE / ACCORDÉES / REFUSÉES
 * Équivalent Laravel : route permission/{status} (users/permission/list.blade.php) + permission/{id}/{status}
 * Le personnel demande ses permissions depuis son espace ; l'hôpital les accorde ou les rejette ici.
 */
export default function ListePermissions({ statut }: { statut: StatutPermission }) {
  const conf = STATUTS[statut];
  const [data, setData] = useState<Liste | null>(null);
  const [recherche, setRecherche] = useState('');
  const [detail, setDetail] = useState<DemandePermission | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    api.hospital.permissions
      .liste(statut)
      .then(setData)
      .catch((e) => {
        setData({ compteurs: { pending: 0, agree: 0, reject: 0 }, demandes: [] });
        alerte.echec(`Impossible de charger les permissions : ${messageErreur(e)}`);
      });
  }, [statut]);

  useEffect(() => {
    setData(null);
    setRecherche('');
    charger();
  }, [charger]);

  const executer = async () => {
    if (!decision) return;
    setEnCours(true);
    try {
      const r = await api.hospital.permissions.traiter(decision.demande.id, decision.statut, decision.demande.type === 'regulateur');
      setDetail(null);
      alerte.succes(r.message);
      charger();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setDecision(null);
      setEnCours(false);
    }
  };

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = data?.demandes ?? [];
    return q ? l.filter((d) => [d.code, d.agent, d.matricule, d.motif, typeAgent(d)].some((v) => v?.toLowerCase().includes(q))) : l;
  }, [data, recherche]);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Permissions</p>
          <h1 className={c.titre}>Permissions {conf.pluriel.toLowerCase()}</h1>
        </div>
      </header>

      {/* Les 3 statuts : compteurs cliquables (changent de page) */}
      <div className={styles.statuts}>
        {ORDRE_STATUTS.map((s, i) => {
          const k = STATUTS[s];
          return (
            <motion.div key={s} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`${baseHopital()}/permissions/${k.chemin}`} className={`${c.compteur} ${styles.statut} ${s === statut ? styles.statutActif : ''}`} aria-current={s === statut ? 'page' : undefined}>
                <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
                  <k.icone aria-hidden="true" />
                </span>
                <span className={c.compteurTexte}>
                  <strong>{data ? data.compteurs[s] : '…'}</strong>
                  <span>{k.pluriel}</span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <label className={`${c.champ} ${c.recherche} ${styles.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Agent, code, matricule, motif…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une demande" />
          </label>
        </div>

        {data && data.demandes.length === 0 ? (
          <div className={styles.vide}>
            <conf.icone aria-hidden="true" />
            <strong>Aucune permission {conf.libelle.toLowerCase()}</strong>
            <p>
              {statut === 'pending'
                ? 'Les demandes d’absence envoyées par les médecins et infirmiers depuis leur espace apparaîtront ici pour être accordées ou refusées.'
                : 'Les demandes que vous traiterez apparaîtront ici.'}
            </p>
          </div>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Période</th>
                  <th scope="col">Durée</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((d, i) => {
                  const jours = nombreJours(d.debut, d.fin);
                  const absent = d.statut === 'agree' && absentAujourdhui(d.debut, d.fin);
                  return (
                    <motion.tr key={`${d.type}-${d.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                      <td className={styles.code}>{d.code}</td>
                      <td>
                        <strong>{d.agent}</strong>
                        <span className={c.sousTexte}>
                          {typeAgent(d)}
                          {d.matricule ? ` · ${d.matricule}` : ''}
                        </span>
                      </td>
                      <td className={styles.nowrap}>
                        {jour(d.debut)} → {jour(d.fin)}
                        {(d.heureDebut || d.heureFin) && (
                          <span className={c.sousTexte}>
                            {heure(d.heureDebut) ?? '—'} → {heure(d.heureFin) ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className={styles.nowrap}>
                        {jours} jour{jours > 1 ? 's' : ''}
                        {absent && <span className={styles.absent}>Absent aujourd'hui</span>}
                      </td>
                      <td>
                        <span className={styles.motif} title={d.motif ?? ''}>{d.motif ?? '—'}</span>
                        {d.justificatif && (
                          <span className={c.sousTexte}>
                            <FaPaperclip aria-hidden="true" /> Justificatif joint
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={c.badge} style={{ background: STATUTS[d.statut].fond, color: STATUTS[d.statut].texte }}>
                          {STATUTS[d.statut].libelle}
                        </span>
                      </td>
                      <td>
                        <div className={c.actions}>
                          <button type="button" className={`${c.icone} ${c.iconeVoir}`} title="Voir la demande" aria-label={`Voir la demande ${d.code}`} onClick={() => setDetail(d)}>
                            <FaEye />
                          </button>
                          {/* L'administration UCP-FM consulte les demandes mais n'y répond pas */}
                          {d.statut === 'pending' && !estAdminHopital() && (
                            <>
                              <button type="button" className={`${c.icone} ${styles.iconeAccorder}`} title="Accorder" aria-label={`Accorder la permission de ${d.agent}`} onClick={() => setDecision({ demande: d, statut: 'agree' })}>
                                <FaCheck />
                              </button>
                              <button type="button" className={`${c.icone} ${c.iconeSupprimer}`} title="Refuser" aria-label={`Refuser la permission de ${d.agent}`} onClick={() => setDecision({ demande: d, statut: 'reject' })}>
                                <FaTimes />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {data && filtres.length === 0 && (
                  <tr>
                    <td colSpan={7} className={c.vide}>Aucune demande ne correspond à la recherche.</td>
                  </tr>
                )}
                {!data && (
                  <tr>
                    <td colSpan={7} className={c.vide}>Chargement…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DetailPermission demande={detail} onFermer={() => setDetail(null)} onDecider={(statut) => detail && setDecision({ demande: detail, statut })} />

      <ConfirmDialog
        ouvert={!!decision}
        titre={decision?.statut === 'agree' ? 'Accorder cette permission ?' : 'Refuser cette permission ?'}
        message={
          decision
            ? `${decision.demande.agent} (${typeAgent(decision.demande)}) — du ${jour(decision.demande.debut)} au ${jour(decision.demande.fin)}, ${nombreJours(decision.demande.debut, decision.demande.fin)} jour(s).`
            : ''
        }
        confirmer={decision?.statut === 'agree' ? 'Accorder' : 'Refuser'}
        ton={decision?.statut === 'agree' ? 'normal' : 'danger'}
        enCours={enCours}
        onConfirmer={executer}
        onAnnuler={() => setDecision(null)}
      />
    </div>
  );
}

