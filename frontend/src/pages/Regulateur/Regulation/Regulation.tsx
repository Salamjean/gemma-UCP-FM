import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheck, FaClipboardList, FaExchangeAlt, FaExclamationTriangle, FaHistory, FaSearch, FaSyncAlt, FaTimes, FaUserMd, FaVideo } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { ConsultationARegler, MedecinPropose, TableauRegulation } from '../../../types';
import s from './Regulation.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';
import SelectRecherche from '../../../components/SelectRecherche/SelectRecherche';
import HorsDistrict from '../../../components/HorsDistrict/HorsDistrict';

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
/** Rafraîchissement automatique de la liste */
const INTERVALLE = 30_000;
/** Au-delà de ce délai sans prise en charge, l'affectation passe « À réguler » (même règle que le backend) */
const ATTENTE_MAX = 30;
/** Réattribution externe sans médecin : envoi à tout le service de l'hôpital */
const TOUS_SERVICE = 'Tous les médecins du service';
const duree = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

/**
 * RÉGULATEUR > RÉGULATION DES PATIENTS (page d'accueil de l'espace)
 * Consultations ouvertes du jour dans l'hôpital. Quand le médecin choisi par l'infirmier·ère n'est pas disponible
 * (aucun médecin, compte désactivé, permission en cours, hors de son planning), le régulateur attribue le patient
 * à un autre médecin disponible maintenant. Une affectation en attente depuis 30 minutes ou plus passe aussi « À réguler »,
 * comme une télémédecine en retard (télé-expertise sans réponse à l'heure limite, téléconsultation non faite 30 min après l'heure prévue).
 * Le patient reçoit un SMS avec son nouveau médecin.
 */
export default function Regulation() {
  const [data, setData] = useState<TableauRegulation | null>(null);
  const [filtre, setFiltre] = useState<'a-reguler' | 'toutes'>('toutes');
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
      .filter((x) => !q || [x.patient.nom, x.patient.code, x.code, x.medecin?.nom, x.infirmierAttribue, x.infirmier, x.prestation, x.service].some((v) => v?.toLowerCase().includes(q)));
  }, [data, filtre, recherche]);
  const pg = usePagination(liste);

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
          <h1 className={c.titre}>Régulation</h1>
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
                // « Toutes » en premier, sélectionné par défaut
                ['toutes', 'Toutes'],
                ['a-reguler', 'À réguler'],
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
                      ? `Aucun patient à réguler : les médecins attribués sont disponibles, aucune affectation n'attend depuis ${ATTENTE_MAX} minutes et aucune télémédecine n'est en retard.`
                      : "Aucune consultation ouverte aujourd'hui."}
                  </td>
                </tr>
              )}
              {pg.lignes.map((x) => (
                <tr key={x.id}>
                  <td>
                    {heure(x.arrivee)}
                    {x.retardTelemedecine !== null ? (
                      <span className={s.attente}>Délai dépassé de {duree(x.retardTelemedecine)}</span>
                    ) : (
                      !x.telemedecine && x.attente >= ATTENTE_MAX && !x.enAppel && <span className={s.attente}>En attente depuis {duree(x.attente)}</span>
                    )}
                  </td>
                  <td>
                    <strong>{x.patient.nom}</strong>
                    <span className={c.sousTexte}>{x.patient.code ?? x.code}</span>
                    {x.urgence && <span className={`${c.badge} ${s.badgeUrgence}`}>Urgence</span>}
                    {x.telemedecine && (
                      <span className={`${c.badge} ${x.telemedecine === 'teleexpertise' ? s.badgeExpertise : s.badgeTeleconsultation}`}>
                        {x.telemedecine === 'teleexpertise' ? 'Télé-expertise' : 'Téléconsultation'}
                      </span>
                    )}
                  </td>
                  <td>
                    {x.prestation ?? '—'}
                    {x.service && <span className={c.sousTexte}>{x.service}</span>}
                  </td>
                  <td>
                    {x.infirmierAttribue ? (
                      <>
                        {x.infirmierAttribue}
                        <span className={`${c.badge} ${s.badgeInfirmier}`}>Infirmier·ère</span>
                      </>
                    ) : (
                      <>
                        {x.medecin?.nom ?? '—'}
                        <span className={`${c.badge} ${x.disponible ? c.badgeOk : s.badgeKo}`}>{x.disponible ? 'Disponible' : x.raison}</span>
                      </>
                    )}
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
        <PaginationTableau pagination={pg} />
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

/**
 * Fenêtre de réattribution, comme la télé-expertise, TOUJOURS dans le service où le patient est affecté (non modifiable) :
 *   - en interne : médecins de ce service dans l'hôpital ;
 *   - en externe : hôpital de la DMHP qui a ce service → ses médecins de ce service.
 * Disponibles d'abord, moins chargés ; motif facultatif.
 */
function FenetreReattribution({ consultation, onFermer, onFait }: { consultation: ConsultationARegler; onFermer: () => void; onFait: () => void }) {
  const [medecins, setMedecins] = useState<MedecinPropose[] | null>(null);
  const [service, setService] = useState<string | null>(consultation.service);
  const [choix, setChoix] = useState<number | null>(null);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // Interne / externe et hôpital (externe) ; le service est celui du patient (non modifiable)
  const [portee, setPortee] = useState<'interne' | 'externe' | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [hopital, setHopital] = useState<number | null>(null);
  const [hopitaux, setHopitaux] = useState<{ id: number; nom: string }[] | null>(null);
  // Externe : hôpitaux du district (par défaut) ou hors du district
  const [horsDistrict, setHorsDistrict] = useState(false);

  // Ouverture : choix par défaut et ses médecins
  useEffect(() => {
    api.regulateur
      .medecins(consultation.id)
      .then((r) => {
        setMedecins(r.medecins);
        if (r.service) setService(r.service);
        setServiceId(r.defaut.serviceId);
        setPortee(r.defaut.portee);
        setHopital(r.defaut.hospitalId);
      })
      .catch((e) => {
        alerte.echec(messageErreur(e));
        onFermer();
      });
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [consultation.id]);

  // Externe : autres hôpitaux de la DMHP qui ont le service du patient
  useEffect(() => {
    setHopitaux(null);
    if (portee !== 'externe' || !serviceId) return;
    let actif = true;
    api.regulateur
      .hopitauxService(serviceId, horsDistrict)
      .then((l) => actif && setHopitaux(l))
      .catch(() => actif && setHopitaux([]));
    return () => {
      actif = false;
    };
  }, [portee, serviceId, horsDistrict]);

  // Médecins du service du patient : dans l'hôpital (interne) ou l'hôpital choisi (externe)
  const [premierChargement, setPremierChargement] = useState(true);
  useEffect(() => {
    if (!portee) return;
    // Le choix par défaut est déjà chargé à l'ouverture
    if (premierChargement) {
      setPremierChargement(false);
      return;
    }
    setChoix(null);
    setMedecins(null);
    if (portee === 'externe' && !hopital) return setMedecins([]);
    let actif = true;
    api.regulateur
      .medecins(consultation.id, portee === 'externe' ? { portee, hospitalId: hopital! } : { portee })
      .then((r) => actif && setMedecins(r.medecins))
      .catch((e) => actif && (alerte.echec(messageErreur(e)), setMedecins([])));
    return () => {
      actif = false;
    };
  }, [portee, hopital]);

  const nomHopital = hopitaux?.find((h) => h.id === hopital)?.nom;
  const pret = !!serviceId && (portee === 'interne' || !!hopital);

  const disponibles = (medecins ?? []).filter((m) => m.disponible && !m.actuel);

  const valider = async () => {
    if (portee === 'externe' && !hopital) return void alerte.echec('Choisissez l’hôpital.');
    if (portee !== 'externe' && !choix) return void alerte.echec('Choisissez le nouveau médecin.');
    setEnvoi(true);
    try {
      const r = await api.regulateur.reattribuer(consultation.id, {
        ...(choix ? { doctorId: choix } : {}),
        ...(portee === 'externe' && hopital ? { hospitalId: hopital } : {}),
        motif: motif.trim() || undefined,
      });
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
              {consultation.prestation ?? 'Consultation'} · actuellement : {consultation.medecin?.nom ?? (consultation.infirmierAttribue ? `${consultation.infirmierAttribue} (infirmier·ère)` : 'aucun médecin')}
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

        {/* En interne (médecin de l'hôpital) ou en externe (autre hôpital de la DMHP), comme la télé-expertise */}
        <div className={s.porteeLigne}>
          <span>
            Réattribuer <em>*</em>
          </span>
          <div className={s.onglets} role="radiogroup" aria-label="Réattribution en interne ou en externe">
            {(
              [
                ['interne', 'En interne'],
                ['externe', 'En externe'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={portee === v}
                className={`${s.onglet} ${portee === v ? s.ongletActif : ''}`}
                onClick={() => {
                  if (portee === v) return;
                  setPortee(v);
                  setHopital(null);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Externe : hôpitaux du district (par défaut) ou hors du district */}
        {portee === 'externe' && (
          <HorsDistrict
            id="reattribution-hors-district"
            valeur={horsDistrict}
            onChange={(v) => {
              setHorsDistrict(v);
              setHopital(null);
            }}
          />
        )}
        {/* Service du patient (fixe) · hôpital (externe) · médecin — sur la même ligne */}
        <div className={portee === 'externe' ? s.choixTrois : s.choixDeux}>
          {/* Service du patient : non modifiable */}
          <div className={s.choixChamp}>
            <span>Service</span>
            <div className={s.champFixe}>{service ?? 'Service du patient'}</div>
          </div>
          {portee === 'externe' && (
            <div className={s.choixChamp}>
              <span>
                Hôpital <em>*</em>
              </span>
              {!serviceId ? (
                <div className={s.champBloque}>Service du patient inconnu</div>
              ) : (
                <SelectRecherche
                  key={`hopital-${serviceId}`}
                  id="reattribution-hopital"
                  options={(hopitaux ?? []).map((h) => ({ id: h.id, name: h.nom }))}
                  value={hopital}
                  onChange={setHopital}
                  placeholder={
                    hopitaux
                      ? hopitaux.length
                        ? '-- Choisir l’hôpital --'
                        : horsDistrict
                          ? 'Aucun hôpital hors du district avec ce service'
                          : 'Aucun autre hôpital du district avec ce service'
                      : 'Chargement…'
                  }
                  placeholderRecherche="Rechercher un hôpital…"
                  aucunResultat="Aucun hôpital ne correspond"
                />
              )}
            </div>
          )}
          {/* Médecin du service disponible maintenant : obligatoire en interne, facultatif en externe (sinon tous les médecins du service) */}
          <div className={s.choixChamp}>
            <span>
              Médecin {portee === 'externe' ? <small className={s.facultatif}>(facultatif)</small> : <em>*</em>}
            </span>
            {!pret ? (
              <div className={s.champBloque}>{!serviceId ? 'Service du patient inconnu' : 'Hôpital d’abord'}</div>
            ) : (
              <SelectRecherche
                key={`medecins-${portee}-${hopital ?? 0}`}
                id="reattribution-medecin"
                options={disponibles.map((m) => ({
                  id: m.id,
                  name: m.nom,
                  detail: `${m.creneau ?? ''} · ${m.charge} patient${m.charge > 1 ? 's' : ''} aujourd’hui`,
                }))}
                value={choix}
                onChange={setChoix}
                optionVide={portee === 'externe' ? TOUS_SERVICE : undefined}
                placeholder={
                  !medecins
                    ? 'Chargement…'
                    : portee === 'externe'
                      ? TOUS_SERVICE
                      : disponibles.length
                        ? '-- Choisir le médecin --'
                        : 'Aucun médecin disponible maintenant'
                }
                placeholderRecherche="Rechercher un médecin…"
                aucunResultat="Aucun médecin ne correspond"
              />
            )}
          </div>
        </div>
        {portee === 'externe' && hopital && !choix && (
          <p className={s.aide}>
            Sans médecin choisi, tous les médecins du service {service ?? 'du patient'} à {nomHopital ?? 'l’hôpital choisi'} reçoivent le patient : le premier qui le prend en
            charge l’obtient, il disparaît alors chez les autres.
          </p>
        )}

        <label className={s.motif}>
          <span>
            Motif <small>(facultatif)</small>
          </span>
          <textarea rows={2} maxLength={500} placeholder="Ex. médecin absent, au bloc…" value={motif} onChange={(e) => setMotif(e.target.value)} />
        </label>
        {choix && <p className={s.aide}>Le patient recevra un SMS avec le nom de son nouveau médecin.</p>}

        <div className={s.boitePied}>
          <button type="button" className={c.secondaire} onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className={c.principal} onClick={valider} disabled={envoi || (portee === 'externe' ? !hopital : !choix)}>
            <FaExchangeAlt aria-hidden="true" /> {envoi ? 'Réattribution…' : 'Réattribuer'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
