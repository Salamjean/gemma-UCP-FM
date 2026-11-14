import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import type { HopitalDetail } from '../../../../types';
import HopitalForm, { HOPITAL_VIDE, type HopitalValeurs } from '../HopitalForm/HopitalForm';

/**
 * SUPER > HÔPITAL > MODIFIER (bouton crayon de la liste)
 * Équivalent Laravel : super.hospital.show / super.hospital.update
 * Le code de l'établissement n'est pas modifiable ; le mot de passe est facultatif.
 */
export default function Modifier() {
  const { id } = useParams();
  const [detail, setDetail] = useState<HopitalDetail | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    api.super.hopitaux.detail(Number(id)).then(setDetail).catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible de charger l'hôpital : ${messageErreur(e)}`);
      });
  }, [id]);

  if (erreur) return <p style={{ padding: 24, color: 'var(--dash-muted)' }}>Données indisponibles.</p>;
  if (!detail) return <p style={{ padding: 24, color: 'var(--dash-muted)' }}>Chargement…</p>;

  const initial: HopitalValeurs = {
    ...HOPITAL_VIDE,
    label: detail.label ?? '',
    reference: detail.reference ?? '',
    contact: detail.contact ?? '',
    localite: detail.localiteId,
    district: detail.district ?? '',
    directionGenerale: detail.directionGenerale ?? '',
    teleconsultation: detail.teleconsultation,
    email: detail.email ?? '',
  };

  return (
    <HopitalForm
      mode="modification"
      titre={`Modifier : ${detail.label ?? 'hôpital'}`}
      initial={initial}
      imgUrl={detail.imgUrl}
      onEnvoyer={async (data) => (await api.super.hopitaux.modifier(detail.id, data)).message}
    />
  );
}
