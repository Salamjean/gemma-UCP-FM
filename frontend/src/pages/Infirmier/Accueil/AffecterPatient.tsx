import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaCheck, FaSearch, FaUserPlus, FaBaby, FaUserEdit, FaStethoscope, FaFolderOpen } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { uploadUrl, apiAgent, type EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierPatientItem, OptionsAccueilInfirmier, PatientIdentite, RecherchePatientFilters } from '../../../types';
import ModifierPatient from './ModifierPatient';
import m from './ModifierPatient.module.css';
import s from './Accueil.module.css';

/** Les 4 critères de recherche ; ils se combinent */
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

/** "AAAA-MM-JJ" → "JJ/MM/AAAA (xx ans)" */
function naissance(date: string | null): string | null {
  const r = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!r) return date;
  const auj = new Date();
  let age = auj.getFullYear() - Number(r[1]);
  if (auj.getMonth() + 1 < Number(r[2]) || (auj.getMonth() + 1 === Number(r[2]) && auj.getDate() < Number(r[3]))) age--;
  return `${r[3]}/${r[2]}/${r[1]}${age >= 0 ? ` (${age} an${age > 1 ? 's' : ''})` : ''}`;
}

/**
 * INFIRMIER / MÉDECIN > VÉRIFIER / RECHERCHER UN PATIENT
 * Recherche (n° de dossier, téléphone, CMU ou nom) → dossier du patient → « Consulter » :
 * la consultation du jour est créée dans le service de l'agent connecté, à son nom (pas de caisse, pas de choix
 * de service / prestation / médecin / motif). L'infirmier arrive sur la prise des constantes, le médecin sur la consultation.
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
  const [dossier, setDossier] = useState<PatientIdentite | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Mise à jour des informations du patient choisi (ex. nouveau-né : nom et prénoms)
  const [miseAJour, setMiseAJour] = useState(false);

  // Localités (résidence du dossier, formulaire « Mettre à jour »)
  useEffect(() => {
    source.patients
      .optionsAccueil()
      .then(setOptions)
      .catch(() => undefined);
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

  // Dossier du patient choisi
  useEffect(() => {
    setDossier(null);
    if (!patient) return;
    let actif = true;
    source.patients
      .identite(patient.id)
      .then((d) => {
        if (actif) setDossier(d);
      })
      .catch((e) => {
        if (actif) alerte.echec(`Dossier indisponible : ${messageErreur(e)}`);
      });
    return () => {
      actif = false;
    };
  }, [patient?.id]);

  const consulter = async () => {
    if (!patient) return;
    setEnvoi(true);
    try {
      const r = await source.patients.consulter(patient.id);
      // Même formulaire de consultation pour le médecin et l'infirmier·ère
      // Consultation toute neuve : quitter le formulaire sans issue proposera de l'annuler
      navigate(espace === 'medecin' ? `/medecin/consultations/${r.consultationId}` : `/infirmier/consultations/medicale/${r.consultationId}`, {
        state: { annulable: r.nouvelle ?? !r.message.startsWith('Reprise') },
      });
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const residence = dossier?.residence ? options?.localites.find((l) => l.id === dossier.residence)?.nom ?? null : null;
  const lignesDossier: [string, string | null | undefined][] = dossier
    ? [
        ['N° de dossier', dossier.code ?? patient?.codePatient],
        ['Nom', dossier.nom],
        ['Prénoms', dossier.prenom],
        ['Genre', dossier.genre],
        ['Date de naissance', naissance(dossier.dateNaissance)],
        ['Lieu de naissance', dossier.lieuNaissanceNom],
        ['Téléphone', dossier.telephone],
        ['2e contact', dossier.contact2],
        ['N° CMU', dossier.numCmu],
        ['Situation matrimoniale', dossier.situationMatrimoniale],
        ['Profession', dossier.profession],
        ['Résidence', residence],
        ['Adresse', dossier.adresse],
        ['Personne à prévenir', [dossier.urgenceNom, dossier.urgenceLien && `(${dossier.urgenceLien})`, dossier.urgenceTelephone].filter(Boolean).join(' ') || null],
        ...(dossier.mere ? ([['Mère', `${dossier.mere.nom}${dossier.mere.code ? ` · ${dossier.mere.code}` : ''}`]] as [string, string][]) : []),
      ]
    : [];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Accueil · Patient existant</p>
          <h1 className={c.titre}>Vérifier / Rechercher un patient</h1>
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
                  onClick={() => setPatient(p)}
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

        {/* --- Dossier du patient + Consulter --- */}
        <section className={c.bloc}>
          <AnimatePresence mode="wait" initial={false}>
            {!patient ? (
              <motion.div key="vide" className={s.attente} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <FaSearch aria-hidden="true" />
                <strong>Choisissez un patient</strong>
                <p>Recherchez-le à gauche pour afficher son dossier, puis cliquez sur « Consulter » pour le prendre en charge dans votre service.</p>
              </motion.div>
            ) : (
              <motion.div key={patient.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
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

                <h3 className={s.dossierTitre}>Dossier du patient</h3>
                {dossier ? (
                  <dl className={s.dossierGrille}>
                    {lignesDossier.map(([libelle, valeur]) => (
                      <div key={libelle}>
                        <dt>{libelle}</dt>
                        <dd>{valeur || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className={c.vide}>Chargement du dossier…</p>
                )}

                <footer className={s.pied}>
                  {/* Médecin comme infirmier·ère : dossier médical complet (toutes les consultations du patient) */}
                  <Link to={`${base}/patients/${patient.id}/dossier`} className={c.secondaire}>
                    <FaFolderOpen aria-hidden="true" /> Dossier médical complet
                  </Link>
                  <motion.button type="button" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi} onClick={consulter}>
                    <FaStethoscope aria-hidden="true" /> {envoi ? 'Ouverture…' : 'Consulter'}
                  </motion.button>
                </footer>
              </motion.div>
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
            // Recharger le dossier mis à jour
            source.patients.identite(patient.id).then(setDossier).catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
