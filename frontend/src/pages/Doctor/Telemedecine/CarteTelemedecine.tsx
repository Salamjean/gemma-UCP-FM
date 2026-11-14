import { motion } from 'framer-motion';
import { FaCalendarAlt, FaClock, FaEye, FaHospital, FaPhoneAlt, FaPlay, FaUserNurse, FaVideo } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { lancerAppelVideo } from '../../../components/AppelVideo';
import c from '../../../styles/espace.module.css';
import type { DoctorTelemedecineItem } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient } from '../Consultations/ListeConsultations';
import s from './Telemedecine.module.css';

const p2 = (n: number) => String(n).padStart(2, '0');
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

/** « Aujourd'hui », « Demain » ou JJ/MM/AAAA */
export function libelleDate(date: string | null) {
  if (!date) return 'Date à définir';
  const auj = aujourdhui();
  if (date === auj) return "Aujourd'hui";
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  if (date === `${demain.getFullYear()}-${p2(demain.getMonth() + 1)}-${p2(demain.getDate())}`) return 'Demain';
  const [a, m, j] = date.split('-');
  return `${j}/${m}/${a}`;
}

const CONSTANTES: { k: keyof DoctorTelemedecineItem['constantes']; l: string; u: string }[] = [
  { k: 'tension', l: 'TA', u: '' },
  { k: 'temperature', l: 'T°', u: '°C' },
  { k: 'pouls', l: 'Pouls', u: 'bpm' },
  { k: 'saturation', l: 'SpO₂', u: '%' },
  { k: 'poids', l: 'Poids', u: 'kg' },
];

/**
 * MÉDECIN > Carte d'une télémédecine programmée (onglet Télémédecine et tableau de bord)
 */
export default function CarteTelemedecine({ item, index = 0, compacte }: { item: DoctorTelemedecineItem; index?: number; compacte?: boolean }) {
  const enRetard = !item.terminee && !!item.date && item.date < aujourdhui();
  const duJour = item.date === aujourdhui();
  const constantes = CONSTANTES.filter((k) => item.constantes[k.k]);

  return (
    <motion.article
      className={`${s.carte} ${duJour && !item.terminee ? s.carteDuJour : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.04 }}
    >
      <header className={s.carteHaut}>
        <span className={`${s.rendezVous} ${enRetard ? s.retard : ''}`}>
          <FaCalendarAlt aria-hidden="true" /> {libelleDate(item.date)}
          {item.heure && (
            <>
              <FaClock aria-hidden="true" /> {item.heure}
            </>
          )}
        </span>
        {item.appelEnCours && !item.terminee ? (
          <span className={`${c.badge} ${s.badgeAppel}`}>
            <FaVideo aria-hidden="true" /> Appel en cours
          </span>
        ) : item.terminee ? (
          <span className={`${c.badge} ${c.badgeOk}`}>{item.issue ?? 'Terminée'}</span>
        ) : enRetard ? (
          <span className={`${c.badge} ${s.badgeRetard}`}>En retard</span>
        ) : (
          <span className={`${c.badge} ${s.badgeAttente}`}>En attente</span>
        )}
      </header>

      <div className={s.patient}>
        <AvatarPatient patient={item.patient} />
        <div>
          <strong>
            {item.patient.nom}
            {item.urgence && <em className={s.urgence}>Urgence</em>}
          </strong>
          <small>
            {item.patient.code}
            {age(item.patient.dateNaissance) ? ` · ${age(item.patient.dateNaissance)}` : ''}
          </small>
        </div>
      </div>

      <p className={s.motif}>{item.motif}</p>

      {!compacte && constantes.length > 0 && (
        <div className={s.constantes}>
          {constantes.map((k) => (
            <span key={k.k}>
              <small>{k.l}</small>
              {item.constantes[k.k]}
              {k.u && ` ${k.u}`}
            </span>
          ))}
        </div>
      )}

      <dl className={s.demandeur}>
        <div>
          <dt>
            <FaUserNurse aria-hidden="true" /> Programmée par
          </dt>
          <dd>{item.infirmier ?? 'Demande en ligne du patient'}</dd>
        </div>
        {item.hopitalDemandeur && (
          <div>
            <dt>
              <FaHospital aria-hidden="true" /> Depuis
            </dt>
            <dd>{item.hopitalDemandeur}</dd>
          </div>
        )}
      </dl>

      {!compacte && item.note && <p className={s.note}>« {item.note} »</p>}

      <div className={s.actions}>
      {!item.terminee && (
        <button type="button" className={`${c.secondaire} ${s.bouton} ${item.appelEnCours ? s.boutonAppelActif : ''}`} onClick={() => lancerAppelVideo(item.id)}>
          <FaPhoneAlt aria-hidden="true" /> {item.appelEnCours ? 'Rejoindre l’appel' : 'Appel vidéo'}
        </button>
      )}
      <Link to={`/medecin/consultations/${item.id}`} className={`${item.terminee ? c.secondaire : c.principal} ${s.bouton}`}>
        {item.terminee ? (
          <>
            <FaEye aria-hidden="true" /> Voir la fiche
          </>
        ) : (
          <>
            <FaPlay aria-hidden="true" /> Démarrer la consultation
          </>
        )}
      </Link>
      </div>
    </motion.article>
  );
}
