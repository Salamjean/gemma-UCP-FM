import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaCalendarCheck, FaCalendarWeek, FaClock, FaHospital, FaMugHot, FaRedo, FaUserMd } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../services/alertes';
import { apiAgent, type EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierPlanningResponse, PlanningJourItem } from '../../../types';
import s from './Planning.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

const minutes = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

/** Créneau affiché : "Toute la journée" ou "08:00 – 17:00" */
const creneau = (j: PlanningJourItem) => (j.journeeEntiere ? 'Toute la journée' : `${j.debut} – ${j.fin}`);

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const GRADUATIONS = [0, 6, 12, 18, 24];

/**
 * INFIRMIER > PLANNING
 * Équivalent Laravel : users.planning
 *   - bandeau « aujourd'hui » : en service maintenant / hors créneau / repos ;
 *   - semaine en frise horaire 0 h → 24 h (jour courant mis en avant) ;
 *   - rendez-vous programmés du service.
 */
export default function Planning({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const source = apiAgent(espace);
  const [chargement, setChargement] = useState(true);
  const [data, setData] = useState<InfirmierPlanningResponse | null>(null);

  const charger = async () => {
    setChargement(true);
    try {
      setData(await source.planning.get());
    } catch (e) {
      alerte.echec(`Erreur de chargement du planning : ${messageErreur(e)}`);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const maintenant = new Date();
  const indexJour = (maintenant.getDay() + 6) % 7; // 0 = lundi, comme Laravel
  const minuteCourante = maintenant.getHours() * 60 + maintenant.getMinutes();
  const aujourdhui = data?.jours.find((j) => j.index === indexJour) ?? null;
  // Permission accordée en cours : hors service pendant toute la permission
  const permission = data?.permission ?? null;
  const finPermission = permission
    ? `${new Date(`${permission.fin}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${permission.heureFin ? ` à ${permission.heureFin}` : ''}`
    : null;
  const enService =
    !permission &&
    !!aujourdhui?.travaille &&
    (aujourdhui.journeeEntiere || (minuteCourante >= minutes(aujourdhui.debut) && minuteCourante <= minutes(aujourdhui.fin)));
  const joursTravailles = data?.jours.filter((j) => j.travaille) ?? [];
  const prochainJour = data && !enService ? [...data.jours.slice(indexJour + 1), ...data.jours.slice(0, indexJour + 1)].find((j) => j.travaille) : null;

  // Tableaux : 10 lignes par page
  const pg = usePagination(data?.rendezVous);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Mon espace</p>
          <h1 className={c.titre}>Mon planning</h1>
        </div>
        <div className={c.boutons}>
          <button type="button" className={c.secondaire} onClick={charger} disabled={chargement}>
            <FaRedo aria-hidden="true" /> Actualiser
          </button>
        </div>
      </header>

      {/* --- Aujourd'hui --- */}
      <motion.section className={`${s.aujourdhui} ${enService ? s.aujourdhuiActif : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className={s.aujourdhuiIcone}>{enService ? <FaClock aria-hidden="true" /> : <FaMugHot aria-hidden="true" />}</span>
        <div className={s.aujourdhuiTexte}>
          <small>
            Aujourd'hui · {maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </small>
          <strong>
            {!data ? 'Chargement…' : permission ? 'En permission : hors service' : enService ? 'Vous êtes en service' : aujourdhui?.travaille ? 'Hors de votre créneau' : 'Jour de repos'}
          </strong>
          <span>
            {permission ? `Permission accordée jusqu'au ${finPermission}` : aujourdhui?.travaille ? `Créneau du jour : ${creneau(aujourdhui)}` : prochainJour ? `Prochain service : ${prochainJour.nom}, ${creneau(prochainJour)}` : data ? 'Aucun jour de service défini' : ''}
          </span>
        </div>
        <dl className={s.aujourdhuiInfos}>
          <div>
            <dt>Établissement</dt>
            <dd>
              <FaHospital aria-hidden="true" /> {data?.hospitalNom ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Jours de service</dt>
            <dd>{data ? `${joursTravailles.length} / 7` : '—'}</dd>
          </div>
        </dl>
      </motion.section>

      {/* --- Semaine --- */}
      <section className={c.bloc}>
        <div className={s.titreBloc}>
          <span className={s.titreIcone}>
            <FaCalendarWeek aria-hidden="true" />
          </span>
          <div>
            <h2>Ma semaine</h2>
            <p>Vos jours et tranches horaires de service.</p>
          </div>
        </div>

        {chargement && !data ? (
          <p className={c.vide}>Chargement du planning…</p>
        ) : (
          <div className={s.semaine}>
            <div className={`${s.jour} ${s.echelle}`} aria-hidden="true">
              <span />
              <div className={s.piste}>
                {GRADUATIONS.map((h) => (
                  <small key={h} style={{ left: `${(h / 24) * 100}%` }}>
                    {h} h
                  </small>
                ))}
              </div>
              <span />
            </div>
            {data?.jours.map((j, i) => {
              const debut = j.journeeEntiere ? 0 : minutes(j.debut);
              const fin = j.journeeEntiere ? 1440 : Math.max(minutes(j.fin), debut);
              const courant = j.index === indexJour;
              return (
                <motion.div
                  key={j.index}
                  className={`${s.jour} ${courant ? s.jourCourant : ''}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <span className={s.jourNom}>
                    {j.nom}
                    {courant && <small>Aujourd'hui</small>}
                  </span>
                  <div className={s.piste}>
                    {GRADUATIONS.slice(1, -1).map((h) => (
                      <i key={h} style={{ left: `${(h / 24) * 100}%` }} />
                    ))}
                    {j.travaille && <span className={s.plage} style={{ left: `${(debut / 1440) * 100}%`, width: `${((fin - debut) / 1440) * 100}%` }} />}
                    {courant && <span className={s.curseur} style={{ left: `${(minuteCourante / 1440) * 100}%` }} />}
                  </div>
                  <span className={s.jourHoraire}>
                    {j.travaille ? (
                      <>
                        <strong>{creneau(j)}</strong>
                        <span className={`${c.badge} ${c.badgeOk}`}>En service</span>
                      </>
                    ) : (
                      <span className={`${c.badge} ${c.badgeNeutre}`}>Repos</span>
                    )}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* --- Rendez-vous (pas pour le régulateur) --- */}
      {espace !== 'regulateur' && (
      <section className={c.bloc}>
        <div className={s.titreBloc}>
          <span className={s.titreIcone}>
            <FaCalendarCheck aria-hidden="true" />
          </span>
          <div>
            <h2>Rendez-vous programmés</h2>
            <p>Consultations planifiées du service, des 7 derniers jours et à venir.</p>
          </div>
          {data && <span className={s.compte}>{data.rendezVous.length}</span>}
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${s.tableCentree}`}>
            <thead>
              <tr>
                <th>Date & heure</th>
                <th>Patient</th>
                <th>Médecin</th>
                <th>Motif</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {chargement && !data ? (
                <tr>
                  <td colSpan={5} className={c.vide}>
                    Chargement des rendez-vous…
                  </td>
                </tr>
              ) : !data || data.rendezVous.length === 0 ? (
                <tr>
                  <td colSpan={5} className={c.vide}>
                    Aucun rendez-vous programmé pour cette période.
                  </td>
                </tr>
              ) : (
                pg.lignes.map((rdv) => (
                  <tr key={rdv.id}>
                    <td>
                      <strong>{formatDate(rdv.date)}</strong>
                      <small className={s.ligneSec}>{rdv.heure}</small>
                    </td>
                    <td>
                      <strong>{rdv.patient.nom}</strong>
                      <small className={s.ligneSec}>
                        {rdv.patient.code}
                        {rdv.patient.telephone !== '—' ? ` · ${rdv.patient.telephone}` : ''}
                      </small>
                    </td>
                    <td>
                      <span className={s.medecin}>
                        <FaUserMd aria-hidden="true" /> {rdv.medecin}
                      </span>
                    </td>
                    <td>{rdv.motif}</td>
                    <td>
                      <span className={`${c.badge} ${rdv.statut === 'Terminé' ? c.badgeOk : s.badgeAttente}`}>{rdv.statut}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationTableau pagination={pg} />
      </section>
      )}
    </div>
  );
}
