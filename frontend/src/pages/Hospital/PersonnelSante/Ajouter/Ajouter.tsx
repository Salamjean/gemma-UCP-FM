import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { OptionsPersonnel, TypeAgent } from '../../../../types';
import AgentForm from '../AgentForm/AgentForm';
import { AGENTS, ORDRE_AGENTS } from '../personnel.config';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Ajouter.module.css';

/**
 * HÔPITAL > PERSONNEL DE SANTÉ > AJOUTER
 * Équivalent Laravel : hospital.doctor.add/{agent} (médecin, sage-femme), hospital.infirmier.add
 * Le type d'agent se choisit en haut (ou arrive par l'adresse : ?type=infirmier depuis une liste).
 */
export default function Ajouter() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = (ORDRE_AGENTS.includes(params.get('type') as TypeAgent) ? params.get('type') : 'medecin') as TypeAgent;
  const [options, setOptions] = useState<OptionsPersonnel | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.hospital.personnel
      .options()
      .then(setOptions)
      .catch((e) => alerte.echec(`Impossible de charger les services : ${messageErreur(e)}`));
  }, []);

  const enregistrer = async (data: FormData) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.personnel.creer(type, data);
      await alerte.succes(r.message);
      navigate(`${baseHopital()}/personnel-sante/${AGENTS[type].chemin}`);
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Personnel de santé</p>
          <h1 className={c.titre}>Ajouter un agent de santé</h1>
        </div>
      </header>

      <div className={styles.types} role="radiogroup" aria-label="Type d'agent">
        {ORDRE_AGENTS.map((t) => {
          const a = AGENTS[t];
          const actif = t === type;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={actif}
              className={`${styles.type} ${actif ? styles.typeActif : ''}`}
              onClick={() => setParams({ type: t }, { replace: true })}
            >
              <span className={styles.typeIcone} style={{ background: a.fond, color: a.texte }}>
                <a.icone aria-hidden="true" />
              </span>
              <span className={styles.typeTexte}>
                <strong>{a.libelle}</strong>
                <small>{a.description}</small>
              </span>
              {actif && (
                <motion.span layoutId="type-agent" className={styles.typeCoche} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
                  <FaCheck />
                </motion.span>
              )}
            </button>
          );
        })}
      </div>

      {options ? (
        <motion.div key={type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <AgentForm
            type={type}
            options={options}
            boutonTexte={`Enregistrer le/la ${AGENTS[type].libelle.toLowerCase()}`}
            envoi={envoi}
            onEnregistrer={enregistrer}
            retour={`${baseHopital()}/personnel-sante/${AGENTS[type].chemin}`}
          />
        </motion.div>
      ) : (
        <section className={c.bloc}>
          <p className={c.vide}>Chargement…</p>
        </section>
      )}
    </div>
  );
}
