import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaBed, FaCheck, FaDoorOpen, FaTimes } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorHospitalisationOptions } from '../../../types';
import s from './Hospitalisation.module.css';

const MOTIFS_SORTIE = ['Guérison', 'Amélioration', 'Sortie contre avis médical', 'Transfert vers un autre établissement', 'Évasion', 'Décès'];
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

interface Cible {
  id: number;
  code: string;
  patient: string;
  /** lit actuel (changement de lit) */
  lit?: string | null;
}

function Fenetre({ ouvert, titre, icone, onFermer, children, pied }: { ouvert: boolean; titre: string; icone: React.ReactNode; onFermer: () => void; children: React.ReactNode; pied: React.ReactNode }) {
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ouvert, onFermer]);
  return (
    <AnimatePresence>
      {ouvert && (
        <motion.div className={s.fond} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
          <motion.div className={s.fenetre} role="dialog" aria-modal="true" aria-label={titre} initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
            <header className={s.fenetreHaut}>
              <span className={s.fenetreIcone}>{icone}</span>
              <h2>{titre}</h2>
              <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer">
                <FaTimes />
              </button>
            </header>
            <div className={s.fenetreCorps}>{children}</div>
            <footer className={s.fenetrePied}>{pied}</footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Attribution / changement de lit (chambre → lit libre, infirmier(ère) facultatif) */
export function FenetreLit({ cible, onFermer, onFait }: { cible: Cible | null; onFermer: () => void; onFait: () => void }) {
  const [options, setOptions] = useState<DoctorHospitalisationOptions | null>(null);
  const [chambreId, setChambreId] = useState<number | null>(null);
  const [litId, setLitId] = useState<number | null>(null);
  const [infirmierId, setInfirmierId] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!cible) return;
    setChambreId(null);
    setLitId(null);
    setInfirmierId(null);
    api.doctor.hospitalisations
      .options()
      .then(setOptions)
      .catch((e) => alerte.echec(`Impossible de charger les chambres : ${messageErreur(e)}`));
  }, [cible]);

  const chambre = options?.chambres.find((x) => x.id === chambreId) ?? null;

  const valider = async () => {
    if (!cible || !litId) return;
    setEnvoi(true);
    try {
      const r = await api.doctor.hospitalisations.attribuerLit(cible.id, litId, infirmierId);
      alerte.succes(r.message);
      onFait();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Fenetre
      ouvert={!!cible}
      titre={cible?.lit ? 'Changer de lit' : 'Attribuer un lit'}
      icone={<FaBed />}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className={c.secondaire} onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className={c.principal} onClick={valider} disabled={!litId || envoi}>
            <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Valider'}
          </button>
        </>
      }
    >
      {cible && (
        <p className={s.cible}>
          <strong>{cible.patient}</strong> · {cible.code}
          {cible.lit && <span> · lit actuel : {cible.lit}</span>}
        </p>
      )}
      {!options ? (
        <p className={c.vide}>Chargement des chambres…</p>
      ) : options.chambres.length === 0 ? (
        <p className={s.note}>Aucune chambre active dans votre établissement.</p>
      ) : (
        <>
          <span className={s.etiquette}>Chambre</span>
          <div className={s.chambres}>
            {options.chambres.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`${s.chambre} ${chambreId === ch.id ? s.chambreActive : ''}`}
                onClick={() => {
                  setChambreId(ch.id);
                  setLitId(null);
                }}
                disabled={ch.lits.length === 0}
              >
                <strong>{ch.numero}</strong>
                <small>
                  {ch.type ?? 'Chambre'} · {fcfa(ch.prix)}/j
                </small>
                <em>{ch.lits.length === 0 ? 'Complète' : `${ch.lits.length} lit${ch.lits.length > 1 ? 's' : ''} libre${ch.lits.length > 1 ? 's' : ''}`}</em>
              </button>
            ))}
          </div>

          {chambre && (
            <>
              <span className={s.etiquette}>Lit</span>
              <div className={s.lits}>
                {chambre.lits.map((l) => (
                  <button key={l.id} type="button" className={`${s.lit} ${litId === l.id ? s.litActif : ''}`} onClick={() => setLitId(l.id)}>
                    <FaBed aria-hidden="true" /> Lit {l.numero}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className={s.champ}>
            <span className={s.etiquette}>Infirmier(ère) en charge (facultatif)</span>
            <select value={infirmierId ?? ''} onChange={(e) => setInfirmierId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Aucun —</option>
              {options.infirmiers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nom}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </Fenetre>
  );
}

/** Sortie du patient (motif obligatoire) */
export function FenetreSortie({ cible, onFermer, onFait }: { cible: Cible | null; onFermer: () => void; onFait: () => void }) {
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (cible) setMotif(null);
  }, [cible]);

  const valider = async () => {
    if (!cible || !motif) return;
    setEnvoi(true);
    try {
      const r = await api.doctor.hospitalisations.sortie(cible.id, motif);
      alerte.succes(r.message);
      onFait();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Fenetre
      ouvert={!!cible}
      titre="Sortie du patient"
      icone={<FaDoorOpen />}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className={c.secondaire} onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className={c.principal} onClick={valider} disabled={!motif || envoi}>
            <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Valider la sortie'}
          </button>
        </>
      }
    >
      {cible && (
        <p className={s.cible}>
          <strong>{cible.patient}</strong> · {cible.code}
          {cible.lit && <span> · {cible.lit}</span>}
        </p>
      )}
      <span className={s.etiquette}>Motif de sortie</span>
      <div className={s.motifs}>
        {MOTIFS_SORTIE.map((m) => (
          <button key={m} type="button" className={`${s.motifSortie} ${motif === m ? s.motifActif : ''} ${m === 'Décès' ? s.motifDeces : ''}`} onClick={() => setMotif(m)}>
            {motif === m && <FaCheck aria-hidden="true" />} {m}
          </button>
        ))}
      </div>
      <p className={s.note}>Les journées sont clôturées, le lit est libéré, la durée et le coût de l’hospitalisation sont calculés.</p>
    </Fenetre>
  );
}
