import s from './FiltreType.module.css';

/** Filtre des listes de télémédecine : toutes, téléconsultations (et appels d'urgence) ou télé-expertises */
export type TypeTelemedecine = 'toutes' | 'teleconsultation' | 'teleexpertise';

const OPTIONS: { id: TypeTelemedecine; libelle: string }[] = [
  { id: 'toutes', libelle: 'Toutes' },
  { id: 'teleconsultation', libelle: 'Téléconsultation' },
  { id: 'teleexpertise', libelle: 'Télé-expertise' },
];

/** L'élément correspond-il au filtre ? (appel d'urgence = téléconsultation vidéo) */
export const correspondType = (type: string, filtre: TypeTelemedecine) =>
  filtre === 'toutes' || (filtre === 'teleexpertise' ? type === 'teleexpertise' : type !== 'teleexpertise');

/**
 * MÉDECIN / INFIRMIER·ÈRE > TÉLÉMÉDECINE — bascule Toutes / Téléconsultation / Télé-expertise
 * (entre le champ de recherche et le nombre de séances).
 */
export default function FiltreType({ valeur, onChange }: { valeur: TypeTelemedecine; onChange: (v: TypeTelemedecine) => void }) {
  return (
    <div className={s.bascule} role="radiogroup" aria-label="Type de télémédecine">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={valeur === o.id} className={valeur === o.id ? s.actif : ''} onClick={() => onChange(o.id)}>
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

/** Statut des télémédecines affichées : en attente (par défaut) ou terminées */
export type StatutTelemedecine = 'en-attente' | 'terminees';

/**
 * MÉDECIN / INFIRMIER·ÈRE > TÉLÉMÉDECINE — filtre de statut du tableau (à la place du nombre de séances),
 * avec le nombre de séances de chaque statut.
 */
export function FiltreStatut({
  valeur,
  onChange,
  compteurs,
}: {
  valeur: StatutTelemedecine;
  onChange: (v: StatutTelemedecine) => void;
  compteurs: Record<StatutTelemedecine, number | null>;
}) {
  const options: { id: StatutTelemedecine; libelle: string }[] = [
    { id: 'en-attente', libelle: 'En attente' },
    { id: 'terminees', libelle: 'Terminées' },
  ];
  return (
    <div className={s.bascule} role="radiogroup" aria-label="Statut des télémédecines">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={valeur === o.id} className={valeur === o.id ? s.actif : ''} onClick={() => onChange(o.id)}>
          {o.libelle}
          <span className={s.compte}>{compteurs[o.id] ?? '·'}</span>
        </button>
      ))}
    </div>
  );
}
