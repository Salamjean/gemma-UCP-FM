/**
 * MASQUES DE SAISIE DES CONSTANTES — le séparateur apparaît tout seul pendant la frappe :
 *   - tension artérielle « 12/8 »  : « / » ajouté après les 2 chiffres de la systolique ;
 *   - température « 37.2 », poids « 72.5 » : « . » ajouté après 2 chiffres ;
 *   - glycémie « 1.05 » (g/l) : « . » ajouté après 1 chiffre.
 * Effacer reste libre : quand on supprime (texte plus court qu'avant), rien n'est ajouté.
 * La virgule est acceptée et remplacée par un point ; le séparateur peut aussi être tapé à la main
 * (ex. poids d'un bébé « 3.5 » : taper 3 puis « . »).
 */

/** Champs masqués et leur format */
const FORMATS = {
  tension: { type: 'tension' },
  temperature: { type: 'decimal', entiers: 2, decimales: 1 },
  poids: { type: 'decimal', entiers: 2, decimales: 1 },
  glycemie: { type: 'decimal', entiers: 1, decimales: 2 },
} as const;

export type ChampMasque = keyof typeof FORMATS;

const efface = (nouvelle: string, ancienne: string) => nouvelle.length < ancienne.length;

/** « 12/8 » : chiffres et une seule barre ; 2 chiffres max de chaque côté */
function masqueTension(nouvelle: string, ancienne: string) {
  const brut = nouvelle.replace(/[^\d/]/g, '');
  const [avant, ...reste] = brut.split('/');
  const sys = avant.slice(0, 2);
  const apresBarre = reste.join('').slice(0, 2);
  const barreTapee = reste.length > 0;
  // Chiffres tapés au-delà de la systolique sans barre (saisie rapide, collage) → passent après la barre
  const debordement = avant.slice(2);
  if (efface(nouvelle, ancienne)) return barreTapee ? `${sys}/${apresBarre}` : sys + (debordement ? `/${debordement.slice(0, 2)}` : '');
  if (barreTapee || debordement) return `${sys}/${(debordement + apresBarre).slice(0, 2)}`;
  return sys.length === 2 ? `${sys}/` : sys;
}

/** Nombre décimal : point ajouté après `entiers` chiffres, `decimales` chiffres après le point */
function masqueDecimal(nouvelle: string, ancienne: string, entiers: number, decimales: number) {
  const brut = nouvelle.replace(',', '.').replace(/[^\d.]/g, '');
  const point = brut.indexOf('.');
  if (point !== -1) {
    const ent = brut.slice(0, point);
    const dec = brut.slice(point + 1).replace(/\./g, '').slice(0, decimales);
    return `${ent}.${dec}`;
  }
  if (efface(nouvelle, ancienne)) return brut;
  if (brut.length < entiers) return brut;
  // Partie entière complète → point ajouté ; chiffres en trop → décimales
  return `${brut.slice(0, entiers)}.${brut.slice(entiers, entiers + decimales)}`;
}

/** Applique le masque du champ à la nouvelle saisie (`ancienne` = valeur avant la frappe) */
export function masquerConstante(champ: ChampMasque, nouvelle: string, ancienne: string): string {
  const f = FORMATS[champ];
  if (f.type === 'tension') return masqueTension(nouvelle, ancienne);
  return masqueDecimal(nouvelle, ancienne, f.entiers, f.decimales);
}
