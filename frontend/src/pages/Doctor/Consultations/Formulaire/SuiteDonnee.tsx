import { FaClipboardCheck, FaFileAlt, FaPhoneAlt, FaShareSquare } from 'react-icons/fa';
import { lancerAppelVideo } from '../../../../components/AppelVideo';
import { Link } from 'react-router-dom';
import type { SuiteConsultation } from '../../../../types';
import { useEspaceConsultation } from './espace';
import s from './FormulaireConsultation.module.css';

const TITRES: Record<SuiteConsultation['type'], string> = {
  teleexpertise: 'Télé-expertise',
  teleconsultation: 'Téléconsultation',
  urgence: 'Appel d’urgence',
  reference: 'Référence du patient',
};

/**
 * FICHE (consultation terminée) > SUITE DONNÉE
 * Ce que l'auteur de la consultation a fait ensuite : à qui, quand, et où en est la demande.
 */
export default function SuiteDonnee({ suite, consultationId }: { suite: SuiteConsultation; consultationId: number }) {
  const { espace } = useEspaceConsultation();
  const date = suite.date ? suite.date.split('-').reverse().join('/') : null;
  const expertise = suite.type === 'teleexpertise';
  const reference = suite.type === 'reference';
  const lignes: [string, string | null][] = [
    [
      'Type',
      `${TITRES[suite.type]}${
        expertise ? `${suite.externe ? ' en externe' : ' en interne'} · ${suite.urgente ? 'urgente' : 'programmée'}` : reference ? (suite.externe ? ' en externe' : ' en interne') : ''
      }`,
    ],
    ['Service', suite.service],
    [reference ? 'Le' : 'Prévue le', date ? `${date}${suite.heure ? ` à ${suite.heure}` : ''}` : null],
    ['Médecin', suite.medecin],
    ['Établissement', suite.hopital],
    ['État', suite.etat],
  ];
  return (
    <div className={s.noteInfirmier}>
      <span>
        <FaShareSquare aria-hidden="true" /> Suite donnée
      </span>
      <dl className={s.suiteListe}>
        {lignes
          .filter(([, v]) => v)
          .map(([libelle, valeur]) => (
            <div key={libelle}>
              <dt>{libelle}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
      </dl>
      {/* Télé-expertise : délai et résultat de l'expert dans « Résultats d'expertise » */}
      {expertise && (
        <Link to={`/${espace}/resultats-expertise/${consultationId}`} className={s.lienResultat}>
          <FaClipboardCheck aria-hidden="true" /> {suite.resultatLe ? 'Voir la réponse de l’expert' : 'Suivre la demande'}
        </Link>
      )}
      {/* Téléconsultation demandée par un médecin à un autre médecin : appel vidéo entre médecins */}
      {espace === 'medecin' && suite.type === 'teleconsultation' && suite.appelPossible && suite.consultationId && (
        <button type="button" className={s.lienResultat} onClick={() => lancerAppelVideo(suite.consultationId!)}>
          <FaPhoneAlt aria-hidden="true" /> Appeler le médecin
        </button>
      )}
      {/* Référence du patient : fiche de référence à imprimer de nouveau */}
      {reference && suite.referenceId && (
        <Link to={`/${espace}/consultations/reference/${suite.referenceId}`} className={s.lienResultat}>
          <FaFileAlt aria-hidden="true" /> Fiche de référence
        </Link>
      )}
    </div>
  );
}
