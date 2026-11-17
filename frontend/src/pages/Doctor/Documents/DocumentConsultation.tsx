import { useEffect, useState } from 'react';
import { FaArrowLeft, FaDownload, FaFileAlt, FaFlask, FaPills } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArretLaravel, BulletinLaravel, OrdonnanceLaravel } from '../../../components/DocumentsLaravel';
import { alerte, messageErreur } from '../../../services/alertes';
import { useEspaceConsultation } from '../Consultations/Formulaire/espace';
import c from '../../../styles/espace.module.css';
import type { DocumentsConsultation } from '../../../types';
import s from './DocumentConsultation.module.css';

export type TypeDocument = 'ordonnance' | 'examens' | 'arret';

export const DOCUMENTS: { id: TypeDocument; titre: string; icone: typeof FaPills }[] = [
  { id: 'ordonnance', titre: 'Ordonnance médicale', icone: FaPills },
  { id: 'examens', titre: 'Bulletin d’examens', icone: FaFlask },
  { id: 'arret', titre: 'Arrêt de travail', icone: FaFileAlt },
];


/**
 * MÉDECIN > DOCUMENT D'UNE CONSULTATION (page A4 à télécharger en PDF ou imprimer)
 * Reproduction exacte des PDF de Laravel : post-consultation/pdf/ordonnance, pdf/examen, pdf/arret.
 * « Télécharger (PDF) » ouvre l'impression du navigateur : choisir « Enregistrer au format PDF ».
 */
export default function DocumentConsultation() {
  const { id, type } = useParams();
  const navigate = useNavigate();
  const { api, racine } = useEspaceConsultation();
  const [doc, setDoc] = useState<DocumentsConsultation | null>(null);
  const [erreur, setErreur] = useState(false);
  const info = DOCUMENTS.find((d) => d.id === type) ?? DOCUMENTS[0];

  useEffect(() => {
    api
      .documents(Number(id))
      .then(setDoc)
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible de charger le document : ${messageErreur(e)}`);
      });
  }, [id]);

  // Nom du fichier PDF proposé par le navigateur
  useEffect(() => {
    if (!doc) return;
    const ancien = document.title;
    document.title = `${info.titre} - ${doc.patient.nom} - ${doc.consultation.code}`;
    return () => {
      document.title = ancien;
    };
  }, [doc, info.titre]);

  const present = doc && (type === 'ordonnance' ? doc.ordonnance : type === 'examens' ? doc.examens : doc.arret);

  return (
    <div className={c.page}>
      <header className={`${c.entete} ${s.nonImprime}`}>
        <div>
          <p className={c.surtitre}>Documents de la consultation</p>
          <h1 className={c.titre}>{info.titre}</h1>
        </div>
        <div className={c.boutons}>
          <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
            <FaArrowLeft aria-hidden="true" /> Retour
          </button>
          <button type="button" className={c.principal} onClick={() => window.print()} disabled={!present}>
            <FaDownload aria-hidden="true" /> Télécharger (PDF)
          </button>
        </div>
      </header>

      {doc && (
        <nav className={`${s.onglets} ${s.nonImprime}`} aria-label="Documents">
          {DOCUMENTS.map((d) => {
            const dispo = d.id === 'ordonnance' ? doc.ordonnance : d.id === 'examens' ? doc.examens : doc.arret;
            return dispo ? (
              <Link key={d.id} to={`${racine}/${id}/document/${d.id}`} className={`${s.onglet} ${d.id === type ? s.ongletActif : ''}`}>
                <d.icone aria-hidden="true" /> {d.titre}
              </Link>
            ) : (
              <span key={d.id} className={`${s.onglet} ${s.ongletVide}`} title="Non prescrit pour cette consultation">
                <d.icone aria-hidden="true" /> {d.titre}
              </span>
            );
          })}
          <span className={s.astuce}>Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ».</span>
        </nav>
      )}

      {!doc ? (
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Document introuvable.' : 'Chargement du document…'}</p>
        </section>
      ) : !present ? (
        <section className={c.bloc}>
          <p className={c.vide}>Ce document n’a pas été prescrit pour cette consultation.</p>
        </section>
      ) : (
        // Reproduction exacte des PDF de Laravel (ordonnance / bulletin d'examen / arrêt de travail)
        <div className={s.zoneFeuille}>
          {type === 'ordonnance' && <OrdonnanceLaravel doc={doc} />}
          {type === 'examens' && <BulletinLaravel doc={doc} />}
          {type === 'arret' && <ArretLaravel doc={doc} />}
        </div>
      )}
    </div>
  );
}
