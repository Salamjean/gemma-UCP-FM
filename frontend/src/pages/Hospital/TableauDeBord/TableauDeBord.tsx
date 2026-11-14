import { useEffect, useState } from 'react';
import {
  BARRES_BORD,
  BARRES_FOND,
  CarteStat,
  COURBE_DECES,
  COURBE_NAISSANCES,
  Graphique,
  moisFr,
} from '../../../components/Statistiques';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import type { HospitalDashboard } from '../../../types';
import styles from './TableauDeBord.module.css';

/**
 * HÔPITAL > TABLEAU DE BORD
 * Données : GET /api/hospital/tableau-de-bord — uniquement l'hôpital connecté
 * (mêmes calculs que Laravel : dashboard/hospital.blade.php + DashboardHospitalRepository)
 */
export default function TableauDeBord() {
  const [data, setData] = useState<HospitalDashboard | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    api.hospital.tableauDeBord().then(setData).catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible de charger le tableau de bord : ${messageErreur(e)}`);
      });
  }, []);

  if (erreur) return <p style={{ padding: 24, color: 'var(--dash-muted)' }}>Données indisponibles.</p>;
  if (!data) return <p className={styles.chargement}>Chargement…</p>;

  const cartes = [
    { icone: '/images/dashboard/consultations-hopital.png', valeur: data.cartes.consultations, libelle: 'Consultations', fond: '#cfe6fb', couleur: '#2b86e0' },
    { icone: '/images/dashboard/naissances.png', valeur: data.cartes.naissances, libelle: 'Déclarations de naissance', fond: '#fff6e4', couleur: '#f5a113' },
    { icone: '/images/dashboard/deces.png', valeur: data.cartes.deces, libelle: 'Déclarations de décès', fond: '#fde0e6', couleur: '#e72e4f' },
  ];

  const libelles = data.mois.map(moisFr);

  return (
    <div className={styles.page}>
      <div className={styles.cartes}>
        {cartes.map((c, i) => (
          <CarteStat key={c.libelle} {...c} index={i} />
        ))}
      </div>

      <div className={styles.graphiques}>
        <Graphique
          type="line"
          titre="Naissances et décès par mois"
          libelles={libelles}
          index={0}
          series={[
            { label: 'Nombre de naissance.', data: data.naissances, ...COURBE_NAISSANCES },
            { label: 'Nombre de décès.', data: data.deces, ...COURBE_DECES },
          ]}
        />
        <Graphique
          type="bar"
          titre="Consultations par mois"
          libelles={libelles}
          index={1}
          series={[{ label: 'Nombre de consultation.', data: data.consultations, couleur: BARRES_BORD, fond: BARRES_FOND }]}
        />
      </div>
    </div>
  );
}
