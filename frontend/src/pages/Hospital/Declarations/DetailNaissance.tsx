import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaBaby, FaCalendarAlt, FaClock, FaFileAlt, FaHospital, FaPrint, FaUser, FaUserMd } from 'react-icons/fa';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CertificatNaissanceLaravel } from '../../../components/DocumentsLaravel';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { EspaceDeclarations } from '../../../types';
import type { DeclarationNaissanceDetail } from '../../../types';
import { calculerAge } from '../Patients/Liste';
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

function libelleGenre(g: string | null): string {
  if (!g) return 'Non renseigné';
  // Naissance multiple : « feminin, masculin » → « Féminin, Masculin »
  if (g.includes(',')) return g.split(',').map((x) => libelleGenre(x.trim())).join(', ');
  const u = g.toUpperCase();
  if (u === 'M' || u.startsWith('MASC')) return 'Masculin';
  if (u === 'F' || u.startsWith('FEM') || u.startsWith('FÉM')) return 'Féminin';
  return g;
}

/**
 * HÔPITAL > DÉCLARATIONS > DÉTAIL NAISSANCE & CERTIFICAT CMN
 * Équivalent Laravel :
 *   - users/hospital/declaration/naissance/show.blade.php
 *   - users/doctor/declaration/pdf/naissance.blade.php
 */
export function DetailNaissance({ espace = 'hopital' }: { espace?: EspaceDeclarations } = {}) {
  /** Hôpital : toutes les déclarations ; médecin : les siennes */
  const source = espace === 'medecin' ? api.doctor.declarations : api.hospital.declarations;
  const base = espace === 'medecin' ? '/medecin' : `${baseHopital()}`;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const modeImpressionInitial = searchParams.get('imprimer') === '1';

  const [detail, setDetail] = useState<DeclarationNaissanceDetail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [onglet, setOnglet] = useState<'fiche' | 'certificat'>(modeImpressionInitial ? 'certificat' : 'fiche');
  const [imgErreur, setImgErreur] = useState(false);

  useEffect(() => {
    setDetail(null);
    setIntrouvable(false);
    source
      .naissanceDetail(Number(id))
      .then(setDetail)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(`Impossible de charger la déclaration de naissance : ${messageErreur(e)}`);
      });
  }, [id]);

  if (introuvable) {
    return (
      <div className={c.page}>
        <header className={c.entete}>
          <div>
            <p className={c.surtitre}>Déclarations · Naissances</p>
            <h1 className={c.titre}>Déclaration de naissance introuvable</h1>
          </div>
          <button type="button" onClick={() => navigate(`${base}/declarations/naissances`)} className={c.secondaire}>
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
          <p className={c.vide}>Chargement de la déclaration de naissance…</p>
        </section>
      </div>
    );
  }

  const urlPhoto = detail.mere.imgUrl ? (detail.mere.imgUrl.startsWith('http') ? detail.mere.imgUrl : uploadUrl('patient', detail.mere.imgUrl)) : null;
  const estGarcon = (detail.genreEnfant ?? '').toUpperCase() === 'M' || (detail.genreEnfant ?? '').toUpperCase().startsWith('MASC');

  return (
    <div className={c.page}>
      <header className={`${c.entete} ${s.masquerImpression}`}>
        <div>
          <p className={c.surtitre}>Déclarations · Naissances · {detail.referenceCmn}</p>
          <h1 className={c.titre}>Déclaration de naissance — {detail.referenceCmn}</h1>
        </div>

        <div className={c.boutons}>
          <div className={s.onglets}>
            <button type="button" className={`${s.onglet} ${onglet === 'fiche' ? s.ongletActif : ''}`} onClick={() => setOnglet('fiche')}>
              {onglet === 'fiche' && <motion.span layoutId="ongletVueNaissance" className={s.ongletFond} />}
              <span className={s.ongletTexte}>
                <FaFileAlt /> Fiche détaillée
              </span>
            </button>
            <button type="button" className={`${s.onglet} ${onglet === 'certificat' ? s.ongletActif : ''}`} onClick={() => setOnglet('certificat')}>
              {onglet === 'certificat' && <motion.span layoutId="ongletVueNaissance" className={s.ongletFond} />}
              <span className={s.ongletTexte}>
                <FaPrint /> Certificat CMN
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

          <button type="button" className={c.secondaire} onClick={() => navigate(`${base}/declarations/naissances`)}>
            <FaArrowLeft aria-hidden="true" /> Retour
          </button>
        </div>
      </header>

      {onglet === 'fiche' ? (
        <>
          <motion.div className={s.banniere} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className={s.profilGauche}>
              {urlPhoto && !imgErreur ? (
                <img src={urlPhoto} alt={detail.mere.nom} className={s.grandAvatar} onError={() => setImgErreur(true)} />
              ) : (
                <div className={s.grandAvatarInitiales}>{initiales(detail.mere.nom)}</div>
              )}
              <div>
                <div className={s.identiteTitre}>
                  <h1>{detail.mere.nom}</h1>
                  <span className={s.code}>{detail.mere.code}</span>
                  <span className={`${c.badge} ${estGarcon ? s.genreM : s.genreF}`}>Nouveau-né : {libelleGenre(detail.genreEnfant)}</span>
                </div>
                <div className={s.metaLigne}>
                  <span>
                    <FaCalendarAlt /> Né(e) le {formatDateLongue(detail.dateNaissance)}
                  </span>
                  {detail.heureNaissance && (
                    <span>
                      <FaClock /> à {detail.heureNaissance}
                    </span>
                  )}
                  <span>
                    <FaHospital /> {detail.lieuNaissance || detail.hopital.nom}
                  </span>
                  <span>
                    <FaUserMd /> {detail.medecin.titre} {detail.medecin.nom}
                  </span>
                </div>
              </div>
            </div>

            {detail.mere.id && espace === 'hopital' && (
              <Link to={`${baseHopital()}/patients/${detail.mere.id}`} className={c.secondaire}>
                <FaUser aria-hidden="true" /> Voir le dossier de la mère
              </Link>
            )}
          </motion.div>

          <div className={s.grilleDetail}>
            <div className={s.colonne}>
              <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className={c.blocTitre}>
                  <FaBaby aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
                  Informations sur le nouveau-né
                </h2>

                <div className={s.champsGrille}>
                  <div className={s.champInfo}>
                    <span>N° Certificat CMN</span>
                    <strong>{detail.referenceCmn}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Référence déclaration</span>
                    <strong>{detail.referenceDn || detail.numeroDeclaration || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Code DM Enfant</span>
                    <strong>{detail.enfant.code || 'Non attribué'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Sexe de l’enfant</span>
                    <strong>{libelleGenre(detail.genreEnfant)}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Date d’accouchement</span>
                    <strong>{formatDateLongue(detail.dateNaissance)}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Heure de naissance</span>
                    <strong>{detail.heureNaissance || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Nombre d’enfants nés</span>
                    <strong>{detail.nombreEnfants}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>État à la naissance</span>
                    <strong>{detail.etatNaissance || 'Né vivant'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Lieu de naissance</span>
                    <strong>{detail.lieuNaissance || detail.hopital.nom}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Milieu de résidence</span>
                    <strong>{detail.milieuResidence || '—'}</strong>
                  </div>
                </div>

                {detail.observations && (
                  <div style={{ marginTop: 14 }}>
                    <span className={c.sousTexte} style={{ fontWeight: 600 }}>
                      Observations médicales
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
                  Informations sur la mère
                </h2>

                <div className={s.champsGrille}>
                  <div className={s.champInfo}>
                    <span>Nom complet</span>
                    <strong>{detail.mere.nom}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>N° Dossier Médical (DM)</span>
                    <strong>{detail.mere.code}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Date de naissance / Âge</span>
                    <strong>
                      {formatDateLongue(detail.mere.dateNaissance)} ({calculerAge(detail.mere.dateNaissance)})
                    </strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Téléphone</span>
                    <strong>{detail.mere.telephone || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Profession</span>
                    <strong>{detail.mere.profession || '—'}</strong>
                  </div>
                  <div className={s.champInfo}>
                    <span>Lieu de résidence habituelle</span>
                    <strong>{detail.mere.residenceHabituelle || '—'}</strong>
                  </div>
                </div>
              </motion.section>

              <motion.section className={c.bloc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <h2 className={c.blocTitre}>
                  <FaUserMd aria-hidden="true" style={{ marginRight: 8, color: 'var(--dash-blue)' }} />
                  Praticien déclarant
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
          <CertificatNaissanceLaravel d={detail} />
        </div>
      )}
    </div>
  );
}
