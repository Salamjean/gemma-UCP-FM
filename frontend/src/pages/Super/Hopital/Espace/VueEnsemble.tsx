import { motion } from 'framer-motion';
import { FaArrowRight, FaBed, FaFileMedical, FaShieldAlt } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { CarteStat } from '../../../../components/Statistiques';
import type { HopitalSupervision } from '../../../../types';
import s from './EspaceHopital.module.css';

/**
 * ADMIN UCP-FM > HÔPITAL > VUE D'ENSEMBLE
 * Activité médicale, personnel de santé, lits et services — sans caisse, pharmacie, secrétariat,
 * comptabilité ni montants payés ou dépensés.
 */
export default function VueEnsemble({ data, base }: { data: HopitalSupervision | null; base: string }) {
  if (!data) return <p className={s.chargement}>Chargement…</p>;
  const { activite: a, personnel: p, lits: l } = data;

  const cartes = [
    { icone: '/images/dashboard/consultations.png', valeur: a.consultations, libelle: 'Consultations', fond: '#cfe6fb', couleur: '#2b86e0' },
    { icone: '/images/dashboard/patients.png', valeur: a.patients, libelle: 'Patients', fond: '#e9e4fb', couleur: '#7b4ee8' },
    { icone: '/images/dashboard/naissances.png', valeur: a.naissances, libelle: 'Naissances', fond: '#fff6e4', couleur: '#f5a113' },
    { icone: '/images/dashboard/deces.png', valeur: a.deces, libelle: 'Décès', fond: '#fde0e6', couleur: '#e72e4f' },
  ];
  const personnel: [string, number, string][] = [
    ['Médecins', p.medecins, 'personnel-sante/medecins'],
    ['Sages-femmes', p.sagesFemmes, 'personnel-sante/sages-femmes'],
    ['Infirmiers', p.infirmiers, 'personnel-sante/infirmiers'],
  ];
  const occupation = l.total ? Math.round((l.occupes / l.total) * 100) : 0;

  return (
    <div className={s.vue}>
      <div className={s.cartes}>
        {cartes.map((c, i) => (
          <CarteStat key={c.libelle} {...c} index={i} />
        ))}
      </div>

      <div className={s.colonnes}>
        {/* --- Personnel de santé --- */}
        <motion.section className={s.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <header className={s.titreBloc}>
            <h2>Personnel de santé</h2>
            <span>{p.total} agent(s)</span>
          </header>
          <ul className={s.compteurs}>
            {personnel.map(([libelle, n, chemin]) => (
              <li key={libelle}>
                <Link to={`${base}/${chemin}`}>
                  <span>{libelle}</span>
                  <strong>{n}</strong>
                  <FaArrowRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Link to={`${base}/personnel-sante/ajouter`} className={s.lienAction}>
            Ajouter un agent
          </Link>
        </motion.section>

        {/* --- Hospitalisation --- */}
        <motion.section className={s.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <header className={s.titreBloc}>
            <h2>
              <FaBed aria-hidden="true" /> Hospitalisation
            </h2>
            <span>{l.total} lit(s)</span>
          </header>
          <div className={s.jauge} role="img" aria-label={`Occupation des lits : ${occupation} %`}>
            <span style={{ width: `${occupation}%` }} />
          </div>
          <ul className={s.compteurs}>
            <li>
              <Link to={`${base}/hospitalisation/chambres`}>
                <span>Lits occupés / libres</span>
                <strong>
                  {l.occupes} / {l.libres}
                </strong>
                <FaArrowRight aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link to={`${base}/hospitalisation/liste`}>
                <span>Hospitalisations en cours</span>
                <strong>{a.hospitalisationsEnCours}</strong>
                <FaArrowRight aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </motion.section>

        {/* --- Suivi --- */}
        <motion.section className={s.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <header className={s.titreBloc}>
            <h2>Suivi</h2>
          </header>
          <ul className={s.compteurs}>
            <li>
              <Link to={`${base}/consultations/nouvelles`}>
                <span>Consultations du jour</span>
                <strong>{a.consultationsJour}</strong>
                <FaArrowRight aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link to={`${base}/permissions/en-attente`}>
                <span>
                  <FaFileMedical aria-hidden="true" /> Permissions en attente
                </span>
                <strong>{a.permissionsEnAttente}</strong>
                <FaArrowRight aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link to={`${base}/assurances/liste`}>
                <span>
                  <FaShieldAlt aria-hidden="true" /> Assurances
                </span>
                <strong>{a.assurances}</strong>
                <FaArrowRight aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </motion.section>
      </div>

      {/* --- Services --- */}
      <motion.section className={s.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <header className={s.titreBloc}>
          <h2>Services de l’établissement</h2>
          <Link to={`${base}/services/ajouter`} className={s.lienAction}>
            Ajouter un service
          </Link>
        </header>
        {data.services.length === 0 ? (
          <p className={s.vide}>Aucun service enregistré.</p>
        ) : (
          <ul className={s.services}>
            {data.services.map((x) => (
              <li key={x.id}>
                <Link to={`${base}/services/${x.id}`}>
                  <strong>{x.libelle ?? 'Service'}</strong>
                  <small>
                    {x.medecins} médecin(s) · {x.actif ? 'actif' : 'désactivé'}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
