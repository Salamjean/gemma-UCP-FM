import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { AgentFiche, OptionsPersonnel, TypeAgent } from '../../../../types';
import AgentForm from '../AgentForm/AgentForm';
import { baseHopital } from '../../../../services/contexteHopital';
import { AGENTS, ORDRE_AGENTS } from '../personnel.config';

/**
 * HÔPITAL > PERSONNEL DE SANTÉ > MODIFIER (bouton "crayon" d'une liste)
 * Équivalent Laravel : hospital.doctor.show, hospital.infirmier.show
 * Adresse : /hopital/personnel-sante/:type/:id/modifier
 */
export default function Modifier() {
  const params = useParams();
  const type = params.type as TypeAgent;
  const id = Number(params.id);
  const navigate = useNavigate();
  const [fiche, setFiche] = useState<AgentFiche | null>(null);
  const [options, setOptions] = useState<OptionsPersonnel | null>(null);
  const [introuvable, setIntrouvable] = useState(!ORDRE_AGENTS.includes(type));
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!ORDRE_AGENTS.includes(type)) return;
    Promise.all([api.hospital.personnel.detail(type, id), api.hospital.personnel.options()])
      .then(([f, o]) => {
        setFiche(f);
        setOptions(o);
      })
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(messageErreur(e));
      });
  }, [type, id]);

  const conf = AGENTS[type] ?? AGENTS.medecin;
  const liste = `${baseHopital()}/personnel-sante/${conf.chemin}`;

  const enregistrer = async (data: FormData) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.personnel.modifier(type, id, data);
      await alerte.succes(r.message);
      navigate(liste);
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
          <p className={c.surtitre}>Personnel de santé · {conf.libelle}</p>
          <h1 className={c.titre}>Modifier {fiche ? `« ${fiche.nom} »` : "l'agent"}</h1>
        </div>
        <Link to={liste} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> {conf.pluriel}
        </Link>
      </header>
      {fiche && options ? (
        <AgentForm type={type} options={options} fiche={fiche} boutonTexte="Enregistrer les modifications" envoi={envoi} onEnregistrer={enregistrer} retour={liste} />
      ) : (
        <section className={c.bloc}>
          <p className={c.vide}>{introuvable ? 'Agent introuvable.' : 'Chargement…'}</p>
        </section>
      )}
    </div>
  );
}
