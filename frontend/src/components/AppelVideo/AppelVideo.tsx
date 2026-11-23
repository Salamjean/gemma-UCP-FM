import { motion, useMotionValue } from 'framer-motion';
import { type LocalVideoTrack, type Participant, type RemoteTrack, type RemoteVideoTrack, Room, RoomEvent, Track } from 'livekit-client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { FaCompressAlt, FaExpandAlt, FaFolderOpen, FaMicrophone, FaMicrophoneSlash, FaPhoneSlash, FaUserMd, FaVideo, FaVideoSlash } from 'react-icons/fa';
import type { AccesAppelVideo } from '../../types';
import s from './AppelVideo.module.css';
import DocumentsAppel, { type DocumentAppel } from './DocumentsAppel';

const p2 = (n: number) => String(n).padStart(2, '0');

/**
 * PARTAGE DE DOCUMENTS PENDANT L'APPEL — entre TOUS les participants : médecin(s) (« doctor_… »),
 * infirmier·ère (« infirmier_… ») et confrères invités (« confrere_… »), dès qu'au moins une autre personne est dans l'appel.
 */
const SUJET_DOCUMENTS = 'documents-teleconsultation';
const TAILLE_MAX_DOCUMENT = 20 * 1024 * 1024;
const EXTENSIONS_DOCUMENTS = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|txt)$/i;

/** Message clair quand le navigateur refuse la caméra ou le micro */
function messageMedia(e: unknown, appareil: 'caméra' | 'micro') {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return `Le navigateur bloque la ${appareil} : ouvrez l'application en https:// ou sur http://localhost (pas par une adresse IP).`;
  }
  const nom = e instanceof Error || (e && typeof e === 'object' && 'name' in e) ? String((e as { name: string }).name) : '';
  const texte = e instanceof Error ? e.message : '';
  if (nom === 'NotAllowedError' || nom === 'PermissionDeniedError' || /permission/i.test(texte))
    return `Accès à la ${appareil} refusé : cliquez sur l'icône à gauche de l'adresse du site, autorisez la ${appareil}, puis réessayez.`;
  if (nom === 'NotReadableError' || nom === 'TrackStartError' || /could not start|in use/i.test(texte))
    return `La ${appareil} est déjà utilisée par une autre application ou un autre navigateur (Teams, Zoom, autre onglet d'appel…). Fermez-la puis réessayez.`;
  if (nom === 'NotFoundError' || nom === 'DevicesNotFoundError' || /not found|requested device/i.test(texte)) return `Aucune ${appareil} détectée sur cet appareil.`;
  return `Impossible d'activer la ${appareil}${texte ? ` : ${texte}` : '.'}`;
}

/** Active la caméra ; si la résolution par défaut est refusée par la webcam, nouvel essai en basse résolution */
async function activerCamera(room: Room) {
  if (!navigator.mediaDevices) throw new Error('mediaDevices indisponible');
  try {
    await room.localParticipant.setCameraEnabled(true);
  } catch (e) {
    const nom = (e as { name?: string })?.name;
    if (nom !== 'OverconstrainedError' && nom !== 'ConstraintNotSatisfiedError') throw e;
    await room.localParticipant.setCameraEnabled(true, { resolution: { width: 640, height: 480 } });
  }
}

interface Distant {
  id: string;
  nom: string;
  video: RemoteVideoTrack | null;
}

/** Vidéo d'un participant (la piste est attachée à l'élément <video>) */
function VideoPiste({ piste, className, miroir }: { piste: RemoteVideoTrack | LocalVideoTrack; className: string; miroir?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    piste.attach(el);
    el.play().catch(() => undefined);
    return () => {
      piste.detach(el);
    };
  }, [piste]);
  return <video ref={ref} className={`${className} ${miroir ? s.miroir : ''}`} autoPlay playsInline muted />;
}

interface Props {
  acces: AccesAppelVideo;
  onRaccrocher: () => void;
  /** Fenêtre réduite (bas à droite) : la page reste utilisable pendant l'appel */
  reduit?: boolean;
  onBasculer?: () => void;
  /** Boutons propres à l'espace (inviter un confrère, formulaire…) */
  actions?: ReactNode;
  /** Texte d'état quand personne n'a encore rejoint */
  attente?: string;
  /** Panneau à droite de la vidéo en plein écran (ex. dossier du patient pour le confrère) */
  panneau?: ReactNode;
}

/**
 * APPEL VIDÉO DE TÉLÉMÉDECINE (LiveKit, comme Laravel)
 * Grille des participants (médecin, infirmier·ère, confrère invité), aperçu de ma caméra, micro / caméra / raccrocher.
 * Le composant reste monté quand on réduit ou agrandit la fenêtre : l'appel n'est jamais coupé.
 */
export default function AppelVideo({ acces, onRaccrocher, reduit = false, onBasculer, actions, attente, panneau }: Props) {
  const audios = useRef<HTMLDivElement>(null);
  const salle = useRef<Room | null>(null);
  const [etat, setEtat] = useState<'connexion' | 'connecte' | 'erreur'>('connexion');
  // Fenêtre réduite déplaçable (pour ne pas cacher le formulaire) ; position remise à zéro en plein écran
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  useEffect(() => {
    if (!reduit) {
      x.set(0);
      y.set(0);
    }
  }, [reduit, x, y]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [micro, setMicro] = useState(true);
  const [camera, setCamera] = useState(true);
  const [maVideo, setMaVideo] = useState<LocalVideoTrack | null>(null);
  const [distants, setDistants] = useState<Distant[]>([]);
  const [dejaVu, setDejaVu] = useState(false);
  const [duree, setDuree] = useState(0);
  const [alerteMedia, setAlerteMedia] = useState<string | null>(null);
  /** Relit ma piste vidéo (défini dans l'effet de connexion) */
  const majMaVideoRef = useRef<() => void>(() => undefined);

  // Documents partagés entre tous les participants de l'appel
  const [documents, setDocuments] = useState<DocumentAppel[]>([]);
  const [envoiDoc, setEnvoiDoc] = useState<{ nom: string; progression: number } | null>(null);
  const [docsOuverts, setDocsOuverts] = useState(false);
  const [nonLus, setNonLus] = useState(0);
  const [avisDoc, setAvisDoc] = useState<string | null>(null);
  const docsOuvertsRef = useRef(false);
  docsOuvertsRef.current = docsOuverts && !reduit;
  /** URLs blob à libérer à la fin de l'appel */
  const urlsDocs = useRef<string[]>([]);
  useEffect(() => () => urlsDocs.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    if (!avisDoc) return;
    const t = setTimeout(() => setAvisDoc(null), 6000);
    return () => clearTimeout(t);
  }, [avisDoc]);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    salle.current = room;
    let actif = true;

    const nomDe = (p: Participant) => p.name || p.identity;

    // Réception d'un document envoyé par un autre participant de l'appel (médecin, infirmier·ère, confrère)
    room.registerByteStreamHandler(SUJET_DOCUMENTS, async (reader, { identity }) => {
      try {
        const morceaux = await reader.readAll();
        if (!actif) return;
        const info = reader.info;
        const type = info.mimeType || 'application/octet-stream';
        const blob = new Blob(morceaux as BlobPart[], { type });
        const url = URL.createObjectURL(blob);
        urlsDocs.current.push(url);
        const auteur = room.remoteParticipants.get(identity)?.name || 'Un participant';
        setDocuments((d) => [...d, { id: info.id, nom: info.name || 'document', taille: blob.size, type, url, auteur, moi: false, heure: new Date() }]);
        if (!docsOuvertsRef.current) {
          setNonLus((n) => n + 1);
          setAvisDoc(`${auteur} a partagé « ${info.name || 'un document'} ».`);
        }
      } catch {
        if (actif) setAvisDoc('Un document partagé n’a pas pu être reçu.');
      }
    });
    const lister = () => {
      if (!actif) return;
      const liste: Distant[] = [...room.remoteParticipants.values()].map((p) => {
        const pub = p.getTrackPublication(Track.Source.Camera);
        return { id: p.identity, nom: nomDe(p), video: pub?.isSubscribed && pub.track && !pub.isMuted ? (pub.track as RemoteVideoTrack) : null };
      });
      setDistants(liste);
      if (liste.length > 0) setDejaVu(true);
    };
    const ecouterAudio = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio && audios.current) audios.current.appendChild(track.attach());
    };
    const majMaVideo = () => {
      if (!actif) return;
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setMaVideo(pub?.track && !pub.isMuted ? (pub.track as LocalVideoTrack) : null);
    };

    room
      .on(RoomEvent.TrackSubscribed, (track) => {
        ecouterAudio(track);
        lister();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        lister();
      })
      .on(RoomEvent.TrackMuted, () => {
        lister();
        majMaVideo();
      })
      .on(RoomEvent.TrackUnmuted, () => {
        lister();
        majMaVideo();
      })
      .on(RoomEvent.ParticipantConnected, lister)
      .on(RoomEvent.ParticipantDisconnected, lister)
      .on(RoomEvent.LocalTrackPublished, majMaVideo)
      .on(RoomEvent.LocalTrackUnpublished, majMaVideo);

    // Démarrage différé : en développement (StrictMode), le 1er montage est annulé avant de se connecter
    const depart = setTimeout(async () => {
      try {
        await room.connect(acces.url, acces.jeton);
        if (!actif) return;
        setEtat('connecte');
        // Micro et caméra séparément : l'absence de l'un ne coupe pas l'autre
        majMaVideoRef.current = majMaVideo;
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
          if (actif) {
            setMicro(false);
            setAlerteMedia(messageMedia(e, 'micro'));
          }
        }
        try {
          await activerCamera(room);
        } catch (e) {
          if (actif) {
            setCamera(false);
            setAlerteMedia(messageMedia(e, 'caméra'));
          }
        }
        room.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => pub.track && ecouterAudio(pub.track as RemoteTrack)));
        majMaVideo();
        lister();
      } catch (e) {
        if (!actif) return;
        setEtat('erreur');
        setErreur(e instanceof Error ? e.message : 'Connexion à l’appel impossible.');
      }
    }, 0);

    return () => {
      actif = false;
      clearTimeout(depart);
      room.unregisterByteStreamHandler(SUJET_DOCUMENTS);
      room.disconnect();
    };
  }, [acces.url, acces.jeton]);

  // Partage possible pour chaque participant (médecin, infirmier·ère, confrère) dès qu'une autre personne est dans l'appel
  const destinatairesDocs = distants.map((d) => d.id);
  const partageDocs = etat === 'connecte' && destinatairesDocs.length > 0;

  const envoyerDocument = async (fichier: File) => {
    const room = salle.current;
    if (!room || !partageDocs) return;
    if (!EXTENSIONS_DOCUMENTS.test(fichier.name)) return setAvisDoc('Format non accepté : PDF, image, Word, Excel ou texte.');
    if (fichier.size > TAILLE_MAX_DOCUMENT) return setAvisDoc('Document trop lourd (20 Mo maximum).');
    setEnvoiDoc({ nom: fichier.name, progression: 0 });
    try {
      const { id } = await room.localParticipant.sendFile(fichier, {
        topic: SUJET_DOCUMENTS,
        mimeType: fichier.type || 'application/octet-stream',
        destinationIdentities: destinatairesDocs,
        onProgress: (p) => setEnvoiDoc({ nom: fichier.name, progression: p }),
      });
      const url = URL.createObjectURL(fichier);
      urlsDocs.current.push(url);
      setDocuments((d) => [...d, { id, nom: fichier.name, taille: fichier.size, type: fichier.type, url, auteur: '', moi: true, heure: new Date() }]);
    } catch (e) {
      setAvisDoc(`Envoi impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}.`);
    } finally {
      setEnvoiDoc(null);
    }
  };

  const basculerDocs = () => {
    if (reduit) {
      onBasculer?.();
      setDocsOuverts(true);
    } else setDocsOuverts((o) => !o);
    setNonLus(0);
  };

  // Durée de l'appel (dès qu'un autre participant est là)
  const ensemble = distants.length > 0;
  useEffect(() => {
    if (!ensemble) return;
    const t = setInterval(() => setDuree((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [ensemble]);

  const basculerMicro = async () => {
    const room = salle.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!micro);
      setMicro(!micro);
      setAlerteMedia(null);
    } catch (e) {
      setMicro(false);
      setAlerteMedia(messageMedia(e, 'micro'));
    }
  };
  const basculerCamera = async () => {
    const room = salle.current;
    if (!room) return;
    try {
      if (camera) {
        await room.localParticipant.setCameraEnabled(false);
        setCamera(false);
      } else {
        await activerCamera(room);
        setCamera(true);
        setAlerteMedia(null);
      }
    } catch (e) {
      setCamera(false);
      setAlerteMedia(messageMedia(e, 'caméra'));
    } finally {
      majMaVideoRef.current();
    }
  };

  const texteEtat =
    etat === 'connexion'
      ? 'Connexion à l’appel…'
      : etat === 'erreur'
        ? (erreur ?? 'Connexion impossible.')
        : ensemble
          ? `${p2(Math.floor(duree / 60))}:${p2(duree % 60)}`
          : dejaVu
            ? 'Les autres participants ont quitté l’appel.'
            : (attente ?? `En attente de ${acces.interlocuteur}…`);

  const bloque = etat !== 'connecte';

  return (
    <motion.div
      className={reduit ? s.reduit : s.fond}
      style={{ x, y }}
      drag={reduit}
      dragMomentum={false}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal={!reduit}
      aria-label="Appel vidéo"
      title={reduit ? 'Faites glisser la fenêtre pour la déplacer' : undefined}
    >
      <header className={s.haut}>
        <div className={s.titre}>
          <strong>Télémédecine · {acces.patient}</strong>
          <span>{ensemble ? `${distants.map((d) => d.nom).join(', ')} · ${texteEtat}` : texteEtat}</span>
        </div>
        <div className={s.actionsHaut}>
          {!reduit && actions}
          {onBasculer && (
            <button type="button" className={s.petitBouton} onClick={onBasculer} aria-label={reduit ? 'Agrandir l’appel' : 'Réduire l’appel'} title={reduit ? 'Agrandir' : 'Réduire'}>
              {reduit ? <FaExpandAlt /> : <FaCompressAlt />}
            </button>
          )}
        </div>
      </header>

      <div className={s.corps}>
        <div className={s.scene}>
          {ensemble ? (
            <div className={`${s.grille} ${distants.length > 1 ? s.grilleMulti : ''}`}>
              {distants.map((d) => (
                <div key={d.id} className={s.tuile}>
                  {d.video ? (
                    <VideoPiste piste={d.video} className={s.distante} />
                  ) : (
                    <div className={s.sansVideo}>
                      <span className={s.avatar}>
                        <FaUserMd aria-hidden="true" />
                      </span>
                      <small>Caméra coupée</small>
                    </div>
                  )}
                  <span className={s.nomTuile}>{d.nom}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.sansVideo}>
              <span className={s.avatar}>
                <FaUserMd aria-hidden="true" />
              </span>
              <strong>{acces.interlocuteur}</strong>
              <small>{texteEtat}</small>
            </div>
          )}
          {maVideo && camera ? <VideoPiste piste={maVideo} className={s.locale} miroir /> : etat === 'connecte' && <div className={`${s.locale} ${s.localeVide}`}>{camera ? 'Caméra…' : 'Caméra coupée'}</div>}
          <div ref={audios} hidden />
        {alerteMedia && (
          <div className={s.alerteMedia} role="alert">
            <span>{alerteMedia}</span>
            <button type="button" onClick={() => setAlerteMedia(null)} aria-label="Fermer le message">
              ×
            </button>
          </div>
        )}
        {avisDoc && !alerteMedia && (
          <div className={`${s.alerteMedia} ${s.avisDoc}`} role="status">
            <span>{avisDoc}</span>
            <button type="button" onClick={() => setAvisDoc(null)} aria-label="Fermer le message">
              ×
            </button>
          </div>
        )}
        </div>
        {!reduit && docsOuverts && (partageDocs || documents.length > 0) ? (
          <DocumentsAppel documents={documents} envoi={envoiDoc} onEnvoyer={envoyerDocument} onFermer={() => setDocsOuverts(false)} partage={partageDocs} />
        ) : (
          !reduit && panneau && <aside className={s.panneau}>{panneau}</aside>
        )}
      </div>

      <footer className={s.controles}>
        <button type="button" className={micro ? s.bouton : `${s.bouton} ${s.coupe}`} onClick={basculerMicro} aria-label={micro ? 'Couper le micro' : 'Activer le micro'} disabled={bloque}>
          {micro ? <FaMicrophone /> : <FaMicrophoneSlash />}
        </button>
        <button type="button" className={camera ? s.bouton : `${s.bouton} ${s.coupe}`} onClick={basculerCamera} aria-label={camera ? 'Couper la caméra' : 'Activer la caméra'} disabled={bloque}>
          {camera ? <FaVideo /> : <FaVideoSlash />}
        </button>
        {(partageDocs || documents.length > 0) && (
          <button
            type="button"
            className={`${s.bouton} ${docsOuverts && !reduit ? s.boutonActif : ''}`}
            onClick={basculerDocs}
            aria-label={nonLus ? `Documents partagés (${nonLus} nouveau${nonLus > 1 ? 'x' : ''})` : 'Documents partagés'}
            title="Documents partagés"
          >
            <FaFolderOpen />
            {nonLus > 0 && <span className={s.pastille}>{nonLus}</span>}
          </button>
        )}
        <button type="button" className={`${s.bouton} ${s.raccrocher}`} onClick={onRaccrocher} aria-label="Raccrocher">
          <FaPhoneSlash />
        </button>
      </footer>
    </motion.div>
  );
}
