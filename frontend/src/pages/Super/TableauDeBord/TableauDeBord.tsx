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
import ExportExcel, { feuilleExport } from '../../../components/ExportExcel';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import type { SuperDashboard } from '../../../types';
import styles from './TableauDeBord.module.css';

/**
 * SUPER > TABLEAU DE BORD
 * Données : GET /api/super/tableau-de-bord (base Laravel, mêmes calculs que DashboardSuperRepository)
 */
export default function TableauDeBord() {
  const [data, setData] = useState<SuperDashboard | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    api.super.tableauDeBord().then(setData).catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible de charger le tableau de bord : ${messageErreur(e)}`);
      });
  }, []);

  if (erreur) return <p style={{ padding: 24, color: 'var(--dash-muted)' }}>Données indisponibles.</p>;
  if (!data) return <p className={styles.chargement}>Chargement…</p>;

  const cartes = [
    { icone: '/images/dashboard/hopitaux.png', valeur: data.cartes.hopitaux, libelle: 'Hôpitaux DMHP', fond: '#e8f7f1', couleur: '#0f9d6c' },
    { icone: '/images/dashboard/patients.png', valeur: data.cartes.patients, libelle: 'Patients Inscrits', fond: '#cfe6fb', couleur: '#2b86e0' },
    { icone: '/images/dashboard/consultations.png', valeur: data.cartes.consultations, libelle: 'Consultations', fond: '#e9e4fb', couleur: '#7b4ee8' },
    { icone: '/images/dashboard/naissances.png', valeur: data.cartes.naissances, libelle: 'Naissances', fond: '#fff6e4', couleur: '#f5a113' },
    { icone: '/images/dashboard/deces.png', valeur: data.cartes.deces, libelle: 'Décès', fond: '#fde0e6', couleur: '#e72e4f' },
  ];

  const libelles = data.mois.map(moisFr);
  // Export : les 12 mois de l'année en cours (janvier → décembre) ; à défaut, les mois du graphique
  const serie = data.annee ?? data;
  const parMois = serie.mois.map((m, i) => ({ mois: moisFr(m), naissances: serie.naissances[i] ?? 0, deces: serie.deces[i] ?? 0, consultations: serie.consultations[i] ?? 0 }));
  // Export : une ligne par mois et par hôpital DMHP (mois de janvier à décembre, puis hôpitaux par ordre alphabétique)
  const ph = data.parHopital;
  const parHopital = ph
    ? ph.mois.flatMap((m, j) =>
        ph.hopitaux.map((h, k) => ({ mois: moisFr(m), hopital: h.label, naissances: ph.naissances[k]?.[j] ?? 0, deces: ph.deces[k]?.[j] ?? 0 })),
      )
    : [];

  return (
    <div className={styles.page}>
      <div className={styles.barre}>
        <ExportExcel
          fichier="tableau_de_bord_dmhp"
          titre="Tableau de bord DMHP"
          module="TABLEAU_DE_BORD"
          feuilles={[
            feuilleExport('Indicateurs', [{ titre: 'Indicateur', valeur: (x) => x.libelle }, { titre: 'Valeur', valeur: (x) => x.valeur }], cartes),
            feuilleExport(
              data.annee ? `Année ${data.annee.mois[0].slice(0, 4)}` : 'Par mois',
              [
                { titre: 'Mois', valeur: (x) => x.mois },
                { titre: 'Naissances', valeur: (x) => x.naissances },
                { titre: 'Décès', valeur: (x) => x.deces },
                { titre: 'Consultations', valeur: (x) => x.consultations },
              ],
              parMois,
            ),
            feuilleExport(
              'Par hôpital',
              [
                { titre: 'Mois', valeur: (x) => x.mois },
                { titre: 'Hôpital', valeur: (x) => x.hopital },
                { titre: 'Naissances', valeur: (x) => x.naissances },
                { titre: 'Décès', valeur: (x) => x.deces },
              ],
              parHopital,
            ),
          ]}
        />
      </div>
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
