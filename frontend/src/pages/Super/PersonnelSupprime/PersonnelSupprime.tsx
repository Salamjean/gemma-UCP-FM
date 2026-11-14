import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaExchangeAlt, FaSearch, FaTimes, FaTrashAlt, FaUndo } from 'react-icons/fa';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { AgentSupprime, OptionsTransfert } from '../../../types';
import s from './PersonnelSupprime.module.css';

const PHOTO_DEFAUT = '/images/dashboard/avatar-doctor.png';

/** Date Laravel (UTC « AAAA-MM-JJ HH:MM:SS ») → « 12/11/2026 à 14:05 » */
const dateHeure = (v: string) => {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * ADMIN UCP-FM > PERSONNEL SUPPRIMÉ
 * Médecins, sages-femmes et infirmiers supprimés par leur hôpital UCP-FM.
 * Actions : réintégrer dans son hôpital, changer d'hôpital, supprimer définitivement.
 */
export default function PersonnelSupprime() {
  const [agents, setAgents] = useState<AgentSupprime[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [type, setType] = useState('');
  const [hopital, setHopital] = useState('');
  const [confirmation, setConfirmation] = useState<{ action: 'reintegrer' | 'supprimer'; a: AgentSupprime } | null>(null);
  const [transfert, setTransfert] = useState<AgentSupprime | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    api.super.personnelSupprime
      .liste()
      .then(setAgents)
      .catch((e) => alerte.echec(`Impossible de charger le personnel supprimé : ${messageErreur(e)}`));
  }, []);
  useEffect(charger, [charger]);

  const hopitaux = useMemo(() => [...new Map((agents ?? []).map((a) => [a.hopital.id, a.hopital.label])).entries()], [agents]);
  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (agents ?? []).filter(
      (a) =>
        (!type || a.type === type) &&
        (!hopital || String(a.hopital.id) === hopital) &&
        (!q || [a.nom, a.matricule, a.email, a.contact, a.hopital.label].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [agents, recherche, type, hopital]);

  const executer = async () => {
    if (!confirmation) return;
    const { action, a } = confirmation;
    setEnCours(true);
    try {
      const r = action === 'reintegrer' ? await api.super.personnelSupprime.reintegrer(a.type, a.id) : await api.super.personnelSupprime.supprimer(a.type, a.id);
      alerte.succes(r.message);
      charger();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setConfirmation(null);
      setEnCours(false);
    }
  };

  const compte = (t: string) => (agents ?? []).filter((a) => a.type === t).length;

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Hôpitaux UCP-FM</p>
          <h1 className={c.titre}>Personnel supprimé</h1>
        </div>
      </header>

      <div className={s.compteurs}>
        {[
          ['Agents supprimés', agents?.length ?? 0],
          ['Médecins', compte('medecin')],
          ['Sages-femmes', compte('sage-femme')],
          ['Infirmiers', compte('infirmier')],
        ].map(([libelle, n]) => (
          <div key={libelle} className={s.compteur}>
            <strong>{n}</strong>
            <span>{libelle}</span>
          </div>
        ))}
      </div>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <label className={`${c.champ} ${c.recherche} ${s.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Rechercher un nom, un matricule, un email…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un agent" />
          </label>
          <select className={c.champ} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filtrer par fonction">
            <option value="">Toutes les fonctions</option>
            <option value="medecin">Médecins</option>
            <option value="sage-femme">Sages-femmes</option>
            <option value="infirmier">Infirmiers</option>
          </select>
          <select className={c.champ} value={hopital} onChange={(e) => setHopital(e.target.value)} aria-label="Filtrer par hôpital">
            <option value="">Tous les hôpitaux</option>
            {hopitaux.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Fonction</th>
                <th scope="col">Hôpital</th>
                <th scope="col">Contact</th>
                <th scope="col">Supprimé le</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((a, i) => (
                <motion.tr key={`${a.type}-${a.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 15) * 0.03 }}>
                  <td>
                    <div className={s.agent}>
                      <img
                        src={a.imgUrl ? uploadUrl(a.type === 'infirmier' ? 'infirmier' : 'doctor', a.imgUrl) : PHOTO_DEFAUT}
                        alt=""
                        onError={(e) => (e.currentTarget.src = PHOTO_DEFAUT)}
                      />
                      <div>
                        <strong>{a.nom}</strong>
                        <span className={c.sousTexte}>{a.matricule ?? '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {a.typeLibelle}
                    {a.specialite && <span className={c.sousTexte}>{a.specialite}</span>}
                  </td>
                  <td>
                    {a.hopital.label}
                    <span className={c.sousTexte}>{a.service ?? 'Sans service'}</span>
                  </td>
                  <td>
                    {a.email ?? '—'}
                    <span className={c.sousTexte}>{a.contact ?? ''}</span>
                  </td>
                  <td>{dateHeure(a.supprimeLe)}</td>
                  <td>
                    <div className={c.actions}>
                      <button type="button" className={`${c.icone} ${c.iconeRelancer}`} title="Réintégrer dans son hôpital" aria-label={`Réintégrer ${a.nom}`} onClick={() => setConfirmation({ action: 'reintegrer', a })}>
                        <FaUndo />
                      </button>
                      <button type="button" className={`${c.icone} ${c.iconeVoir}`} title="Changer d'hôpital" aria-label={`Changer l'hôpital de ${a.nom}`} onClick={() => setTransfert(a)}>
                        <FaExchangeAlt />
                      </button>
                      <button type="button" className={`${c.icone} ${c.iconeSupprimer}`} title="Supprimer définitivement" aria-label={`Supprimer définitivement ${a.nom}`} onClick={() => setConfirmation({ action: 'supprimer', a })}>
                        <FaTrashAlt />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {agents && filtres.length === 0 && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    {agents.length ? 'Aucun agent ne correspond à la recherche.' : "Aucun agent supprimé par les hôpitaux UCP-FM."}
                  </td>
                </tr>
              )}
              {!agents && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    Chargement…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        ouvert={!!confirmation}
        titre={confirmation?.action === 'reintegrer' ? 'Réintégrer cet agent ?' : 'Supprimer définitivement ?'}
        message={
          confirmation?.action === 'reintegrer'
            ? `« ${confirmation.a.nom} » retrouvera sa place et son accès à ${confirmation.a.hopital.label}.`
            : `Le compte de « ${confirmation?.a.nom ?? ''} » sera fermé et son adresse email libérée. S'il a des consultations ou d'autres éléments dans les dossiers patients, sa fiche est gardée pour l'historique ; sinon tout est effacé. Action irréversible.`
        }
        confirmer={confirmation?.action === 'reintegrer' ? 'Réintégrer' : 'Supprimer'}
        ton={confirmation?.action === 'supprimer' ? 'danger' : 'normal'}
        enCours={enCours}
        onConfirmer={executer}
        onAnnuler={() => setConfirmation(null)}
      />

      <AnimatePresence>
        {transfert && (
          <Transfert
            agent={transfert}
            onFermer={() => setTransfert(null)}
            onFait={(message) => {
              setTransfert(null);
              alerte.succes(message);
              charger();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Fenêtre « Changer d'hôpital » : hôpital d'arrivée, puis service(s), actes et spécialité */
function Transfert({ agent, onFermer, onFait }: { agent: AgentSupprime; onFermer: () => void; onFait: (message: string) => void }) {
  const [options, setOptions] = useState<OptionsTransfert | null>(null);
  const [hopitalId, setHopitalId] = useState(0);
  const [service, setService] = useState(0);
  const [services, setServices] = useState<number[]>([]);
  const [actes, setActes] = useState<number[]>([]);
  const [specialite, setSpecialite] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const infirmier = agent.type === 'infirmier';

  // Hôpitaux UCP-FM, puis services / actes / spécialités de celui choisi
  useEffect(() => {
    let actif = true;
    api.super.personnelSupprime
      .options(hopitalId || undefined)
      .then((o) => actif && setOptions(o))
      .catch((e) => alerte.echec(messageErreur(e)));
    setService(0);
    setServices([]);
    setActes([]);
    setSpecialite(0);
    return () => {
      actif = false;
    };
  }, [hopitalId]);

  useEffect(() => {
    const fermer = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    window.addEventListener('keydown', fermer);
    return () => window.removeEventListener('keydown', fermer);
  }, [onFermer]);

  const actesDuService = (options?.actes ?? []).filter((a) => a.serviceId === service);
  const basculer = (liste: number[], v: number) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hopitalId) return alerte.attention("Choisissez l'hôpital d'arrivée.");
    if (infirmier && !services.length) return alerte.attention('Choisissez au moins un service.');
    if (!infirmier && !service) return alerte.attention("Choisissez le service d'affectation.");
    if (!infirmier && !actes.length) return alerte.attention('Choisissez au moins un acte médical pratiqué.');
    if (agent.specialiste && !specialite) return alerte.attention('Choisissez la spécialité du médecin.');
    setEnvoi(true);
    try {
      const r = await api.super.personnelSupprime.transferer(agent.type, agent.id, {
        hopitalId,
        ...(infirmier ? { services } : { service, actes }),
        ...(agent.specialiste ? { typeDoctor: specialite } : {}),
      });
      onFait(r.message);
    } catch (err) {
      alerte.echec(messageErreur(err));
      setEnvoi(false);
    }
  };

  return (
    <motion.div className={s.fond} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <motion.form
        className={s.boite}
        onSubmit={valider}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-transfert"
      >
        <header className={s.boiteEntete}>
          <div>
            <h2 id="titre-transfert">Changer d’hôpital</h2>
            <p>
              {agent.nom} · {agent.typeLibelle} · actuellement à <strong>{agent.hopital.label}</strong>
            </p>
          </div>
          <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer">
            <FaTimes />
          </button>
        </header>

        <label className={s.champ}>
          <span>Hôpital d’arrivée *</span>
          <select value={hopitalId} onChange={(e) => setHopitalId(Number(e.target.value))} className={c.champ}>
            <option value={0}>Choisir un hôpital UCP-FM…</option>
            {options?.hopitaux
              .filter((h) => h.id !== agent.hopital.id)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
          </select>
        </label>

        {hopitalId > 0 && options?.services && (
          <>
            {infirmier ? (
              <fieldset className={s.groupe}>
                <legend>Services *</legend>
                <div className={s.cases}>
                  {options.services.map((sv) => (
                    <label key={sv.id} className={s.case}>
                      <input type="checkbox" checked={services.includes(sv.id)} onChange={() => setServices((l) => basculer(l, sv.id))} />
                      {sv.libelle}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <>
                <label className={s.champ}>
                  <span>Service d’affectation *</span>
                  <select
                    value={service}
                    onChange={(e) => {
                      setService(Number(e.target.value));
                      setActes([]);
                    }}
                    className={c.champ}
                  >
                    <option value={0}>Choisir un service…</option>
                    {options.services.map((sv) => (
                      <option key={sv.id} value={sv.id}>
                        {sv.libelle}
                      </option>
                    ))}
                  </select>
                </label>
                {service > 0 && (
                  <fieldset className={s.groupe}>
                    <legend>Actes médicaux pratiqués *</legend>
                    {actesDuService.length === 0 ? (
                      <p className={s.aide}>Aucun acte tarifé dans ce service.</p>
                    ) : (
                      <div className={s.cases}>
                        {actesDuService.map((a) => (
                          <label key={a.id} className={s.case}>
                            <input type="checkbox" checked={actes.includes(a.id)} onChange={() => setActes((l) => basculer(l, a.id))} />
                            {a.libelle}
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                )}
                {agent.specialiste && (
                  <label className={s.champ}>
                    <span>Spécialité dans le nouvel hôpital * (avant : {agent.specialite})</span>
                    <select value={specialite} onChange={(e) => setSpecialite(Number(e.target.value))} className={c.champ}>
                      <option value={0}>Choisir une spécialité…</option>
                      {(options.specialites ?? []).map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.libelle}
                        </option>
                      ))}
                    </select>
                    {(options.specialites ?? []).length === 0 && (
                      <span className={s.aide}>Cet hôpital n’a aucune spécialité médicale : ajoutez-la d’abord (Hôpital › Personnel › Spécialités médicales).</span>
                    )}
                  </label>
                )}
              </>
            )}
            {options.services.length === 0 && <p className={s.aide}>Cet hôpital n’a aucun service actif.</p>}
          </>
        )}

        <p className={s.aide}>L’agent est réintégré dans le nouvel hôpital avec son compte, son matricule et son planning.</p>

        <div className={s.boutons}>
          <button type="button" className={c.secondaire} onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className={c.principal} disabled={envoi}>
            <FaExchangeAlt aria-hidden="true" /> {envoi ? 'Transfert…' : 'Changer d’hôpital'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
