/**
 * REPÈRES DE LECTURE DES CONSTANTES (valeurs adultes usuelles) — affichés sous chaque constante pendant la saisie :
 * « Normal(e) » en vert, sinon l'état (Fièvre, Élevée, Basse…) en orange ou en rouge.
 * Ce sont des repères indicatifs, pas un diagnostic (les normes de l'enfant sont différentes).
 */
export type Repere = { libelle: string; ton: 'ok' | 'attention' | 'alerte' } | null;

const nombre = (v: string | null | undefined) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

/** « 12/8 » (cmHg) ou « 120/80 » (mmHg) */
export const repereTension = (v: string | null | undefined): Repere => {
  const m = /^(\d{1,3}(?:[.,]\d)?)\s*\/\s*(\d{1,3}(?:[.,]\d)?)$/.exec(String(v ?? '').trim());
  if (!m) return null;
  let sys = parseFloat(m[1].replace(',', '.'));
  let dia = parseFloat(m[2].replace(',', '.'));
  if (sys < 30) {
    sys *= 10;
    dia *= 10;
  }
  if (sys >= 140 || dia >= 90) return { libelle: 'Élevée', ton: 'alerte' };
  if (sys < 90 || dia < 60) return { libelle: 'Basse', ton: 'attention' };
  return { libelle: 'Normale', ton: 'ok' };
};

export const repereTemperature = (v: string | null | undefined): Repere => {
  const t = nombre(v);
  if (t === null) return null;
  if (t < 36) return { libelle: 'Hypothermie', ton: 'alerte' };
  if (t <= 37.5) return { libelle: 'Normale', ton: 'ok' };
  if (t < 38.5) return { libelle: 'Fébricule', ton: 'attention' };
  return { libelle: 'Fièvre', ton: 'alerte' };
};

export const reperePouls = (v: string | null | undefined): Repere => {
  const p = nombre(v);
  if (p === null) return null;
  if (p < 60) return { libelle: 'Bradycardie', ton: 'attention' };
  if (p <= 100) return { libelle: 'Normal', ton: 'ok' };
  return { libelle: 'Tachycardie', ton: 'attention' };
};

export const repereImc = (v: string | null | undefined): Repere => {
  const i = nombre(v);
  if (i === null) return null;
  if (i < 18.5) return { libelle: 'Maigreur', ton: 'attention' };
  if (i < 25) return { libelle: 'Normal', ton: 'ok' };
  if (i < 30) return { libelle: 'Surpoids', ton: 'attention' };
  return { libelle: 'Obésité', ton: 'alerte' };
};

/** Saturation en oxygène (%) */
export const repereSaturation = (v: string | null | undefined): Repere => {
  const s = nombre(v);
  if (s === null) return null;
  if (s >= 95) return { libelle: 'Normale', ton: 'ok' };
  if (s >= 90) return { libelle: 'Basse', ton: 'attention' };
  return { libelle: 'Hypoxémie', ton: 'alerte' };
};

/** Glycémie à jeun (g/l) */
export const repereGlycemieAJeun = (v: string | null | undefined): Repere => {
  const g = nombre(v);
  if (g === null) return null;
  if (g < 0.7) return { libelle: 'Hypoglycémie', ton: 'alerte' };
  if (g <= 1.1) return { libelle: 'Normale', ton: 'ok' };
  if (g < 1.26) return { libelle: 'Élevée', ton: 'attention' };
  return { libelle: 'Hyperglycémie', ton: 'alerte' };
};

/** Glycémie non à jeun (g/l) */
export const repereGlycemieNonAJeun = (v: string | null | undefined): Repere => {
  const g = nombre(v);
  if (g === null) return null;
  if (g < 0.7) return { libelle: 'Hypoglycémie', ton: 'alerte' };
  if (g < 1.4) return { libelle: 'Normale', ton: 'ok' };
  if (g < 2) return { libelle: 'Élevée', ton: 'attention' };
  return { libelle: 'Hyperglycémie', ton: 'alerte' };
};

/** Fréquence respiratoire (cycles / min) */
export const repereFrequenceRespiratoire = (v: string | null | undefined): Repere => {
  const f = nombre(v);
  if (f === null) return null;
  if (f < 12) return { libelle: 'Bradypnée', ton: 'attention' };
  if (f <= 20) return { libelle: 'Normale', ton: 'ok' };
  return { libelle: 'Tachypnée', ton: 'attention' };
};

/** Repère d'une constante du formulaire de consultation (clé du champ → fonction) ; null = pas de repère */
export const REPERES: Partial<Record<string, (v: string | null | undefined) => Repere>> = {
  tension: repereTension,
  temperature: repereTemperature,
  pouls: reperePouls,
  imc: repereImc,
  saturation: repereSaturation,
  glycemieAJeun: repereGlycemieAJeun,
  glycemieNonAJeun: repereGlycemieNonAJeun,
  frequenceRespiratoire: repereFrequenceRespiratoire,
};
