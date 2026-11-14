import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaCheck, FaSearch, FaUserPlus, FaBaby, FaUserEdit } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { uploadUrl, apiAgent, type EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierPatientItem, OptionsAccueilInfirmier, RecherchePatientFilters } from '../../../types';
import ChampsAffectation, { type ValeurAffectation } from './ChampsAffectation';
import ModifierPatient from './ModifierPatient';
import m from './ModifierPatient.module.css';
import s from './Accueil.module.css';

/** Les 4 critères de recherche (comme "Vérifier / Rechercher") ; ils se combinent */
interface Criteres {
  code: string;
  telephone: string;
  cmu: string;
  nom: string;
}
const CRITERES_VIDES: Criteres = { code: '', telephone: '', cmu: '', nom: '' };

function filtres(c: Criteres): RecherchePatientFilters {
  return {
    code_patient: c.code.trim().toUpperCase() || undefined,
    telephone: c.telephone.trim() || undefined,
    num_cmu: c.cmu.trim() || undefined,
    fullname: c.nom.trim() || undefined,
  };
}

const initiales = (nom: string) =>
  nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'P';

/**
 * INFIRMIER > RECHERCHER UN PATIENT ET L'AFFECTER (bouton du tableau de bord)
 * Recherche (n° de dossier, téléphone ou nom) → choix du patient → affectation :
 * la consultation du jour est créée directement (pas de caisse) et l'infirmier arrive sur la prise des constantes.
 */
export default function AffecterPatient({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const source = apiAgent(espace);
  /** Racine des liens : /infirmier ou /medecin */
  const base = espace === 'medecin' ? '/medecin' : '/infirmier';
  const navigate = useNavigate();
  const [options, setOptions] = useState<OptionsAccueilInfirmier | null>(null);
  const [criteres, setCriteres] = useState<Criteres>(CRITERES_VIDES);
  const [resultats, setResultats] = useState<InfirmierPatientItem[] | null>(null);
  const [cherche, setCherche] = useState(false);
  const [patient, setPatient] = useState<InfirmierPatientItem | null>(null);
  const [affectation, setAffectation] = useState<ValeurAffectation>({ prestationId: null, doctorId: null, infirmierId: null, motif: '' });
  const [verifier, setVerifier] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Mise à jour des informations du patient choisi (ex. nouveau-né : nom et prénoms)
  const [miseAJour, setMiseAJour] = useState(false);

  useEffect(() => {
    source.patients
      .optionsAccueil()
      .then(setOptions)
      .catch((e) => alerte.echec(`Impossible de charger les services : ${messageErreur(e)}`));
  }, []);

  // Recherche pendant la frappe, dès qu'un critère a au moins 2 caractères
  useEffect(() => {
    if (!Object.values(criteres).some((v) => v.trim().length >= 2)) {
      setResultats(null);
      setCherche(false);
      return;
    }
    let actif = true;
    setCherche(true);
    const t = setTimeout(() => {
      source.patients
        .rechercher(filtres(criteres))
        .then((l) => {
          if (actif) setResultats(l);
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
  }, [criteres]);

  const choisir = (p: InfirmierPatientItem) => {
    setPatient(p);
    setVerifier(false);
    setAffectation({ prestationId: null, doctorId: null, infirmierId: null, motif: '' });
  };

  const affecter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setVerifier(true);
    if (!affectation.prestationId) return void alerte.echec('Choisissez le service puis la prestation.');
    if (!affectation.doctorId) return void alerte.echec('Veuillez choisir le médecin.');
    if (espace === 'medecin' && !affectation.infirmierId) return void alerte.echec('Veuillez choisir l’infirmier·ère.');
    if (!affectation.motif.trim()) return void alerte.echec('Le motif de la consultation est obligatoire.');
    setEnvoi(true);
    try {
      const r = await source.patients.affecter(patient.id, {
        prestationId: affectation.prestationId,
        motif: affectation.motif.trim(),
        doctorId: affectation.doctorId,
        infirmierId: espace === 'medecin' ? (affectation.infirmierId ?? undefined) : undefined,
      });
      await alerte.succes(r.message);
      navigate(espace === 'medecin' ? base : `/infirmier/consultations/formulaire/${r.consultationId}`);
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
          <p className={c.surtitre}>Accueil · Patient existant</p>
          <h1 className={c.titre}>Rechercher et affecter un patient</h1>
        </div>
        <div className={c.boutons}>
          <Link to={`${base}/patients/inscrire`} className={c.secondaire}>
            <FaUserPlus aria-hidden="true" /> Nouveau patient
          </Link>
          <Link to={base} className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Tableau de bord
          </Link>
        </div>
      </header>

      {/* --- Recherche : les 4 champs sur une ligne --- */}
      <section className={c.bloc}>
        <div className={s.criteres}>
          {(
            [
              { cle: 'nom', libelle: 'Nom & prénoms', exemple: 'Ex. Kouamé Aya', autoFocus: true },
              { cle: 'code', libelle: 'N° de dossier', exemple: 'Ex. DM2024…' },
              { cle: 'telephone', libelle: 'Téléphone', exemple: 'Ex. 0707…', numerique: true },
              { cle: 'cmu', libelle: 'N° CMU', exemple: 'Ex. 123456…' },
            ] as { cle: keyof Criteres; libelle: string; exemple: string; numerique?: boolean; autoFocus?: boolean }[]
          ).map((f) => (
            <label key={f.cle} className={s.grandeRecherche}>
              <span className={s.critereLibelle}>{f.libelle}</span>
              <span className={s.critereSaisie}>
                <FaSearch aria-hidden="true" />
                <input
                  type="search"
                  inputMode={f.numerique ? 'numeric' : undefined}
                  placeholder={f.exemple}
                  value={criteres[f.cle]}
                  onChange={(e) => setCriteres((c) => ({ ...c, [f.cle]: f.numerique ? e.target.value.replace(/\D/g, '') : e.target.value }))}
                  autoFocus={f.autoFocus}
                />
              </span>
            </label>
          ))}
        </div>
        <div className={s.criteresPied}>
          {cherche ? (
            <span className={s.enCours}>
              <span className={s.chargement} aria-hidden="true" /> Recherche…
            </span>
          ) : (
            <span>Remplissez un ou plusieurs champs : ils se combinent.</span>
          )}
          {Object.values(criteres).some(Boolean) && (
            <button type="button" className={s.effacer} onClick={() => setCriteres(CRITERES_VIDES)}>
              Effacer
            </button>
          )}
        </div>
      </section>

      <div className={s.deuxColonnes}>
        {/* --- Résultats --- */}
        <section className={c.bloc}>
          <h2 className={s.titreBloc}>Résultats{resultats ? <span className={s.compteResultats}>{resultats.length}</span> : null}</h2>
          <div className={s.resultats}>
            {resultats === null && <p className={s.aide}>Tapez au moins 2 caractères dans un champ pour lancer la recherche.</p>}
            {resultats?.length === 0 && (
              <div className={s.aucun}>
                <p>Aucun patient trouvé.</p>
                <Link to={`${base}/patients/inscrire`} className={c.principal}>
                  <FaUserPlus aria-hidden="true" /> Inscrire ce patient
                </Link>
              </div>
            )}
            {resultats?.map((p, i) => {
              const actif = patient?.id === p.id;
              const feminin = (p.genre ?? '').toLowerCase().startsWith('f');
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  className={`${s.resultat} ${actif ? s.resultatActif : ''}`}
                  onClick={() => choisir(p)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.03 }}
                >
                  {p.imgUrl ? (
                    <img className={s.avatar} src={p.imgUrl.startsWith('http') ? p.imgUrl : uploadUrl('patient', p.imgUrl)} alt="" />
                  ) : (
                    <span className={`${s.avatar} ${feminin ? s.avatarF : ''}`}>{initiales(p.nomComplet)}</span>
                  )}
                  <span className={s.resultatTexte}>
                    <strong>{p.nomComplet}</strong>
                    <small>
                      {p.codePatient} · {p.telephone ?? 'sans téléphone'}
                      {p.dateNaissance ? ` · né(e) le ${p.dateNaissance}` : ''}
                    </small>
                  </span>
                  {actif && (
                    <span className={s.coche}>
                      <FaCheck />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* --- Affectation --- */}
        <section className={c.bloc}>
          <AnimatePresence mode="wait" initial={false}>
            {!patient ? (
              <motion.div key="vide" className={s.attente} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <FaSearch aria-hidden="true" />
                <strong>Choisissez un patient</strong>
                <p>
                  Recherchez-le à gauche, puis indiquez le service et le motif : la consultation sera créée et {espace === 'medecin' ? 'l’infirmier·ère prendra ses constantes.' : 'vous pourrez prendre ses constantes.'}
                </p>
              </motion.div>
            ) : (
              <motion.form key={patient.id} onSubmit={affecter} noValidate initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div className={s.patientChoisi}>
                  <span className={s.avatar}>{initiales(patient.nomComplet)}</span>
                  <div>
                    <strong>{patient.nomComplet}</strong>
                    <small>
                      {patient.codePatient}
                      {patient.genre ? ` · ${patient.genre}` : ''}
                      {patient.numCmu ? ` · CMU ${patient.numCmu}` : ''}
                    </small>
                  </div>
                  <button type="button" className={m.boutonMaj} onClick={() => setMiseAJour(true)}>
                    <FaUserEdit aria-hidden="true" /> Mettre à jour
                  </button>
                  <button type="button" className={s.changer} onClick={() => setPatient(null)}>
                    Changer
                  </button>
                </div>
                {/^nouveau-n/i.test(patient.nomComplet) && (
                  <p className={m.rappelNouveauNe}>
                    <FaBaby aria-hidden="true" />
                    <span>Nouveau-né enregistré à la naissance : complétez son nom et ses prénoms avant les soins.</span>
                    <button type="button" className={m.boutonMaj} onClick={() => setMiseAJour(true)}>
                      Compléter
                    </button>
                  </p>
                )}
                {options ? <ChampsAffectation options={options} valeur={affectation} onChange={setAffectation} verifier={verifier} /> : <p className={c.vide}>Chargement…</p>}
                <footer className={s.pied}>
                  <span className={s.piedEtape}>Aucun passage à la caisse : la consultation est créée tout de suite.</span>
                  <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi || !options}>
                    <FaCheck aria-hidden="true" /> {envoi ? 'Affectation…' : espace === 'medecin' ? 'Affecter le patient' : 'Affecter et prendre les constantes'}
                  </motion.button>
                </footer>
              </motion.form>
            )}
          </AnimatePresence>
        </section>
      </div>
      {miseAJour && patient && (
        <ModifierPatient
          espace={espace}
          patientId={patient.id}
          localites={options?.localites}
          onFermer={() => setMiseAJour(false)}
          onEnregistre={(nomComplet) => {
            setMiseAJour(false);
            setPatient((x) => (x ? { ...x, nomComplet } : x));
            setResultats((r) => (r ? r.map((x) => (x.id === patient.id ? { ...x, nomComplet } : x)) : r));
          }}
        />
      )}
    </div>
  );
}
