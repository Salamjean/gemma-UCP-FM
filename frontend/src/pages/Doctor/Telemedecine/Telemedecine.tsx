import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaEye, FaPhoneAlt, FaPlay, FaSyncAlt, FaVideo } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { lancerAppelVideo } from '../../../components/AppelVideo';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorTelemedecineItem, DoctorTelemedecines } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient } from '../Consultations/ListeConsultations';
import tab from '../Consultations/Consultations.module.css';
import { libelleDate } from './CarteTelemedecine';
import s from './Telemedecine.module.css';

const FILTRES: { id: string; libelle: string; cle: keyof DoctorTelemedecines['compteurs'] }[] = [
  { id: 'en-attente', libelle: 'En attente', cle: 'enAttente' },
  { id: 'aujourdhui', libelle: "Aujourd'hui", cle: 'aujourdhui' },
  { id: 'terminees', libelle: 'Terminées', cle: 'terminees' },
  { id: 'toutes', libelle: 'Toutes', cle: 'toutes' },
];

const p2 = (n: number) => String(n).padStart(2, '0');
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

/** Statut d'une télémédecine : appel en cours, terminée, en retard ou en attente */
function Statut({ item }: { item: DoctorTelemedecineItem }) {
  if (item.appelEnCours && !item.terminee)
    return (
      <span className={`${c.badge} ${s.badgeAppel}`}>
        <FaVideo aria-hidden="true" /> Appel en cours
      </span>
    );
  if (item.terminee) return <span className={`${c.badge} ${c.badgeOk}`}>{item.issue ?? 'Terminée'}</span>;
  if (item.date && item.date < aujourdhui()) return <span className={`${c.badge} ${s.badgeRetard}`}>En retard</span>;
  return <span className={`${c.badge} ${s.badgeAttente}`}>En attente</span>;
}

/**
 * MÉDECIN > TÉLÉMÉDECINE (remplace « Appels vidéo HD »)
 * Télémédecines programmées par l'infirmier (orientation « Télémédecine ») ou demandées en ligne par le patient,
 * attribuées au médecin connecté. Chaque carte ouvre le formulaire de consultation.
 */
export default function Telemedecine() {
  const [filtre, setFiltre] = useState('en-attente');
  const [data, setData] = useState<DoctorTelemedecines | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let actif = true;
    api.doctor
      .telemedecines(filtre)
      .then((d) => {
        if (actif) setData(d);
      })
      .catch((e) => {
        if (actif) alerte.echec(`Impossible de charger les télémédecines : ${messageErreur(e)}`);
      });
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [filtre, tick]);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Télémédecine</p>
          <h1 className={c.titre}>Mes télémédecines</h1>
        </div>
        <div className={c.boutons}>
          <button type="button" className={c.secondaire} onClick={() => setTick((x) => x + 1)}>
            <FaSyncAlt aria-hidden="true" /> Actualiser
          </button>
        </div>
      </header>

      <section className={c.bloc}>
        <div className={s.filtres} role="tablist" aria-label="Filtrer les télémédecines">
          {FILTRES.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filtre === f.id} className={filtre === f.id ? s.filtreActif : ''} onClick={() => setFiltre(f.id)}>
              {f.libelle}
              <span>{data?.compteurs[f.cle] ?? '·'}</span>
            </button>
          ))}
        </div>

        {!data ? (
          <p className={c.vide}>Chargement…</p>
        ) : data.liste.length === 0 ? (
          <div className={s.vide}>
            <FaVideo aria-hidden="true" />
            <strong>{filtre === 'terminees' ? 'Aucune télémédecine terminée' : 'Aucune télémédecine en attente'}</strong>
            <p>Les télémédecines programmées pour vous par un infirmier apparaîtront ici.</p>
          </div>
        ) : (
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Rendez-vous</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Programmée par</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.liste.map((x, i) => (
                  <motion.tr key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                    <td>
                      <span className={tab.patient}>
                        <AvatarPatient patient={x.patient} />
                        <span>
                          <strong>{x.patient.nom}</strong>
                          <small>
                            {x.patient.code}
                            {age(x.patient.dateNaissance) ? ` · ${age(x.patient.dateNaissance)}` : ''}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={tab.empile}>
                        <strong className={!x.terminee && !!x.date && x.date < aujourdhui() ? s.retard : undefined}>{libelleDate(x.date)}</strong>
                        <small>{x.heure ?? '—'}</small>
                      </span>
                    </td>
                    <td className={tab.motif}>{x.motif}</td>
                    <td>
                      <span className={tab.empile}>
                        <strong>{x.infirmier ?? 'Demande en ligne'}</strong>
                        {x.hopitalDemandeur && <small>{x.hopitalDemandeur}</small>}
                      </span>
                    </td>
                    <td>
                      <span className={tab.statuts}>
                        {x.urgence && <span className={`${c.badge} ${tab.badgeUrgence}`}>Urgence</span>}
                        <Statut item={x} />
                      </span>
                    </td>
                    <td>
                      <span className={s.actionsLigne}>
                        {!x.terminee && (
                          <button type="button" className={`${c.secondaire} ${tab.action} ${x.appelEnCours ? s.boutonAppelActif : ''}`} onClick={() => lancerAppelVideo(x.id)}>
                            <FaPhoneAlt aria-hidden="true" /> {x.appelEnCours ? 'Rejoindre' : 'Appeler'}
                          </button>
                        )}
                        <Link to={`/medecin/consultations/${x.id}`} className={`${x.terminee ? c.secondaire : c.principal} ${tab.action}`}>
                          {x.terminee ? (
                            <>
                              <FaEye aria-hidden="true" /> Voir
                            </>
                          ) : (
                            <>
                              <FaPlay aria-hidden="true" /> Consulter
                            </>
                          )}
                        </Link>
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
