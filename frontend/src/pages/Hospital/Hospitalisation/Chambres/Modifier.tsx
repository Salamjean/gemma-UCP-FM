import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { ChambreDetail, ChambreSaisie } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import ChambreForm from './ChambreForm';

/**
 * HÔPITAL > HOSPITALISATION > CHAMBRES > MODIFIER (bouton "crayon" de la liste)
 * Équivalent Laravel : hospital.bedroom.show (modification de la chambre, ajout / renommage / retrait des lits)
 */
export default function Modifier() {
  const { id } = useParams();
  const chambreId = Number(id);
  const navigate = useNavigate();
  const [chambre, setChambre] = useState<ChambreDetail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.hospital.chambres
      .detail(chambreId)
      .then(setChambre)
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(messageErreur(e));
      });
  }, [chambreId]);

  const enregistrer = async (data: ChambreSaisie) => {
    setEnvoi(true);
    try {
      const r = await api.hospital.chambres.modifier(chambreId, data);
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
          <h1 className={c.titre}>Modifier {chambre ? `la chambre « ${chambre.numero} »` : 'la chambre'}</h1>
        </div>
        <Link to={`${baseHopital()}/hospitalisation/chambres`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des chambres
        </Link>
      </header>
      {chambre ? (
        <ChambreForm chambre={chambre} boutonTexte="Enregistrer les modifications" envoi={envoi} onEnregistrer={enregistrer} />
      ) : (
        <section className={c.bloc}>
          <p className={c.vide}>{introuvable ? 'Chambre introuvable.' : 'Chargement…'}</p>
        </section>
      )}
    </div>
  );
}
