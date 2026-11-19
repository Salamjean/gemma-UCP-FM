import { FaMapMarkedAlt } from 'react-icons/fa';
import s from './HorsDistrict.module.css';

/**
 * Envoi EN EXTERNE : interrupteur « Envoyer hors du district ».
 *   désactivé (par défaut) → seuls les hôpitaux du MÊME district sanitaire sont proposés ;
 *   activé                 → seuls les hôpitaux des AUTRES districts sont proposés.
 */
export default function HorsDistrict({ valeur, onChange, id }: { valeur: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <div className={s.ligne}>
      <label className={s.interrupteur} htmlFor={id}>
        <input id={id} type="checkbox" role="switch" checked={valeur} onChange={(e) => onChange(e.target.checked)} />
        <span className={s.piste} aria-hidden="true">
          <span className={s.bouton} />
        </span>
        <span className={s.libelle}>
          <FaMapMarkedAlt aria-hidden="true" /> Envoyer hors du district
        </span>
      </label>
      <small className={s.aide}>{valeur ? 'Hôpitaux des autres districts sanitaires' : 'Hôpitaux de votre district sanitaire'}</small>
    </div>
  );
}
