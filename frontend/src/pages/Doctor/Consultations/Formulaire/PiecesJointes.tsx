import { useRef, useState } from 'react';
import { FaDownload, FaFileAlt, FaFileImage, FaFilePdf, FaPaperclip, FaPlus, FaTrashAlt } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
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

/** Saisie d'un document : libellé obligatoire + fichier */
function AjoutPiece({ onAjout, enCours }: { onAjout: (p: PieceEnAttente) => void | Promise<void>; enCours?: boolean }) {
  const [libelle, setLibelle] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  const ajouter = async () => {
    if (!libelle.trim()) {
      alerte.attention('Précisez le libellé du document (ex. : Résultat NFS, Radiographie thoracique…).');
      return;
    }
    if (!fichier) {
      alerte.attention('Choisissez le fichier à joindre.');
      return;
    }
    if (fichier.size > MAX) {
      alerte.attention(`« ${fichier.name} » dépasse 10 Mo.`);
      return;
    }
    await onAjout({ libelle: libelle.trim(), fichier });
    setLibelle('');
    setFichier(null);
    if (champ.current) champ.current.value = '';
  };

  return (
    <div className={s.ajoutPiece}>
      <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Libellé du document (ex. : Résultat NFS)" aria-label="Libellé du document" maxLength={191} />
      <label className={s.choixFichier}>
        <FaPaperclip aria-hidden="true" />
        <span>{fichier ? fichier.name : 'Choisir un fichier'}</span>
        <input ref={champ} type="file" accept={FORMATS} onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
      </label>
      <button type="button" className={s.boutonAjout} onClick={ajouter} disabled={enCours}>
        <FaPlus aria-hidden="true" /> {enCours ? 'Envoi…' : 'Joindre'}
      </button>
    </div>
  );
}

/** Étape 4 : documents préparés avant l'enregistrement (envoyés juste après) */
export function PiecesAJoindre({ pieces, onChange }: { pieces: PieceEnAttente[]; onChange: (p: PieceEnAttente[]) => void }) {
  return (
    <div className={s.hospBloc}>
      <h3 className={s.sousTitre}>
        <FaPaperclip aria-hidden="true" /> Documents à joindre à la référence <small className={s.facultatif}>facultatif · PDF, image ou Word, 10 Mo maximum</small>
      </h3>
      <AjoutPiece onAjout={(p) => onChange([...pieces, p])} />
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
export async function envoyerPieces(consultationId: number, pieces: PieceEnAttente[]) {
  const fd = new FormData();
  pieces.forEach((p) => {
    fd.append('fichiers', p.fichier);
    fd.append('libelles', p.libelle);
  });
  return api.doctor.consultations.references.ajouter(consultationId, fd);
}

/** Fiche : documents de la référence (télécharger, retirer, en ajouter) */
export function DocumentsReference({ consultationId, documents, onChange }: { consultationId: number; documents: DocumentReference[]; onChange: (d: DocumentReference[]) => void }) {
  const [envoi, setEnvoi] = useState(false);

  const ajouter = async (p: PieceEnAttente) => {
    setEnvoi(true);
    try {
      const r = await envoyerPieces(consultationId, [p]);
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
      const r = await api.doctor.consultations.references.supprimer(consultationId, d.id);
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
                  onClick={() => api.doctor.consultations.references.telecharger(consultationId, d.id, d.nom).catch((e) => alerte.echec(messageErreur(e)))}
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
