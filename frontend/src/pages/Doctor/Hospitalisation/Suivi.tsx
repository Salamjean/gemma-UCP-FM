import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { FaArrowLeft, FaBed, FaCalendarDay, FaClock, FaDoorOpen, FaFileMedical, FaHeartbeat, FaPills, FaSave } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorHospitalisationDetail, DossierHospitalisation } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient } from '../Consultations/ListeConsultations';
import { FenetreLit, FenetreSortie } from './Fenetres';
import { dateFr } from './ListeHospitalisations';
import s from './Hospitalisation.module.css';

type CleDossier = Exclude<keyof DossierHospitalisation, 'motif' | 'motifSortie'>;
const CHAMPS: { k: CleDossier; libelle: string; long?: boolean; placeholder: string }[] = [
  { k: 'diagnostic', libelle: 'Diagnostic', long: true, placeholder: 'Diagnostic d’hospitalisation…' },
  { k: 'regime', libelle: 'Régime alimentaire', long: true, placeholder: 'Régime prescrit…' },
  { k: 'analyseMedical', libelle: 'Analyses médicales', long: true, placeholder: 'Bilans demandés pendant l’hospitalisation…' },
  { k: 'sonde', libelle: 'Sonde', placeholder: 'Type de sonde…' },
  { k: 'oxygenotherapie', libelle: 'Oxygénothérapie', placeholder: 'Débit, mode…' },
  { k: 'volume', libelle: 'Volume / perfusion', placeholder: 'Volume prescrit…' },
  { k: 'remarque', libelle: 'Remarques', long: true, placeholder: 'Consignes pour l’équipe…' },
];
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const heureFr = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * MÉDECIN > HOSPITALISATION > SUIVI D'UN PATIENT
 * Repris de Laravel : doctor.hospitalisation.edit / detail — dossier, lit, journées, surveillances de l'infirmier, sortie.
 */
export default function Suivi() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [h, setH] = useState<DoctorHospitalisationDetail | null>(null);
  const [erreur, setErreur] = useState(false);
  const [dossier, setDossier] = useState<Partial<DossierHospitalisation>>({});
  const [envoi, setEnvoi] = useState(false);
  const [fenetre, setFenetre] = useState<'lit' | 'sortie' | null>(null);

  const charger = useCallback(() => {
    api.doctor.hospitalisations
      .detail(Number(id))
      .then((d) => {
        setH(d);
        setDossier(d.dossier);
      })
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible d'ouvrir l'hospitalisation : ${messageErreur(e)}`);
      });
  }, [id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const enregistrer = async () => {
    if (!h) return;
    setEnvoi(true);
    try {
      const { motif: _m, motifSortie: _s, ...modifiable } = dossier;
      const r = await api.doctor.hospitalisations.majDossier(h.id, Object.fromEntries(Object.entries(modifiable).filter(([, v]) => v !== null && v !== '')));
      alerte.succes(r.message);
      charger();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  const entete = (
    <header className={c.entete}>
      <div>
        <p className={c.surtitre}>Hospitalisation</p>
        <h1 className={c.titre}>Suivi du patient hospitalisé</h1>
      </div>
      <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
        <FaArrowLeft aria-hidden="true" /> Retour
      </button>
    </header>
  );

  if (!h) {
    return (
      <div className={c.page}>
        {entete}
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Hospitalisation introuvable.' : 'Chargement…'}</p>
        </section>
      </div>
    );
  }

  const modifiable = h.statut !== 'terminee';
  const litActuel = h.journees.find((j) => j.lit)?.lit ?? null;
  const joursEcoules = h.debut ? Math.max(1, Math.floor((Date.now() - new Date(`${h.debut}T00:00:00Z`).getTime()) / 86400000) + 1) : null;
  const statut = { 'en-attente': ['En attente de chambre', s.badgeAttente], 'en-cours': ['En cours', s.badgeBleu], terminee: [h.dossier.motifSortie ?? 'Terminée', c.badgeOk] }[h.statut];

  return (
    <div className={c.page}>
      {entete}

      {/* --- Patient & état --- */}
      <motion.section className={`${c.bloc} ${s.bandeau}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className={s.bandeauPatient}>
          <AvatarPatient patient={{ ...h.patient }} />
          <span>
            <strong>{h.patient.nom}</strong>
            <small>
              {h.patient.code} · {age(h.patient.dateNaissance) ?? 'Âge inconnu'}
              {h.patient.allergies ? ` · Allergies : ${h.patient.allergies}` : ''}
            </small>
          </span>
        </span>
        <dl className={s.resume}>
          <div>
            <dt>Dossier</dt>
            <dd>{h.code}</dd>
          </div>
          <div>
            <dt>Entrée</dt>
            <dd>{dateFr(h.debut)}</dd>
          </div>
          <div>
            <dt>{h.statut === 'terminee' ? 'Durée' : 'Jour'}</dt>
            <dd>{h.statut === 'terminee' ? `${h.jours ?? '—'} jour(s)` : `J${joursEcoules}`}</dd>
          </div>
          <div>
            <dt>Chambre</dt>
            <dd>{litActuel ?? '—'}</dd>
          </div>
          {h.operations.length > 0 && (
            <div>
              <dt>Opération</dt>
              <dd>{h.operations.map(dateFr).join(', ')}</dd>
            </div>
          )}
          {h.statut === 'terminee' && h.prix !== null && (
            <div>
              <dt>Coût du séjour</dt>
              <dd>{fcfa(h.prix)}</dd>
            </div>
          )}
        </dl>
        <div className={s.bandeauActions}>
          <span className={`${c.badge} ${statut[1]}`}>{statut[0]}</span>
          {modifiable && (
            <>
              <button type="button" className={c.secondaire} onClick={() => setFenetre('lit')}>
                <FaBed aria-hidden="true" /> {litActuel ? 'Changer de lit' : 'Attribuer un lit'}
              </button>
              {h.statut === 'en-cours' && (
                <button type="button" className={c.principal} onClick={() => setFenetre('sortie')}>
                  <FaDoorOpen aria-hidden="true" /> Sortie
                </button>
              )}
            </>
          )}
        </div>
      </motion.section>

      <div className={s.grilleSuivi}>
        {/* --- Dossier --- */}
        <section className={c.bloc}>
          <div className={s.titreBloc}>
            <FaFileMedical aria-hidden="true" />
            <div>
              <h2>Dossier d’hospitalisation</h2>
              <p>
                Consultation {h.consultation.code ?? ''} · motif : {h.consultation.motif ?? '—'}
              </p>
            </div>
          </div>
          <fieldset className={s.verrou} disabled={!modifiable}>
            <div className={s.dossier}>
              {CHAMPS.map((f) => (
                <label key={f.k} className={`${s.champ} ${f.long ? s.champLong : ''}`}>
                  <span className={s.etiquette}>{f.libelle}</span>
                  {f.long ? (
                    <textarea rows={2} value={dossier[f.k] ?? ''} placeholder={modifiable ? f.placeholder : '—'} onChange={(e) => setDossier((x) => ({ ...x, [f.k]: e.target.value }))} />
                  ) : (
                    <input value={dossier[f.k] ?? ''} placeholder={modifiable ? f.placeholder : '—'} onChange={(e) => setDossier((x) => ({ ...x, [f.k]: e.target.value }))} />
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          {modifiable && (
            <div className={s.piedBloc}>
              <button type="button" className={c.principal} onClick={enregistrer} disabled={envoi}>
                <FaSave aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Enregistrer le dossier'}
              </button>
            </div>
          )}
        </section>

        {/* --- Journées --- */}
        <section className={c.bloc}>
          <div className={s.titreBloc}>
            <FaCalendarDay aria-hidden="true" />
            <div>
              <h2>Journées d’hospitalisation</h2>
              <p>Lit, médecin et infirmier(ère) de chaque période.</p>
            </div>
          </div>
          {h.journees.length === 0 ? (
            <p className={s.note}>Aucune journée enregistrée.</p>
          ) : (
            <ul className={s.journees}>
              {h.journees.map((j) => (
                <li key={j.id}>
                  <strong>
                    {dateFr(j.jour)}
                    {j.fin ? ` → ${dateFr(j.fin)}` : ' → en cours'}
                  </strong>
                  <span>{j.lit ?? 'Sans lit (en attente de chambre)'}</span>
                  <small>
                    {[j.medecin && `Dr ${j.medecin.replace(/^dr\.?\s*/i, '')}`, j.infirmier && `Inf. ${j.infirmier}`].filter(Boolean).join(' · ') || '—'}
                    {j.prix ? ` · ${fcfa(j.prix)}` : ''}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* --- Protocole thérapeutique (prescrit à l'hospitalisation) --- */}
      <section className={c.bloc}>
        <div className={s.titreBloc}>
          <FaPills aria-hidden="true" />
          <div>
            <h2>Protocole thérapeutique</h2>
            <p>Produits prescrits, posologie, voie et heures d’administration.</p>
          </div>
          <span className={s.compte}>{h.protocole.length}</span>
        </div>
        {h.protocole.length === 0 ? (
          <p className={s.note}>Aucun protocole enregistré.</p>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col">Quantité</th>
                  <th scope="col">Posologie</th>
                  <th scope="col">Voie</th>
                  <th scope="col">Heures</th>
                  <th scope="col">Montant</th>
                </tr>
              </thead>
              <tbody>
                {h.protocole.map((p) => (
                  <tr key={p.id}>
                    <td className={s.diagnostic}>
                      <strong>{p.produit}</strong>
                    </td>
                    <td>
                      {p.quantite}
                      {p.unite ? ` ${p.unite}` : ''}
                    </td>
                    <td>{p.posologie ?? '—'}</td>
                    <td>{p.voie ?? '—'}</td>
                    <td>
                      {p.heures ? (
                        <span className={s.heures}>
                          <FaClock aria-hidden="true" /> {p.heures}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{p.total !== null ? fcfa(p.total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Surveillances de l'infirmier --- */}
      <section className={c.bloc}>
        <div className={s.titreBloc}>
          <FaHeartbeat aria-hidden="true" />
          <div>
            <h2>Surveillances infirmières</h2>
            <p>Paramètres relevés par l’infirmier(ère) pendant l’hospitalisation.</p>
          </div>
          <span className={s.compte}>{h.surveillances.length}</span>
        </div>
        {h.surveillances.length === 0 ? (
          <p className={s.note}>Aucune surveillance enregistrée pour le moment.</p>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Date & heure</th>
                  <th scope="col">TA</th>
                  <th scope="col">T°</th>
                  <th scope="col">Pouls</th>
                  <th scope="col">SpO₂</th>
                  <th scope="col">Glycémie</th>
                  <th scope="col">Diurèse</th>
                  <th scope="col">Conscience</th>
                  <th scope="col">Évolution / conduite à tenir</th>
                </tr>
              </thead>
              <tbody>
                {h.surveillances.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {heureFr(v.date)} {v.heure ?? ''}
                    </td>
                    <td>{v.ta ?? '—'}</td>
                    <td>{v.temperature ?? '—'}</td>
                    <td>{v.pouls ?? '—'}</td>
                    <td>{v.sao2 ?? '—'}</td>
                    <td>{v.glycemie ?? '—'}</td>
                    <td>{v.diurese ?? '—'}</td>
                    <td>{v.conscience ?? '—'}</td>
                    <td className={s.diagnostic}>{[v.evolution, v.conduite].filter(Boolean).join(' — ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className={s.retourListe}>
        <Link to={h.statut === 'terminee' ? '/medecin/hospitalisation/historique' : h.statut === 'en-cours' ? '/medecin/hospitalisation/en-cours' : '/medecin/hospitalisation/en-attente'}>← Retour à la liste</Link>
      </p>

      <FenetreLit
        cible={fenetre === 'lit' ? { id: h.id, code: h.code, patient: h.patient.nom, lit: litActuel } : null}
        onFermer={() => setFenetre(null)}
        onFait={() => {
          setFenetre(null);
          charger();
        }}
      />
      <FenetreSortie
        cible={fenetre === 'sortie' ? { id: h.id, code: h.code, patient: h.patient.nom, lit: litActuel } : null}
        onFermer={() => setFenetre(null)}
        onFait={() => {
          setFenetre(null);
          charger();
        }}
      />
    </div>
  );
}
