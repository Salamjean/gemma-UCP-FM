import { useEffect, useRef, useState } from 'react';
import { FaArrowLeft, FaDownload } from 'react-icons/fa';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { FicheReference as Fiche } from '../../../types';
import { useEspaceConsultation } from '../Consultations/Formulaire/espace';
import s from './FicheReference.module.css';

const dateHeure = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const naissance = (x: string | null) => (x ? (/^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10).split('-').reverse().join('/') : x) : null);

const CONSTANTES: [keyof Fiche['constantes'], string, string][] = [
  ['tension', 'Tension artérielle', ''],
  ['temperature', 'Température', '°C'],
  ['pouls', 'Pouls', 'bpm'],
  ['saturation', 'Saturation', '%'],
  ['poids', 'Poids', 'kg'],
  ['taille', 'Taille', 'cm'],
  ['imc', 'IMC', ''],
];

/**
 * FICHE DE RÉFÉRENCE (document A4 remis au patient) — issue « Référence » de l'infirmier·ère ou du médecin.
 * Le patient la présente au médecin / à l'hôpital où il est référé. « ?imprimer=1 » : impression proposée à l'ouverture.
 */
export default function FicheReference() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { api } = useEspaceConsultation();
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [erreur, setErreur] = useState(false);
  const imprime = useRef(false);

  useEffect(() => {
    api
      .ficheReference(Number(id))
      .then(setFiche)
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible d’ouvrir la fiche de référence : ${messageErreur(e)}`);
      });
  }, [id]);

  // Nom du fichier PDF proposé, et impression à l'ouverture juste après la référence
  useEffect(() => {
    if (!fiche) return;
    const ancien = document.title;
    document.title = `Fiche de référence - ${fiche.patient.nom} - ${fiche.code}`;
    if (params.get('imprimer') === '1' && !imprime.current) {
      imprime.current = true;
      setTimeout(() => window.print(), 400);
    }
    return () => {
      document.title = ancien;
    };
  }, [fiche]);

  const ligne = (libelle: string, valeur: string | null | undefined) => (
    <div className={s.ligne}>
      <dt>{libelle}</dt>
      <dd>{valeur || '—'}</dd>
    </div>
  );

  return (
    <div className={c.page}>
      <header className={`${c.entete} ${s.nonImprime}`}>
        <div>
          <p className={c.surtitre}>Référence du patient</p>
          <h1 className={c.titre}>Fiche de référence</h1>
        </div>
        <div className={c.boutons}>
          <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
            <FaArrowLeft aria-hidden="true" /> Retour
          </button>
          <button type="button" className={c.principal} onClick={() => window.print()} disabled={!fiche}>
            <FaDownload aria-hidden="true" /> Imprimer / PDF
          </button>
        </div>
      </header>

      {!fiche ? (
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Fiche de référence introuvable.' : 'Chargement de la fiche…'}</p>
        </section>
      ) : (
        <div className={s.zone}>
          <article className={s.feuille}>
            {/* En-tête : hôpital d'origine */}
            <header className={s.enTete}>
              <div className={s.origine}>
                {fiche.origine.logo && <img src={fiche.origine.logo.startsWith('http') ? fiche.origine.logo : uploadUrl('hospital', fiche.origine.logo)} alt="" />}
                <div>
                  <strong>{fiche.origine.hopital ?? 'Établissement'}</strong>
                  {fiche.origine.contact && <small>Tél. {fiche.origine.contact}</small>}
                </div>
              </div>
              <div className={s.numero}>
                <strong>N° {fiche.code}</strong>
                <small>{dateHeure(fiche.date)}</small>
              </div>
            </header>

            <h2 className={s.titre}>Fiche de référence {fiche.externe ? '(externe)' : '(interne)'}</h2>

            <section className={s.bloc}>
              <h3>Patient</h3>
              <dl className={s.grille}>
                {ligne('Nom et prénoms', fiche.patient.nom)}
                {ligne('N° de dossier', fiche.patient.code)}
                {ligne('Sexe', fiche.patient.genre ? (fiche.patient.genre.toLowerCase().startsWith('f') ? 'Féminin' : 'Masculin') : null)}
                {ligne('Date de naissance', naissance(fiche.patient.dateNaissance))}
                {ligne('Téléphone', fiche.patient.telephone)}
              </dl>
            </section>

            <section className={s.bloc}>
              <h3>Référé vers</h3>
              <dl className={s.grille}>
                {ligne('Service', fiche.destination.service)}
                {ligne('Établissement', fiche.destination.hopital)}
                {ligne('Médecin', fiche.destination.medecin)}
                {fiche.destination.contact && ligne('Contact de l’établissement', fiche.destination.contact)}
                {fiche.destination.prisePar && ligne('Pris en charge par', `${fiche.destination.prisePar}${fiche.destination.hopitalPrise ? ` · ${fiche.destination.hopitalPrise}` : ''}`)}
              </dl>
            </section>

            <section className={s.bloc}>
              <h3>Motif de la référence</h3>
              <p className={s.texte}>{fiche.motif ?? '—'}</p>
              {(fiche.examenPhysique || fiche.diagnostic) && (
                <dl className={s.grille}>
                  {fiche.examenPhysique && ligne('Examen physique', fiche.examenPhysique)}
                  {fiche.diagnostic && ligne('Diagnostic', fiche.diagnostic)}
                </dl>
              )}
            </section>

            <section className={s.bloc}>
              <h3>Constantes</h3>
              <dl className={s.constantes}>
                {CONSTANTES.map(([cle, libelle, unite]) => (
                  <div key={cle}>
                    <dt>{libelle}</dt>
                    <dd>{fiche.constantes[cle] ? `${fiche.constantes[cle]}${unite ? ` ${unite}` : ''}` : '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <footer className={s.pied}>
              <div>
                <small>Référé par</small>
                <strong>{fiche.origine.medecin ?? (fiche.origine.infirmier ? `${fiche.origine.infirmier} (infirmier·ère)` : '—')}</strong>
              </div>
              <div className={s.signature}>
                <small>Signature et cachet</small>
              </div>
            </footer>
            <p className={s.note}>À présenter au médecin ou à l’accueil de l’établissement où le patient est référé.</p>
          </article>
        </div>
      )}
    </div>
  );
}
