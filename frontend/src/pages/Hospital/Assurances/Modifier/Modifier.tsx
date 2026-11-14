import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { Assurance, AssuranceSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import AssuranceForm from '../AssuranceForm/AssuranceForm';

/**
 * HÔPITAL > ASSURANCES > MODIFIER (bouton "crayon" de la liste)
 * Équivalent Laravel : hospital.type.assurance.show (formulaire "Modifier les données")
 */
export default function Modifier() {
  const { id } = useParams();
  const assuranceId = Number(id);
  const navigate = useNavigate();
  const [assurance, setAssurance] = useState<Assurance | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.hospital.assurances
      .detail(assuranceId)
      .then(setAssurance)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(messageErreur(e));
      });
  }, [assuranceId]);

  const enregistrer = async (data: AssuranceSaisie) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.assurances.modifier(assuranceId, data);
      await alerte.succes(r.message);
      navigate(`${baseHopital()}/assurances/liste`);
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
          <p className={c.surtitre}>Assurances</p>
          <h1 className={c.titre}>Modifier {assurance ? `« ${assurance.libelle} »` : "l'assurance"}</h1>
        </div>
        <Link to={`${baseHopital()}/assurances/liste`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des assurances
        </Link>
      </header>
      {assurance ? (
        <AssuranceForm
          initial={{ libelle: assurance.libelle, reduction: Math.round(assurance.reduction), description: assurance.description ?? '' }}
          reference={assurance.reference}
          boutonTexte="Enregistrer les modifications"
          envoi={envoi}
          onEnregistrer={enregistrer}
        />
      ) : (
        <section className={c.bloc}>
          <p className={c.vide}>{introuvable ? 'Assurance introuvable.' : 'Chargement…'}</p>
        </section>
      )}
    </div>
  );
}
