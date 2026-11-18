import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { FaArrowLeft, FaCalendarPlus, FaCheck, FaSearch, FaShareSquare, FaUserCheck, FaVideo } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { apiAgent, apiProgrammationTelemedecine } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { InfirmierPatientItem, RecherchePatientFilters } from '../../../../types';
import ChoixMedecinReference, { ChoixServiceExterne, momentReferenceValide, momentReferenceVide, type MomentReference } from '../../Consultations/Formulaire/ChoixMedecinReference';
import { EspaceConsultationContexte, outilsEspace } from '../../Consultations/Formulaire/espace';
import IssueTelemedecine, { telemedecineManque, telemedecinePayload, telemedecineVide, type TelemedecineSaisie } from '../../Consultations/Formulaire/IssueTelemedecine';
import { envoyerPieces, PiecesAJoindre, type PieceEnAttente } from '../../Consultations/Formulaire/PiecesJointes';
import f from '../../Consultations/Formulaire/FormulaireConsultation.module.css';
import s from './ProgrammerTelemedecine.module.css';

type Espace = 'medecin' | 'infirmier';
type Critere = keyof RecherchePatientFilters;

const CRITERES: { id: Critere; libelle: string; exemple: string }[] = [
  { id: 'fullname', libelle: 'Nom', exemple: 'Nom et prénoms' },
  { id: 'code_patient', libelle: 'N° de dossier', exemple: 'Ex. DM2024…' },
  { id: 'telephone', libelle: 'Téléphone', exemple: '0700000000' },
  { id: 'num_cmu', libelle: 'N° CMU', exemple: 'N° CMU' },
];

const URGENTE = 'Urgente · moins de 30 min';
const PROGRAMMEE = 'Programmée · 24 à 48 h';

/** Choix segmenté */
function Segments({ valeur, options, onChange, nom }: { valeur: string | null; options: string[]; onChange: (v: string) => void; nom: string }) {
  return (
    <div className={f.segments} role="radiogroup" aria-label={nom}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={valeur === o} className={valeur === o ? f.segmentActif : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * MÉDECIN / INFIRMIER·ÈRE > TÉLÉMÉDECINE > PROGRAMMER
 * 1. rechercher le patient · 2. téléconsultation (hôpital, médecin, date, heure) ou télé-expertise
 * (interne / externe, urgente / programmée, service, médecin, documents) · 3. motif → programmation directe.
 * Mêmes champs et mêmes contrôles que l'issue du formulaire de consultation.
 */
function Programmer({ espace }: { espace: Espace }) {
  const navigate = useNavigate();
  const retour = espace === 'infirmier' ? '/infirmier/teleconsultations' : '/medecin/telemedecine';
  const { api } = outilsEspace(espace);

  // 1. Patient
  const [critere, setCritere] = useState<Critere>('fullname');
  const [texte, setTexte] = useState('');
  const [resultats, setResultats] = useState<InfirmierPatientItem[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [patient, setPatient] = useState<InfirmierPatientItem | null>(null);

  // 2. Programmation
  const [type, setType] = useState<'teleconsultation' | 'teleexpertise' | null>(null);
  const [tele, setTele] = useState<TelemedecineSaisie>(telemedecineVide());
  const [portee, setPortee] = useState<'refere-interne' | 'refere-externe' | null>(null);
  const [moment, setMoment] = useState<MomentReference>(momentReferenceVide());
  // Interne : service (obligatoire) + médecin (facultatif) ; externe : service (obligatoire) + hôpital et médecin (facultatifs)
  const [serviceInterne, setServiceInterne] = useState<number | null>(null);
  const [medecin, setMedecin] = useState<number | null>(null);
  const [serviceExterne, setServiceExterne] = useState<number | null>(null);
  const [hopitalExterne, setHopitalExterne] = useState<number | null>(null);
  const [medecinExterne, setMedecinExterne] = useState<number | null>(null);
  const [pieces, setPieces] = useState<PieceEnAttente[]>([]);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const rechercher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texte.trim()) return void alerte.attention('Saisissez ce que vous recherchez.');
    setRecherche(true);
    try {
      setResultats(await apiAgent(espace).patients.rechercher({ [critere]: texte.trim() }));
    } catch (err) {
      alerte.echec(`Recherche impossible : ${messageErreur(err)}`);
    } finally {
      setRecherche(false);
    }
  };

  const programmer = async () => {
    if (!patient) return void alerte.attention('Recherchez puis choisissez le patient.');
    if (!type) return void alerte.attention('Choisissez une téléconsultation ou une télé-expertise.');
    if (!motif.trim()) return void alerte.attention('Le motif de la demande est obligatoire.');
    const payload: Record<string, unknown> = { patientId: patient.id, motif: motif.trim(), justification: motif.trim() };
    if (type === 'teleconsultation') {
      // Interne / externe, service, date et heure obligatoires ; hôpital (externe) et médecin facultatifs
      const manque = telemedecineManque(tele);
      if (manque) return void alerte.attention(manque);
      Object.assign(payload, { modeSortie: 'teleconsultation', ...telemedecinePayload(tele) });
    } else {
      if (!portee) return void alerte.attention('Télé-expertise : précisez si elle est en interne ou en externe.');
      if (moment.urgente === null) return void alerte.attention('Télé-expertise : choisissez le type de demande (urgente ou programmée).');
      if (!momentReferenceValide(moment)) return void alerte.attention('Télé-expertise programmée : choisissez une date et une heure à venir, dans les 48 heures.');
      if (portee === 'refere-interne' && !serviceInterne) return void alerte.attention('Choisissez le service auquel vous adressez la télé-expertise.');
      if (portee === 'refere-externe' && !serviceExterne) return void alerte.attention('Choisissez le service auquel vous adressez la télé-expertise.');
      // Documents à partager facultatifs (interne comme externe)
      Object.assign(
        payload,
        { modeSortie: portee },
        // Sans médecin : tous les médecins du service la reçoivent, le premier qui la prend en charge l'obtient
        portee === 'refere-interne'
          ? { referenceServiceHospitalId: serviceInterne, ...(medecin ? { medecinReferenceId: medecin } : {}) }
          : {
              referenceServiceId: serviceExterne,
              ...(hopitalExterne ? { referenceHopitalId: hopitalExterne } : {}),
              ...(hopitalExterne && medecinExterne ? { medecinReferenceId: medecinExterne } : {}),
            },
        moment.urgente ? { referenceUrgente: true } : { referenceUrgente: false, referenceDate: moment.date, referenceHeure: moment.heure },
      );
    }

    setEnvoi(true);
    try {
      const r = await apiProgrammationTelemedecine(espace)(payload);
      // Télé-expertise : documents partagés joints juste après
      if (type === 'teleexpertise' && pieces.length) {
        try {
          await envoyerPieces(api, r.consultationId, pieces);
        } catch (err) {
          alerte.echec(`Programmation enregistrée, mais les documents n’ont pas pu être joints : ${messageErreur(err)}`);
        }
      }
      alerte.succes(type === 'teleconsultation' ? 'Téléconsultation programmée.' : 'Télé-expertise envoyée.');
      navigate(retour);
    } catch (err) {
      alerte.echec(`Programmation impossible : ${messageErreur(err)}`);
    } finally {
      setEnvoi(false);
    }
  };

  const changerPatient = () => {
    setPatient(null);
    setType(null);
  };

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Télémédecine</p>
          <h1 className={c.titre}>Programmer un acte de télémédecine</h1>
        </div>
        <button type="button" className={c.secondaire} onClick={() => navigate(retour)}>
          <FaArrowLeft aria-hidden="true" /> Télémédecine
        </button>
      </header>

      {/* --- 1. Patient --- */}
      <section className={c.bloc}>
        <h2 className={s.titre}>
          <span className={s.numero}>1</span> Patient
        </h2>
        {patient ? (
          <div className={s.patientChoisi}>
            <FaUserCheck aria-hidden="true" />
            <span>
              <strong>{patient.nomComplet}</strong>
              <small>
                {patient.codePatient}
                {patient.telephone ? ` · ${patient.telephone}` : ''}
                {patient.dateNaissance ? ` · né(e) le ${patient.dateNaissance.slice(0, 10).split('-').reverse().join('/')}` : ''}
              </small>
            </span>
            <button type="button" className={c.secondaire} onClick={changerPatient}>
              Changer
            </button>
          </div>
        ) : (
          <>
            <form className={s.recherche} onSubmit={rechercher}>
              <select value={critere} onChange={(e) => setCritere(e.target.value as Critere)} aria-label="Rechercher par">
                {CRITERES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.libelle}
                  </option>
                ))}
              </select>
              <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={CRITERES.find((x) => x.id === critere)?.exemple} aria-label="Recherche" autoFocus />
              <button type="submit" className={c.principal} disabled={recherche}>
                <FaSearch aria-hidden="true" /> {recherche ? 'Recherche…' : 'Rechercher'}
              </button>
            </form>
            {resultats && (
              <ul className={s.resultats}>
                {resultats.length === 0 && <li className={s.vide}>Aucun patient trouvé.</li>}
                {resultats.map((p) => (
                  <li key={p.id}>
                    {/* Informations du patient sur une ligne, jusqu'au bouton « Choisir » */}
                    <dl className={s.infos}>
                      {[
                        ['Patient', p.nomComplet],
                        ['N° de dossier', p.codePatient],
                        ['Sexe', p.genre ? (p.genre.toLowerCase().startsWith('f') ? 'Féminin' : 'Masculin') : null],
                        ['Né(e) le', p.dateNaissance ? p.dateNaissance.slice(0, 10).split('-').reverse().join('/') : null],
                        ['Téléphone', p.telephone],
                        ['Résidence', p.residence],
                      ].map(([libelle, valeur]) => (
                        <div key={libelle}>
                          <dt>{libelle}</dt>
                          <dd>{valeur || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                    <button type="button" className={c.secondaire} onClick={() => setPatient(p)}>
                      Choisir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* --- 2. Programmation --- */}
      <AnimatePresence>
        {patient && (
          <motion.section className={c.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h2 className={s.titre}>
              <span className={s.numero}>2</span> Programmation
            </h2>
            <div className={s.types} role="radiogroup" aria-label="Type de télémédecine">
              {[
                { id: 'teleconsultation' as const, titre: 'Téléconsultation', detail: 'Avec un médecin à distance', icone: FaVideo },
                { id: 'teleexpertise' as const, titre: 'Télé-expertise', detail: 'Avis sur documents, interne ou externe', icone: FaShareSquare },
              ].map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={type === t.id} className={`${s.type} ${type === t.id ? s.typeActif : ''}`} onClick={() => setType(t.id)}>
                  <t.icone aria-hidden="true" />
                  <span>
                    <strong>{t.titre}</strong>
                    <small>{t.detail}</small>
                  </span>
                </button>
              ))}
            </div>

            {type === 'teleconsultation' && <IssueTelemedecine valeur={tele} onChange={setTele} />}

            {type === 'teleexpertise' && (
              <div className={s.expertise}>
                <div className={f.ligneChoixDouble}>
                <div className={f.ligneChoix}>
                  <span className={f.sousTitre}>
                    Télé-expertise <em className={f.requis}>*</em>
                  </span>
                  <Segments
                    nom="Télé-expertise en interne ou en externe"
                    valeur={portee === 'refere-interne' ? 'En interne' : portee === 'refere-externe' ? 'En externe' : null}
                    options={['En interne', 'En externe']}
                    onChange={(x) => setPortee(x === 'En interne' ? 'refere-interne' : 'refere-externe')}
                  />
                </div>
                <div className={f.ligneChoix}>
                  <span className={f.sousTitre}>
                    Type de demande <em className={f.requis}>*</em>
                  </span>
                  <Segments
                    nom="Type de télé-expertise"
                    valeur={moment.urgente === true ? URGENTE : moment.urgente === false ? PROGRAMMEE : null}
                    options={[URGENTE, PROGRAMMEE]}
                    onChange={(x) => setMoment((m) => ({ ...m, urgente: x === URGENTE }))}
                  />
                </div>
                </div>
                {portee && (
                  <>
                    {portee === 'refere-interne' ? (
                      <ChoixMedecinReference
                        serviceId={serviceInterne}
                        onService={setServiceInterne}
                        valeur={medecin}
                        onChange={setMedecin}
                        moment={moment}
                        onMoment={setMoment}
                        documents={<PiecesAJoindre compact facultatif pieces={pieces} onChange={setPieces} />}
                      />
                    ) : (
                      <ChoixServiceExterne
                        valeur={serviceExterne}
                        onChange={setServiceExterne}
                        hopital={hopitalExterne}
                        onHopital={setHopitalExterne}
                        medecin={medecinExterne}
                        onMedecin={setMedecinExterne}
                        moment={moment}
                        onMoment={setMoment}
                        documents={<PiecesAJoindre compact facultatif pieces={pieces} onChange={setPieces} />}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {type && (
              <label className={s.motif}>
                <span>
                  Motif de la demande <em>*</em>
                </span>
                <textarea rows={3} maxLength={1000} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif et résumé du cas pour le médecin sollicité…" />
              </label>
            )}

            {type && (
              <footer className={s.pied}>
                <button type="button" className={c.secondaire} onClick={() => navigate(retour)} disabled={envoi}>
                  Annuler
                </button>
                <button type="button" className={c.principal} onClick={programmer} disabled={envoi}>
                  {type === 'teleconsultation' ? <FaCalendarPlus aria-hidden="true" /> : <FaCheck aria-hidden="true" />}{' '}
                  {envoi ? 'Enregistrement…' : type === 'teleconsultation' ? 'Programmer la téléconsultation' : 'Envoyer la télé-expertise'}
                </button>
              </footer>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Mêmes composants que le formulaire de consultation, branchés sur l'API de l'espace */
export default function ProgrammerTelemedecine({ espace }: { espace: Espace }) {
  return (
    <EspaceConsultationContexte.Provider value={espace}>
      <Programmer espace={espace} />
    </EspaceConsultationContexte.Provider>
  );
}
