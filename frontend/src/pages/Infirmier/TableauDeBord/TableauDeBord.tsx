import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  FaArrowRight,
  FaBed,
  FaClipboardList,
  FaNotesMedical,
  FaPlay,
  FaSearch,
  FaStethoscope,
  FaUserPlus,
  FaUsers,
  FaVideo,
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { displayName } from '../../../config/roles';
import { useAuth } from '../../../context/AuthContext';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierDashboard, InfirmierDashboardConsultations, InfirmierDashboardSoins } from '../../../types';
import s from './TableauDeBord.module.css';

/* ---------- Utilitaires d'affichage ---------- */
const deux = (n: number) => String(n).padStart(2, '0');

/** Heure "HH:mm" d'une date MySQL renvoyée par le backend */
function heure(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}`;
}

/** "yyyy-mm-dd" (ou ISO) → "dd/mm/yyyy" */
function dateFr(v: string | null): string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function initiales(nom: string): string {
  const p = nom.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return 'P';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[1][0]}`.toUpperCase();
}

const apparition = (i: number, base = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: base + Math.min(i, 12) * 0.04 },
});


/**
 * INFIRMIER > TABLEAU DE BORD
 * Données : GET /api/infirmier/tableau-de-bord (Laravel : DashboardController + partials/dashboard/infirmier.blade.php)
 * En tête : salutation + 2 boutons d'accueil (inscrire un nouveau patient / rechercher et affecter un patient).
 *  - service "Soins infirmier" → nouveaux soins + soins en cours
 *  - autres services → file d'attente du jour (à gauche), télémédecine et hospitalisés (à droite)
 */
export default function TableauDeBord() {
  const { user } = useAuth();
  const [data, setData] = useState<InfirmierDashboard | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    api.infirmier
      .tableauDeBord()
      .then(setData)
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible de charger le tableau de bord : ${messageErreur(e)}`);
      });
  }, []);

  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className={c.page}>
      {/* ---------- En-tête : salutation + actions d'accueil ---------- */}
      <motion.section className={s.hero} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className={s.salutation}>
          <p className={s.date}>{aujourdhui}</p>
          <h1>Bonjour, {user ? displayName(user) : 'infirmier(e)'}</h1>
          <p className={s.sousTitre}>Accueillez un patient puis prenez ses constantes en quelques clics.</p>
        </div>
        <div className={s.actions}>
          <Link to="/infirmier/patients/inscrire" className={`${s.action} ${s.actionBleue}`}>
            <span className={s.actionIcone}>
              <FaUserPlus aria-hidden="true" />
            </span>
            <span className={s.actionTexte}>
              <strong>Inscrire un nouveau patient</strong>
              <small>Inscription complète ou d'urgence, puis affectation</small>
            </span>
            <FaArrowRight className={s.actionFleche} aria-hidden="true" />
          </Link>
          <Link to="/infirmier/patients/affecter" className={`${s.action} ${s.actionVerte}`}>
            <span className={s.actionIcone}>
              <FaSearch aria-hidden="true" />
            </span>
            <span className={s.actionTexte}>
              <strong>Rechercher et affecter</strong>
              <small>Patient déjà inscrit : dossier, téléphone ou nom</small>
            </span>
            <FaArrowRight className={s.actionFleche} aria-hidden="true" />
          </Link>
        </div>
      </motion.section>

      {erreur && (
        <section className={c.bloc}>
          <p className={c.vide}>Données indisponibles.</p>
        </section>
      )}
      {!erreur && !data && (
        <section className={c.bloc}>
          <p className={c.vide}>Chargement du tableau de bord…</p>
        </section>
      )}

      {data?.mode === 'soins' && <VueSoins data={data} />}
      {data?.mode === 'consultations' && <VueConsultations data={data} />}
    </div>
  );
}

/* ---------- Titre de bloc ---------- */
function EnteteBloc({ icone: Icone, titre, sousTitre, lien, libelleLien, compte }: { icone: IconType; titre: string; sousTitre?: string; lien?: string; libelleLien?: string; compte?: number }) {
  return (
    <div className={s.enteteBloc}>
      <span className={s.enteteIcone}>
        <Icone aria-hidden="true" />
      </span>
      <div className={s.enteteTexte}>
        <h2>
          {titre}
          {compte !== undefined && <span className={s.compte}>{compte}</span>}
        </h2>
        {sousTitre && <p>{sousTitre}</p>}
      </div>
      {lien && (
        <Link to={lien} className={s.lienBloc}>
          {libelleLien} <FaArrowRight aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/* =========================================================
   VARIANTE 1 — SERVICE SOINS INFIRMIER
   ========================================================= */
function VueSoins({ data }: { data: InfirmierDashboardSoins }) {
  const nouveaux = data.soins.filter((x) => x.statut === 'pending');
  const enCours = data.soins.filter((x) => x.statut !== 'pending');

  const liste = (items: typeof data.soins, vide: string, enAttente: boolean) =>
    items.length === 0 ? (
      <p className={s.videListe}>{vide}</p>
    ) : (
      <ul className={s.file}>
        {items.map((x, i) => (
          <motion.li key={x.id} className={s.ligneFile} {...apparition(i)}>
            <span className={s.heure}>{heure(x.heure)}</span>
            <span className={s.avatar}>{initiales(x.patient.nom)}</span>
            <span className={s.patient}>
              <strong>{x.patient.nom}</strong>
              <small>
                {x.patient.code}
                {x.motif ? ` · ${x.motif}` : ''}
              </small>
            </span>
            <span className={`${c.badge} ${c.badgeNeutre}`}>{x.acte || 'Soin'}</span>
            {enAttente ? (
              <Link to="/infirmier/soins/nouvelles" className={s.boutonPrincipal}>
                <FaPlay aria-hidden="true" /> Commencer
              </Link>
            ) : x.statut === 'payment_pending' ? (
              <span className={`${c.badge} ${s.badgeAttente}`}>Paiement en attente</span>
            ) : (
              <Link to="/infirmier/soins/tous" className={s.boutonSecondaire}>
                Continuer <FaArrowRight aria-hidden="true" />
              </Link>
            )}
          </motion.li>
        ))}
      </ul>
    );

  return (
    <>
      <div className={s.colonnes}>
        <motion.section className={c.bloc} {...apparition(0, 0.15)}>
          <EnteteBloc icone={FaNotesMedical} titre="Nouveaux soins du jour" sousTitre="À prendre en charge" compte={nouveaux.length} lien="/infirmier/soins/tous" libelleLien={`Tous les soins (${data.totalSoinsNonTermines})`} />
          {liste(nouveaux, 'Aucun nouveau soin en attente.', true)}
        </motion.section>
        <motion.section className={c.bloc} {...apparition(1, 0.15)}>
          <EnteteBloc icone={FaClipboardList} titre="Soins en cours" sousTitre="En attente de paiement ou à poursuivre" compte={enCours.length} />
          {liste(enCours, 'Aucun soin en cours.', false)}
        </motion.section>
      </div>
    </>
  );
}

/* =========================================================
   VARIANTE 2 — AUTRES SERVICES (consultations infirmières)
   ========================================================= */
function VueConsultations({ data }: { data: InfirmierDashboardConsultations }) {
  return (
    <>
      <div className={s.colonnes}>
        {/* --- File d'attente du jour --- */}
        <motion.section className={`${c.bloc} ${s.principal}`} {...apparition(0, 0.15)}>
          <EnteteBloc
            icone={FaStethoscope}
            titre="File d'attente du jour"
            sousTitre="Patients qui attendent la prise de leurs constantes"
            compte={data.aConsulter.length}
            lien="/infirmier/consultations/toutes"
            libelleLien={`Toutes (${data.totalAConsulter})`}
          />
          {data.aConsulter.length === 0 ? (
            <div className={s.vide}>
              <FaUsers aria-hidden="true" />
              <strong>Personne en attente</strong>
              <p>Inscrivez un patient ou affectez un patient existant avec les boutons ci-dessus.</p>
            </div>
          ) : (
            <ul className={s.file}>
              {data.aConsulter.map((x, i) => (
                <motion.li key={x.id} className={s.ligneFile} {...apparition(i)}>
                  <span className={s.heure}>{heure(x.heure)}</span>
                  <span className={s.avatar}>{initiales(x.patient.nom)}</span>
                  <span className={s.patient}>
                    <strong>{x.patient.nom}</strong>
                    <small>
                      {x.patient.code}
                      {x.motif ? ` · ${x.motif}` : ''}
                    </small>
                  </span>
                  <span className={`${c.badge} ${s.badgeInfo}`}>{x.typeVisite || 'Consultation'}</span>
                  <Link to={`/infirmier/consultations/formulaire/${x.id}`} className={s.boutonPrincipal} title="Prendre les constantes">
                    <FaPlay aria-hidden="true" /> Constantes
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* --- Colonne droite : télémédecine + hospitalisés --- */}
        <div className={s.colonneDroite}>
          <motion.section className={c.bloc} {...apparition(1, 0.15)}>
            <EnteteBloc icone={FaVideo} titre="Télémédecine" compte={data.teleconsultations.length} lien="/infirmier/teleconsultations" libelleLien="Ouvrir" />
            {data.teleconsultations.length === 0 ? (
              <p className={s.videListe}>Aucune séance en attente.</p>
            ) : (
              <ul className={s.mini}>
                {data.teleconsultations.slice(0, 4).map((t, i) => (
                  <motion.li key={t.id} {...apparition(i)}>
                    <span className={`${s.avatarMini} ${t.urgence ? s.avatarUrgence : ''}`}>{t.urgence ? '!' : initiales(t.patient.nom)}</span>
                    <span className={s.patient}>
                      <strong>{t.patient.nom}</strong>
                      <small>
                        {t.medecin} · {t.date ? dateFr(t.date) : "aujourd'hui"} {t.heure || heure(t.creeLe)}
                      </small>
                    </span>
                    {t.etatAppel === 'connecte' ? (
                      <span className={`${c.badge} ${c.badgeOk}`}>Connecté</span>
                    ) : t.etatAppel === 'appel' ? (
                      <span className={`${c.badge} ${s.badgeAttente}`}>
                        <span className={s.pointAppel} /> Appel
                      </span>
                    ) : (
                      <span className={`${c.badge} ${s.badgeViolet}`}>En attente</span>
                    )}
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.section>

          <motion.section className={c.bloc} {...apparition(2, 0.15)}>
            <EnteteBloc icone={FaBed} titre="Hospitalisés" compte={data.hospitalises.length} lien="/infirmier/hospitalisations/en-cours" libelleLien="Suivi" />
            {data.hospitalises.length === 0 ? (
              <p className={s.videListe}>Aucun patient hospitalisé.</p>
            ) : (
              <ul className={s.mini}>
                {data.hospitalises.slice(0, 4).map((h, i) => {
                  const feminin = (h.patient.genre ?? '').toLowerCase().startsWith('f');
                  return (
                    <motion.li key={h.hospitalisationId} {...apparition(i)}>
                      {h.patient.imgUrl ? (
                        <img className={s.avatarMini} src={h.patient.imgUrl.startsWith('http') ? h.patient.imgUrl : uploadUrl('patient', h.patient.imgUrl)} alt="" />
                      ) : (
                        <span className={`${s.avatarMini} ${feminin ? s.avatarF : ''}`}>{initiales(h.patient.nom)}</span>
                      )}
                      <span className={s.patient}>
                        <Link to={`/infirmier/hospitalisations/${h.hospitalisationId}/suivi`} className={s.lienPatient}><strong>{h.patient.nom}</strong></Link>
                        <small>
                          {h.lit ? `Chambre ${h.lit}` : 'En attente de chambre'}
                          {h.medecin ? ` · Dr ${h.medecin.replace(/^dr\.?\s*/i, '')}` : ''}
                        </small>
                      </span>
                      {h.confieAMoi ? <span className={`${c.badge} ${c.badgeOk}`}>Vous</span> : !h.lit && <span className={`${c.badge} ${s.badgeAttente}`}>Sans lit</span>}
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </motion.section>
        </div>
      </div>

    </>
  );
}
