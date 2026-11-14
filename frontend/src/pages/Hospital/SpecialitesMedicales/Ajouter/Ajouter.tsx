import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { SpecialiteSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import SpecialiteForm from '../SpecialiteForm/SpecialiteForm';

/**
 * HÔPITAL > SPÉCIALITÉS MÉDICALES > AJOUTER
 * Équivalent Laravel : hospital.type.doctor.add (users/hospital/type_doctor/add.blade.php)
 */
export default function Ajouter() {
  const navigate = useNavigate();
  const [existantes, setExistantes] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.hospital.specialites
      .liste()
      .then((l) => setExistantes(l.map((s) => s.label)))
      .catch(() => undefined); // facultatif : sert seulement à masquer les suggestions déjà prises
  }, []);

  const enregistrer = async (data: SpecialiteSaisie) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.specialites.creer(data);
      await alerte.succes(r.message);
      navigate(`${baseHopital()}/specialites/liste`);
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
          <p className={c.surtitre}>Spécialités médicales</p>
          <h1 className={c.titre}>Ajouter une spécialité</h1>
        </div>
        <Link to={`${baseHopital()}/specialites/liste`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des spécialités
        </Link>
      </header>
      <SpecialiteForm existantes={existantes} boutonTexte="Enregistrer la spécialité" envoi={envoi} onEnregistrer={enregistrer} />
    </div>
  );
}
