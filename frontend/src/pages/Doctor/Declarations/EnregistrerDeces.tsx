import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaCheck, FaClipboardList, FaMapMarkerAlt, FaSearch, FaUserAlt } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DecesDirectSaisie, PatientDeclarationItem } from '../../../types';
import s from '../../Infirmier/Accueil/Accueil.module.css';
import d from './EnregistrerDeces.module.css';

const ETAPES = [
  { titre: 'Personne décédée', icone: FaUserAlt },
  { titre: 'Date & lieu', icone: FaMapMarkerAlt },
  { titre: 'Constat médical', icone: FaClipboardList },
];

const p2 = (n: number) => String(n).padStart(2, '0');
const aujourdhui = () => {
  const x = new Date();
  return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}`;
};
const maintenant = () => {
  const x = new Date();
  return `${p2(x.getHours())}:${p2(x.getMinutes())}`;
};

/** Boutons de choix (même style que les autres formulaires) */
function Choix<T extends string>({ valeur, options, onChange, label }: { valeur: T; options: { id: T; libelle: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={s.choix} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={valeur === o.id} className={`${s.option} ${valeur === o.id ? s.optionActive : ''}`} onClick={() => onChange(o.id)}>
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

/**
 * MÉDECIN > DÉCLARATIONS > ENREGISTRER UN DÉCÈS (en 3 étapes)
 * Équivalent Laravel : doctor.declaration.deces.direct / store_direct
 *   1. personne décédée : patient existant (recherche) ou nouveau défunt non enregistré ;
 *   2. date, heure, lieu (dans l'établissement ou hors), milieu, catégorie, décès maternel ;
 *   3. causes initiale et directe, observations, récapitulatif.
 */
export default function EnregistrerDeces() {
  const navigate = useNavigate();
  const [etape, setEtape] = useState(1);
  const [verifiees, setVerifiees] = useState<number[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [options, setOptions] = useState<{ hopital: string; medecin: string } | null>(null);

  // Étape 1
  const [mode, setMode] = useState<'existant' | 'nouveau'>('existant');
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<PatientDeclarationItem[] | null>(null);
  const [cherche, setCherche] = useState(false);
  const [patient, setPatient] = useState<PatientDeclarationItem | null>(null);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [genre, setGenre] = useState<'' | 'masculin' | 'feminin'>('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [ageEstime, setAgeEstime] = useState('');
  const [profession, setProfession] = useState('');
  const [telephone, setTelephone] = useState('');
  const [residence, setResidence] = useState('');
  // Étape 2
  const [date, setDate] = useState(aujourdhui());
  const [heure, setHeure] = useState(maintenant());
  const [lieuType, setLieuType] = useState<'hopital' | 'hors'>('hopital');
  const [service, setService] = useState('');
  const [lieuAutre, setLieuAutre] = useState('');
  const [milieu, setMilieu] = useState<'Urbain' | 'Rural'>('Urbain');
  const [person, setPerson] = useState<'patient' | 'enfant'>('patient');
  const [maternel, setMaternel] = useState<'non' | 'oui'>('non');
  // Étape 3
  const [causeInitiale, setCauseInitiale] = useState('');
  const [causeDirecte, setCauseDirecte] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    api.doctor.declarations
      .optionsDeces()
      .then(setOptions)
      .catch((e) => alerte.echec(`Impossible de charger le formulaire : ${messageErreur(e)}`));
  }, []);

  // Recherche du patient (après une courte pause de saisie)
  useEffect(() => {
    if (mode !== 'existant' || recherche.trim().length < 2) {
      setResultats(null);
      return;
    }
    let actif = true;
    setCherche(true);
    const t = setTimeout(() => {
      api.doctor.declarations
        .patients(recherche.trim())
        .then((r) => {
          if (actif) setResultats(r);
        })
        .catch((e) => {
          if (actif) alerte.echec(messageErreur(e));
        })
        .finally(() => {
          if (actif) setCherche(false);
        });
    }, 350);
    return () => {
      actif = false;
      clearTimeout(t);
    };
  }, [recherche, mode]);

  const erreurs: Record<string, { etape: number; message: string; ko: boolean }> = {
    patient: { etape: 1, message: 'Recherchez et choisissez le patient décédé.', ko: mode === 'existant' && !patient },
    nom: { etape: 1, message: 'Le nom du défunt est obligatoire.', ko: mode === 'nouveau' && !nom.trim() },
    genre: { etape: 1, message: 'Choisissez le sexe du défunt.', ko: mode === 'nouveau' && !genre },
    telephone: { etape: 1, message: 'Le contact doit contenir 10 chiffres.', ko: mode === 'nouveau' && !!telephone && !/^\d{10}$/.test(telephone) },
    date: { etape: 2, message: 'La date du décès est obligatoire.', ko: !date },
    futur: { etape: 2, message: 'La date du décès ne peut pas être dans le futur.', ko: !!date && !!heure && new Date(`${date}T${heure}`) > new Date() },
    heure: { etape: 2, message: 'L’heure du décès est obligatoire.', ko: !heure },
    lieuAutre: { etape: 2, message: 'Précisez le lieu exact du décès.', ko: lieuType === 'hors' && lieuAutre.trim().length < 2 },
    causeInitiale: { etape: 3, message: 'La cause initiale est obligatoire.', ko: causeInitiale.trim().length < 2 },
    causeDirecte: { etape: 3, message: 'La cause directe est obligatoire.', ko: causeDirecte.trim().length < 2 },
  };
  const ko = (k: string) => verifiees.includes(erreurs[k].etape) && erreurs[k].ko;
  const premiereErreur = (etapes: number[]) => Object.values(erreurs).find((e) => e.ko && etapes.includes(e.etape));

  const allerA = (n: number) => {
    if (n > etape) {
      const etapes = Array.from({ length: n - 1 }, (_, i) => i + 1);
      setVerifiees((v) => [...new Set([...v, ...etapes])]);
      const e = premiereErreur(etapes);
      if (e) {
        setEtape(e.etape);
        return void alerte.echec(e.message);
      }
    }
    setEtape(n);
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (etape < 3) return allerA(etape + 1);
    setVerifiees([1, 2, 3]);
    const err = premiereErreur([1, 2, 3]);
    if (err) {
      setEtape(err.etape);
      return void alerte.echec(err.message);
    }
    const corps: DecesDirectSaisie = {
      patientMode: mode,
      ...(mode === 'existant'
        ? { patientId: patient!.id }
        : {
            nom: nom.trim(),
            prenom: prenom.trim() || undefined,
            genre: genre as 'masculin' | 'feminin',
            dateNaissance: dateNaissance || undefined,
            ageEstime: !dateNaissance && ageEstime ? Number(ageEstime) : undefined,
            profession: profession.trim() || undefined,
            telephone: telephone || undefined,
            lieuResidence: residence.trim() || undefined,
          }),
      date,
      heure,
      lieuType,
      service: lieuType === 'hopital' ? service.trim() || undefined : undefined,
      lieuAutre: lieuType === 'hors' ? lieuAutre.trim() : undefined,
      milieuResidence: milieu,
      person,
      decesMaternel: maternel,
      causeInitiale: causeInitiale.trim(),
      causeDirecte: causeDirecte.trim(),
      observation: observation.trim() || undefined,
    };
    setEnvoi(true);
    try {
      const r = await api.doctor.declarations.enregistrerDeces(corps);
      await alerte.succes(r.message);
      navigate(`/medecin/declarations/deces/${r.declarationId}`);
    } catch (e2) {
      alerte.echec(messageErreur(e2));
    } finally {
      setEnvoi(false);
    }
  };

  const nomDefunt = mode === 'existant' ? (patient?.nom ?? '—') : `${nom.trim().toUpperCase()} ${prenom.trim()}`.trim() || '—';
  const lieu = lieuType === 'hopital' ? `${options?.hopital ?? 'Établissement'}${service.trim() ? ` - ${service.trim()}` : ''}` : lieuAutre.trim() || '—';

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Déclarations · Décès</p>
          <h1 className={c.titre}>Enregistrer un décès</h1>
        </div>
        <Link to="/medecin/declarations/deces" className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des décès
        </Link>
      </header>

      <form className={c.bloc} onSubmit={soumettre} noValidate>
        <ol className={s.etapes}>
          {ETAPES.map((et, i) => {
            const n = i + 1;
            const faite = n < etape;
            return (
              <li key={et.titre} className={`${s.etape} ${n === etape ? s.etapeActive : ''} ${faite ? s.etapeFaite : ''}`}>
                <button type="button" onClick={() => allerA(n)} aria-current={n === etape ? 'step' : undefined}>
                  <span className={s.etapeNumero}>
                    {n === etape && <motion.span layoutId="etape-deces" className={s.etapeFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
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

        <AnimatePresence mode="wait">
          <motion.div key={etape} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {/* ---------------- ÉTAPE 1 : PERSONNE DÉCÉDÉE ---------------- */}
            {etape === 1 && (
              <div className={s.grille}>
                <div className={`${s.champ} ${s.large}`}>
                  <span className={s.etiquette}>
                    Statut de la personne décédée <span className={s.requis}>*</span>
                  </span>
                  <Choix
                    label="Statut de la personne décédée"
                    valeur={mode}
                    onChange={(v) => {
                      setMode(v);
                      setPatient(null);
                    }}
                    options={[
                      { id: 'existant', libelle: 'Patient déjà enregistré' },
                      { id: 'nouveau', libelle: 'Personne non enregistrée' },
                    ]}
                  />
                </div>

                {mode === 'existant' ? (
                  <div className={`${s.champ} ${s.large} ${ko('patient') ? s.invalide : ''}`}>
                    {patient ? (
                      <div className={d.choisi}>
                        <span className={d.avatar}>{patient.nom.slice(0, 2).toUpperCase()}</span>
                        <span className={d.texte}>
                          <strong>{patient.nom}</strong>
                          <small>
                            {[patient.code, patient.genre === 'feminin' ? 'Féminin' : patient.genre === 'masculin' ? 'Masculin' : null, patient.age !== null ? `${patient.age} ans` : null, patient.telephone]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </span>
                        <button type="button" className={c.secondaire} onClick={() => setPatient(null)}>
                          Changer
                        </button>
                      </div>
                    ) : (
                      <>
                        <label htmlFor="recherche">
                          Rechercher le patient <span className={s.requis}>*</span>
                        </label>
                        <div className={d.recherche}>
                          <FaSearch aria-hidden="true" />
                          <input id="recherche" type="search" placeholder="Nom & prénoms, n° de dossier (DM…) ou téléphone" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus />
                        </div>
                        {cherche && <small className={d.aide}>Recherche…</small>}
                        {resultats && !cherche && resultats.length === 0 && <small className={d.aide}>Aucun patient trouvé. Choisissez « Personne non enregistrée » si le défunt n’a pas de dossier.</small>}
                        {resultats && resultats.length > 0 && (
                          <ul className={d.resultats}>
                            {resultats.map((p) => (
                              <li key={p.id}>
                                <button type="button" disabled={p.dejaDecede} onClick={() => setPatient(p)} title={p.dejaDecede ? 'Déjà déclaré décédé' : undefined}>
                                  <span className={d.avatar}>{p.nom.slice(0, 2).toUpperCase()}</span>
                                  <span className={d.texte}>
                                    <strong>{p.nom}</strong>
                                    <small>{[p.code, p.age !== null ? `${p.age} ans` : null, p.telephone].filter(Boolean).join(' · ')}</small>
                                  </span>
                                  {p.dejaDecede && <span className={`${c.badge} ${d.badgeDecede}`}>Déjà déclaré</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={`${s.champ} ${ko('nom') ? s.invalide : ''}`}>
                      <label htmlFor="nom">
                        Nom <span className={s.requis}>*</span>
                      </label>
                      <input id="nom" maxLength={100} placeholder="Ex. KOUASSI" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
                    </div>
                    <div className={s.champ}>
                      <label htmlFor="prenom">
                        Prénom(s) <span className={s.facultatif}>(facultatif)</span>
                      </label>
                      <input id="prenom" maxLength={100} placeholder="Ex. Jean" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                    </div>
                    <div className={`${s.champ} ${ko('genre') ? s.invalide : ''}`}>
                      <span className={s.etiquette}>
                        Sexe <span className={s.requis}>*</span>
                      </span>
                      <Choix
                        label="Sexe"
                        valeur={genre}
                        onChange={setGenre}
                        options={[
                          { id: 'masculin', libelle: 'Masculin' },
                          { id: 'feminin', libelle: 'Féminin' },
                        ]}
                      />
                    </div>
                    <div className={s.champ}>
                      <label htmlFor="naissance">
                        Date de naissance <span className={s.facultatif}>(si connue)</span>
                      </label>
                      <input id="naissance" type="date" max={date || aujourdhui()} value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} />
                    </div>
                    <div className={s.champ}>
                      <label htmlFor="age">
                        Ou âge estimé <span className={s.facultatif}>(années)</span>
                      </label>
                      <input id="age" inputMode="numeric" placeholder="Ex. 65" value={ageEstime} disabled={!!dateNaissance} onChange={(e) => setAgeEstime(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                    </div>
                    <div className={s.champ}>
                      <label htmlFor="profession">
                        Profession <span className={s.facultatif}>(facultatif)</span>
                      </label>
                      <input id="profession" maxLength={100} value={profession} onChange={(e) => setProfession(e.target.value)} />
                    </div>
                    <div className={`${s.champ} ${ko('telephone') ? s.invalide : ''}`}>
                      <label htmlFor="tel">
                        Contact de la famille <span className={s.facultatif}>(facultatif)</span>
                      </label>
                      <input id="tel" inputMode="numeric" placeholder="Ex. 0707070707" value={telephone} onChange={(e) => setTelephone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                    </div>
                    <div className={`${s.champ} ${s.large2}`}>
                      <label htmlFor="residence">
                        Lieu de résidence habituelle <span className={s.facultatif}>(facultatif)</span>
                      </label>
                      <input id="residence" maxLength={200} placeholder="Ex. Abidjan, Yopougon" value={residence} onChange={(e) => setResidence(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ---------------- ÉTAPE 2 : DATE & LIEU ---------------- */}
            {etape === 2 && (
              <div className={s.grille}>
                <div className={`${s.champ} ${ko('date') || ko('futur') ? s.invalide : ''}`}>
                  <label htmlFor="date">
                    Date du décès <span className={s.requis}>*</span>
                  </label>
                  <input id="date" type="date" max={aujourdhui()} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className={`${s.champ} ${ko('heure') || ko('futur') ? s.invalide : ''}`}>
                  <label htmlFor="heure">
                    Heure du décès <span className={s.requis}>*</span>
                  </label>
                  <input id="heure" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
                </div>
                <div className={s.champ}>
                  <span className={s.etiquette}>
                    Milieu de résidence <span className={s.requis}>*</span>
                  </span>
                  <Choix
                    label="Milieu de résidence"
                    valeur={milieu}
                    onChange={setMilieu}
                    options={[
                      { id: 'Urbain', libelle: 'Urbain' },
                      { id: 'Rural', libelle: 'Rural' },
                    ]}
                  />
                </div>
                <div className={s.champ}>
                  <span className={s.etiquette}>
                    Lieu du décès <span className={s.requis}>*</span>
                  </span>
                  <Choix
                    label="Lieu du décès"
                    valeur={lieuType}
                    onChange={setLieuType}
                    options={[
                      { id: 'hopital', libelle: 'Dans l’établissement' },
                      { id: 'hors', libelle: 'Hors établissement' },
                    ]}
                  />
                </div>
                {lieuType === 'hopital' ? (
                  <div className={`${s.champ} ${s.large2}`}>
                    <label htmlFor="service">
                      Service / unité <span className={s.facultatif}>(facultatif · {options?.hopital ?? 'établissement'})</span>
                    </label>
                    <input id="service" maxLength={150} placeholder="Ex. Urgences, Réanimation…" value={service} onChange={(e) => setService(e.target.value)} />
                  </div>
                ) : (
                  <div className={`${s.champ} ${s.large2} ${ko('lieuAutre') ? s.invalide : ''}`}>
                    <label htmlFor="lieuAutre">
                      Lieu exact du décès <span className={s.requis}>*</span>
                    </label>
                    <input id="lieuAutre" maxLength={200} placeholder="Ex. Domicile, Cocody Angré" value={lieuAutre} onChange={(e) => setLieuAutre(e.target.value)} />
                  </div>
                )}
                <div className={s.champ}>
                  <span className={s.etiquette}>
                    Catégorie de la personne <span className={s.requis}>*</span>
                  </span>
                  <Choix
                    label="Catégorie de la personne"
                    valeur={person}
                    onChange={setPerson}
                    options={[
                      { id: 'patient', libelle: 'Adulte ou enfant' },
                      { id: 'enfant', libelle: 'Nouveau-né' },
                    ]}
                  />
                </div>
                <div className={s.champ}>
                  <span className={s.etiquette}>Décès lié à la grossesse (maternel) ?</span>
                  <Choix
                    label="Décès maternel"
                    valeur={maternel}
                    onChange={setMaternel}
                    options={[
                      { id: 'non', libelle: 'Non' },
                      { id: 'oui', libelle: 'Oui' },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* ---------------- ÉTAPE 3 : CONSTAT MÉDICAL ---------------- */}
            {etape === 3 && (
              <div className={s.grille}>
                <div className={`${s.champ} ${ko('causeInitiale') ? s.invalide : ''}`}>
                  <label htmlFor="causeInitiale">
                    Cause initiale / sous-jacente <span className={s.requis}>*</span>
                  </label>
                  <textarea id="causeInitiale" className={d.zone} rows={3} maxLength={500} placeholder="Ex. Hypertension artérielle chronique" value={causeInitiale} onChange={(e) => setCauseInitiale(e.target.value)} />
                </div>
                <div className={`${s.champ} ${ko('causeDirecte') ? s.invalide : ''}`}>
                  <label htmlFor="causeDirecte">
                    Cause directe du décès <span className={s.requis}>*</span>
                  </label>
                  <textarea id="causeDirecte" className={d.zone} rows={3} maxLength={500} placeholder="Ex. Accident vasculaire cérébral" value={causeDirecte} onChange={(e) => setCauseDirecte(e.target.value)} />
                </div>
                <div className={s.champ}>
                  <label htmlFor="observation">
                    Observations <span className={s.facultatif}>(facultatif)</span>
                  </label>
                  <textarea id="observation" className={d.zone} rows={3} maxLength={2000} value={observation} onChange={(e) => setObservation(e.target.value)} />
                </div>

                <dl className={`${s.large} ${d.recap}`}>
                  <div>
                    <dt>Défunt</dt>
                    <dd>{nomDefunt}</dd>
                  </div>
                  <div>
                    <dt>Date et heure</dt>
                    <dd>{date ? `${date.split('-').reverse().join('/')} à ${heure || '—'}` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Lieu</dt>
                    <dd>{lieu}</dd>
                  </div>
                  <div>
                    <dt>Médecin déclarant</dt>
                    <dd>{options?.medecin ?? '—'}</dd>
                  </div>
                </dl>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <footer className={s.pied}>
          {etape === 1 ? (
            <Link to="/medecin/declarations/deces" className={c.secondaire}>
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
                <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Enregistrer le décès'}
              </>
            )}
          </motion.button>
        </footer>
      </form>
    </div>
  );
}
