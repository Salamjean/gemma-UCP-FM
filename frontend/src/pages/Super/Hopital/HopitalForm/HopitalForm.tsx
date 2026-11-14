import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import type { IconType } from 'react-icons';
import {
  FaArrowLeft,
  FaArrowRight,
  FaBarcode,
  FaBuilding,
  FaCheck,
  FaCloudUploadAlt,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaHeadset,
  FaHospital,
  FaLock,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaPen,
  FaSitemap,
  FaTrashAlt,
} from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api, uploadUrl } from '../../../../services/api';
import type { Localite } from '../../../../types';
import styles from './HopitalForm.module.css';
import SelectRecherche from '../../../../components/SelectRecherche';

/** Comparaison sans majuscules ni accents ("MARAHOUE" = "Marahoué") */
const sansAccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export interface HopitalValeurs {
  label: string;
  reference: string;
  contact: string;
  localite: number | null;
  district: string;
  directionGenerale: string;
  teleconsultation: boolean;
  email: string;
  password: string;
  passwordConfirmation: string;
}

export const HOPITAL_VIDE: HopitalValeurs = {
  label: '',
  reference: '',
  contact: '',
  localite: null,
  district: '',
  directionGenerale: '',
  teleconsultation: false,
  email: '',
  password: '',
  passwordConfirmation: '',
};

type Champ = keyof HopitalValeurs | 'image';
type Erreurs = Partial<Record<Champ, string>>;

interface HopitalFormProps {
  /** "ajout" : tout est obligatoire. "modification" : code non modifiable, mot de passe facultatif */
  mode: 'ajout' | 'modification';
  titre: string;
  initial?: HopitalValeurs;
  /** Photo actuelle (mode modification) */
  imgUrl?: string | null;
  /** Envoie le formulaire ; renvoie le message de succès */
  onEnvoyer: (data: FormData) => Promise<string>;
}

/** Les étapes de l'assistant et les champs qu'elles contiennent */
const ETAPES: { titre: string; sousTitre: string; icone: IconType; champs: Champ[] }[] = [
  { titre: 'Établissement', sousTitre: 'Identité et contact', icone: FaHospital, champs: ['label', 'reference', 'contact', 'directionGenerale'] },
  { titre: 'Localisation', sousTitre: 'Lieu, photo, services', icone: FaMapMarkerAlt, champs: ['localite', 'district', 'image', 'teleconsultation'] },
  { titre: "Compte d'accès", sousTitre: 'Connexion de l’hôpital', icone: FaLock, champs: ['email', 'password', 'passwordConfirmation'] },
  { titre: 'Récapitulatif', sousTitre: 'Vérifier et valider', icone: FaCheck, champs: [] },
];

/** Mêmes règles que Laravel (HospitalRequest / UpdateHospitalRequest) — vérifiées aussi par le backend */
function valider(v: HopitalValeurs, image: File | null, mode: HopitalFormProps['mode']): Erreurs {
  const e: Erreurs = {};
  if (!v.label.trim()) e.label = "Le nom de l'hôpital est obligatoire";
  if (mode === 'ajout' && !v.reference.trim()) e.reference = 'Le code est obligatoire';
  if (!/^[0-9]{10}$/.test(v.contact.trim())) e.contact = 'Le contact doit contenir exactement 10 chiffres';
  if (!v.localite) e.localite = 'Veuillez choisir une localité';
  if (!v.district.trim()) e.district = 'Le district sanitaire est obligatoire';
  if (image) {
    if (!/\.(jpe?g|png)$/i.test(image.name)) e.image = 'Image : formats acceptés jpg, jpeg, png';
    else if (image.size > 3 * 1024 * 1024) e.image = 'Image trop lourde (3 Mo maximum)';
  }
  if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = 'Adresse email invalide';
  const mdpRequis = mode === 'ajout' || v.password !== '' || v.passwordConfirmation !== '';
  if (mdpRequis && v.password.length < 4) e.password = 'Le mot de passe doit contenir au moins 4 caractères';
  if (mdpRequis && v.passwordConfirmation !== v.password) e.passwordConfirmation = 'Les mots de passe ne correspondent pas';
  return e;
}

/**
 * SUPER > HÔPITAL — formulaire partagé par "Ajouter" et "Modifier".
 * Assistant en 4 étapes (barre de progression cliquable) + aperçu en direct de la fiche.
 */
export default function HopitalForm({ mode, titre, initial = HOPITAL_VIDE, imgUrl, onEnvoyer }: HopitalFormProps) {
  const navigate = useNavigate();
  const modification = mode === 'modification';
  const [valeurs, setValeurs] = useState<HopitalValeurs>(initial);
  const [image, setImage] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [localites, setLocalites] = useState<Localite[]>([]);
  const [regions, setRegions] = useState<Localite[]>([]);
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [etape, setEtape] = useState(0);
  const [direction, setDirection] = useState(1);
  const [envoi, setEnvoi] = useState(false);
  const [voirMdp, setVoirMdp] = useState(false);
  const [survol, setSurvol] = useState(false);

  useEffect(() => {
    api.super.hopitaux
      .localites()
      .then(setLocalites)
      .catch((e) => alerte.echec(`Impossible de charger les localités : ${messageErreur(e)}`));
    api.super.hopitaux
      .regions()
      .then((liste) => {
        setRegions(liste);
        // Ancienne saisie libre (ex. "MARAHOUE") → nom exact de la région ("Marahoué")
        setValeurs((v) => {
          const trouvee = liste.find((r) => sansAccent(r.name) === sansAccent(v.directionGenerale));
          return trouvee ? { ...v, directionGenerale: trouvee.name } : v;
        });
      })
      .catch((e) => alerte.echec(`Impossible de charger les régions : ${messageErreur(e)}`));
  }, []);

  // Aperçu de l'image choisie
  useEffect(() => {
    if (!image) return setApercu(null);
    const url = URL.createObjectURL(image);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const maj = <K extends keyof HopitalValeurs>(champ: K, valeur: HopitalValeurs[K]) => {
    setValeurs((v) => ({ ...v, [champ]: valeur }));
    setErreurs((e) => ({ ...e, [champ]: undefined }));
  };
  const texte = (champ: keyof HopitalValeurs) => (e: ChangeEvent<HTMLInputElement>) => maj(champ, e.target.value as never);

  const choisirImage = (fichier: File | null | undefined) => {
    setImage(fichier ?? null);
    setErreurs((e) => ({ ...e, image: undefined }));
  };

  /** Erreurs d'une étape donnée (ou de tout le formulaire) */
  const erreursDe = (indices: number[]) => {
    const toutes = valider(valeurs, image, mode);
    const champs = new Set(indices.flatMap((i) => ETAPES[i].champs));
    return Object.fromEntries(Object.entries(toutes).filter(([k]) => champs.has(k as Champ))) as Erreurs;
  };

  /** Vérifie les étapes ; en cas d'erreur : pop-up (première erreur) + contour rouge */
  const verifier = (indices: number[]) => {
    const errs = erreursDe(indices);
    setErreurs((e) => ({ ...e, ...errs }));
    const premiere = Object.values(errs).find(Boolean);
    if (premiere) alerte.echec(premiere);
    return !premiere;
  };

  const allerA = (cible: number) => {
    if (cible === etape) return;
    // En création, on ne peut avancer que si les étapes précédentes sont valides
    if (cible > etape && !modification && !verifier(Array.from({ length: cible }, (_, i) => i))) return;
    setDirection(cible > etape ? 1 : -1);
    setEtape(cible);
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (etape < ETAPES.length - 1) return allerA(etape + 1); // "Entrée" = étape suivante
    if (!verifier([0, 1, 2])) {
      // Revenir à la première étape qui contient une erreur
      const errs = erreursDe([0, 1, 2]);
      const fautive = ETAPES.findIndex((s) => s.champs.some((c) => errs[c]));
      if (fautive >= 0) setEtape(fautive);
      return;
    }

    const data = new FormData();
    Object.entries(valeurs).forEach(([k, v]) => {
      if (modification && k === 'reference') return; // non modifiable
      if (v !== null && v !== '') data.append(k, String(v));
    });
    if (image) data.append('image', image);

    setEnvoi(true);
    try {
      const message = await onEnvoyer(data);
      navigate('/super/hopital/liste');
      alerte.succes(message);
    } catch (err) {
      alerte.echec(messageErreur(err));
      setEnvoi(false);
    }
  };

  const photo = apercu ?? (imgUrl ? uploadUrl('hospital', imgUrl) : null);
  const localiteNom = localites.find((l) => l.id === valeurs.localite)?.name;

  // Complétion : champs obligatoires remplis
  const completion = useMemo(() => {
    const requis = [
      valeurs.label.trim(),
      modification || valeurs.reference.trim(),
      /^[0-9]{10}$/.test(valeurs.contact),
      valeurs.localite,
      valeurs.district.trim(),
      /^\S+@\S+\.\S+$/.test(valeurs.email),
      modification || (valeurs.password.length >= 4 && valeurs.password === valeurs.passwordConfirmation),
    ];
    return Math.round((requis.filter(Boolean).length / requis.length) * 100);
  }, [valeurs, modification]);

  const etapeValide = (i: number) => ETAPES[i].champs.length > 0 && Object.keys(erreursDe([i])).length === 0;

  return (
    <div className={styles.page}>
      {/* --- En-tête --- */}
      <header className={styles.entete}>
        <div>
          <p className={styles.surtitre}>{modification ? 'Modification' : 'Nouvel établissement'}</p>
          <h1 className={styles.titre}>{titre}</h1>
        </div>
        <Link to="/super/hopital/liste" className={styles.retour}>
          <FaArrowLeft aria-hidden="true" /> Retour à la liste
        </Link>
      </header>

      <div className={styles.grille}>
        <form className={styles.carte} onSubmit={envoyer} noValidate>
          {/* --- Barre d'étapes --- */}
          <ol className={styles.etapes}>
            {ETAPES.map((s, i) => {
              const etat = i === etape ? styles.etapeActive : i < etape || (modification && etapeValide(i)) ? styles.etapeFaite : '';
              return (
                <li key={s.titre} className={`${styles.etape} ${etat}`}>
                  <button type="button" onClick={() => allerA(i)} aria-current={i === etape ? 'step' : undefined}>
                    <span className={styles.pastille}>
                      {i < etape ? <FaCheck aria-hidden="true" /> : <s.icone aria-hidden="true" />}
                    </span>
                    <span className={styles.etapeTexte}>
                      <strong>{s.titre}</strong>
                      <small>{s.sousTitre}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className={styles.progression} aria-hidden="true">
            <motion.span animate={{ width: `${(etape / (ETAPES.length - 1)) * 100}%` }} transition={{ duration: 0.4 }} />
          </div>

          {/* --- Contenu de l'étape --- */}
          <div className={styles.corps}>
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={etape}
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={{ duration: 0.25 }}
              >
                {etape === 0 && (
                  <section>
                    <EnTeteEtape titre="Identité de l'établissement" texte="Le nom et le code permettent de retrouver l'hôpital partout dans GEMMA." />
                    <div className={styles.champs}>
                      <Champ id="label" label="Nom de l'hôpital" requis erreur={erreurs.label} icone={FaHospital} large>
                        <input id="label" className={styles.input} placeholder="Ex. Hôpital Général d'Abobo" value={valeurs.label} onChange={texte('label')} autoFocus />
                      </Champ>
                      <Champ id="reference" label="Code de l'établissement" requis={!modification} erreur={erreurs.reference} icone={FaBarcode} aide={modification ? 'Le code ne peut pas être modifié' : undefined}>
                        <input id="reference" className={styles.input} placeholder="Ex. HO-4589" value={valeurs.reference} onChange={texte('reference')} disabled={modification} />
                      </Champ>
                      <Champ id="contact" label="Contact" requis erreur={erreurs.contact} icone={FaPhoneAlt} aide="10 chiffres">
                        <input id="contact" className={styles.input} inputMode="numeric" maxLength={10} placeholder="0101010101" value={valeurs.contact} onChange={(e) => maj('contact', e.target.value.replace(/\D/g, ''))} />
                      </Champ>
                      <Champ id="directionGenerale" label="Direction régionale" erreur={erreurs.directionGenerale} icone={FaSitemap} aide="Facultatif" large>
                        <SelectRecherche
                          avecIcone
                          id="directionGenerale"
                          options={regions.map((r) => ({ id: r.name, name: r.name }))}
                          value={regions.some((r) => r.name === valeurs.directionGenerale) ? valeurs.directionGenerale : null}
                          valeurLibre={valeurs.directionGenerale || undefined}
                          onChange={(nom) => maj('directionGenerale', nom ?? '')}
                          placeholder="Choisir une région"
                          placeholderRecherche="Rechercher une région…"
                          aucunResultat="Aucune région trouvée"
                          optionVide="Aucune région"
                        />
                      </Champ>
                    </div>
                  </section>
                )}

                {etape === 1 && (
                  <section>
                    <EnTeteEtape titre="Localisation et services" texte="Où se trouve l'établissement, sa photo et les services en ligne proposés." />
                    <div className={styles.champs}>
                      <Champ id="localite" label="Localité" requis erreur={erreurs.localite} icone={FaMapMarkerAlt}>
                        <SelectRecherche
                          avecIcone
                          id="localite"
                          options={localites}
                          value={valeurs.localite}
                          onChange={(id) => maj('localite', id)}
                          placeholder="Choisir une localité"
                          placeholderRecherche="Rechercher une localité…"
                          aucunResultat="Aucune localité trouvée"
                          invalide={!!erreurs.localite}
                        />
                      </Champ>
                      <Champ id="district" label="District sanitaire" requis erreur={erreurs.district} icone={FaBuilding}>
                        <input id="district" className={styles.input} placeholder="Ex. District d'Abobo-Est" value={valeurs.district} onChange={texte('district')} />
                      </Champ>
                    </div>

                    {/* Photo : glisser-déposer ou clic */}
                    <p className={styles.sousTitreBloc}>Photo de l'établissement <span>(facultatif)</span></p>
                    <label
                      htmlFor="image"
                      className={`${styles.depot} ${survol ? styles.depotSurvol : ''} ${erreurs.image ? styles.depotInvalide : ''}`}
                      onDragOver={(e: DragEvent) => { e.preventDefault(); setSurvol(true); }}
                      onDragLeave={() => setSurvol(false)}
                      onDrop={(e: DragEvent) => { e.preventDefault(); setSurvol(false); choisirImage(e.dataTransfer.files?.[0]); }}
                    >
                      {photo ? (
                        <img src={photo} alt="Photo de l'hôpital" className={styles.depotImage} />
                      ) : (
                        <FaCloudUploadAlt className={styles.depotIcone} aria-hidden="true" />
                      )}
                      <span className={styles.depotTexte}>
                        <strong>{image ? image.name : photo ? 'Changer la photo' : 'Glissez une image ici'}</strong>
                        <small>ou cliquez pour parcourir — jpg, jpeg, png · 3 Mo max.</small>
                      </span>
                      {image && (
                        <button type="button" className={styles.depotRetirer} onClick={(e) => { e.preventDefault(); choisirImage(null); }} aria-label="Retirer l'image">
                          <FaTrashAlt />
                        </button>
                      )}
                    </label>
                    <input id="image" type="file" accept=".jpg,.jpeg,.png" className={styles.fichier} onChange={(e) => choisirImage(e.target.files?.[0])} />

                    {/* Téléconsultation */}
                    <label className={`${styles.option} ${valeurs.teleconsultation ? styles.optionActive : ''}`}>
                      <span className={styles.optionIcone}><FaHeadset aria-hidden="true" /></span>
                      <span className={styles.optionTexte}>
                        <strong>Téléconsultation</strong>
                        <small>Permet aux patients de consulter à distance les praticiens de l'hôpital.</small>
                      </span>
                      <input type="checkbox" checked={valeurs.teleconsultation} onChange={(e) => maj('teleconsultation', e.target.checked)} />
                      <span className={styles.piste} aria-hidden="true" />
                    </label>
                  </section>
                )}

                {etape === 2 && (
                  <section>
                    <EnTeteEtape
                      titre="Compte d'accès de l'hôpital"
                      texte={modification ? 'Laissez le mot de passe vide pour conserver l’actuel.' : "Ces identifiants permettront à l'hôpital de se connecter à son espace."}
                    />
                    <div className={styles.champs}>
                      <Champ id="email" label="Adresse email" requis erreur={erreurs.email} icone={FaEnvelope} large>
                        <input id="email" type="email" autoComplete="off" className={styles.input} placeholder="contact@hopital.ci" value={valeurs.email} onChange={texte('email')} />
                      </Champ>
                      <Champ id="password" label={modification ? 'Nouveau mot de passe' : 'Mot de passe'} requis={!modification} erreur={erreurs.password} icone={FaLock} aide="4 caractères minimum">
                        <input id="password" type={voirMdp ? 'text' : 'password'} autoComplete="new-password" className={`${styles.input} ${styles.inputOeil}`} placeholder={modification ? 'Inchangé si vide' : '••••••••'} value={valeurs.password} onChange={texte('password')} />
                        <button type="button" className={styles.oeil} onClick={() => setVoirMdp((v) => !v)} aria-label={voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                          {voirMdp ? <FaEyeSlash /> : <FaEye />}
                        </button>
                      </Champ>
                      <Champ id="passwordConfirmation" label="Confirmation" requis={!modification} erreur={erreurs.passwordConfirmation} icone={FaLock}>
                        <input id="passwordConfirmation" type={voirMdp ? 'text' : 'password'} autoComplete="new-password" className={styles.input} placeholder="Répétez le mot de passe" value={valeurs.passwordConfirmation} onChange={texte('passwordConfirmation')} />
                      </Champ>
                    </div>
                  </section>
                )}

                {etape === 3 && (
                  <section>
                    <EnTeteEtape titre="Récapitulatif" texte="Vérifiez les informations avant de valider. Cliquez sur « Modifier » pour corriger une étape." />
                    {/* Les 3 cartes du récapitulatif sur la même ligne */}
                    <div className={styles.recapGrille}>
                    <Recap titre="Établissement" onModifier={() => allerA(0)} lignes={[
                      ['Nom', valeurs.label],
                      ['Code', valeurs.reference],
                      ['Contact', valeurs.contact],
                      ['Direction régionale', valeurs.directionGenerale || '—'],
                    ]} />
                    <Recap titre="Localisation & services" onModifier={() => allerA(1)} lignes={[
                      ['Localité', localiteNom ?? '—'],
                      ['District sanitaire', valeurs.district],
                      ['Photo', image ? image.name : photo ? 'Photo actuelle conservée' : 'Aucune'],
                      ['Téléconsultation', valeurs.teleconsultation ? 'Activée' : 'Désactivée'],
                    ]} />
                    <Recap titre="Compte d'accès" onModifier={() => allerA(2)} lignes={[
                      ['Email', valeurs.email],
                      ['Mot de passe', valeurs.password ? '•'.repeat(Math.min(valeurs.password.length, 12)) : modification ? 'Inchangé' : '—'],
                    ]} />
                    </div>
                  </section>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* --- Navigation --- */}
          <footer className={styles.pied}>
            <button type="button" className={styles.secondaire} onClick={() => allerA(etape - 1)} disabled={etape === 0 || envoi}>
              <FaArrowLeft aria-hidden="true" /> Précédent
            </button>
            <span className={styles.compteur}>Étape {etape + 1} sur {ETAPES.length}</span>
            {etape < ETAPES.length - 1 ? (
              <motion.button type="submit" className={styles.principal} whileTap={{ scale: 0.97 }}>
                Suivant <FaArrowRight aria-hidden="true" />
              </motion.button>
            ) : (
              <motion.button type="submit" className={`${styles.principal} ${styles.valider}`} disabled={envoi} whileTap={{ scale: 0.97 }}>
                <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : modification ? 'Enregistrer les modifications' : "Créer l'hôpital"}
              </motion.button>
            )}
          </footer>
        </form>

        {/* --- Aperçu en direct --- */}
        <aside className={styles.apercu} aria-label="Aperçu de la fiche">
          <p className={styles.apercuTitre}>Aperçu de la fiche</p>
          <div className={styles.fiche}>
            <div className={styles.ficheHaut}>
              <div className={styles.fichePhoto}>
                {photo ? <img src={photo} alt="" /> : <FaHospital aria-hidden="true" />}
              </div>
              <strong className={styles.ficheNom}>{valeurs.label || 'Nom de l’hôpital'}</strong>
              <span className={styles.ficheCode}>{valeurs.reference || 'CODE'}</span>
            </div>
            <ul className={styles.ficheInfos}>
              <li><FaMapMarkerAlt aria-hidden="true" /><span className={styles.capitale}>{localiteNom ?? 'Localité'}</span></li>
              <li><FaBuilding aria-hidden="true" /><span>{valeurs.district || 'District sanitaire'}</span></li>
              <li><FaPhoneAlt aria-hidden="true" /><span>{valeurs.contact || 'Contact'}</span></li>
              <li><FaEnvelope aria-hidden="true" /><span>{valeurs.email || 'Email de connexion'}</span></li>
            </ul>
            <span className={`${styles.badge} ${valeurs.teleconsultation ? styles.badgeOk : styles.badgeNeutre}`}>
              <FaHeadset aria-hidden="true" /> Téléconsultation {valeurs.teleconsultation ? 'activée' : 'désactivée'}
            </span>
          </div>

          <div className={styles.completion}>
            <div className={styles.completionHaut}>
              <span>Informations obligatoires</span>
              <strong>{completion}%</strong>
            </div>
            <div className={styles.jauge}>
              <motion.span animate={{ width: `${completion}%` }} transition={{ duration: 0.4 }} className={completion === 100 ? styles.jaugePleine : ''} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Titre + texte d'aide d'une étape */
function EnTeteEtape({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className={styles.enTeteEtape}>
      <h2>{titre}</h2>
      <p>{texte}</p>
    </div>
  );
}

/** Libellé + champ avec icône (contour rouge si invalide ; le message est dans le pop-up) */
function Champ({ id, label, requis, erreur, icone: Icone, aide, large, children }: {
  id: string;
  label: string;
  requis?: boolean;
  erreur?: string;
  icone: IconType;
  aide?: string;
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.champ} ${large ? styles.champLarge : ''} ${erreur ? styles.champInvalide : ''}`} title={erreur}>
      <label htmlFor={id} className={styles.label}>
        {label} {requis && <span className={styles.requis}>*</span>}
        {aide && <span className={styles.aideChamp}>{aide}</span>}
      </label>
      <div className={styles.avecIcone}>
        <Icone className={styles.iconeChamp} aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/** Bloc du récapitulatif */
function Recap({ titre, lignes, onModifier }: { titre: string; lignes: [string, string][]; onModifier: () => void }) {
  return (
    <div className={styles.recap}>
      <div className={styles.recapHaut}>
        <h3>{titre}</h3>
        <button type="button" onClick={onModifier}>
          <FaPen aria-hidden="true" /> Modifier
        </button>
      </div>
      <dl>
        {lignes.map(([cle, val]) => (
          <div key={cle}>
            <dt>{cle}</dt>
            <dd className={cle === 'Localité' ? styles.capitale : ''}>{val || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
