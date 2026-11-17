import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  FaArrowLeft,
  FaCheck,
  FaExchangeAlt,
  FaHeartbeat,
  FaHospital,
  FaIdCard,
  FaPhoneAlt,
  FaPhoneVolume,
  FaRulerVertical,
  FaSave,
  FaSearch,
  FaStethoscope,
  FaSyringe,
  FaThermometerHalf,
  FaTimes,
  FaUserMd,
  FaVideo,
  FaWeight,
} from 'react-icons/fa';
import { MdMonitorHeart } from 'react-icons/md';
import { useNavigate, useParams } from 'react-router-dom';
import { ouvrirAppelVideo } from '../../../components/AppelVideo';
import SelectRecherche from '../../../components/SelectRecherche';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierConstantesFormulaire, TeleconsultationHospitalItem } from '../../../types';
import s from './FormulaireConstantes.module.css';
import { type ChampMasque, masquerConstante } from '../../../services/saisieConstantes';
import { type Repere, repereImc, reperePouls, repereTemperature, repereTension } from '../../../services/reperesConstantes';

type Orientation = 'sortie' | 'teleconsultation' | 'urgence' | null;

function calculerAge(dateNaissance: string | null): string {
  if (!dateNaissance) return '—';
  let annee: number | null = null;
  let mois = 0;
  let jour = 1;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dateNaissance);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateNaissance);
  if (fr) {
    jour = Number(fr[1]);
    mois = Number(fr[2]) - 1;
    annee = Number(fr[3]);
  } else if (iso) {
    annee = Number(iso[1]);
    mois = Number(iso[2]) - 1;
    jour = Number(iso[3]);
  }
  if (!annee || annee < 1900) return dateNaissance;
  const auj = new Date();
  let age = auj.getFullYear() - annee;
  const m = auj.getMonth() - mois;
  if (m < 0 || (m === 0 && auj.getDate() < jour)) age--;
  return age >= 0 ? `${age} ans` : '—';
}

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/** Date du jour au format « AAAA-MM-JJ » (heure locale) */
const dateLocale = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Champs avec masque de saisie (séparateur « / » ou « . » ajouté automatiquement) */
const MASQUES: Record<string, ChampMasque | undefined> = { tension: 'tension', temperature: 'temperature', poids: 'poids' };


/** Types de soins : "valeur" est enregistrée en base (inchangée), "court" est affiché pour tenir sur une ligne */
const TYPES_SOINS = [
  { valeur: 'Pansement simple', court: 'Pansement' },
  { valeur: 'Pansement complexe', court: 'Pansement complexe' },
  { valeur: 'Injection IM / IV / SC', court: 'Injection' },
  { valeur: 'Perfusion / Réhydratation', court: 'Perfusion' },
  { valeur: "Soins d'urgence simples", court: 'Soins urgents' },
  { valeur: 'Prise de constantes seule', court: 'Constantes seules' },
  { valeur: 'Nettoyage et désinfection de plaie', court: 'Désinfection plaie' },
  { valeur: 'Autre intervention', court: 'Autre' },
];

/** Les 4 orientations possibles (null = envoi standard dans la file du médecin, comme Laravel) */
const ORIENTATIONS: {
  id: Orientation;
  titre: string;
  detail: string;
  icone: IconType;
  ton: string;
}[] = [
  {
    id: null,
    titre: 'Envoi au médecin',
    detail: "File d'attente du médecin (par défaut)",
    icone: FaUserMd,
    ton: 'bleu',
  },
  {
    id: 'sortie',
    titre: 'Soins / Sortie',
    detail: 'Soins faits sur place, sans médecin',
    icone: FaSyringe,
    ton: 'vert',
  },
  {
    id: 'teleconsultation',
    titre: 'Télémédecine',
    detail: 'Consultation vidéo à distance',
    icone: FaVideo,
    ton: 'violet',
  },
  {
    id: 'urgence',
    titre: "Appel d'urgence",
    detail: 'Prise en charge prioritaire',
    icone: FaPhoneVolume,
    ton: 'rouge',
  },
];

/**
 * INFIRMIER > CONSULTATIONS > FORMULAIRE DE PRISE DE CONSTANTES & ORIENTATION
 * Équivalent Laravel : infirmier.consultation.formulaire (formulaire.blade.php)
 *   1. constantes vitales (IMC calculé automatiquement, repères de lecture)
 *   2. orientation : envoi au médecin (défaut) · soins / sortie · télémédecine (téléconsultation) · urgence
 * Fiche patient résumée à droite (reste visible pendant la saisie).
 */
export default function FormulaireConstantes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<InfirmierConstantesFormulaire | null>(null);
  const [chargement, setChargement] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [imgErreur, setImgErreur] = useState(false);

  // Constantes
  const [poids, setPoids] = useState('');
  const [taille, setTaille] = useState('');
  const [imc, setImc] = useState('');
  const [temperature, setTemperature] = useState('');
  const [tensionArterielle, setTensionArterielle] = useState('');
  const [pouls, setPouls] = useState('');

  // Orientation
  const [orientation, setOrientation] = useState<Orientation>(null);
  const [typeSoins, setTypeSoins] = useState('');
  const [observationSoins, setObservationSoins] = useState('');
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [desiredDate, setDesiredDate] = useState('');
  const [desiredTime, setDesiredTime] = useState('');
  const [observationInfirmiere, setObservationInfirmiere] = useState('');

  // Établissement et médecins (téléconsultation)
  const [selectedHospital, setSelectedHospital] = useState<{
    id: number;
    nom: string;
    reference: string;
    district: string;
  } | null>(null);
  const [doctorsList, setDoctorsList] = useState<Array<{ id: number; nom: string; specialite: string; creneau?: string | null }>>([]);
  const [chargementMedecins, setChargementMedecins] = useState(false);

  // Fenêtre de choix de l'hôpital
  const [showHospitalModal, setShowHospitalModal] = useState(false);
  const [hospitalsList, setHospitalsList] = useState<TeleconsultationHospitalItem[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [hospitalSearch, setHospitalSearch] = useState('');

  useEffect(() => {
    if (!id) return;
    setChargement(true);
    api.infirmier.consultations
      .formulaire(Number(id))
      .then((res) => {
        // Consultation faite par l'infirmier·ère lui-même : la fiche est le formulaire de consultation, en lecture
        if (res.consultation.consultationDirecte) {
          navigate(`/infirmier/consultations/medicale/${res.consultation.id}`, { replace: true });
          return;
        }
        setData(res);
        const cons = res.consultation;
        setPoids(cons.constantes.poids || '');
        setTaille(cons.constantes.taille || '');
        setImc(cons.constantes.imc || '');
        setTemperature(cons.constantes.temperature || '');
        setTensionArterielle(cons.constantes.tensionArterielle || '');
        setPouls(cons.constantes.pouls || '');
        setOrientation(cons.orientationInfirmier === 'sortie' || cons.orientationInfirmier === 'teleconsultation' || cons.orientationInfirmier === 'urgence' ? cons.orientationInfirmier : null);
        setTypeSoins(cons.typeSoinsInfirmier || '');
        setObservationSoins(cons.observationSoins || '');
        setDoctorId(cons.doctorId || null);
        setDesiredDate((cons.desiredDate ?? '').slice(0, 10) || dateLocale(new Date()));
        setDesiredTime(cons.desiredTime || '');
        setObservationInfirmiere(cons.observationInfirmiere || '');
        setSelectedHospital({
          id: res.hopital.id,
          nom: res.hopital.nom,
          reference: res.hopital.reference,
          district: res.hopital.district,
        });
        setDoctorsList(res.doctors);
      })
      .catch((e) => alerte.echec(`Erreur de chargement du formulaire : ${messageErreur(e)}`))
      .finally(() => setChargement(false));
  }, [id, navigate]);

  // IMC calculé automatiquement (taille en cm ou en m)
  useEffect(() => {
    const p = parseFloat(poids);
    const t = parseFloat(taille);
    if (!isNaN(p) && !isNaN(t) && t > 0) {
      const tailleM = t > 3 ? t / 100 : t;
      setImc((p / (tailleM * tailleM)).toFixed(1));
    } else {
      setImc('');
    }
  }, [poids, taille]);

  /** Date et heure de la télémédecine renseignées et valides (préalable au choix de l'hôpital et du médecin) */
  const momentChoisi = /^\d{4}-\d{2}-\d{2}$/.test(desiredDate) && /^\d{2}:\d{2}/.test(desiredTime);
  const momentPasse = momentChoisi && new Date(`${desiredDate}T${desiredTime.slice(0, 5)}`) < new Date();

  // Date / heure / hôpital changés → médecins disponibles à ce moment dans l'hôpital choisi
  const hopitalChoisiId = selectedHospital?.id ?? null;
  useEffect(() => {
    if (!data || data.consultation.terminee || orientation !== 'teleconsultation') return;
    if (!momentChoisi || momentPasse || !hopitalChoisiId) {
      setDoctorsList([]);
      setDoctorId(null);
      return;
    }
    let actif = true;
    setChargementMedecins(true);
    api.infirmier.consultations
      .teleconsultationDoctors(hopitalChoisiId, desiredDate, desiredTime.slice(0, 5))
      .then((liste) => {
        if (!actif) return;
        setDoctorsList(liste);
        // Le médecin déjà choisi n'est plus disponible à ce moment → à rechoisir
        setDoctorId((d) => (d && liste.some((x) => x.id === d) ? d : null));
      })
      .catch((e) => {
        if (actif) alerte.echec(`Impossible de charger les médecins disponibles : ${messageErreur(e)}`);
      })
      .finally(() => actif && setChargementMedecins(false));
    return () => {
      actif = false;
    };
  }, [data, orientation, desiredDate, desiredTime, hopitalChoisiId, momentChoisi, momentPasse]);

  const ouvrirModalHopitaux = async () => {
    if (!momentChoisi) return void alerte.attention('Renseignez d’abord la date et l’heure de la télémédecine.');
    if (momentPasse) return void alerte.attention('La date et l’heure choisies sont déjà passées.');
    setShowHospitalModal(true);
    setLoadingHospitals(true);
    try {
      // Rechargés à chaque ouverture : le nombre de médecins disponibles dépend de la date et de l'heure
      setHospitalsList(await api.infirmier.consultations.teleconsultationHospitals(desiredDate, desiredTime.slice(0, 5)));
    } catch {
      alerte.echec('Impossible de charger les hôpitaux partenaires.');
    } finally {
      setLoadingHospitals(false);
    }
  };

  const choisirHopital = async (h: TeleconsultationHospitalItem) => {
    setSelectedHospital({
      id: h.id,
      nom: h.name,
      reference: h.reference,
      district: h.district,
    });
    setShowHospitalModal(false);
    setDoctorId(null); // le médecin doit être choisi dans le nouvel établissement (liste rechargée pour la date choisie)
    alerte.succes(`Établissement sélectionné : ${h.name} (${h.availableDoctorsCount} médecin(s) disponible(s) à cette date)`);
  };

  const hopitauxFiltres = useMemo(() => {
    const q = hospitalSearch.trim().toLowerCase();
    if (!q) return hospitalsList;
    return hospitalsList.filter((h) => [h.name, h.reference, h.district].some((v) => v.toLowerCase().includes(q)));
  }, [hospitalsList, hospitalSearch]);

  /**
   * APPEL D'URGENCE (comme Laravel) : toutes les constantes obligatoires, enregistrées avec l'appel ;
   * l'appel vidéo sonne chez tous les médecins alertés, le premier qui décroche prend le patient.
   */
  const appelUrgence = async () => {
    if (!id) return;
    const manque = [!poids && 'poids', !taille && 'taille', !temperature && 'température', !tensionArterielle && 'tension artérielle', !pouls && 'pouls'].filter(Boolean);
    if (manque.length) return void alerte.attention(`Renseignez toutes les constantes avant l’appel d’urgence (manque : ${manque.join(', ')}).`);
    setSauvegarde(true);
    try {
      const acces = await api.infirmier.consultations.lancerUrgence(Number(id), {
        tension_arterielle: tensionArterielle,
        temperature,
        taille,
        poids,
        imc,
        pouls,
        observation: observationInfirmiere || undefined,
      });
      ouvrirAppelVideo(acces);
      // La fiche passe en lecture (constantes prises) avec le bouton pour rejoindre / relancer l'appel
      setData((d) => (d ? { ...d, consultation: { ...d.consultation, terminee: true, statusInf: 1, orientationInfirmier: 'urgence', isUrgence: true } } : d));
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setSauvegarde(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orientation === 'urgence') return void appelUrgence();
    if (!id) return;
    const hasVitals = !!tensionArterielle || !!temperature || !!poids || !!pouls;

    if (!orientation && !hasVitals) {
      alerte.attention('Veuillez renseigner au moins une constante (TA, Température, Poids, Pouls) avant d’envoyer chez le médecin.');
      return;
    }
    if (orientation === 'teleconsultation' && !hasVitals) {
      alerte.attention('Veuillez renseigner les constantes avant de programmer la télémédecine.');
      return;
    }
    if (orientation === 'sortie' && !typeSoins) {
      alerte.attention('Veuillez choisir le type de soins administrés.');
      return;
    }
    if (orientation === 'teleconsultation' && !momentChoisi) {
      alerte.attention('Renseignez la date et l’heure de la télémédecine.');
      return;
    }
    if (orientation === 'teleconsultation' && momentPasse) {
      alerte.attention('La date et l’heure de la télémédecine ne peuvent pas être dans le passé.');
      return;
    }
    if (orientation === 'teleconsultation' && !doctorId) {
      alerte.attention('Veuillez sélectionner un médecin pour la télémédecine.');
      return;
    }

    setSauvegarde(true);
    try {
      const res = await api.infirmier.consultations.enregistrerConstantes({
        consultation_id: Number(id),
        tension_arterielle: tensionArterielle,
        temperature,
        taille,
        poids,
        imc,
        pouls,
        orientation_infirmier: orientation,
        type_soins_infirmier: typeSoins,
        observation_soins: observationSoins,
        observation_infirmiere: observationInfirmiere || observationSoins,
        // Médecin, date et heure ne concernent que la télémédecine (sinon le patient apparaîtrait en téléconsultation)
        doctor_id: orientation === 'teleconsultation' && doctorId ? Number(doctorId) : null,
        desired_date: orientation === 'teleconsultation' ? desiredDate : '',
        desired_time: orientation === 'teleconsultation' ? desiredTime : '',
      });
      alerte.succes(res.message);
      navigate('/infirmier/consultations/nouvelles');
    } catch (err) {
      alerte.echec(`Erreur lors de l’enregistrement : ${messageErreur(err)}`);
    } finally {
      setSauvegarde(false);
    }
  };

  if (chargement || !data) {
    return (
      <div className={c.page}>
        <section className={c.bloc}>
          <p className={c.vide}>{chargement ? 'Chargement de la fiche de consultation…' : 'Consultation introuvable.'}</p>
          {!chargement && (
            <button type="button" onClick={() => navigate(-1)} className={c.secondaire}>
              <FaArrowLeft aria-hidden="true" /> Retour
            </button>
          )}
        </section>
      </div>
    );
  }

  const { consultation: cons, hopital } = data;
  const patient = cons.patient;
  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
  const urlPhoto = patient.imgUrl ? (patient.imgUrl.startsWith('http') ? patient.imgUrl : uploadUrl('patient', patient.imgUrl)) : null;

  // Tuiles des constantes
  const constantes: {
    id: string;
    libelle: string;
    unite: string;
    icone: IconType;
    valeur: string;
    onChange?: (v: string) => void;
    placeholder: string;
    type: 'decimal' | 'texte';
    repere?: Repere;
  }[] = [
    {
      id: 'tension',
      libelle: 'Tension artérielle',
      unite: 'mmHg',
      icone: MdMonitorHeart,
      valeur: tensionArterielle,
      onChange: setTensionArterielle,
      placeholder: '12/8',
      type: 'texte',
      repere: repereTension(tensionArterielle),
    },
    {
      id: 'temperature',
      libelle: 'Température',
      unite: '°C',
      icone: FaThermometerHalf,
      valeur: temperature,
      onChange: setTemperature,
      placeholder: '37.2',
      type: 'decimal',
      repere: repereTemperature(temperature),
    },
    {
      id: 'pouls',
      libelle: 'Pouls',
      unite: 'bpm',
      icone: FaHeartbeat,
      valeur: pouls,
      onChange: setPouls,
      placeholder: '78',
      type: 'decimal',
      repere: reperePouls(pouls),
    },
    {
      id: 'poids',
      libelle: 'Poids',
      unite: 'kg',
      icone: FaWeight,
      valeur: poids,
      onChange: setPoids,
      placeholder: '72.5',
      type: 'decimal',
    },
    {
      id: 'taille',
      libelle: 'Taille',
      unite: 'cm',
      icone: FaRulerVertical,
      valeur: taille,
      onChange: setTaille,
      placeholder: '175',
      type: 'decimal',
    },
    {
      id: 'imc',
      libelle: 'IMC (calculé)',
      unite: 'kg/m²',
      icone: FaStethoscope,
      valeur: imc,
      placeholder: 'auto',
      type: 'texte',
      repere: repereImc(imc),
    },
  ];
  const nbConstantes = [tensionArterielle, temperature, pouls, poids, taille].filter(Boolean).length;
  // Comme la règle d'enregistrement : au moins une constante (TA, température, poids ou pouls)
  const constantesPrises = !!tensionArterielle || !!temperature || !!poids || !!pouls;
  // Envoi au médecin et téléconsultation exigent les constantes : bouton grisé tant qu'elles ne sont pas prises
  // Appel d'urgence : les 5 constantes sont exigées par le serveur → bouton grisé tant qu'il en manque
  const manquantesUrgence = [!poids && 'poids', !taille && 'taille', !temperature && 'température', !tensionArterielle && 'tension', !pouls && 'pouls'].filter(Boolean) as string[];
  const attendUrgence = orientation === 'urgence' && manquantesUrgence.length > 0;
  const attendConstantes = ((orientation === null || orientation === 'teleconsultation') && !constantesPrises) || attendUrgence;

  const orientationActive = ORIENTATIONS.find((o) => o.id === orientation)!;
  const libelleBouton =
    orientation === 'sortie' ? 'Clôturer la consultation' : orientation === 'teleconsultation' ? 'Programmer la télémédecine' : orientation === 'urgence' ? 'Lancer l’appel d’urgence' : 'Valider & envoyer au médecin';
  const medecinChoisi = doctorsList.find((d) => d.id === doctorId);
  // Constantes déjà prises (status_inf = 1) : la fiche s'ouvre en consultation seule, sans validation
  const lecture = cons.terminee;

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Consultations · {lecture ? 'Fiche' : 'Prise en charge'}</p>
          <h1 className={c.titre}>Constantes &amp; orientation</h1>
        </div>
        <button type="button" onClick={() => navigate(-1)} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Retour à la liste
        </button>
      </header>

      <div className={s.grille}>
        {/* ================= FORMULAIRE ================= */}
        <form className={`${s.formulaire} ${lecture ? s.lecture : ''}`} onSubmit={handleSubmit} noValidate>
          {lecture && (
            <p className={s.bandeauLecture}>
              <FaCheck aria-hidden="true" /> Constantes déjà prises et patient orienté : cette fiche est en consultation seule.
            </p>
          )}
          {/* --- 1. Constantes --- */}
          <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className={s.sectionEntete}>
              <span className={s.numero}>1</span>
              <div>
                <h2>Constantes vitales</h2>
                <p>{lecture ? 'Constantes relevées lors de la prise en charge.' : 'Mesurez les paramètres du patient. L’IMC se calcule tout seul avec le poids et la taille.'}</p>
              </div>
              <span className={s.progression}>{nbConstantes} / 5 saisies</span>
            </div>

            <fieldset className={s.verrou} disabled={lecture}>
              <div className={s.constantes}>
                {constantes.map((k, i) => (
                  <motion.label
                    key={k.id}
                    htmlFor={k.id}
                    className={`${s.constante} ${k.valeur ? s.constanteRemplie : ''} ${!k.onChange ? s.constanteAuto : ''}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i }}
                  >
                    <span className={s.constanteHaut}>
                      <span className={s.constanteIcone}>
                        <k.icone aria-hidden="true" />
                      </span>
                      {k.libelle}
                    </span>
                    <span className={s.constanteSaisie}>
                      <input
                        id={k.id}
                        inputMode={k.type === 'decimal' ? 'decimal' : 'text'}
                        placeholder={k.placeholder}
                        value={k.valeur}
                        readOnly={!k.onChange}
                        onChange={
                          k.onChange
                            ? (e) => {
                                const v = e.target.value;
                                // Tension « 12/8 », température « 37.2 », poids « 72.5 » : le séparateur s'ajoute tout seul
                                if (MASQUES[k.id]) return k.onChange!(masquerConstante(MASQUES[k.id]!, v, k.valeur));
                                k.onChange!(k.type === 'decimal' ? v.replace(',', '.').replace(/[^\d.]/g, '') : v);
                              }
                            : undefined
                        }
                      />
                      <small>{k.unite}</small>
                    </span>
                    <span className={s.repere}>{k.repere ? <span className={`${s.repereBadge} ${s[`ton_${k.repere.ton}`]}`}>{k.repere.libelle}</span> : <span className={s.repereVide}>—</span>}</span>
                  </motion.label>
                ))}
              </div>
            </fieldset>
            <p className={s.note}>Les repères (normale, fièvre…) sont indicatifs, pour un adulte.</p>
          </motion.section>

          {/* --- 2. Orientation --- */}
          <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className={s.sectionEntete}>
              <span className={s.numero}>2</span>
              <div>
                <h2>Orientation du patient</h2>
                <p>{lecture ? 'Orientation choisie lors de la prise en charge.' : 'Par défaut, le patient est envoyé dans la file d’attente du médecin.'}</p>
              </div>
            </div>

            <fieldset className={s.verrou} disabled={lecture}>
              <div className={s.orientations} role="radiogroup" aria-label="Orientation du patient">
                {ORIENTATIONS.map((o) => {
                  const actif = orientation === o.id;
                  return (
                    <button key={o.titre} type="button" role="radio" aria-checked={actif} className={`${s.orientation} ${s[`o_${o.ton}`]} ${actif ? s.orientationActive : ''}`} onClick={() => setOrientation(o.id)}>
                      {/* Icône sur la même ligne que le titre */}
                      <span className={s.orientationTitre}>
                        <span className={s.orientationIcone}>
                          <o.icone aria-hidden="true" />
                        </span>
                        <strong>{o.titre}</strong>
                      </span>
                      <small>{o.detail}</small>
                      {actif && (
                        <motion.span
                          layoutId="orientation-coche"
                          className={s.coche}
                          transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30,
                          }}
                        >
                          <FaCheck />
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {/* --- Soins / sortie --- */}
                {orientation === 'sortie' && (
                  <motion.div key="sortie" className={s.detail} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                    <div className={s.detailInterieur}>
                      <p className={s.etiquette}>
                        Type de soins administrés <span className={s.requis}>*</span>
                      </p>
                      <div className={s.puces} role="radiogroup" aria-label="Type de soins">
                        {TYPES_SOINS.map((t) => (
                          <button
                            key={t.valeur}
                            type="button"
                            role="radio"
                            aria-checked={typeSoins === t.valeur}
                            title={t.valeur}
                            className={`${s.puce} ${typeSoins === t.valeur ? s.puceActive : ''}`}
                            onClick={() => setTypeSoins(t.valeur)}
                          >
                            {typeSoins === t.valeur && <FaCheck aria-hidden="true" />} {t.court}
                          </button>
                        ))}
                      </div>
                      <label className={s.champ}>
                        <span className={s.etiquette}>Observations &amp; détails de l’intervention</span>
                        <textarea rows={3} placeholder="Gestes effectués, matériel utilisé, état du patient…" value={observationSoins} onChange={(e) => setObservationSoins(e.target.value)} />
                      </label>
                    </div>
                  </motion.div>
                )}

                {/* --- Télémédecine (valeur enregistrée : 'teleconsultation', comme Laravel) --- */}
                {orientation === 'teleconsultation' && (
                  <motion.div key="tele" className={s.detail} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                    <div className={s.detailInterieur}>
                      {/* 1. Date et heure d'abord → 2. établissement → 3. médecins disponibles à ce moment */}
                      <div className={s.ligneTele}>
                        <label className={s.champ}>
                          <span className={s.etiquette}>
                            Date <span className={s.requis}>*</span>
                          </span>
                          <input type="date" min={dateLocale(new Date())} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
                        </label>
                        <label className={s.champ}>
                          <span className={s.etiquette}>
                            Heure <span className={s.requis}>*</span>
                          </span>
                          <input type="time" value={desiredTime} onChange={(e) => setDesiredTime(e.target.value)} />
                        </label>
                        <div className={s.champ}>
                          <span className={s.etiquette}>Établissement</span>
                          <div
                            className={`${s.etablissement} ${!momentChoisi ? s.champInactif : ''}`}
                            title={`${selectedHospital?.nom || hopital.nom} · ${selectedHospital?.reference || hopital.reference} · District ${selectedHospital?.district || hopital.district}`}
                          >
                            <FaHospital className={s.etablissementIcone} aria-hidden="true" />
                            <span className={s.etablissementNom}>{selectedHospital?.nom || hopital.nom}</span>
                            <button
                              type="button"
                              className={s.changer}
                              onClick={ouvrirModalHopitaux}
                              disabled={!momentChoisi}
                              title={momentChoisi ? "Changer d'établissement" : 'Renseignez d’abord la date et l’heure'}
                              aria-label="Changer d'établissement"
                            >
                              <FaExchangeAlt />
                            </button>
                          </div>
                        </div>
                        <div className={s.champ}>
                          <label htmlFor="medecin" className={s.etiquette}>
                            Médecin disponible <span className={s.requis}>*</span>
                          </label>
                          <SelectRecherche
                            id="medecin"
                            options={doctorsList.map((d) => ({
                              id: d.id,
                              name: d.nom,
                              detail: d.creneau ? `${d.specialite} · ${d.creneau}` : d.specialite,
                            }))}
                            value={doctorId}
                            onChange={setDoctorId}
                            placeholder={
                              !momentChoisi
                                ? '-- Choisissez d’abord la date et l’heure --'
                                : momentPasse
                                  ? '-- Date et heure déjà passées --'
                                  : chargementMedecins
                                    ? 'Recherche des médecins disponibles…'
                                    : doctorsList.length
                                      ? `-- ${doctorsList.length} médecin(s) disponible(s) --`
                                      : '-- Aucun médecin disponible à ce moment --'
                            }
                            placeholderRecherche="Rechercher un médecin…"
                            aucunResultat="Aucun médecin disponible à cette date et cette heure"
                          />
                        </div>
                      </div>
                      {momentChoisi && !momentPasse && !chargementMedecins && doctorsList.length === 0 && (
                        <p className={s.aideTele}>
                          Aucun médecin de {selectedHospital?.nom || hopital.nom} n’est disponible à ce moment : changez l’heure, la date ou l’établissement.
                        </p>
                      )}

                      <label className={s.champ}>
                        <span className={s.etiquette}>Note clinique pour le médecin</span>
                        <textarea rows={3} placeholder="Informations transmises au médecin pour la télémédecine…" value={observationInfirmiere} onChange={(e) => setObservationInfirmiere(e.target.value)} />
                      </label>
                    </div>
                  </motion.div>
                )}

                {/* --- Urgence --- */}
                {orientation === 'urgence' && (
                  <motion.div key="urgence" className={s.detail} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                    <div className={`${s.detailInterieur} ${s.detailUrgence}`}>
                      <p className={s.alerteUrgence}>
                        <FaPhoneVolume aria-hidden="true" /> L’appel vidéo sonne chez les médecins du même service et chez les médecins généralistes de tous les hôpitaux de la DMHP : le premier qui décroche prend le patient.
                      </p>
                      <label className={s.champ}>
                        <span className={s.etiquette}>Motif de l’alerte</span>
                        <textarea rows={3} placeholder="Signes de gravité constatés…" value={observationInfirmiere} onChange={(e) => setObservationInfirmiere(e.target.value)} />
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </fieldset>

            {/* --- Pied : résumé + validation (absente en consultation seule) --- */}
            <footer className={s.pied}>
              <p className={s.resume}>
                <orientationActive.icone aria-hidden="true" />
                {orientation === 'teleconsultation' && medecinChoisi ? `Télémédecine avec ${medecinChoisi.nom}` : orientation === 'sortie' && typeSoins ? `Soins : ${typeSoins}` : orientationActive.detail}
              </p>
              <div className={s.piedBoutons}>
                <button type="button" className={c.secondaire} onClick={() => navigate(-1)} disabled={sauvegarde}>
                  {lecture ? 'Retour' : 'Annuler'}
                </button>
                {lecture && cons.orientationInfirmier === 'urgence' && cons.status === 0 && (
                  <motion.button type="button" className={`${c.principal} ${s.boutonUrgence}`} whileTap={{ scale: 0.97 }} onClick={appelUrgence} disabled={sauvegarde}>
                    <FaPhoneVolume aria-hidden="true" /> {sauvegarde ? 'Connexion…' : 'Rejoindre / relancer l’appel d’urgence'}
                  </motion.button>
                )}
                {!lecture && (
                  <>
                    {attendConstantes && (
                      <span className={s.aideBouton} id="aide-envoi">
                        <FaThermometerHalf aria-hidden="true" />{' '}
                        {attendUrgence ? `Constantes manquantes pour l’appel : ${manquantesUrgence.join(', ')}` : 'Prenez les constantes pour activer'}
                      </span>
                    )}
                    <motion.button
                      type="submit"
                      className={`${c.principal} ${orientation === 'urgence' ? s.boutonUrgence : ''} ${attendConstantes ? s.boutonInactif : ''}`}
                      whileTap={attendConstantes ? undefined : { scale: 0.97 }}
                      disabled={sauvegarde || attendConstantes}
                      aria-describedby={attendConstantes ? 'aide-envoi' : undefined}
                      title={
                        attendUrgence
                          ? `Renseignez toutes les constantes pour lancer l’appel (manque : ${manquantesUrgence.join(', ')})`
                          : attendConstantes
                            ? 'Renseignez au moins une constante (TA, température, poids ou pouls)'
                            : undefined
                      }
                    >
                      <FaSave aria-hidden="true" /> {sauvegarde ? 'Enregistrement…' : libelleBouton}
                    </motion.button>
                  </>
                )}
              </div>
            </footer>
          </motion.section>
        </form>

        {/* ================= FICHE PATIENT ================= */}
        <motion.aside className={`${c.bloc} ${s.fiche}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} aria-label="Fiche du patient">
          <div className={s.ficheHaut}>
            {urlPhoto && !imgErreur ? (
              <img src={urlPhoto} alt="" className={s.avatar} onError={() => setImgErreur(true)} />
            ) : (
              <span className={`${s.avatar} ${s.avatarInitiales} ${feminin ? s.avatarF : ''}`}>{initiales(patient.nom)}</span>
            )}
            <strong className={s.ficheNom}>{patient.nom}</strong>
            <span className={s.ficheSous}>
              {feminin ? 'Féminin' : 'Masculin'} · {calculerAge(patient.birthDate)}
            </span>
            <span className={s.dossier}>
              <FaIdCard aria-hidden="true" /> {patient.code}
            </span>
            {cons.isUrgence && <span className={s.urgence}>Urgence</span>}
          </div>

          <div className={s.motif}>
            <span>Motif de consultation</span>
            <p>{cons.motif || '—'}</p>
            {cons.serviceLibelle && <small>Service : {cons.serviceLibelle}</small>}
          </div>

          <dl className={s.infos}>
            {[
              { t: 'Naissance', v: patient.birthDate },
              { t: 'Téléphone', v: patient.telephone, icone: FaPhoneAlt },
              { t: 'Profession', v: patient.profession },
              { t: 'Résidence', v: patient.residence || patient.adresse },
              { t: 'N° CMU', v: patient.numCmu },
              { t: 'N° assurance', v: patient.noAssurance },
            ].map((x) => (
              <div key={x.t}>
                <dt>{x.t}</dt>
                <dd>{x.v || '—'}</dd>
              </div>
            ))}
          </dl>
        </motion.aside>
      </div>

      {/* ================= CHOIX DE L'HÔPITAL (téléconsultation) ================= */}
      <AnimatePresence>
        {showHospitalModal && (
          <motion.div className={s.voile} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setShowHospitalModal(false)}>
            <motion.div
              className={s.fenetre}
              role="dialog"
              aria-modal="true"
              aria-labelledby="titre-hopitaux"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <header className={s.fenetreEntete}>
                <span className={s.fenetreIcone}>
                  <FaHospital aria-hidden="true" />
                </span>
                <div>
                  <h3 id="titre-hopitaux">Choisir un établissement</h3>
                  <p>Hôpitaux partenaires ouverts à la télémédecine</p>
                </div>
                <button type="button" className={s.fermer} onClick={() => setShowHospitalModal(false)} aria-label="Fermer">
                  <FaTimes />
                </button>
              </header>

              <label className={s.rechercheHopital}>
                <FaSearch aria-hidden="true" />
                <input type="search" placeholder="Nom, code ou district…" value={hospitalSearch} onChange={(e) => setHospitalSearch(e.target.value)} autoFocus aria-label="Rechercher un établissement" />
              </label>

              <div className={s.hopitaux}>
                {loadingHospitals ? (
                  <p className={c.vide}>Chargement des établissements…</p>
                ) : hopitauxFiltres.length === 0 ? (
                  <p className={c.vide}>Aucun établissement trouvé.</p>
                ) : (
                  hopitauxFiltres.map((h) => {
                    const actuel = selectedHospital?.id === h.id;
                    return (
                      <button key={h.id} type="button" className={`${s.hopital} ${actuel ? s.hopitalActuel : ''}`} onClick={() => choisirHopital(h)}>
                        <span className={s.hopitalHaut}>
                          <span className={s.hopitalRef}>{h.reference}</span>
                          <span className={h.availableDoctorsCount > 0 ? s.dispo : s.indispo}>
                            {h.availableDoctorsCount} médecin
                            {h.availableDoctorsCount > 1 ? 's' : ''}
                          </span>
                        </span>
                        <strong>{h.name}</strong>
                        <small>
                          District {h.district}
                          {h.contact ? ` · ${h.contact}` : ''}
                        </small>
                        {actuel && (
                          <span className={s.hopitalCoche}>
                            <FaCheck aria-hidden="true" /> Établissement actuel
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <footer className={s.fenetrePied}>
                <span>
                  {hopitauxFiltres.length} établissement
                  {hopitauxFiltres.length > 1 ? 's' : ''}
                </span>
                <button type="button" className={c.secondaire} onClick={() => setShowHospitalModal(false)}>
                  Fermer
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
