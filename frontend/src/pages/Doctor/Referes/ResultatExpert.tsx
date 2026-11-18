import { motion } from 'framer-motion';
import { useState } from 'react';
import { FaCheckCircle, FaClipboardCheck, FaDownload, FaFileAlt, FaFileImage, FaFilePdf, FaPaperPlane, FaTimes } from 'react-icons/fa';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DocumentReference, RefereDetail } from '../../../types';
import { PiecesAJoindre, type PieceEnAttente } from '../Consultations/Formulaire/PiecesJointes';
import { heure, jour } from '../Consultations/ListeConsultations';
import Chrono, { delaiExpertise } from '../Telemedecine/Chrono';
import { BadgeDelai } from '../Telemedecine/Telemedecine';
import s from './Referes.module.css';

const taille = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);
const icone = (type: string) => (type.includes('pdf') ? FaFilePdf : type.startsWith('image/') ? FaFileImage : FaFileAlt);

/** Documents (téléchargeables) d'un résultat d'expertise */
export function ListeDocumentsResultat({ documents, telecharger }: { documents: DocumentReference[]; telecharger: (x: DocumentReference) => Promise<void> }) {
  return (
    <>
      <h3 className={s.sousTitreResultat}>Documents joints par l’expert</h3>
      {!documents.length ? (
        <p className={s.note}>Aucun document joint par l’expert.</p>
      ) : (
    <ul className={s.documents}>
      {documents.map((x) => {
        const Icone = icone(x.type);
        return (
          <li key={x.id}>
            <Icone aria-hidden="true" />
            <span>
              <strong>{x.libelle}</strong>
              <small>
                {x.nom} · {taille(x.taille)}
              </small>
            </span>
            <button type="button" className={c.secondaire} onClick={() => telecharger(x).catch((e) => alerte.echec(messageErreur(e)))}>
              <FaDownload aria-hidden="true" /> Télécharger
            </button>
          </li>
        );
      })}
    </ul>
      )}
    </>
  );
}

/** Avis, conduite à tenir et documents d'un résultat envoyé */
export function ContenuResultat({
  avis,
  conduite,
  le,
  dansDelai,
  documents,
  telecharger,
}: {
  avis: string | null;
  conduite: string | null;
  le: string | null;
  dansDelai: boolean | null;
  documents: DocumentReference[];
  telecharger: (x: DocumentReference) => Promise<void>;
}) {
  return (
    <>
      <p className={s.note}>
        <FaCheckCircle aria-hidden="true" /> Réponse envoyée {le ? `le ${jour(le)} à ${heure(le)}` : ''}
        {dansDelai !== null && (
          <span className={`${c.badge} ${dansDelai ? c.badgeOk : s.badgeRetardResultat}`}>{dansDelai ? 'Dans le délai' : 'En retard'}</span>
        )}
      </p>
      <h3 className={s.sousTitreResultat}>Avis / conclusion</h3>
      <p className={s.texteResultat}>{avis ?? '—'}</p>
      {conduite && (
        <>
          <h3 className={s.sousTitreResultat}>Consignes au requérant</h3>
          <p className={s.texteResultat}>{conduite}</p>
        </>
      )}
      <ListeDocumentsResultat documents={documents} telecharger={telecharger} />
    </>
  );
}

/** Résultat déjà envoyé : l'expert ajoute des documents (envoyés dès qu'ils sont choisis) */
function AjoutDocumentsResultat({ origineId, onAjoute }: { origineId: number; onAjoute: () => void }) {
  const [pieces, setPieces] = useState<PieceEnAttente[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = async (liste: PieceEnAttente[]) => {
    setPieces(liste);
    if (!liste.length) return;
    setEnvoi(true);
    try {
      const fd = new FormData();
      for (const p of liste) {
        fd.append('fichiers', p.fichier);
        fd.append('libelles', p.libelle);
      }
      const r = await api.doctor.referes.ajouterDocumentsResultat(origineId, fd);
      alerte.succes(r.message);
      setPieces([]);
      onAjoute();
    } catch (e) {
      alerte.echec(messageErreur(e));
      setPieces([]);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div className={s.ajoutResultat}>
      <PiecesAJoindre pieces={pieces} onChange={(l) => void envoyer(l)} facultatif />
      {envoi && <p className={s.note}>Envoi du document…</p>}
    </div>
  );
}

/**
 * MÉDECIN (EXPERT) > TÉLÉ-EXPERTISE : délai de réponse et résultat.
 *   - délai : urgente (< 30 min) ou programmée (24 à 48 h), compte à rebours jusqu'à l'heure limite ;
 *   - le médecin sollicité joint son résultat (avis obligatoire, conduite à tenir, documents) : envoyé une seule fois,
 *     il clôt la télé-expertise et arrive chez le demandeur dans « Résultats d'expertise ».
 */
export default function ResultatExpert({ d, onEnvoye, ouvrir }: { d: RefereDetail; onEnvoye: () => void; /** Arrivée après la consultation : formulaire ouvert */ ouvrir?: boolean }) {
  const [ouvert, setOuvert] = useState(!!ouvrir);
  const [avis, setAvis] = useState('');
  const [conduite, setConduite] = useState('');
  const [pieces, setPieces] = useState<PieceEnAttente[]>([]);
  const [confirmation, setConfirmation] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const telecharger = (x: DocumentReference) => api.doctor.referes.telecharger(d.origineId, x.id, x.nom);

  const envoyer = async () => {
    setEnvoi(true);
    try {
      const fd = new FormData();
      fd.append('avis', avis.trim());
      if (conduite.trim()) fd.append('conduite', conduite.trim());
      for (const p of pieces) {
        fd.append('fichiers', p.fichier);
        fd.append('libelles', p.libelle);
      }
      const r = await api.doctor.referes.envoyerResultat(d.origineId, fd);
      alerte.succes(r.message);
      setOuvert(false);
      onEnvoye();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnvoi(false);
      setConfirmation(false);
    }
  };

  return (
    <section className={c.bloc}>
      <h2 className={s.titreBloc}>
        <FaClipboardCheck aria-hidden="true" /> Réponse de la télé-expertise
      </h2>

      {/* Délai de réponse */}
      <div className={s.delaiReponse}>
        <BadgeDelai urgente={d.urgente} />
        <span className={s.note}>
          {d.urgente ? 'Urgente (synchrone) : réponse attendue en moins de 30 minutes.' : 'Programmée (asynchrone) : réponse attendue en 24 à 48 heures.'}
        </span>
        {!d.resultat && d.echeance && <Chrono recueLe={d.date} date={null} heure={null} echeance={d.echeance} delai={delaiExpertise(d)} />}
      </div>

      {d.resultat ? (
        <>
        <ContenuResultat
          avis={d.resultat.avis}
          conduite={d.resultat.conduite}
          le={d.resultat.le}
          dansDelai={d.resultat.dansDelai}
          documents={d.resultat.documents}
          telecharger={telecharger}
        />
          {/* Expert : compléter le résultat avec des documents (ex. oubliés à l'envoi) */}
          {d.estExpert && <AjoutDocumentsResultat origineId={d.origineId} onAjoute={onEnvoye} />}
        </>
      ) : !d.peutRepondre ? (
        <p className={s.note}>La réponse sera jointe par le médecin qui traite cette télé-expertise.</p>
      ) : !ouvert ? (
        <div className={s.barreResultat}>
          <span className={s.note}>Une fois la consultation terminée, joignez votre avis et vos consignes : ils seront envoyés au requérant.</span>
          <button type="button" className={c.principal} onClick={() => setOuvert(true)}>
            <FaPaperPlane aria-hidden="true" /> Joindre la réponse
          </button>
        </div>
      ) : (
        <motion.form
          className={s.formResultat}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!avis.trim()) return void alerte.attention('L’avis / la conclusion est obligatoire.');
            setConfirmation(true);
          }}
          noValidate
        >
          <label className={s.champResultat}>
            <span>
              Avis / conclusion <em>*</em>
            </span>
            <textarea rows={4} maxLength={10000} value={avis} onChange={(e) => setAvis(e.target.value)} placeholder="Votre avis d’expert sur le cas présenté…" autoFocus />
          </label>
          <label className={s.champResultat}>
            <span>Consignes au requérant</span>
            <textarea
              rows={4}
              maxLength={10000}
              value={conduite}
              onChange={(e) => setConduite(e.target.value)}
              placeholder="Ce que le requérant doit faire : traitement à donner, examens à demander, surveillance, orientation, quand recontacter…"
            />
          </label>
          <PiecesAJoindre pieces={pieces} onChange={setPieces} facultatif />
          <div className={s.piedResultat}>
            <button type="button" className={c.secondaire} onClick={() => setOuvert(false)} disabled={envoi}>
              <FaTimes aria-hidden="true" /> Annuler
            </button>
            <button type="submit" className={c.principal} disabled={envoi}>
              <FaPaperPlane aria-hidden="true" /> {envoi ? 'Envoi…' : 'Envoyer la réponse'}
            </button>
          </div>
        </motion.form>
      )}

      <ConfirmDialog
        ouvert={confirmation}
        titre="Envoyer la réponse ?"
        message="La réponse sera envoyée au demandeur et la télé-expertise sera close. Elle ne pourra plus être modifiée."
        confirmer="Envoyer"
        enCours={envoi}
        onConfirmer={envoyer}
        onAnnuler={() => setConfirmation(false)}
      />
    </section>
  );
}
