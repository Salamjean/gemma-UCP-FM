import { useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { ChambreSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import ChambreForm from './ChambreForm';

/**
 * HÔPITAL > HOSPITALISATION > CHAMBRES > AJOUTER (bouton de la liste)
 * Équivalent Laravel : hospital.bedroom.add (?individual / ?collective)
 */
export default function Ajouter() {
  const navigate = useNavigate();
  const [envoi, setEnvoi] = useState(false);

  const enregistrer = async (data: ChambreSaisie) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.chambres.creer(data);
      await alerte.succes(r.message);
      navigate(`${baseHopital()}/hospitalisation/chambres`);
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
          <p className={c.surtitre}>Hospitalisation · Chambres</p>
          <h1 className={c.titre}>Ajouter une chambre</h1>
        </div>
        <Link to={`${baseHopital()}/hospitalisation/chambres`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des chambres
        </Link>
      </header>
      <ChambreForm boutonTexte="Enregistrer la chambre" envoi={envoi} onEnregistrer={enregistrer} />
    </div>
  );
}
