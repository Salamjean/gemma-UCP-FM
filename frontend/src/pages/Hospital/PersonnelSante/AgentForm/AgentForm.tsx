import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaCamera, FaCheck, FaEye, FaEyeSlash, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import SelectRecherche from '../../../../components/SelectRecherche';
import { alerte } from '../../../../services/alertes';
import { uploadUrl } from '../../../../services/api';
import { fcfa } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { AgentFiche, OptionsPersonnel, TypeAgent } from '../../../../types';
import { AGENTS, JOURS, prefixeMatricule } from '../personnel.config';
import styles from './AgentForm.module.css';

const AVATAR_DEFAUT = '/images/dashboard/avatar-doctor.png';
const HEURE_DEFAUT = '08:00';
const PHOTO_MAX = 3 * 1024 * 1024;
/** Les 3 étapes de l'ajout */
const ETAPES = ['Identité & service', 'Actes & disponibilités', 'Compte de connexion'];

interface Props {
  type: TypeAgent;
  options: OptionsPersonnel;
  /** Fiche existante = mode modification (email et matricule non modifiables, mot de passe facultatif) */
  fiche?: AgentFiche;
  boutonTexte: string;
  envoi: boolean;
  onEnregistrer: (data: FormData) => void;
  /** Lien du bouton Annuler */
  retour: string;
}

/**
 * HÔPITAL > PERSONNEL DE SANTÉ — formulaire partagé (Ajouter / Modifier) pour les 3 types d'agents, en 3 étapes :
 *   1. Identité + spécialité (médecin) + service(s)   2. Actes pratiqués (médecin / sage-femme) & disponibilités   3. Compte de connexion
 * En modification, "Enregistrer" est disponible à chaque étape.
 * Spécialiste : la spécialité est toujours choisie dans la liste (pas de case "Gynécologue" ; le backend en déduit l'accès maternité).
 * Mêmes règles que Laravel (DoctorRequest, SageFRequest, InfirmierRequest + Update*) :
 *   nom ≥ 3 car., contact 10 chiffres, adresse facultative (≥ 3 car.), au moins un jour de disponibilité,
 *   médecin / sage-femme : service + actes pratiqués ; infirmier : un ou plusieurs services ;
 *   création : email, matricule, mot de passe (≥ 4 car.) + confirmation.
 */
export default function AgentForm({ type, options, fiche, boutonTexte, envoi, onEnregistrer, retour }: Props) {
  const conf = AGENTS[type];
  const edition = !!fiche;
  const estDocteur = type === 'medecin' || type === 'sage-femme';

  // --- Identité ---
  const [nom, setNom] = useState(fiche?.nom ?? '');
  const [matricule, setMatricule] = useState('');
  const [contact, setContact] = useState(fiche?.contact ?? '');
  const [adresse, setAdresse] = useState(fiche?.adresse ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);

  // --- Affectation ---
  const [service, setService] = useState<number | null>(fiche?.service ?? null);
  const [actes, setActes] = useState<number[]>(fiche?.actes ?? []);
  const [services, setServices] = useState<number[]>(fiche?.services ?? []);
  const [typeName, setTypeName] = useState<'generaliste' | 'specialiste'>(fiche?.typeName ?? 'generaliste');
  const [typeDoctor, setTypeDoctor] = useState<number | null>(fiche?.typeDoctor ?? null);

  // --- Disponibilités : jour → heure de début (absent = non travaillé) ---
  const [jours, setJours] = useState<Record<number, string>>(() => Object.fromEntries((fiche?.jours ?? []).map((j) => [j.jour, j.heure])));

  // --- Compte ---
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voirMdp, setVoirMdp] = useState(false);

  // --- Étapes (ajout uniquement ; la modification reste sur une seule page) ---
  const [etape, setEtape] = useState(1);
  /** Étapes déjà validées une fois : leurs erreurs sont affichées */
  const [verifiees, setVerifiees] = useState<number[]>([]);

  // Aperçu de la photo choisie
  useEffect(() => {
    if (!photo) return setApercu(null);
    const url = URL.createObjectURL(photo);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const actesDuService = useMemo(() => options.actes.filter((a) => a.serviceId === service), [options.actes, service]);

  const choisirService = (id: number | null) => {
    setService(id);
    // Les actes du service choisi sont cochés d'office (il suffit de décocher ceux qui ne sont pas pratiqués)
    setActes(id ? options.actes.filter((a) => a.serviceId === id).map((a) => a.id) : []);
  };

  const basculer = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);

  const choisirPhoto = (f: File | undefined) => {
    if (!f) return;
    if (!['image/jpeg', 'image/png'].includes(f.type)) return void alerte.echec('Photo : formats acceptés jpg, jpeg, png.');
    if (f.size > PHOTO_MAX) return void alerte.echec('Photo trop lourde (3 Mo maximum).');
    setPhoto(f);
  };

  const basculerJour = (j: number) =>
    setJours((x) => {
      const n = { ...x };
      if (j in n) delete n[j];
      else n[j] = HEURE_DEFAUT;
      return n;
    });
  const joursRapides = (liste: number[]) => setJours(Object.fromEntries(liste.map((j) => [j, jours[j] ?? HEURE_DEFAUT])));

  // --- Erreurs (affichées après un essai d'enregistrement) ---
  const erreurs = {
    nom: nom.trim().length < 3,
    matricule: !edition && !/^[A-Za-z0-9-]{1,30}$/.test(matricule.trim()),
    contact: !/^[0-9]{10}$/.test(contact),
    adresse: adresse.trim() !== '' && adresse.trim().length < 3,
    service: estDocteur && !service,
    actes: estDocteur && actes.length === 0,
    typeDoctor: type === 'medecin' && typeName === 'specialiste' && !typeDoctor,
    services: type === 'infirmier' && services.length === 0,
    jours: Object.keys(jours).length === 0,
    email: !edition && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    motDePasse: edition ? motDePasse !== '' && motDePasse.length < 4 : motDePasse.length < 4,
    confirmation: motDePasse !== confirmation,
  };
  const messages: Record<keyof typeof erreurs, string> = {
    nom: 'Le nom doit contenir au moins 3 caractères.',
    matricule: 'Le matricule est obligatoire (lettres et chiffres).',
    contact: 'Le contact doit contenir exactement 10 chiffres.',
    adresse: "L'adresse doit contenir au moins 3 caractères.",
    service: "Choisissez le service d'affectation.",
    actes: 'Cochez au moins un acte médical pratiqué.',
    typeDoctor: 'Choisissez la spécialité du médecin.',
    services: 'Choisissez au moins un service.',
    jours: 'Sélectionnez au moins un jour de disponibilité.',
    email: 'Adresse email invalide.',
    motDePasse: 'Le mot de passe doit contenir au moins 4 caractères.',
    confirmation: 'Les mots de passe ne correspondent pas.',
  };
  /** Étape où se trouve chaque champ */
  const ETAPE_DU_CHAMP: Record<keyof typeof erreurs, number> = {
    nom: 1, matricule: 1, contact: 1, adresse: 1, typeDoctor: 1, service: 1, services: 1,
    actes: 2, jours: 2,
    email: 3, motDePasse: 3, confirmation: 3,
  };
  const invalide = (k: keyof typeof erreurs) => verifiees.includes(ETAPE_DU_CHAMP[k]) && erreurs[k];
  /** Première erreur des étapes données */
  const premiereErreur = (etapes: number[]) =>
    (Object.keys(erreurs) as (keyof typeof erreurs)[]).find((k) => erreurs[k] && etapes.includes(ETAPE_DU_CHAMP[k]));
  const visible = (n: number) => etape === n;

  const allerA = (n: number) => {
    // On peut toujours revenir en arrière ; pour avancer, les étapes précédentes doivent être complètes
    if (n > etape) {
      const avant = Array.from({ length: n - 1 }, (_, i) => i + 1);
      setVerifiees((v) => [...new Set([...v, ...avant])]);
      const erreur = premiereErreur(avant);
      if (erreur) {
        setEtape(ETAPE_DU_CHAMP[erreur]);
        return void alerte.echec(messages[erreur]);
      }
    }
    setEtape(n);
  };

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    // Ajout : "Entrée" passe à l'étape suivante. Modification : on peut enregistrer depuis n'importe quelle étape.
    if (!edition && etape < 3) return allerA(etape + 1);
    setVerifiees([1, 2, 3]);
    const premiere = premiereErreur([1, 2, 3]);
    if (premiere) {
      setEtape(ETAPE_DU_CHAMP[premiere]);
      return void alerte.echec(messages[premiere]);
    }

    const f = new FormData();
    f.set('name', nom.trim());
    f.set('contact', contact);
    if (adresse.trim()) f.set('address', adresse.trim());
    if (!edition) {
      f.set('email', email.trim());
      f.set('matricule', matricule.trim().toUpperCase());
    }
    if (motDePasse) {
      f.set('password', motDePasse);
      f.set('passwordConfirmation', confirmation);
    }
    if (estDocteur) {
      f.set('service', String(service));
      f.set('actes', JSON.stringify(actes));
    }
    if (type === 'medecin') {
      f.set('typeName', typeName);
      if (typeName === 'specialiste' && typeDoctor) f.set('typeDoctor', String(typeDoctor));
    }
    if (type === 'infirmier') f.set('services', JSON.stringify(services));
    f.set('jours', JSON.stringify(Object.entries(jours).map(([jour, heure]) => ({ jour: Number(jour), heure }))));
    if (photo) f.set('image', photo);
    onEnregistrer(f);
  };

  // --- Récapitulatif ---
  const photoAffichee = apercu ?? (fiche?.photo ? uploadUrl(conf.dossier, fiche.photo) : AVATAR_DEFAUT);
  const libelleService =
    type === 'infirmier'
      ? options.services.filter((s) => services.includes(s.id)).map((s) => s.libelle).join(', ')
      : options.services.find((s) => s.id === service)?.libelle;
  const libelleSpecialite =
    type === 'medecin'
      ? typeName === 'generaliste'
        ? 'Généraliste'
        : options.specialites.find((s) => s.id === typeDoctor)?.libelle ?? 'Spécialiste'
      : conf.libelle;
  const matriculeAffiche = fiche?.matricule ?? (matricule.trim() ? `${prefixeMatricule(type, typeName)}${matricule.trim().toUpperCase()}` : null);

  return (
    <div className={styles.grille}>
      <form className={`${c.bloc} ${styles.formulaire}`} onSubmit={soumettre} noValidate>
        {/* ---------- Barre des 3 étapes (ajout ET modification) ---------- */}
          <ol className={styles.etapes}>
            {ETAPES.map((titre, i) => {
              const n = i + 1;
              const faite = n < etape;
              return (
                <li key={titre} className={`${styles.etape} ${n === etape ? styles.etapeActive : ''} ${faite ? styles.etapeFaite : ''}`}>
                  <button type="button" onClick={() => allerA(n)} aria-current={n === etape ? 'step' : undefined}>
                    <span className={styles.etapeNumero}>
                      {n === etape && <motion.span layoutId="etape-agent" className={styles.etapeFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                      <span className={styles.etapeChiffre}>{faite ? <FaCheck aria-hidden="true" /> : n}</span>
                    </span>
                    <span className={styles.etapeTexte}>
                      <small>Étape {n}</small>
                      {n === 2 && !estDocteur ? 'Disponibilités' : n === 1 && type === 'regulateur' ? 'Identité' : titre}
                    </span>
                  </button>
                  {n < ETAPES.length && (
                    <span className={styles.etapeTrait}>
                      <motion.span initial={false} animate={{ width: faite ? '100%' : '0%' }} transition={{ duration: 0.35 }} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

        <AnimatePresence mode="wait" initial={false}>
        <motion.div key={etape} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
        {/* ---------- 1. Identité ---------- */}
        {visible(1) && (<>
        <h2 className={c.blocTitre}>Identité</h2>
        <div className={styles.identite}>
          <label className={styles.photo} title="Choisir une photo (jpg, png — 3 Mo max.)">
            <img src={photoAffichee} alt="" onError={(e) => (e.currentTarget.src = AVATAR_DEFAUT)} />
            <span className={styles.photoBouton}>
              <FaCamera aria-hidden="true" />
            </span>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => choisirPhoto(e.target.files?.[0])} aria-label="Photo de l'agent" />
          </label>
          {photo && (
            <button type="button" className={styles.photoRetirer} onClick={() => setPhoto(null)}>
              <FaTimes aria-hidden="true" /> Retirer la nouvelle photo
            </button>
          )}

          <div className={styles.champs}>
            <div className={`${styles.champ} ${styles.large} ${invalide('nom') ? styles.invalide : ''}`}>
              <label htmlFor="nom">Nom et prénoms <span className={styles.requis}>*</span></label>
              <input id="nom" maxLength={191} placeholder="Ex. Dr Kouassi Aya Marie" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus={!edition} />
            </div>
            <div className={`${styles.champ} ${invalide('matricule') ? styles.invalide : ''}`}>
              <label htmlFor="matricule">Matricule {!edition && <span className={styles.requis}>*</span>}</label>
              {edition ? (
                <input id="matricule" value={fiche?.matricule ?? '—'} disabled />
              ) : (
                <div className={styles.prefixe}>
                  <span>{prefixeMatricule(type, typeName)}</span>
                  <input id="matricule" maxLength={30} placeholder="204783" value={matricule} onChange={(e) => setMatricule(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))} />
                </div>
              )}
            </div>
            <div className={`${styles.champ} ${invalide('contact') ? styles.invalide : ''}`}>
              <label htmlFor="contact">Contact <span className={styles.requis}>*</span></label>
              <input id="contact" inputMode="numeric" maxLength={10} placeholder="0700000000" value={contact} onChange={(e) => setContact(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </div>
            <div className={`${styles.champ} ${styles.large} ${invalide('adresse') ? styles.invalide : ''}`}>
              <label htmlFor="adresse">Adresse <span className={styles.facultatif}>(facultatif)</span></label>
              <input id="adresse" maxLength={191} placeholder="Ex. Cocody, Riviera 2" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Affectation : type de médecin, spécialité et service alignés sur une même ligne */}
        {estDocteur && (
          <>
            <h2 className={`${c.blocTitre} ${styles.espace}`}>{type === 'medecin' ? 'Spécialité & service' : 'Service'}</h2>
            <div className={`${styles.ligneAffectation} ${type === 'medecin' ? styles.ligneMedecin : ''}`}>
              {type === 'medecin' && (
                <>
                  <div className={styles.champ}>
                    <span className={styles.etiquette}>Type <span className={styles.requis}>*</span></span>
                    <div className={styles.pastilles} role="radiogroup" aria-label="Type de médecin">
                      {(['generaliste', 'specialiste'] as const).map((t) => (
                        <button key={t} type="button" role="radio" aria-checked={typeName === t} className={`${styles.pastille} ${typeName === t ? styles.pastilleActive : ''}`} onClick={() => setTypeName(t)}>
                          {typeName === t && <motion.span layoutId="type-medecin" className={styles.pastilleFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                          <span className={styles.pastilleTexte}>{t === 'generaliste' ? 'Généraliste' : 'Spécialiste'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.champ}>
                    <label htmlFor="specialite">
                      Spécialité {typeName === 'specialiste' && <span className={styles.requis}>*</span>}
                    </label>
                    {typeName === 'specialiste' ? (
                      <SelectRecherche
                        id="specialite"
                        options={options.specialites.map((s) => ({ id: s.id, name: s.libelle }))}
                        value={typeDoctor}
                        onChange={setTypeDoctor}
                        placeholder="-- Choisir la spécialité --"
                        placeholderRecherche="Rechercher une spécialité…"
                        aucunResultat="Aucune spécialité (ajoutez-en dans l'onglet Spécialités)"
                        invalide={!!invalide('typeDoctor')}
                      />
                    ) : (
                      <div className={styles.champFixe}>Généraliste : pas de spécialité</div>
                    )}
                  </div>
                </>
              )}
              <div className={styles.champ}>
                <label htmlFor="service">Service <span className={styles.requis}>*</span></label>
                <SelectRecherche
                  id="service"
                  options={options.services.map((s) => ({ id: s.id, name: s.libelle }))}
                  value={service}
                  onChange={choisirService}
                  placeholder="-- Choisir le service --"
                  placeholderRecherche="Rechercher un service…"
                  aucunResultat="Aucun service activé (voir l'onglet Services)"
                  invalide={!!invalide('service')}
                />
              </div>
            </div>
          </>
        )}

        {type === 'infirmier' && (
          <>
            <h2 className={`${c.blocTitre} ${styles.espace}`}>Services</h2>
            <div className={styles.groupe}>
              <p className={`${styles.groupeTitre} ${invalide('services') ? styles.texteErreur : ''}`}>
                Services d'affectation <span className={styles.requis}>*</span>
                <small>un ou plusieurs</small>
              </p>
              <div className={styles.puces}>
                {options.services.map((s) => (
                  <button key={s.id} type="button" className={`${styles.puce} ${services.includes(s.id) ? styles.puceActive : ''}`} onClick={() => setServices((x) => basculer(x, s.id))} aria-pressed={services.includes(s.id)}>
                    {services.includes(s.id) && <FaCheck aria-hidden="true" />} {s.libelle}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        </>)}

        {/* ---------- 2. Actes du service (médecin / sage-femme) ---------- */}
        {visible(2) && estDocteur && (
          <>
            <h2 className={c.blocTitre}>Actes médicaux pratiqués</h2>
            {service ? (
              <div className={styles.groupeActes}>
                <p className={`${styles.groupeTitre} ${invalide('actes') ? styles.texteErreur : ''}`}>
                  {libelleService} <span className={styles.requis}>*</span>
                  <small>{actes.length} / {actesDuService.length} coché{actes.length > 1 ? 's' : ''}</small>
                </p>
                <div className={styles.puces}>
                  {actesDuService.map((a) => (
                    <button key={a.id} type="button" className={`${styles.puce} ${actes.includes(a.id) ? styles.puceActive : ''}`} onClick={() => setActes((x) => basculer(x, a.id))} aria-pressed={actes.includes(a.id)}>
                      {actes.includes(a.id) && <FaCheck aria-hidden="true" />} {a.libelle}
                      <small>{fcfa(a.prix)}</small>
                    </button>
                  ))}
                  {actesDuService.length === 0 && <p className={c.sousTexte}>Ce service n'a aucun acte : ajoutez-en dans l'onglet Services.</p>}
                </div>
              </div>
            ) : (
              <p className={c.sousTexte}>Choisissez d'abord le service à l'étape 1.</p>
            )}
          </>
        )}

        {/* ---------- 3. Disponibilités ---------- */}
        {visible(2) && (<>
        <h2 className={`${c.blocTitre} ${estDocteur ? styles.espace : ''}`}>Jours de disponibilité</h2>
        <div className={styles.joursRapides}>
          <button type="button" onClick={() => joursRapides([0, 1, 2, 3, 4])}>Lundi → vendredi</button>
          <button type="button" onClick={() => joursRapides([0, 1, 2, 3, 4, 5])}>Lundi → samedi</button>
          <button type="button" onClick={() => joursRapides([0, 1, 2, 3, 4, 5, 6])}>Tous les jours</button>
          <button type="button" onClick={() => setJours({})}>Aucun</button>
        </div>
        <div className={`${styles.jours} ${invalide('jours') ? styles.joursInvalides : ''}`}>
          {JOURS.map((j, i) => {
            const actif = i in jours;
            return (
              <div key={j} className={`${styles.jour} ${actif ? styles.jourActif : ''}`}>
                <button type="button" className={styles.jourNom} onClick={() => basculerJour(i)} aria-pressed={actif}>
                  <span className={styles.jourCoche}>{actif && <FaCheck aria-hidden="true" />}</span>
                  {j}
                </button>
                <input type="time" value={jours[i] ?? ''} disabled={!actif} onChange={(e) => setJours((x) => ({ ...x, [i]: e.target.value || HEURE_DEFAUT }))} aria-label={`Heure de début le ${j.toLowerCase()}`} />
              </div>
            );
          })}
        </div>

        </>)}

        {/* ---------- 4. Compte ---------- */}
        {visible(3) && (<>
        <h2 className={c.blocTitre}>Compte de connexion</h2>
        <div className={styles.champs}>
          <div className={`${styles.champ} ${styles.large} ${invalide('email') ? styles.invalide : ''}`}>
            <label htmlFor="email">Adresse email {!edition && <span className={styles.requis}>*</span>}</label>
            {edition ? (
              <input id="email" value={fiche?.email ?? ''} disabled />
            ) : (
              <input id="email" type="email" maxLength={191} placeholder="agent@hopital.ci" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            )}
          </div>
          <div className={`${styles.champ} ${invalide('motDePasse') ? styles.invalide : ''}`}>
            <label htmlFor="mdp">
              {edition ? 'Nouveau mot de passe' : 'Mot de passe'} {edition ? <span className={styles.facultatif}>(vide = inchangé)</span> : <span className={styles.requis}>*</span>}
            </label>
            <div className={styles.mdp}>
              <input id="mdp" type={voirMdp ? 'text' : 'password'} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="new-password" />
              <button type="button" onClick={() => setVoirMdp((v) => !v)} aria-label={voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                {voirMdp ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <div className={`${styles.champ} ${invalide('confirmation') ? styles.invalide : ''}`}>
            <label htmlFor="confirmation">Confirmation {!edition && <span className={styles.requis}>*</span>}</label>
            <input id="confirmation" type={voirMdp ? 'text' : 'password'} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
          </div>
        </div>

        {!edition && (
          <p className={styles.rappel}>
            <FaInfoCircle aria-hidden="true" /> L'agent se connectera avec cet email et ce mot de passe. Vérifiez l'aperçu à droite avant d'enregistrer.
          </p>
        )}
        </>)}
        </motion.div>
        </AnimatePresence>

        <footer className={styles.pied}>
          {etape === 1 ? (
            <Link to={retour} className={c.secondaire}>Annuler</Link>
          ) : (
            <button type="button" className={c.secondaire} onClick={() => allerA(etape - 1)}>
              <FaArrowLeft aria-hidden="true" /> Précédent
            </button>
          )}
          <span className={styles.piedEtape}>Étape {etape} / 3</span>
          <div className={styles.piedBoutons}>
            {/* En modification, on peut enregistrer à chaque étape */}
            {(edition || etape === 3) && (
              <motion.button type="submit" className={edition && etape < 3 ? c.secondaire : c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
                <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : boutonTexte}
              </motion.button>
            )}
            {etape < 3 && (
              <motion.button type={edition ? 'button' : 'submit'} className={c.principal} whileTap={{ scale: 0.97 }} onClick={edition ? () => allerA(etape + 1) : undefined}>
                Suivant <FaArrowRight aria-hidden="true" />
              </motion.button>
            )}
          </div>
        </footer>
      </form>

      {/* ---------- Aperçu (carte de l'agent) ---------- */}
      <aside className={`${c.bloc} ${styles.carte}`} aria-label="Aperçu de l'agent">
        <p className={styles.carteTitre}>Aperçu</p>
        <img src={photoAffichee} alt="" className={styles.cartePhoto} onError={(e) => (e.currentTarget.src = AVATAR_DEFAUT)} />
        <p className={`${styles.carteNom} ${nom.trim() ? '' : styles.carteVide}`}>{nom.trim() || "Nom de l'agent"}</p>
        <span className={c.badge} style={{ background: conf.fond, color: conf.texte }}>
          <conf.icone aria-hidden="true" /> {libelleSpecialite}
        </span>
        <dl className={styles.carteInfos}>
          <div>
            <dt>Matricule</dt>
            <dd className={styles.mono}>{matriculeAffiche ?? '—'}</dd>
          </div>
          {type !== 'regulateur' && (
            <div>
              <dt>{type === 'infirmier' ? 'Services' : 'Service'}</dt>
              <dd>{libelleService || '—'}</dd>
            </div>
          )}
          {estDocteur && (
            <div>
              <dt>Actes</dt>
              <dd>{actes.length}</dd>
            </div>
          )}
          <div>
            <dt>Contact</dt>
            <dd>{contact || '—'}</dd>
          </div>
        </dl>
        <div className={styles.carteJours}>
          {JOURS.map((j, i) => (
            <span key={j} className={i in jours ? styles.carteJourActif : ''} title={i in jours ? `${j} à partir de ${jours[i]}` : j}>
              {j.charAt(0)}
            </span>
          ))}
        </div>
      </aside>
    </div>
  );
}
