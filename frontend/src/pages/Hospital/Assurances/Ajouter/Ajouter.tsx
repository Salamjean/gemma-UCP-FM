import { useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { AssuranceSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import AssuranceForm from '../AssuranceForm/AssuranceForm';

/**
 * HÔPITAL > ASSURANCES > AJOUTER
 * Équivalent Laravel : hospital.type.assurance.create (users/hospital/type_assurance/create.blade.php)
 */
export default function Ajouter() {
  const navigate = useNavigate();
  const [envoi, setEnvoi] = useState(false);

  const enregistrer = async (data: AssuranceSaisie) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.assurances.creer(data);
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
          <h1 className={c.titre}>Ajouter une assurance</h1>
        </div>
        <Link to={`${baseHopital()}/assurances/liste`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des assurances
        </Link>
      </header>
      <AssuranceForm boutonTexte="Enregistrer l'assurance" envoi={envoi} onEnregistrer={enregistrer} />
    </div>
  );
}
