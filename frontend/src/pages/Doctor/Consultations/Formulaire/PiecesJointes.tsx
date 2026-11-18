import { useRef, useState } from 'react';
import { FaDownload, FaFileAlt, FaFileImage, FaFilePdf, FaPaperclip, FaPlus, FaTrashAlt } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../../services/alertes';
import type { ApiFormulaireConsultation } from '../../../../services/api';
import { useEspaceConsultation } from './espace';
import type { DocumentReference } from '../../../../types';
import s from './FormulaireConsultation.module.css';

export const FORMATS = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
const MAX = 10 * 1024 * 1024;

export interface PieceEnAttente {
  libelle: string;
  fichier: File;
}

const taille = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);
const icone = (type: string) => (type.includes('pdf') ? FaFilePdf : type.startsWith('image/') ? FaFileImage : FaFileAlt);

/** Libellé par défaut : nom du fichier sans son extension */
const libelleParDefaut = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 191) || 'Document';

/**
 * Saisie d'un document : libellé + fichier.
 * Choisir le fichier l'AJOUTE AUSSITÔT (libellé saisi, sinon le nom du fichier) : un fichier choisi n'est plus perdu
 * parce qu'on a oublié de cliquer sur « Joindre ».
 */
function AjoutPiece({ onAjout, enCours, compact }: { onAjout: (p: PieceEnAttente) => void | Promise<void>; enCours?: boolean; compact?: boolean }) {
  const [libelle, setLibelle] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  const ajouter = async (f: File | null = fichier) => {
    if (!f) {
      alerte.attention('Choisissez le fichier à joindre.');
      return;
    }
    if (f.size > MAX) {
      alerte.attention(`« ${f.name} » dépasse 10 Mo.`);
      if (champ.current) champ.current.value = '';
      setFichier(null);
      return;
    }
    await onAjout({ libelle: libelle.trim() || libelleParDefaut(f), fichier: f });
    setLibelle('');
    setFichier(null);
    if (champ.current) champ.current.value = '';
  };

  return (
    <div className={`${s.ajoutPiece} ${compact ? s.ajoutPieceCompact : ''}`}>
      <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Libellé du document (ex. : Résultat NFS)" aria-label="Libellé du document" maxLength={191} />
      <label className={s.choixFichier}>
        <FaPaperclip aria-hidden="true" />
        <span>{fichier ? fichier.name : 'Choisir un fichier'}</span>
        <input
          ref={champ}
          type="file"
          accept={FORMATS}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFichier(f);
            if (f) void ajouter(f);
          }}
        />
      </label>
      <button type="button" className={s.boutonAjout} onClick={() => void ajouter()} disabled={enCours}>
        <FaPlus aria-hidden="true" /> {enCours ? 'Envoi…' : 'Joindre'}
      </button>
    </div>
  );
}

/** Étape 4 : documents préparés avant l'enregistrement (envoyés juste après) */
export function PiecesAJoindre({
  pieces,
  onChange,
  compact,
  facultatif,
}: {
  pieces: PieceEnAttente[];
  onChange: (p: PieceEnAttente[]) => void;
  compact?: boolean;
  /** Documents facultatifs (ex. résultat de l'expert) */
  facultatif?: boolean;
}) {
  // compact : dans une colonne (télé-expertise en interne), sans cadre
  return (
    <div className={compact ? s.piecesCompact : s.hospBloc}>
      <h3 className={s.sousTitre}>
        <FaPaperclip aria-hidden="true" /> {compact ? 'Documents' : facultatif ? 'Documents joints' : 'Documents à partager'} {!facultatif && <em className={s.requis}>*</em>}
        {compact && facultatif && <small className={s.facultatif}>(facultatif)</small>}
        {!compact && <small className={s.facultatif}>PDF, image ou Word, 10 Mo maximum</small>}
      </h3>
      <AjoutPiece compact={compact} onAjout={(p) => onChange([...pieces, p])} />
      {pieces.length > 0 && (
        <ul className={s.pieces}>
          {pieces.map((p, i) => {
            const Icone = icone(p.fichier.type);
            return (
              <li key={`${p.libelle}-${i}`}>
                <Icone aria-hidden="true" />
                <span>
                  <strong>{p.libelle}</strong>
                  <small>
                    {p.fichier.name} · {taille(p.fichier.size)}
                  </small>
                </span>
                <button type="button" className={s.retirer} onClick={() => onChange(pieces.filter((_, j) => j !== i))} aria-label={`Retirer ${p.libelle}`}>
                  <FaTrashAlt />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Envoi groupé des documents d'une consultation référée */
export async function envoyerPieces(api: ApiFormulaireConsultation, consultationId: number, pieces: PieceEnAttente[]) {
  const fd = new FormData();
  pieces.forEach((p) => {
    fd.append('fichiers', p.fichier);
    fd.append('libelles', p.libelle);
  });
  return api.references.ajouter(consultationId, fd);
}

/** Fiche : documents de la référence (télécharger, retirer, en ajouter) */
export function DocumentsReference({ consultationId, documents, onChange }: { consultationId: number; documents: DocumentReference[]; onChange: (d: DocumentReference[]) => void }) {
  const [envoi, setEnvoi] = useState(false);
  const { api } = useEspaceConsultation();

  const ajouter = async (p: PieceEnAttente) => {
    setEnvoi(true);
    try {
      const r = await envoyerPieces(api, consultationId, [p]);
      onChange(r.documents);
      alerte.succes(r.message);
    } catch (e) {
      alerte.echec(messageErreur(e));
      throw e;
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (d: DocumentReference) => {
    if (!window.confirm(`Retirer « ${d.libelle} » de la référence ?`)) return;
    try {
      const r = await api.references.supprimer(consultationId, d.id);
      onChange(documents.filter((x) => x.id !== d.id));
      alerte.succes(r.message);
    } catch (e) {
      alerte.echec(messageErreur(e));
    }
  };

  return (
    <div className={s.documentsFiche}>
      <span className={s.sousTitre}>
        <FaPaperclip aria-hidden="true" /> Documents de la référence
      </span>
      {documents.length === 0 ? (
        <p className={s.note}>Aucun document joint.</p>
      ) : (
        <ul className={s.pieces}>
          {documents.map((d) => {
            const Icone = icone(d.type);
            return (
              <li key={d.id}>
                <Icone aria-hidden="true" />
                <span>
                  <strong>{d.libelle}</strong>
                  <small>
                    {d.nom} · {taille(d.taille)}
                  </small>
                </span>
                <button
                  type="button"
                  className={s.telechargerPiece}
                  onClick={() => api.references.telecharger(consultationId, d.id, d.nom).catch((e) => alerte.echec(messageErreur(e)))}
                  aria-label={`Télécharger ${d.libelle}`}
                >
                  <FaDownload />
                </button>
                <button type="button" className={s.retirer} onClick={() => retirer(d)} aria-label={`Retirer ${d.libelle}`}>
                  <FaTrashAlt />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <AjoutPiece onAjout={ajouter} enCours={envoi} />
    </div>
  );
}
