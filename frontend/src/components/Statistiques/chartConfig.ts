/** "2026-02" → "février 2026" (comme chartMonthFrensh de Laravel) */
export const moisFr = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Couleurs des barres de consultations — identiques à Laravel (dashboard/super.blade.php, hospital.blade.php) */
export const BARRES_FOND = [
  'rgba(255, 99, 132, 0.2)', 'rgba(255, 159, 64, 0.2)', 'rgba(255, 205, 86, 0.2)', 'rgba(75, 192, 192, 0.2)',
  'rgba(54, 162, 235, 0.2)', 'rgba(153, 102, 255, 0.2)', 'rgba(201, 203, 207, 0.2)', 'rgba(97, 255, 19, 0.2)',
  'rgba(0, 0, 0, 0.2)', 'rgba(4, 28, 62, 0.2)',
];
export const BARRES_BORD = [
  'rgb(255, 99, 132)', 'rgb(255, 159, 64)', 'rgb(255, 205, 86)', 'rgb(75, 192, 192)', 'rgb(54, 162, 235)',
  'rgb(153, 102, 255)', 'rgb(201, 203, 207)', 'rgba(97, 255, 19, 1)', 'rgba(0, 0, 0, 1)', 'rgba(4, 28, 62, 1)',
];

/** Courbes naissances / décès (couleurs par défaut de Chart.js, comme Laravel) */
export const COURBE_NAISSANCES = { couleur: '#36a2eb', fond: 'rgba(54, 162, 235, 0.5)' };
export const COURBE_DECES = { couleur: '#ff6384', fond: 'rgba(255, 99, 132, 0.5)' };
