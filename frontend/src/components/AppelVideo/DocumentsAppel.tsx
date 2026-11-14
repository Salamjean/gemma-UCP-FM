import { useRef } from 'react';
import { FaDownload, FaEye, FaFileAlt, FaFileImage, FaFilePdf, FaPaperclip, FaTimes } from 'react-icons/fa';
import s from './AppelVideo.module.css';

/** Document partagé pendant l'appel (gardé en mémoire le temps de l'appel seulement) */
export interface DocumentAppel {
  id: string;
  nom: string;
  taille: number;
  type: string;
  /** URL locale (blob:) pour ouvrir / télécharger */
  url: string;
  auteur: string;
  moi: boolean;
  heure: Date;
}

/** Types acceptés : PDF, images, Word, Excel, texte (taille max contrôlée par AppelVideo : 20 Mo) */
const TYPES_DOCUMENTS = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt';

const taille = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);
const heure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const icone = (type: string) => (type === 'application/pdf' ? FaFilePdf : type.startsWith('image/') ? FaFileImage : FaFileAlt);
/** Ouvrable dans un onglet (sinon : téléchargement) */
const visible = (type: string) => type === 'application/pdf' || type.startsWith('image/') || type === 'text/plain';

interface Props {
  documents: DocumentAppel[];
  envoi: { nom: string; progression: number } | null;
  onEnvoyer: (fichier: File) => void;
  onFermer: () => void;
  /** Envoi possible (médecin principal et confrère présents) ; sinon : consultation seulement */
  partage: boolean;
}

/**
 * PANNEAU « DOCUMENTS » DE L'APPEL — partage entre le médecin principal et le(s) confrère(s) invité(s).
 * Les fichiers passent directement par la salle LiveKit (rien n'est enregistré sur le serveur) :
 * seuls les participants présents au moment de l'envoi les reçoivent.
 */
export default function DocumentsAppel({ documents, envoi, onEnvoyer, onFermer, partage }: Props) {
  const champ = useRef<HTMLInputElement>(null);
  return (
    <aside className={s.panneauDocs} aria-label="Documents partagés">
      <div className={s.docsHaut}>
        <strong>Documents partagés</strong>
        <button type="button" className={s.petitBouton} onClick={onFermer} aria-label="Fermer les documents">
          <FaTimes />
        </button>
      </div>

      <button type="button" className={`${s.actionHaut} ${s.actionPrincipale} ${s.docsAjouter}`} onClick={() => champ.current?.click()} disabled={!!envoi || !partage}>
        <FaPaperclip aria-hidden="true" /> Partager un document
      </button>
      <input
        ref={champ}
        type="file"
        accept={TYPES_DOCUMENTS}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onEnvoyer(f);
        }}
      />
      <small className={s.docsAide}>
        {partage
          ? "PDF, images, Word, Excel ou texte · 20 Mo max. Reçu par les médecins présents dans l'appel."
          : "Le confrère a quitté l'appel : vous pouvez encore ouvrir les documents reçus."}
      </small>

      {envoi && (
        <div className={s.docsEnvoi}>
          <span>Envoi de « {envoi.nom} »…</span>
          <span className={s.docsBarre}>
            <span style={{ width: `${Math.round(envoi.progression * 100)}%` }} />
          </span>
        </div>
      )}

      {documents.length === 0 && !envoi ? (
        <p className={s.docsVide}>Aucun document partagé pour l'instant.</p>
      ) : (
        <ul className={s.docsListe}>
          {documents.map((d) => {
            const Icone = icone(d.type);
            return (
              <li key={d.id} className={s.docsLigne}>
                <span className={s.docsIcone}>
                  <Icone aria-hidden="true" />
                </span>
                <span className={s.docsTexte}>
                  <strong title={d.nom}>{d.nom}</strong>
                  <small>
                    {d.moi ? 'Vous' : d.auteur} · {heure(d.heure)} · {taille(d.taille)}
                  </small>
                </span>
                {visible(d.type) && (
                  <a className={s.petitBouton} href={d.url} target="_blank" rel="noreferrer" title="Ouvrir" aria-label={`Ouvrir ${d.nom}`}>
                    <FaEye />
                  </a>
                )}
                <a className={s.petitBouton} href={d.url} download={d.nom} title="Télécharger" aria-label={`Télécharger ${d.nom}`}>
                  <FaDownload />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
