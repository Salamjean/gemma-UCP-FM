import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaCheck, FaClock, FaHospitalUser, FaPaperPlane, FaSearch, FaTimes, FaUserMd } from 'react-icons/fa';
import type { MedecinReference } from '../../../../types';
import { useEspaceConsultation } from './espace';
import s from './EnvoiMedecin.module.css';

const p2 = (n: number) => String(n).padStart(2, '0');
const maintenant = () => {
  const d = new Date();
  return { date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, heure: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
};
const nomAffiche = (m: MedecinReference) => (/^dr\.?\s/i.test(m.nom) || m.sageFemme ? m.nom : `Dr ${m.nom}`);

/**
 * INFIRMIER·ÈRE > ISSUE « ENVOYER AU MÉDECIN » — fenêtre de choix du médecin
 * Consignes : seulement les médecins du SERVICE de la consultation, dans leur CRÉNEAU maintenant
 * (planning + permissions ; le serveur vérifie la même règle).
 * La consultation n'est pas terminée : elle passe au médecin choisi avec la saisie déjà faite.
 */
export default function EnvoiMedecin({
  ouvert,
  enCours,
  serviceId,
  service,
  onEnvoyer,
  onFermer,
}: {
  ouvert: boolean;
  enCours: boolean;
  /** Service de la consultation (service_hospitals.id) */
  serviceId: number | null;
  service: string | null;
  onEnvoyer: (doctorId: number) => void;
  onFermer: () => void;
}) {
  const { api } = useEspaceConsultation();
  const [medecins, setMedecins] = useState<MedecinReference[] | null>(null);
  const [choix, setChoix] = useState<number | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    if (!ouvert) return;
    setChoix(null);
    setRecherche('');
    setMedecins(null);
    const m = maintenant();
    // Avec la date et l'heure : chaque médecin vient avec son créneau et « en service » maintenant ou non
    api
      .medecinsReference(m.date, m.heure)
      .then(setMedecins)
      .catch(() => setMedecins([]));
  }, [ouvert]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (medecins ?? [])
      // Même service que la consultation, et dans son créneau maintenant
      .filter((m) => m.enService && (serviceId === null || m.serviceId === serviceId))
      .filter((m) => !q || [m.nom, m.service].some((x) => (x ?? '').toLowerCase().includes(q)))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [medecins, recherche, serviceId]);

  return (
    <AnimatePresence>
      {ouvert && (
        <motion.div className={s.fond} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && !enCours && onFermer()}>
          <motion.div
            className={s.fenetre}
            role="dialog"
            aria-modal="true"
            aria-labelledby="envoi-medecin-titre"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
          >
            <header className={s.entete}>
              <div>
                <h2 id="envoi-medecin-titre">Envoyer au médecin</h2>
                <p>
                  Médecins du service <strong>{service ?? 'de la consultation'}</strong> dans leur créneau maintenant. La consultation n’est pas terminée : le médecin choisi la poursuit
                  avec ce que vous avez déjà saisi.
                </p>
              </div>
              <button type="button" className={s.fermer} onClick={onFermer} disabled={enCours} aria-label="Fermer">
                <FaTimes aria-hidden="true" />
              </button>
            </header>

            <label className={s.recherche}>
              <FaSearch aria-hidden="true" />
              <input type="search" placeholder="Rechercher un médecin ou un service…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un médecin" />
            </label>

            <ul className={s.liste} role="radiogroup" aria-label="Médecin">
              {!medecins && <li className={s.vide}>Chargement des médecins…</li>}
              {medecins && liste.length === 0 && (
                <li className={s.vide}>
                  {recherche ? 'Aucun médecin ne correspond.' : `Aucun médecin du service ${service ?? 'de la consultation'} n’est dans son créneau en ce moment.`}
                </li>
              )}
              {liste.map((m) => (
                <li key={m.id}>
                  <button type="button" role="radio" aria-checked={choix === m.id} className={`${s.medecin} ${choix === m.id ? s.choisi : ''}`} onClick={() => setChoix(m.id)}>
                    <span className={s.icone}>{choix === m.id ? <FaCheck aria-hidden="true" /> : <FaUserMd aria-hidden="true" />}</span>
                    <span className={s.texte}>
                      <strong>{nomAffiche(m)}</strong>
                      <small>
                        <FaHospitalUser aria-hidden="true" /> {m.service || 'Service non renseigné'}
                      </small>
                    </span>
                    <span className={s.creneau}>
                      <span className={`${s.badge} ${m.enService ? s.badgeOk : s.badgeKo}`}>{m.enService ? 'En service' : 'Hors créneau'}</span>
                      <small>
                        <FaClock aria-hidden="true" /> {m.creneau ?? 'Pas de créneau aujourd’hui'}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <footer className={s.pied}>
              <button type="button" className={s.annuler} onClick={onFermer} disabled={enCours}>
                Annuler
              </button>
              <button type="button" className={s.envoyer} onClick={() => choix && onEnvoyer(choix)} disabled={!choix || enCours}>
                <FaPaperPlane aria-hidden="true" /> {enCours ? 'Envoi…' : 'Envoyer au médecin'}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
