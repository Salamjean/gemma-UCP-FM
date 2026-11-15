import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaCheck } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { apiAgent, type EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { OptionsAccueilInfirmier } from '../../../types';
import ChampsAffectation, { type ValeurAffectation } from './ChampsAffectation';
import s from './Accueil.module.css';

/** Valeurs par défaut des champs obligatoires non demandés en urgence (modifiables ensuite dans la fiche du patient) */
const PAYS = "Côte d'Ivoire";
const SITUATION_PAR_DEFAUT = 'celibataire';
const PIECE_PAR_DEFAUT = 'Aucune';

/**
 * INFIRMIER / MÉDECIN > INSCRIPTION D'URGENCE (avec affectation)
 * Une seule page : les informations obligatoires du patient (nom, prénom, sexe, date ou âge, téléphone) + N° CMU facultatif
 * + l'affectation (obligatoire). Même enregistrement que l'inscription complète (POST patients) :
 * situation matrimoniale « Célibataire » et pièce « Aucune » par défaut, le reste se complète plus tard dans la fiche.
 */
export default function InscriptionUrgence({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const source = apiAgent(espace);
  const base = espace === 'medecin' ? '/medecin' : '/infirmier';
  const navigate = useNavigate();
  const [options, setOptions] = useState<OptionsAccueilInfirmier | null>(null);
  const [verifier, setVerifier] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [genre, setGenre] = useState<'masculin' | 'feminin' | ''>('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [age, setAge] = useState('');
  const [telephone, setTelephone] = useState('');
  const [numCmu, setNumCmu] = useState('');
  const [affectation, setAffectation] = useState<ValeurAffectation>({ prestationId: null, doctorId: null, infirmierId: null, motif: '' });

  useEffect(() => {
    source.patients
      .optionsAccueil()
      .then(setOptions)
      .catch((e) => alerte.echec(`Impossible de charger le formulaire : ${messageErreur(e)}`));
  }, []);

  const anneeCourante = new Date().getFullYear();
  /** Âge → date de naissance au 1er janvier (comme l'inscription complète) */
  const saisirAge = (v: string) => {
    const a = v.replace(/\D/g, '').slice(0, 3);
    setAge(a);
    setDateNaissance(a === '' || Number(a) > 130 ? '' : `${anneeCourante - Number(a)}-01-01`);
  };
  const saisirDate = (v: string) => {
    setDateNaissance(v);
    if (!v) return setAge('');
    const n = new Date(`${v}T00:00:00`);
    const auj = new Date();
    let a = auj.getFullYear() - n.getFullYear();
    if (auj.getMonth() < n.getMonth() || (auj.getMonth() === n.getMonth() && auj.getDate() < n.getDate())) a--;
    setAge(a >= 0 ? String(a) : '');
  };
  const tel = (v: string) => v.replace(/\D/g, '').slice(0, 10);

  const erreurs: Record<string, { message: string; ko: boolean }> = {
    nom: { message: 'Le nom est obligatoire.', ko: !nom.trim() },
    prenom: { message: 'Le prénom est obligatoire.', ko: !prenom.trim() },
    genre: { message: 'Choisissez le sexe du patient.', ko: !genre },
    dateNaissance: { message: 'La date de naissance ou l’âge est obligatoire.', ko: !dateNaissance },
    telephone: { message: 'Le téléphone doit contenir 10 chiffres.', ko: !/^\d{10}$/.test(telephone) },
    prestation: { message: 'Choisissez le service puis la prestation.', ko: !affectation.prestationId },
    medecin: { message: 'Veuillez choisir le médecin.', ko: !affectation.doctorId },
    infirmier: { message: 'Veuillez choisir l’infirmier·ère.', ko: espace === 'medecin' && !affectation.infirmierId },
    motif: { message: 'Le motif de la consultation est obligatoire.', ko: !affectation.motif.trim() },
  };
  const ko = (k: string) => verifier && erreurs[k].ko;

  const soumettre = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setVerifier(true);
    const e = Object.values(erreurs).find((x) => x.ko);
    if (e) return void alerte.echec(e.message);
    setEnvoi(true);
    try {
      const r = await source.patients.inscrire({
        urgence: true,
        nom: nom.trim(),
        prenom: prenom.trim(),
        genre: genre as 'masculin' | 'feminin',
        dateNaissance,
        pays: PAYS,
        situationMatrimoniale: SITUATION_PAR_DEFAUT,
        telephone,
        typePiece: PIECE_PAR_DEFAUT,
        numCmu: numCmu.trim() || undefined,
        affectation: {
          prestationId: affectation.prestationId!,
          motif: affectation.motif.trim(),
          doctorId: affectation.doctorId!,
          infirmierId: espace === 'medecin' ? affectation.infirmierId ?? undefined : undefined,
        },
      });
      await alerte.succes(r.message);
      // Infirmier : prise des constantes directement ; médecin : retour au tableau de bord
      navigate(r.consultationId && espace !== 'medecin' ? `/infirmier/consultations/formulaire/${r.consultationId}` : base);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Accueil · Urgence</p>
          <h1 className={c.titre}>Inscription d'urgence</h1>
        </div>
        <div className={c.boutons}>
          <Link to={`${base}/patients/inscrire`} className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Type d'inscription
          </Link>
        </div>
      </header>

      <form className={c.bloc} onSubmit={soumettre} noValidate>
        {!options ? (
          <p className={c.vide}>Chargement du formulaire…</p>
        ) : (
          <>
            <p className={s.sousTitre}>Patient — informations obligatoires</p>
            <div className={s.grille}>
              <div className={`${s.champ} ${ko('nom') ? s.invalide : ''}`}>
                <label htmlFor="u-nom">
                  Nom <span className={s.requis}>*</span>
                </label>
                <input id="u-nom" maxLength={191} placeholder="Ex. KOUASSI" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
              </div>
              <div className={`${s.champ} ${ko('prenom') ? s.invalide : ''}`}>
                <label htmlFor="u-prenom">
                  Prénom(s) <span className={s.requis}>*</span>
                </label>
                <input id="u-prenom" maxLength={191} placeholder="Ex. Aya Marie" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
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
                <label htmlFor="u-naissance">
                  Date de naissance ou âge <span className={s.requis}>*</span>
                </label>
                <div className={s.dateAge}>
                  <input id="u-naissance" type="date" max={new Date().toISOString().slice(0, 10)} value={dateNaissance} onChange={(e) => saisirDate(e.target.value)} />
                  <span className={s.age} title="Âge si la date de naissance est inconnue : la date sera le 1er janvier de l'année calculée">
                    <input inputMode="numeric" placeholder="Âge" value={age} onChange={(e) => saisirAge(e.target.value)} aria-label="Âge du patient (si la date de naissance est inconnue)" />
                    <small>ans</small>
                  </span>
                </div>
              </div>
              <div className={`${s.champ} ${ko('telephone') ? s.invalide : ''}`}>
                <label htmlFor="u-tel">
                  Téléphone <span className={s.requis}>*</span>
                </label>
                <input id="u-tel" inputMode="numeric" placeholder="0700000000" value={telephone} onChange={(e) => setTelephone(tel(e.target.value))} />
              </div>
              <div className={s.champ}>
                <label htmlFor="u-cmu">
                  N° CMU <span className={s.facultatif}>(facultatif)</span>
                </label>
                <input id="u-cmu" maxLength={191} value={numCmu} onChange={(e) => setNumCmu(e.target.value)} />
              </div>
            </div>

            <p className={s.sousTitre}>Affectation</p>
            <ChampsAffectation options={options} valeur={affectation} onChange={setAffectation} verifier={verifier} />
            <p className={s.aide}>Situation matrimoniale « Célibataire » et pièce d'identité « Aucune » par défaut : le reste du dossier se complète plus tard depuis la fiche du patient.</p>
          </>
        )}

        <footer className={s.pied}>
          <Link to={base} className={c.secondaire}>
            Annuler
          </Link>
          <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi || !options}>
            {envoi ? (
              'Enregistrement…'
            ) : (
              <>
                <FaCheck aria-hidden="true" /> {espace === 'medecin' ? 'Inscrire et affecter' : 'Inscrire et prendre les constantes'}
              </>
            )}
          </motion.button>
        </footer>
      </form>
    </div>
  );
}
