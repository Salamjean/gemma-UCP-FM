import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheck, FaClipboardList, FaExchangeAlt, FaExclamationTriangle, FaHistory, FaSearch, FaSyncAlt, FaTimes, FaUserMd, FaVideo } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { ConsultationARegler, MedecinPropose, TableauRegulation } from '../../../types';
import s from './Regulation.module.css';

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
/** Rafraîchissement automatique de la liste */
const INTERVALLE = 30_000;
/** Au-delà de ce délai sans prise en charge, l'affectation passe « À réguler » (même règle que le backend) */
const ATTENTE_MAX = 30;
const duree = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

/**
 * RÉGULATEUR > RÉGULATION DES PATIENTS (page d'accueil de l'espace)
 * Consultations ouvertes du jour dans l'hôpital. Quand le médecin choisi par l'infirmier·ère n'est pas disponible
 * (aucun médecin, compte désactivé, permission en cours, hors de son planning), le régulateur attribue le patient
 * à un autre médecin disponible maintenant. Une affectation en attente depuis 30 minutes ou plus passe aussi « À réguler ».
 * Le patient reçoit un SMS avec son nouveau médecin.
 */
export default function Regulation() {
  const [data, setData] = useState<TableauRegulation | null>(null);
  const [filtre, setFiltre] = useState<'a-reguler' | 'toutes'>('a-reguler');
  const [recherche, setRecherche] = useState('');
  const [choisie, setChoisie] = useState<ConsultationARegler | null>(null);

  const charger = useCallback(
    () =>
      api.regulateur
        .consultations()
        .then(setData)
        .catch((e) => alerte.echec(`Impossible de charger les consultations : ${messageErreur(e)}`)),
    [],
  );
  useEffect(() => {
    charger();
    const t = setInterval(charger, INTERVALLE);
    return () => clearInterval(t);
  }, [charger]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (data?.consultations ?? [])
      .filter((x) => filtre === 'toutes' || x.aReguler)
      .filter((x) => !q || [x.patient.nom, x.patient.code, x.code, x.medecin?.nom, x.infirmier, x.prestation, x.service].some((v) => v?.toLowerCase().includes(q)));
  }, [data, filtre, recherche]);

  const compteurs = [
    { libelle: 'Consultations ouvertes', valeur: data?.stats.ouvertes, icone: FaClipboardList, fond: '#eaf3fe', texte: '#1f6fc6' },
    { libelle: 'À réguler', valeur: data?.stats.aReguler, icone: FaExclamationTriangle, fond: '#fdeaee', texte: '#c4213f' },
    { libelle: "Réattribuées aujourd'hui", valeur: data?.stats.reattribueesAujourdhui, icone: FaExchangeAlt, fond: '#e3f5ee', texte: '#0b7a54' },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Régulation · {data?.hopital ?? '…'}</p>
          <h1 className={c.titre}>Régulation des patients</h1>
        </div>
        <div className={c.boutons}>
          <button type="button" className={c.secondaire} onClick={charger}>
            <FaSyncAlt aria-hidden="true" /> Actualiser
          </button>
          <Link to="/regulateur/historique" className={c.secondaire}>
            <FaHistory aria-hidden="true" /> Historique
          </Link>
        </div>
      </header>

      <div className={s.compteurs}>
        {compteurs.map((k, i) => (
          <motion.div key={k.libelle} className={c.compteur} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
              <k.icone aria-hidden="true" />
            </span>
            <span className={c.compteurTexte}>
              <strong>{k.valeur ?? '…'}</strong>
              <span>{k.libelle}</span>
            </span>
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <div className={s.onglets} role="tablist" aria-label="Consultations affichées">
            {(
              [
                ['a-reguler', 'À réguler'],
                ['toutes', 'Toutes'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={filtre === v} className={`${s.onglet} ${filtre === v ? s.ongletActif : ''}`} onClick={() => setFiltre(v)}>
                {l}
              </button>
            ))}
          </div>
          <label className={`${c.champ} ${c.recherche} ${s.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Patient, médecin, infirmier, prestation…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une consultation" />
          </label>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Arrivée</th>
                <th scope="col">Patient</th>
                <th scope="col">Prestation</th>
                <th scope="col">Médecin attribué</th>
                <th scope="col">Infirmier·ère</th>
                <th scope="col">Étape</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!data && (
                <tr>
                  <td colSpan={7} className={c.vide}>
                    Chargement…
                  </td>
                </tr>
              )}
              {data && liste.length === 0 && (
                <tr>
                  <td colSpan={7} className={c.vide}>
                    {filtre === 'a-reguler'
                      ? `Aucun patient à réguler : les médecins attribués sont disponibles et aucune affectation n'attend depuis ${ATTENTE_MAX} minutes.`
                      : "Aucune consultation ouverte aujourd'hui."}
                  </td>
                </tr>
              )}
              {liste.map((x) => (
                <tr key={x.id}>
                  <td>
                    {heure(x.arrivee)}
                    {x.attente >= ATTENTE_MAX && !x.enAppel && <span className={s.attente}>En attente depuis {duree(x.attente)}</span>}
                  </td>
                  <td>
                    <strong>{x.patient.nom}</strong>
                    <span className={c.sousTexte}>{x.patient.code ?? x.code}</span>
                    {x.urgence && <span className={`${c.badge} ${s.badgeUrgence}`}>Urgence</span>}
                  </td>
                  <td>
                    {x.prestation ?? '—'}
                    {x.service && <span className={c.sousTexte}>{x.service}</span>}
                  </td>
                  <td>
                    {x.medecin?.nom ?? '—'}
                    <span className={`${c.badge} ${x.disponible ? c.badgeOk : s.badgeKo}`}>{x.disponible ? 'Disponible' : x.raison}</span>
                    {x.reattributions > 0 && <span className={c.sousTexte}>Réattribué {x.reattributions} fois</span>}
                  </td>
                  <td>{x.infirmier ?? '—'}</td>
                  <td>
                    {x.etape}
                    {x.enAppel && (
                      <span className={c.sousTexte}>
                        <FaVideo aria-hidden="true" /> En télémédecine
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={x.aReguler ? c.principal : c.secondaire}
                      onClick={() => setChoisie(x)}
                      disabled={x.enAppel}
                      title={x.enAppel ? 'Le patient est en télémédecine avec son médecin' : 'Attribuer le patient à un autre médecin'}
                    >
                      <FaExchangeAlt aria-hidden="true" /> Réattribuer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AnimatePresence>
        {choisie && (
          <FenetreReattribution
            consultation={choisie}
            onFermer={() => setChoisie(null)}
            onFait={() => {
              setChoisie(null);
              charger();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Fenêtre : choix du nouveau médecin parmi ceux du service du patient (disponibles d'abord, moins chargés) + motif facultatif */
function FenetreReattribution({ consultation, onFermer, onFait }: { consultation: ConsultationARegler; onFermer: () => void; onFait: () => void }) {
  const [medecins, setMedecins] = useState<MedecinPropose[] | null>(null);
  const [service, setService] = useState<string | null>(consultation.service);
  const [choix, setChoix] = useState<number | null>(null);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [tous, setTous] = useState(false);

  useEffect(() => {
    api.regulateur
      .medecins(consultation.id)
      .then((r) => {
        setMedecins(r.medecins);
        if (r.service) setService(r.service);
      })
      .catch((e) => {
        alerte.echec(messageErreur(e));
        onFermer();
      });
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [consultation.id]);

  const disponibles = (medecins ?? []).filter((m) => m.disponible && !m.actuel);
  const affiches = tous ? (medecins ?? []).filter((m) => !m.actuel) : disponibles;

  const valider = async () => {
    if (!choix) return void alerte.echec('Choisissez le nouveau médecin.');
    setEnvoi(true);
    try {
      const r = await api.regulateur.reattribuer(consultation.id, { doctorId: choix, motif: motif.trim() || undefined });
      await alerte.succes(r.message);
      onFait();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <motion.div className={s.fond} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && !envoi && onFermer()}>
      <motion.div className={s.boite} role="dialog" aria-modal="true" aria-labelledby="reattribution-titre" initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
        <div className={s.boiteEntete}>
          <div>
            <h2 id="reattribution-titre">Réattribuer {consultation.patient.nom}</h2>
            <p>
              {consultation.prestation ?? 'Consultation'} · actuellement : {consultation.medecin?.nom ?? 'aucun médecin'}
              {consultation.raison
                ? ` (${consultation.raison.toLowerCase()})`
                : consultation.attente >= ATTENTE_MAX
                  ? ` (en attente depuis ${duree(consultation.attente)})`
                  : ''}
            </p>
          </div>
          <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer" disabled={envoi}>
            <FaTimes />
          </button>
        </div>

        <div className={s.listeEntete}>
          <strong>Médecins du service {service ?? 'du patient'}</strong>
          <label className={s.coche}>
            <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} /> Afficher aussi les indisponibles
          </label>
        </div>

        {!medecins ? (
          <p className={s.aide}>Chargement des médecins…</p>
        ) : affiches.length === 0 ? (
          <p className={s.aide}>
            {tous ? `Aucun autre médecin dans le service ${service ?? 'du patient'}.` : `Aucun autre médecin du service ${service ?? 'du patient'} n'est disponible maintenant.`}
          </p>
        ) : (
          <ul className={s.medecins} role="radiogroup" aria-label="Nouveau médecin">
            {affiches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choix === m.id}
                  disabled={!m.disponible}
                  className={`${s.medecin} ${choix === m.id ? s.medecinChoisi : ''}`}
                  onClick={() => setChoix(m.id)}
                >
                  <span className={s.medecinIcone}>{choix === m.id ? <FaCheck aria-hidden="true" /> : <FaUserMd aria-hidden="true" />}</span>
                  <span className={s.medecinTexte}>
                    <strong>{m.nom}</strong>
                    <small>{m.specialite}</small>
                  </span>
                  <span className={s.medecinInfos}>
                    {m.disponible ? (
                      <small>
                        {m.creneau} · {m.charge} patient{m.charge > 1 ? 's' : ''} aujourd'hui
                      </small>
                    ) : (
                      <span className={`${c.badge} ${s.badgeKo}`}>{m.raison}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className={s.motif}>
          <span>
            Motif <small>(facultatif)</small>
          </span>
          <textarea rows={2} maxLength={500} placeholder="Ex. médecin absent, au bloc…" value={motif} onChange={(e) => setMotif(e.target.value)} />
        </label>
        <p className={s.aide}>Le patient recevra un SMS avec le nom de son nouveau médecin.</p>

        <div className={s.boitePied}>
          <button type="button" className={c.secondaire} onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className={c.principal} onClick={valider} disabled={envoi || !choix || disponibles.length === 0}>
            <FaExchangeAlt aria-hidden="true" /> {envoi ? 'Réattribution…' : 'Réattribuer'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
