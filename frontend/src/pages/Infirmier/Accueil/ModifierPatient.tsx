import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaBaby, FaSave, FaTimes, FaUserEdit } from 'react-icons/fa';
import SelectRecherche from '../../../components/SelectRecherche';
import { alerte, messageErreur } from '../../../services/alertes';
import { apiAgent, type EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { PatientIdentite } from '../../../types';
import s from './Accueil.module.css';
import m from './ModifierPatient.module.css';

const SITUATIONS = [
  { id: 'celibataire', libelle: 'Célibataire' },
  { id: 'marie', libelle: 'Marié(e)' },
  { id: 'concubinage', libelle: 'Concubinage' },
  { id: 'divorce', libelle: 'Divorcé(e)' },
  { id: 'veuf', libelle: 'Veuf / veuve' },
];

const tel = (v: string) => v.replace(/\D/g, '').slice(0, 10);

interface Props {
  espace?: EspaceAgent;
  patientId: number;
  /** Localités (résidence, lieu de naissance) déjà chargées par la page */
  localites?: { id: number; nom: string }[];
  onFermer: () => void;
  onEnregistre: (nomComplet: string) => void;
}

/**
 * PARTAGÉ (infirmier·ère / médecin) — METTRE À JOUR LES INFORMATIONS D'UN PATIENT
 * Pour un nouveau-né déclaré à la naissance (« NOUVEAU-NÉ DE … ») : nom et prénoms donnés le jour où il revient pour des soins.
 * Le numéro de dossier (DM) ne change pas.
 */
export default function ModifierPatient({ espace = 'infirmier', patientId, localites = [], onFermer, onEnregistre }: Props) {
  const source = apiAgent(espace);
  const [p, setP] = useState<PatientIdentite | null>(null);
  const [verifier, setVerifier] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    source.patients
      .identite(patientId)
      .then((x) => {
        if (!actif) return;
        // Nouveau-né : le nom provisoire « NOUVEAU-NÉ DE … » est vidé pour saisir le vrai nom
        setP(x.nouveauNe ? { ...x, nom: '', prenom: x.prenom } : x);
      })
      .catch((e) => {
        alerte.echec(messageErreur(e));
        onFermer();
      });
    return () => {
      actif = false;
    };
  }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const maj = (patch: Partial<PatientIdentite>) => setP((x) => (x ? { ...x, ...patch } : x));
  const ko = (cond: boolean) => (verifier && cond ? s.invalide : '');

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p) return;
    setVerifier(true);
    const erreur = !p.nom.trim()
      ? 'Le nom est obligatoire.'
      : !p.prenom.trim()
        ? 'Le prénom est obligatoire.'
        : !p.genre
          ? 'Choisissez le sexe.'
          : p.telephone && p.telephone.length !== 10
            ? 'Le téléphone doit contenir 10 chiffres.'
            : p.contact2 && p.contact2.length !== 10
              ? 'Le 2e contact doit contenir 10 chiffres.'
              : p.urgenceTelephone && p.urgenceTelephone.length !== 10
                ? 'Le téléphone de la personne à prévenir doit contenir 10 chiffres.'
                : null;
    if (erreur) return void alerte.echec(erreur);
    setEnvoi(true);
    try {
      const vide = (x: string | null) => (x && x.trim() ? x.trim() : undefined);
      const r = await source.patients.modifier(p.id, {
        nom: p.nom.trim(),
        prenom: p.prenom.trim(),
        genre: p.genre as 'masculin' | 'feminin',
        telephone: vide(p.telephone),
        contact2: vide(p.contact2),
        situationMatrimoniale: p.situationMatrimoniale ?? undefined,
        numCmu: vide(p.numCmu),
        profession: vide(p.profession),
        adresse: vide(p.adresse),
        residence: p.residence ?? undefined,
        urgenceNom: vide(p.urgenceNom),
        urgenceTelephone: vide(p.urgenceTelephone),
        urgenceLien: vide(p.urgenceLien),
      });
      alerte.succes(r.message);
      onEnregistre(r.nomComplet);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const lieux = localites.map((l) => ({ id: l.id, name: l.nom }));

  return (
    <AnimatePresence>
      <motion.div className={m.voile} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFermer}>
        <motion.form
          className={m.fenetre}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          onSubmit={enregistrer}
          noValidate
          role="dialog"
          aria-modal="true"
          aria-labelledby="titre-maj-patient"
        >
          <header className={m.haut}>
            <span className={m.icone}>{p?.nouveauNe ? <FaBaby aria-hidden="true" /> : <FaUserEdit aria-hidden="true" />}</span>
            <div>
              <h2 id="titre-maj-patient">Mettre à jour les informations</h2>
              <p>{p ? `Dossier ${p.code ?? '—'} · le numéro de dossier, la date et le lieu de naissance ne changent pas` : 'Chargement…'}</p>
            </div>
            <button type="button" className={m.fermer} onClick={onFermer} aria-label="Fermer">
              <FaTimes />
            </button>
          </header>

          {!p ? (
            <p className={c.vide}>Chargement du dossier…</p>
          ) : (
            <div className={m.corps}>
              {p.nouveauNe && (
                <p className={m.bandeau}>
                  <FaBaby aria-hidden="true" /> Nouveau-né{p.mere ? ` de ${p.mere.nom}` : ''} : saisissez son nom et ses prénoms (déclarés à l’état civil).
                </p>
              )}

              <h3 className={m.titre}>Identité</h3>
              <div className={m.grille}>
                <div className={`${s.champ} ${ko(!p.nom.trim())}`}>
                  <label htmlFor="maj-nom">
                    Nom <span className={s.requis}>*</span>
                  </label>
                  <input id="maj-nom" maxLength={191} placeholder="Ex. KOUASSI" value={p.nom} onChange={(e) => maj({ nom: e.target.value })} autoFocus />
                </div>
                <div className={`${s.champ} ${ko(!p.prenom.trim())}`}>
                  <label htmlFor="maj-prenom">
                    Prénom(s) <span className={s.requis}>*</span>
                  </label>
                  <input id="maj-prenom" maxLength={191} placeholder="Ex. Aya Marie" value={p.prenom} onChange={(e) => maj({ prenom: e.target.value })} />
                </div>
                <div className={`${s.champ} ${ko(!p.genre)}`}>
                  <span className={s.etiquette}>
                    Sexe <span className={s.requis}>*</span>
                  </span>
                  <div className={s.choix} role="radiogroup" aria-label="Sexe">
                    {(['masculin', 'feminin'] as const).map((g) => (
                      <button key={g} type="button" role="radio" aria-checked={p.genre === g} className={`${s.option} ${p.genre === g ? s.optionActive : ''}`} onClick={() => maj({ genre: g })}>
                        {g === 'masculin' ? 'Masculin' : 'Féminin'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={s.champ}>
                  <label htmlFor="maj-naissance">Date de naissance</label>
                  <input id="maj-naissance" value={p.dateNaissance ? p.dateNaissance.split('-').reverse().join('/') : 'Non renseignée'} disabled title="La date de naissance ne peut pas être modifiée" />
                </div>
                <div className={s.champ}>
                  <label htmlFor="maj-lieu">Lieu de naissance</label>
                  <input
                    id="maj-lieu"
                    value={p.lieuNaissanceNom ?? localites.find((l) => l.id === p.lieuNaissance)?.nom ?? 'Non renseigné'}
                    disabled
                    title={p.nouveauNe || p.mere ? 'Né à l’hôpital : localité de l’hôpital de naissance' : 'Lieu de naissance indiqué à l’inscription'}
                  />
                </div>
                {!p.nouveauNe && (
                  <div className={s.champ}>
                    <label htmlFor="maj-situation">Situation matrimoniale</label>
                    <select id="maj-situation" className={s.select} value={p.situationMatrimoniale ?? ''} onChange={(e) => maj({ situationMatrimoniale: e.target.value || null })}>
                      <option value="">— Non renseignée —</option>
                      {SITUATIONS.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.libelle}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <h3 className={m.titre}>Contacts</h3>
              <div className={m.grille}>
                <div className={`${s.champ} ${ko(!!p.telephone && p.telephone.length !== 10)}`}>
                  <label htmlFor="maj-tel">Téléphone{p.nouveauNe ? ' (parent)' : ''}</label>
                  <input id="maj-tel" inputMode="numeric" value={p.telephone ?? ''} onChange={(e) => maj({ telephone: tel(e.target.value) || null })} />
                </div>
                <div className={`${s.champ} ${ko(!!p.contact2 && p.contact2.length !== 10)}`}>
                  <label htmlFor="maj-tel2">2e contact</label>
                  <input id="maj-tel2" inputMode="numeric" value={p.contact2 ?? ''} onChange={(e) => maj({ contact2: tel(e.target.value) || null })} />
                </div>
                <div className={s.champ}>
                  <label htmlFor="maj-residence">Résidence actuelle</label>
                  <SelectRecherche
                    id="maj-residence"
                    options={lieux}
                    value={p.residence}
                    onChange={(id) => maj({ residence: id })}
                    placeholder="-- Choisir --"
                    placeholderRecherche="Rechercher une localité…"
                    aucunResultat="Aucune localité"
                    optionVide="Non renseignée"
                  />
                </div>
                <div className={s.champ}>
                  <label htmlFor="maj-adresse">Adresse</label>
                  <input id="maj-adresse" maxLength={191} value={p.adresse ?? ''} onChange={(e) => maj({ adresse: e.target.value || null })} />
                </div>
                <div className={s.champ}>
                  <label htmlFor="maj-cmu">N° CMU</label>
                  <input id="maj-cmu" maxLength={191} value={p.numCmu ?? ''} onChange={(e) => maj({ numCmu: e.target.value || null })} />
                </div>
                {!p.nouveauNe && (
                  <div className={s.champ}>
                    <label htmlFor="maj-profession">Profession</label>
                    <input id="maj-profession" maxLength={191} value={p.profession ?? ''} onChange={(e) => maj({ profession: e.target.value || null })} />
                  </div>
                )}
              </div>

              <h3 className={m.titre}>Personne à prévenir</h3>
              <div className={m.grille}>
                <div className={s.champ}>
                  <label htmlFor="maj-urg-nom">Nom</label>
                  <input id="maj-urg-nom" maxLength={191} value={p.urgenceNom ?? ''} onChange={(e) => maj({ urgenceNom: e.target.value || null })} />
                </div>
                <div className={`${s.champ} ${ko(!!p.urgenceTelephone && p.urgenceTelephone.length !== 10)}`}>
                  <label htmlFor="maj-urg-tel">Téléphone</label>
                  <input id="maj-urg-tel" inputMode="numeric" value={p.urgenceTelephone ?? ''} onChange={(e) => maj({ urgenceTelephone: tel(e.target.value) || null })} />
                </div>
                <div className={s.champ}>
                  <label htmlFor="maj-urg-lien">Lien</label>
                  <input id="maj-urg-lien" maxLength={191} placeholder="Mère, père, conjoint…" value={p.urgenceLien ?? ''} onChange={(e) => maj({ urgenceLien: e.target.value || null })} />
                </div>
              </div>
            </div>
          )}

          <footer className={m.pied}>
            <button type="button" className={c.secondaire} onClick={onFermer} disabled={envoi}>
              Annuler
            </button>
            <button type="submit" className={c.principal} disabled={envoi || !p}>
              <FaSave aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </footer>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
