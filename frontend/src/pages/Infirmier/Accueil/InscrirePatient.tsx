import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaCheck, FaIdCard, FaStethoscope, FaUser } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import SelectRecherche from '../../../components/SelectRecherche';
import { alerte, messageErreur } from '../../../services/alertes';
import { apiAgent, type EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { OptionsAccueilInfirmier } from '../../../types';
import ChampsAffectation, { type ValeurAffectation } from './ChampsAffectation';
import s from './Accueil.module.css';

const ETAPES = [
  { titre: 'Identité', icone: FaUser },
  { titre: 'Contacts & pièce', icone: FaIdCard },
  { titre: 'Affectation', icone: FaStethoscope },
];

const SITUATIONS = [
  { id: 'celibataire', libelle: 'Célibataire' },
  { id: 'marie', libelle: 'Marié(e)' },
  { id: 'concubinage', libelle: 'Concubinage' },
  { id: 'divorce', libelle: 'Divorcé(e)' },
  { id: 'veuf', libelle: 'Veuf / veuve' },
];
const PIECES = ['CNI', 'Passeport', 'Attestation', 'Permis de conduire', 'Carte consulaire', 'Extrait de naissance', 'Carnet de naissance', 'Aucune'];

/**
 * INFIRMIER > INSCRIRE UN NOUVEAU PATIENT (bouton du tableau de bord)
 * Repris du formulaire du secrétariat Laravel (Secretariat\PatientController@addPatient), en 3 étapes :
 *   1. identité  2. contacts & pièce  3. affectation (facultative : crée la consultation du jour, sans caisse)
 * Après l'affectation, l'infirmier arrive directement sur la prise des constantes.
 */
export default function InscrirePatient({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const source = apiAgent(espace);
  /** Racine des liens : /infirmier ou /medecin */
  const base = espace === 'medecin' ? '/medecin' : '/infirmier';
  const navigate = useNavigate();
  const [options, setOptions] = useState<OptionsAccueilInfirmier | null>(null);
  const [etape, setEtape] = useState(1);
  const [verifiees, setVerifiees] = useState<number[]>([]);
  const [envoi, setEnvoi] = useState(false);

  // Étape 1
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [genre, setGenre] = useState<'masculin' | 'feminin' | ''>('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [lieuNaissance, setLieuNaissance] = useState<number | null>(null);
  const pays = "Côte d'Ivoire"; // champ grisé (non modifiable)
  const [situation, setSituation] = useState('celibataire'); // Célibataire par défaut
  const [profession, setProfession] = useState('');
  /** Âge saisi quand la date de naissance est inconnue → date "01/01/(année − âge)" */
  const [age, setAge] = useState('');

  const anneeCourante = new Date().getFullYear();
  /** Âge → date de naissance au 1er janvier (le backend numérote le dossier comme Laravel si plusieurs patients ont la même date) */
  const saisirAge = (v: string) => {
    const a = v.replace(/\D/g, '').slice(0, 3);
    setAge(a);
    setDateNaissance(a === '' || Number(a) > 130 ? '' : `${anneeCourante - Number(a)}-01-01`);
  };
  /** Date → âge affiché à côté */
  const saisirDate = (v: string) => {
    setDateNaissance(v);
    if (!v) return setAge('');
    const n = new Date(`${v}T00:00:00`);
    const auj = new Date();
    let a = auj.getFullYear() - n.getFullYear();
    if (auj.getMonth() < n.getMonth() || (auj.getMonth() === n.getMonth() && auj.getDate() < n.getDate())) a--;
    setAge(a >= 0 ? String(a) : '');
  };
  // Étape 2
  const [telephone, setTelephone] = useState('');
  const [contact2, setContact2] = useState('');
  const [email, setEmail] = useState('');
  const [residence, setResidence] = useState<number | null>(null);
  const [adresse, setAdresse] = useState('');
  const [typePiece, setTypePiece] = useState('CNI');
  const [numeroIdentite, setNumeroIdentite] = useState('');
  const [numCmu, setNumCmu] = useState('');
  const [urgenceNom, setUrgenceNom] = useState('');
  const [urgenceTelephone, setUrgenceTelephone] = useState('');
  const [urgenceLien, setUrgenceLien] = useState('');
  // Étape 3
  const [affecter, setAffecter] = useState(true);
  const [affectation, setAffectation] = useState<ValeurAffectation>({ prestationId: null, doctorId: null, infirmierId: null, motif: '' });

  useEffect(() => {
    source.patients
      .optionsAccueil()
      .then(setOptions)
      .catch((e) => alerte.echec(`Impossible de charger le formulaire : ${messageErreur(e)}`));
  }, []);

  const tel = (v: string) => v.replace(/\D/g, '').slice(0, 10);
  const erreurs: Record<string, { etape: number; message: string; ko: boolean }> = {
    nom: { etape: 1, message: 'Le nom est obligatoire.', ko: !nom.trim() },
    prenom: { etape: 1, message: 'Le prénom est obligatoire.', ko: !prenom.trim() },
    genre: { etape: 1, message: 'Choisissez le sexe du patient.', ko: !genre },
    dateNaissance: { etape: 1, message: 'La date de naissance est obligatoire.', ko: !dateNaissance },
    situation: { etape: 1, message: 'Choisissez la situation matrimoniale.', ko: !situation },
    telephone: { etape: 2, message: 'Le téléphone doit contenir 10 chiffres.', ko: !/^\d{10}$/.test(telephone) },
    contact2: { etape: 2, message: 'Le 2e contact doit contenir 10 chiffres.', ko: !!contact2 && !/^\d{10}$/.test(contact2) },
    email: { etape: 2, message: 'Adresse email invalide.', ko: !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) },
    numCmu: { etape: 2, message: 'Le N° CMU est obligatoire.', ko: !numCmu.trim() },
    urgenceTelephone: { etape: 2, message: 'Le téléphone de la personne à prévenir doit contenir 10 chiffres.', ko: !!urgenceTelephone && !/^\d{10}$/.test(urgenceTelephone) },
    prestation: { etape: 3, message: 'Choisissez le service puis la prestation.', ko: affecter && !affectation.prestationId },
    medecin: { etape: 3, message: 'Veuillez choisir le médecin.', ko: affecter && !affectation.doctorId },
    infirmier: { etape: 3, message: 'Veuillez choisir l’infirmier·ère.', ko: affecter && espace === 'medecin' && !affectation.infirmierId },
    motif: { etape: 3, message: 'Le motif de la consultation est obligatoire.', ko: affecter && !affectation.motif.trim() },
  };
  const ko = (k: string) => verifiees.includes(erreurs[k].etape) && erreurs[k].ko;
  const premiereErreur = (etapes: number[]) => Object.values(erreurs).find((e) => e.ko && etapes.includes(e.etape));

  const allerA = (n: number) => {
    if (n > etape) {
      const avant = Array.from({ length: n - 1 }, (_, i) => i + 1);
      setVerifiees((v) => [...new Set([...v, ...avant])]);
      const e = premiereErreur(avant);
      if (e) {
        setEtape(e.etape);
        return void alerte.echec(e.message);
      }
    }
    setEtape(n);
  };

  const soumettre = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (etape < 3) return allerA(etape + 1);
    setVerifiees([1, 2, 3]);
    const e = premiereErreur([1, 2, 3]);
    if (e) {
      setEtape(e.etape);
      return void alerte.echec(e.message);
    }
    setEnvoi(true);
    try {
      const r = await source.patients.inscrire({
        nom: nom.trim(),
        prenom: prenom.trim(),
        genre: genre as 'masculin' | 'feminin',
        dateNaissance,
        lieuNaissance: lieuNaissance ?? undefined,
        residence: residence ?? undefined,
        pays: pays.trim(),
        situationMatrimoniale: situation,
        telephone,
        contact2: contact2 || undefined,
        email: email.trim() || undefined,
        typePiece,
        numeroIdentite: numeroIdentite.trim() || undefined,
        profession: profession.trim() || undefined,
        numCmu: numCmu.trim(),
        adresse: adresse.trim() || undefined,
        urgenceNom: urgenceNom.trim() || undefined,
        urgenceTelephone: urgenceTelephone || undefined,
        urgenceLien: urgenceLien.trim() || undefined,
        affectation: affecter ? { prestationId: affectation.prestationId!, motif: affectation.motif.trim(), doctorId: affectation.doctorId!, infirmierId: espace === 'medecin' ? affectation.infirmierId ?? undefined : undefined } : undefined,
      });
      await alerte.succes(r.message);
      // Affecté → prise des constantes directement ; sinon retour au tableau de bord
      navigate(r.consultationId && espace !== 'medecin' ? `/infirmier/consultations/formulaire/${r.consultationId}` : base);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const localites = (options?.localites ?? []).map((l) => ({ id: l.id, name: l.nom }));

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Accueil · Nouveau patient</p>
          <h1 className={c.titre}>Inscrire un nouveau patient</h1>
        </div>
        <Link to={`${base}/patients/inscrire`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Type d'inscription
        </Link>
      </header>

      <form className={c.bloc} onSubmit={soumettre} noValidate>
        {/* --- Étapes --- */}
        <ol className={s.etapes}>
          {ETAPES.map((et, i) => {
            const n = i + 1;
            const faite = n < etape;
            return (
              <li key={et.titre} className={`${s.etape} ${n === etape ? s.etapeActive : ''} ${faite ? s.etapeFaite : ''}`}>
                <button type="button" onClick={() => allerA(n)} aria-current={n === etape ? 'step' : undefined}>
                  <span className={s.etapeNumero}>
                    {n === etape && <motion.span layoutId="etape-inscription" className={s.etapeFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                    <span className={s.etapeChiffre}>{faite ? <FaCheck aria-hidden="true" /> : <et.icone aria-hidden="true" />}</span>
                  </span>
                  <span className={s.etapeTexte}>
                    <small>Étape {n}</small>
                    {et.titre}
                  </span>
                </button>
                {n < ETAPES.length && (
                  <span className={s.etapeTrait}>
                    <motion.span initial={false} animate={{ width: faite ? '100%' : '0%' }} transition={{ duration: 0.35 }} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {!options ? (
          <p className={c.vide}>Chargement du formulaire…</p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={etape} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              {etape === 1 && (
                <div className={s.grille}>
                  <div className={`${s.champ} ${ko('nom') ? s.invalide : ''}`}>
                    <label htmlFor="nom">
                      Nom <span className={s.requis}>*</span>
                    </label>
                    <input id="nom" maxLength={191} placeholder="Ex. KOUASSI" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
                  </div>
                  <div className={`${s.champ} ${ko('prenom') ? s.invalide : ''}`}>
                    <label htmlFor="prenom">
                      Prénom(s) <span className={s.requis}>*</span>
                    </label>
                    <input id="prenom" maxLength={191} placeholder="Ex. Aya Marie" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                  </div>
                  <div className={`${s.champ} ${ko('genre') ? s.invalide : ''}`}>
                    <span className={s.etiquette}>
                      Sexe <span className={s.requis}>*</span>
                    </span>
                    <div className={s.choix} role="radiogroup" aria-label="Sexe">
                      {(['masculin', 'feminin'] as const).map((g) => (
                        <button key={g} type="button" role="radio" aria-checked={genre === g} className={`${s.option} ${genre === g ? s.optionActive : ''}`} onClick={() => setGenre(g)}>
                          {g === 'masculin' ? 'Masculin' : 'Féminin'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`${s.champ} ${ko('dateNaissance') ? s.invalide : ''}`}>
                    <label htmlFor="naissance">
                      Date de naissance ou âge <span className={s.requis}>*</span>
                    </label>
                    <div className={s.dateAge}>
                      <input id="naissance" type="date" max={new Date().toISOString().slice(0, 10)} value={dateNaissance} onChange={(e) => saisirDate(e.target.value)} />
                      <span className={s.age} title="Âge si la date de naissance est inconnue : la date sera le 1er janvier de l'année calculée">
                        <input inputMode="numeric" placeholder="Âge" value={age} onChange={(e) => saisirAge(e.target.value)} aria-label="Âge du patient (si la date de naissance est inconnue)" />
                        <small>ans</small>
                      </span>
                    </div>
                  </div>
                  <div className={s.champ}>
                    <label htmlFor="lieu">
                      Lieu de naissance <span className={s.facultatif}>(facultatif)</span>
                    </label>
                    <SelectRecherche
                      id="lieu"
                      options={localites}
                      value={lieuNaissance}
                      onChange={setLieuNaissance}
                      placeholder="-- Choisir --"
                      placeholderRecherche="Rechercher une localité…"
                      aucunResultat="Aucune localité"
                      optionVide="Non renseigné"
                    />
                  </div>
                  <div className={`${s.champ} `}>
                    <label htmlFor="pays">Pays</label>
                    <input id="pays" value={pays} disabled title="Pays par défaut" />
                  </div>
                  <div className={`${s.champ} ${s.large2} ${ko('situation') ? s.invalide : ''}`}>
                    <span className={s.etiquette}>
                      Situation matrimoniale <span className={s.requis}>*</span>
                    </span>
                    <div className={s.choix} role="radiogroup" aria-label="Situation matrimoniale">
                      {SITUATIONS.map((x) => (
                        <button key={x.id} type="button" role="radio" aria-checked={situation === x.id} className={`${s.option} ${situation === x.id ? s.optionActive : ''}`} onClick={() => setSituation(x.id)}>
                          {x.libelle}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={s.champ}>
                    <label htmlFor="profession">
                      Profession <span className={s.facultatif}>(facultatif)</span>
                    </label>
                    <input id="profession" maxLength={191} placeholder="Ex. Commerçante" value={profession} onChange={(e) => setProfession(e.target.value)} />
                  </div>
                </div>
              )}

              {etape === 2 && (
                <div className={s.grille}>
                  <div className={`${s.champ} ${ko('telephone') ? s.invalide : ''}`}>
                    <label htmlFor="tel">
                      Téléphone <span className={s.requis}>*</span>
                    </label>
                    <input id="tel" inputMode="numeric" placeholder="0700000000" value={telephone} onChange={(e) => setTelephone(tel(e.target.value))} autoFocus />
                  </div>
                  <div className={`${s.champ} ${ko('contact2') ? s.invalide : ''}`}>
                    <label htmlFor="tel2">
                      2e contact <span className={s.facultatif}>(facultatif)</span>
                    </label>
                    <input id="tel2" inputMode="numeric" placeholder="0500000000" value={contact2} onChange={(e) => setContact2(tel(e.target.value))} />
                  </div>
                  <div className={`${s.champ} ${ko('email') ? s.invalide : ''}`}>
                    <label htmlFor="email">
                      Email <span className={s.facultatif}>(facultatif)</span>
                    </label>
                    <input id="email" type="email" maxLength={191} placeholder="patient@exemple.ci" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className={s.champ}>
                    <label htmlFor="residence">
                      Résidence actuelle <span className={s.facultatif}>(facultatif)</span>
                    </label>
                    <SelectRecherche
                      id="residence"
                      options={localites}
                      value={residence}
                      onChange={setResidence}
                      placeholder="-- Choisir --"
                      placeholderRecherche="Rechercher une localité…"
                      aucunResultat="Aucune localité"
                      optionVide="Non renseignée"
                    />
                  </div>
                  <div className={`${s.champ} ${s.large2}`}>
                    <label htmlFor="adresse">
                      Adresse <span className={s.facultatif}>(facultatif)</span>
                    </label>
                    <input id="adresse" maxLength={191} placeholder="Quartier, rue…" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
                  </div>
                  <div className={s.champ}>
                    <label htmlFor="piece">
                      Pièce d'identité <span className={s.requis}>*</span>
                    </label>
                    <select id="piece" className={s.select} value={typePiece} onChange={(e) => setTypePiece(e.target.value)}>
                      {PIECES.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className={s.champ}>
                    {/* CNI : le numéro à saisir est le NNI (numéro national d'identification) */}
                    <label htmlFor="numpiece">
                      {typePiece === 'CNI' ? 'N° NNI' : 'N° de la pièce'} <span className={s.facultatif}>(facultatif)</span>
                    </label>
                    <input
                      id="numpiece"
                      maxLength={191}
                      placeholder={typePiece === 'CNI' ? 'Ex. CI0012345678' : ''}
                      value={numeroIdentite}
                      onChange={(e) => setNumeroIdentite(e.target.value)}
                      disabled={typePiece === 'Aucune'}
                    />
                  </div>
                  <div className={`${s.champ} ${ko('numCmu') ? s.invalide : ''}`}>
                    <label htmlFor="cmu">
                      N° CMU <span className={s.requis}>*</span>
                    </label>
                    <input id="cmu" maxLength={191} value={numCmu} onChange={(e) => setNumCmu(e.target.value)} />
                  </div>
                  <p className={`${s.sousTitre} ${s.large}`}>
                    Personne à prévenir <span className={s.facultatif}>(facultatif)</span>
                  </p>
                  <div className={s.champ}>
                    <label htmlFor="unom">Nom</label>
                    <input id="unom" maxLength={191} value={urgenceNom} onChange={(e) => setUrgenceNom(e.target.value)} />
                  </div>
                  <div className={`${s.champ} ${ko('urgenceTelephone') ? s.invalide : ''}`}>
                    <label htmlFor="utel">Téléphone</label>
                    <input id="utel" inputMode="numeric" value={urgenceTelephone} onChange={(e) => setUrgenceTelephone(tel(e.target.value))} />
                  </div>
                  <div className={s.champ}>
                    <label htmlFor="ulien">Lien</label>
                    <input id="ulien" maxLength={191} placeholder="Ex. Époux, mère…" value={urgenceLien} onChange={(e) => setUrgenceLien(e.target.value)} />
                  </div>
                </div>
              )}

              {etape === 3 && (
                <div className={s.etape3}>
                  <label className={s.interrupteur}>
                    <input type="checkbox" checked={affecter} onChange={(e) => setAffecter(e.target.checked)} />
                    <span className={s.interrupteurPiste} aria-hidden="true" />
                    <span>
                      <strong>Affecter le patient maintenant</strong>
                      <small>
                        {espace === 'medecin' ? 'Crée la consultation du jour : l’infirmier·ère prendra ses constantes.' : 'Crée la consultation du jour : vous prendrez ses constantes juste après l’inscription.'}
                      </small>
                    </span>
                  </label>
                  {affecter && <ChampsAffectation options={options} valeur={affectation} onChange={setAffectation} verifier={verifiees.includes(3)} />}
                  <div className={s.recapInscription}>
                    <span className={s.avatarRecap}>{`${nom.trim()[0] ?? ''}${prenom.trim()[0] ?? ''}`.toUpperCase() || '?'}</span>
                    <div>
                      <strong>
                        {nom.toUpperCase()} {prenom}
                      </strong>
                      <small>
                        {genre === 'feminin' ? 'Féminin' : genre === 'masculin' ? 'Masculin' : '—'} · {telephone || 'sans téléphone'}
                      </small>
                    </div>
                    <span className={s.recapNote}>Le numéro de dossier (DM) sera créé à l'enregistrement.</span>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        <footer className={s.pied}>
          {etape === 1 ? (
            <Link to={base} className={c.secondaire}>
              Annuler
            </Link>
          ) : (
            <button type="button" className={c.secondaire} onClick={() => allerA(etape - 1)}>
              <FaArrowLeft aria-hidden="true" /> Précédent
            </button>
          )}
          <span className={s.piedEtape}>Étape {etape} / 3</span>
          <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi || !options}>
            {etape < 3 ? (
              <>
                Suivant <FaArrowRight aria-hidden="true" />
              </>
            ) : (
              <>
                <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : affecter ? (espace === 'medecin' ? 'Inscrire et affecter' : 'Inscrire et prendre les constantes') : 'Inscrire le patient'}
              </>
            )}
          </motion.button>
        </footer>
      </form>
    </div>
  );
}
