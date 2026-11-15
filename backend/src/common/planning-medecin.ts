/**
 * PLANNING DES MÉDECINS (table Laravel availabilities) — partagé par le régulateur (calendrier)
 * et la programmation des télémédecines (médecins disponibles à une date et une heure).
 */
export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const lireJson = (v: unknown): unknown[] => {
  if (typeof v !== 'string') return Array.isArray(v) ? v : [];
  try {
    const r = JSON.parse(v);
    return Array.isArray(r) ? r : [r];
  } catch {
    return [];
  }
};
const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5).padStart(5, '0') : null);

/**
 * Planning hebdomadaire (availabilities) lu comme Laravel / creneauDuJour :
 * days = ["0","2"] (0 = lundi) ; heures sur 7 cases (une par jour) ou une par jour listé (anciennes données) ;
 * début "00:00" = dès minuit, fin absente = 23:59.
 */
export function planningSemaine(days: unknown, hourStart: unknown, hourEnd: unknown) {
  const jours = lireJson(days).map(Number);
  const debuts = lireJson(hourStart).map((x) => (x === null ? '' : String(x)));
  const fins = lireJson(hourEnd).map((x) => (x === null ? '' : String(x)));
  return JOURS.map((nomJour, i) => {
    const position = jours.indexOf(i);
    const prendre = (l: string[]) => (l.length === 7 ? l[i] : (l[position] ?? l[0])) || '';
    const debut = hhmm(prendre(debuts)) ?? '00:00';
    let fin = hhmm(prendre(fins)) ?? '23:59';
    if (fin === '00:00') fin = '23:59';
    return { index: i, nom: nomJour, travaille: position !== -1, debut, fin, journeeEntiere: debut === '00:00' && fin === '23:59' };
  });
}

/** Permission accordée d'un médecin (dates "AAAA-MM-JJ", heures "HH:MM" ou null) */
export interface PermissionMedecin {
  debut: string;
  fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
}

const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * Le médecin est-il disponible le `date` (« AAAA-MM-JJ »), à `heure` (« HH:MM ») si elle est donnée ?
 * Règles : jour travaillé dans son planning, heure dans son créneau (début → fin), aucune permission accordée
 * couvrant ce moment (une permission d'un seul jour avec heures ne couvre que ces heures).
 */
export function disponibiliteLe(
  planning: { days: unknown; debut: unknown; fin: unknown },
  date: string,
  heure: string | null,
  permissions: PermissionMedecin[],
): { disponible: boolean; creneau: string | null; raison: string | null } {
  const d = new Date(`${date}T00:00:00Z`);
  const index = (d.getUTCDay() + 6) % 7; // 0 = lundi
  const jour = planningSemaine(planning.days, planning.debut, planning.fin)[index];
  const creneau = jour.travaille ? (jour.journeeEntiere ? 'Toute la journée' : `${jour.debut} – ${jour.fin}`) : null;
  if (!jour.travaille) return { disponible: false, creneau, raison: `Ne travaille pas le ${JOURS[index].toLowerCase()}` };

  // Même règle que common/permission-en-cours : du jour de début (heure de début, 00:00 sinon)
  // au jour de fin (heure de fin, 23:59 sinon)
  const p = permissions.find((x) => {
    if (!(x.debut <= date && x.fin >= date)) return false;
    if (!heure) return true; // sans heure précise : le jour est touché par la permission
    const m = minutes(heure);
    if (date === x.debut && x.heure_debut && m < minutes(x.heure_debut)) return false;
    if (date === x.fin && x.heure_fin && m > minutes(x.heure_fin)) return false;
    return true;
  });
  if (p) return { disponible: false, creneau, raison: 'En permission' };

  if (heure && !jour.journeeEntiere && (minutes(heure) < minutes(jour.debut) || minutes(heure) > minutes(jour.fin))) {
    return { disponible: false, creneau, raison: `Hors de son créneau (${creneau})` };
  }
  return { disponible: true, creneau, raison: null };
}
