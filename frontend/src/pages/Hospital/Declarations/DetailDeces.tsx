import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaCalendarAlt, FaClock, FaFileAlt, FaFileMedicalAlt, FaHospital, FaPrint, FaUser, FaUserMd } from 'react-icons/fa';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CertificatDecesLaravel } from '../../../components/DocumentsLaravel';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { EspaceDeclarations } from '../../../types';
import type { DeclarationDecesDetail } from '../../../types';
import { baseHopital } from '../../../services/contexteHopital';
import s from './Declarations.module.css';

function initiales(nom: string) {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDateLongue(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function libelleGenre(g: string | null) {
  if (!g) return 'Non renseigné';
  const u = g.toUpperCase();
  if (u === 'M' || u.startsWith('MASC')) return 'Masculin';
  if (u === 'F' || u.startsWith('FEM') || u.startsWith('FÉM')) return 'Féminin';
  return g;
}

/**
 * HÔPITAL > DÉCLARATIONS > DÉTAIL DÉCÈS & CERTIFICAT MÉDICAL
 * Équivalent Laravel :
 *   - users/hospital/declaration/deces/show.blade.php
 *   - users/doctor/declaration/pdf/deces.blade.php
 */
export function DetailDeces({ espace = 'hopital' }: { espace?: EspaceDeclarations } = {}) {
  /** Hôpital : toutes les déclarations ; médecin : les siennes */
  const source = espace === 'medecin' ? api.doctor.declarations : api.hospital.declarations;
  const base = espace === 'medecin' ? '/medecin' : `${baseHopital()}`;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const modeImpressionInitial = searchParams.get('imprimer') === '1';

  const [detail, setDetail] = useState<DeclarationDecesDetail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [onglet, setOnglet] = useState<'fiche' | 'certificat'>(modeImpressionInitial ? 'certificat' : 'fiche');
  const [imgErreur, setImgErreur] = useState(false);

  useEffect(() => {
    setDetail(null);
    setIntrouvable(false);
    source
      .decesDetail(Number(id))
      .then(setDetail)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(`Impossible de charger la déclaration de décès : ${messageErreur(e)}`);
      });
  }, [id]);

  if (introuvable) {
    return (
      <div className={c.page}>
        <header className={c.entete}>
          <div>
            <p className={c.surtitre}>Déclarations · Décès</p>
            <h1 className={c.titre}>Déclaration de décès introuvable</h1>
          </div>
          <button type="button" onClick={() => navigate(`${base}/declarations/deces`)} className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Retour
          </button>
        </header>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={c.page}>
        <section className={c.bloc}>
          <p className={c.vide}>Chargement de la déclaration de décès…</p>
        </section>
      </div>
    );
  }

  const urlPhoto = detail.patient.imgUrl ? (detail.patient.imgUrl.startsWith('http') ? detail.patient.imgUrl : uploadUrl('patient', detail.patient.imgUrl)) : null;
  const genreAffiche = detail.genre ?? detail.patient.genre;

  return (
    <div className={c.page}>
      <header className={`${c.entete} ${s.masquerImpression}`}>
        <div>
          <p className={c.surtitre}>Déclarations · Décès · {detail.reference}</p>
          <h1 className={c.titre}>Déclaration de décès — {detail.reference}</h1>
        </div>

        <div className={c.boutons}>
          <div className={s.onglets}>
            <button type="button" className={`${s.onglet} ${onglet === 'fiche' ? s.ongletActif : ''}`} onClick={() => setOnglet('fiche')}>
              {onglet === 'fiche' && <motion.span layoutId="ongletVueDeces" className={s.ongletFond} />}
              <span className={s.ongletTexte}>
                <FaFileAlt /> Fiche détaillée
              </span>
            </button>
            <button type="button" className={`${s.onglet} ${onglet === 'certificat' ? s.ongletActif : ''}`} onClick={() => setOnglet('certificat')}>
              {onglet === 'certificat' && <motion.span layoutId="ongletVueDeces" className={s.ongletFond} />}
              <span className={s.ongletTexte}>
                <FaPrint /> Certificat de décès
              </span>
            </button>
          </div>

          <button
            type="button"
            className={c.principal}
            onClick={() => {
              setOnglet('certificat');
              setTimeout(() => window.print(), 120);
            }}
          >
            <FaPrint aria-hidden="true" /> Imprimer le certificat
          </button>

          <button type="button" className={c.secondaire} onClick={() => navigate(`${base}/declarations/deces`)}>
            <FaArrowLeft aria-hidden="true" /> Retour
          </button>
        </div>
      </header>

      {onglet === 'fiche' ? (
        <>
          <motion.div className={s.banniere} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className={s.profilGauche}>
              {urlPhoto && !imgErreur ? (
                <img src={urlPhoto} alt={detail.patient.nom} className={s.grandAvatar} onError={() => setImgErreur(true)} />
              ) : (
                <div className={s.grandAvatarInitiales}>{initiales(detail.patient.nom)}</div>
              )}
              <div>
                <div className={s.identiteTitre}>
                  <h1>{detail.patient.nom}</h1>
                  <span className={s.code}>{detail.patient.code}</span>
                  <span className={`${c.badge} ${detail.personne === 'enfant' ? s.badgeAttention : c.badgeOk}`}>{detail.personne === 'enfant' ? 'Nouveau-né' : 'Patient'}</span>
                  {detail.decesMaternel && <span className={`${c.badge} ${s.badgeDanger}`}>Décès maternel</span>}
                </div>
                <div className={s.metaLigne}>
                  <span>
                    <FaCalendarAlt /> Décédé(e) le {formatDateLongue(detail.dateDeces)}
                  </span>
                  {detail.heureDeces && (
                    <span>
                      <FaClock /> à {detail.heureDeces}
                    </span>
                  )}
                  <span>
                    <FaHospital /> {detail.lieu || detail.hopital.nom}
                  </span>
                  <span>
                    <FaUserMd /> {detail.medecin.titre} {detail.medecin.nom}
                  </span>
                </div>
              </div>
            </div>

            {detail.patient.id && espace === 'hopital' && (
              <Link to={`${baseHopital()}/patients/${detail.patient.id}`} className={c.secondaire}>
                <FaUser aria-hidden="true" /> Voir le dossier patient
              </Link>
            )}
          </motion.div>

          <div className={s.grilleDetail}>
            <div className={s.colonne}>
              <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className={c.blocTitre}>
                  <FaFileMedicalAlt aria-hidden="true" style={{ marginRight: 8, color: '#c4213f' }} />
                  Informations sur le décès
                </h2>

                <div className={s.champsGrille}>
                  <div className={s.champInfo}>
                    <span>N° Certificat</span>
                    <strong>{detail.reference}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>N° Déclaration</span>
                    <strong>{detail.numeroDeclaration || detail.referenceDeces || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Personne concernée</span>
                    <strong>{detail.personne === 'enfant' ? 'Nouveau-né (Enfant)' : 'Patient'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Sexe</span>
                    <strong>{libelleGenre(genreAffiche)}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Date du décès</span>
                    <strong>{formatDateLongue(detail.dateDeces)}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Heure du décès</span>
                    <strong>{detail.heureDeces || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Âge au décès</span>
                    <strong>{detail.age ? `${detail.age} ans` : '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Décès maternel</span>
                    <strong>{detail.decesMaternel ? 'Oui' : 'Non'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Lieu du décès</span>
                    <strong>{detail.lieu || detail.hopital.nom}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Milieu de résidence</span>
                    <strong>{detail.milieuResidence || '—'}</strong>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <span className={c.sousTexte} style={{ fontWeight: 600 }}>
                    Cause directe du décès
                  </span>
                  <div className={s.texteLong} style={{ marginTop: 6 }}>
                    {detail.causeDirecte || 'Non renseignée'}
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <span className={c.sousTexte} style={{ fontWeight: 600 }}>
                    Cause initiale du décès
                  </span>
                  <div className={s.texteLong} style={{ marginTop: 6 }}>
                    {detail.causeInitiale || 'Non renseignée'}
                  </div>
                </div>

                {detail.observations && (
                  <div style={{ marginTop: 12 }}>
                    <span className={c.sousTexte} style={{ fontWeight: 600 }}>
                      Observations médicales complémentaires
                    </span>
                    <div className={s.texteLong} style={{ marginTop: 6 }}>
                      {detail.observations}
                    </div>
                  </div>
                )}
              </motion.section>
            </div>

            <div className={s.colonne}>
              <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <h2 className={c.blocTitre}>
                  <FaUser aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
                  {detail.personne === 'enfant' ? 'Informations sur la mère / dossier rattaché' : 'Identité du défunt'}
                </h2>

                <div className={s.champsGrille}>
                  <div className={s.champInfo}>
                    <span>Nom complet</span>
                    <strong>{detail.patient.nom}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Code Dossier Médical (DM)</span>
                    <strong>{detail.patient.code}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Date de naissance</span>
                    <strong>{formatDateLongue(detail.patient.dateNaissance)}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Lieu de naissance</span>
                    <strong>{detail.patient.lieuNaissance || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Profession</span>
                    <strong>{detail.patient.profession || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Téléphone</span>
                    <strong>{detail.patient.telephone || '—'}</strong>
                  </div>
                  <div className={s.champInfo} style={{ gridColumn: '1 / -1' }}>
                    <span>Résidence habituelle</span>
                    <strong>{detail.patient.residenceHabituelle || '—'}</strong>
                  </div>
                </div>
              </motion.section>

              <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <h2 className={c.blocTitre}>
                  <FaUserMd aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
                  Praticien certifiant
                </h2>

                <div className={s.champsGrille}>
                  <div className={s.champInfo}>
                    <span>Qualité / Titre</span>
                    <strong>{detail.medecin.titre}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Nom du praticien</span>
                    <strong>{detail.medecin.nom}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Établissement</span>
                    <strong>{detail.hopital.nom}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Localité</span>
                    <strong>{detail.hopital.localite || '—'}</strong>
                  </div>
                </div>
              </motion.section>
            </div>
          </div>
        </>
      ) : (
        // Certificat : reproduction exacte du PDF de Laravel
        <div className={s.zoneCertificat}>
          <CertificatDecesLaravel d={detail} />
        </div>
      )}
    </div>
  );
}
