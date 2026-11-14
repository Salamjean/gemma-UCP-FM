import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { Specialite, SpecialiteSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import SpecialiteForm from '../SpecialiteForm/SpecialiteForm';

/**
 * HÔPITAL > SPÉCIALITÉS MÉDICALES > MODIFIER (bouton "crayon" de la liste)
 * Équivalent Laravel : hospital.type.doctor.show (formulaire de modification)
 */
export default function Modifier() {
  const { id } = useParams();
  const specialiteId = Number(id);
  const navigate = useNavigate();
  const [specialite, setSpecialite] = useState<Specialite | null>(null);
  const [existantes, setExistantes] = useState<string[]>([]);
  const [introuvable, setIntrouvable] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    Promise.all([api.hospital.specialites.detail(specialiteId), api.hospital.specialites.liste()])
      .then(([s, liste]) => {
        setSpecialite(s);
        setExistantes(liste.filter((x) => x.id !== s.id).map((x) => x.label));
      })
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(messageErreur(e));
      });
  }, [specialiteId]);

  const enregistrer = async (data: SpecialiteSaisie) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.specialites.modifier(specialiteId, data);
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
          <h1 className={c.titre}>Modifier {specialite ? `« ${specialite.label} »` : 'la spécialité'}</h1>
        </div>
        <Link to={`${baseHopital()}/specialites/liste`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des spécialités
        </Link>
      </header>
      {specialite ? (
        <SpecialiteForm
          initial={{ label: specialite.label, description: specialite.description ?? '' }}
          existantes={existantes}
          boutonTexte="Enregistrer les modifications"
          envoi={envoi}
          onEnregistrer={enregistrer}
        />
      ) : (
        <section className={c.bloc}>
          <p className={c.vide}>{introuvable ? 'Spécialité introuvable.' : 'Chargement…'}</p>
        </section>
      )}
    </div>
  );
}
