import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { FaBolt, FaHospitalUser, FaRegClock, FaUserMd } from 'react-icons/fa';
import SelectRecherche from '../../../../components/SelectRecherche/SelectRecherche';
import type { MedecinReference } from '../../../../types';
import { useEspaceConsultation } from './espace';
import s from './FormulaireConsultation.module.css';

export interface MomentReference {
  /**
   * Délai de réponse (tableaux cliniques de télémédecine) :
   *   true  = urgente (synchrone) : réponse en moins de 30 min, prise en charge immédiate (pas de date / heure) ;
   *   false = programmée (asynchrone) : réponse en 24 à 48 h, date et heure de prise en charge dans les 48 h ;
   *   null  = pas encore choisi.
   */
  urgente: boolean | null;
  /** AAAA-MM-JJ */
  date: string;
  /** HH:MM */
  heure: string;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const dateLocale = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** Par défaut : programmée (24 à 48 h) */
export const momentReferenceVide = (): MomentReference => ({ urgente: false, date: dateLocale(new Date()), heure: '' });
/** Maintenant (télé-expertise urgente) */
const maintenant = () => {
  const n = new Date();
  return { date: dateLocale(n), heure: `${p2(n.getHours())}:${p2(n.getMinutes())}` };
};

/** Délai maximal d'une télé-expertise programmée */
export const DELAI_PROGRAMMEE_H = 48;

const dateHeureSaisies = (m: MomentReference) => /^\d{4}-\d{2}-\d{2}$/.test(m.date) && /^\d{2}:\d{2}$/.test(m.heure);
/** Programmée : prise en charge au-delà des 48 h */
export const momentReferenceTropLoin = (m: MomentReference) =>
  m.urgente === false && dateHeureSaisies(m) && new Date(`${m.date}T${m.heure}`).getTime() - Date.now() > DELAI_PROGRAMMEE_H * 3600_000;

/** Urgente, ou programmée avec date + heure à venir et dans les 48 h */
export const momentReferenceValide = (m: MomentReference) =>
  m.urgente === true || (m.urgente === false && dateHeureSaisies(m) && new Date(`${m.date}T${m.heure}`) >= new Date() && !momentReferenceTropLoin(m));

/** Date et heure du moment choisi (urgente : maintenant) */
const momentEffectif = (m: MomentReference) => (m.urgente ? maintenant() : { date: m.date, heure: m.heure });

/** Date et heure, ou « Immédiate » pour une télé-expertise urgente, avec les messages d'erreur */
function ChampMoment({ moment, onMoment }: { moment: MomentReference; onMoment: (m: MomentReference) => void }) {
  const passe = moment.urgente === false && dateHeureSaisies(moment) && new Date(`${moment.date}T${moment.heure}`) < new Date();
  const loin = momentReferenceTropLoin(moment);
  const max = new Date(Date.now() + DELAI_PROGRAMMEE_H * 3600_000);
  return (
    <div>
      <h3 className={s.sousTitre}>
        <FaRegClock aria-hidden="true" /> {moment.urgente ? 'Prise en charge' : 'Date et heure'} <em className={s.requis}>*</em>
      </h3>
      {moment.urgente === null ? (
        <div className={s.champBloqueTele}>Type de demande d’abord</div>
      ) : moment.urgente ? (
        <div className={s.champImmediat}>
          <FaBolt aria-hidden="true" /> Immédiate · réponse en moins de 30 min
        </div>
      ) : (
        <>
          <div className={s.dateHeure}>
            <input
              type="date"
              aria-label="Date de la prise en charge"
              min={momentReferenceVide().date}
              max={dateLocale(max)}
              value={moment.date}
              onChange={(e) => onMoment({ ...moment, date: e.target.value })}
            />
            <input type="time" aria-label="Heure de la prise en charge" value={moment.heure} onChange={(e) => onMoment({ ...moment, heure: e.target.value })} />
          </div>
          {passe && (
            <p className={s.noteErreur} role="alert">
              La date et l’heure ne peuvent pas être dans le passé.
            </p>
          )}
          {loin && (
            <p className={s.noteErreur} role="alert">
              Programmée : la prise en charge doit avoir lieu dans les 48 heures.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const nomAffiche = (m: MedecinReference) => (/^dr\.?\s/i.test(m.nom) || m.sageFemme ? m.nom : `Dr ${m.nom}`);

/**
 * CONSULTATION > ISSUE « TÉLÉ-EXPERTISE » EN INTERNE
 * Sur une ligne, dans l'ordre : 1. le service · 2. la date et l'heure de la prise en charge · 3. le médecin,
 * choisi parmi ceux du service DISPONIBLES à ce moment (planning + permissions) · 4. les documents à partager.
 */
export default function ChoixMedecinReference({
  valeur,
  onChange,
  moment,
  onMoment,
  documents,
}: {
  valeur: number | null;
  onChange: (id: number | null) => void;
  moment: MomentReference;
  onMoment: (m: MomentReference) => void;
  /** Documents à partager, affichés dans la même ligne */
  documents?: ReactNode;
}) {
  const { api } = useEspaceConsultation();
  // Tous les médecins de l'hôpital (pour la liste des services)
  const [tous, setTous] = useState<MedecinReference[] | null>(null);
  // Les mêmes, avec leur disponibilité au moment choisi
  const [aCeMoment, setACeMoment] = useState<MedecinReference[] | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const momentOk = momentReferenceValide(moment);
  // Urgente : disponibilités de maintenant ; programmée : à la date et l'heure choisies
  const effectif = momentEffectif(moment);
  const cleMoment = moment.urgente ? 'maintenant' : `${moment.date}-${moment.heure}`;

  useEffect(() => {
    api
      .medecinsReference()
      .then(setTous)
      .catch(() => setTous([]));
  }, []);

  useEffect(() => {
    setACeMoment(null);
    if (!momentOk) return;
    let actif = true;
    api
      .medecinsReference(effectif.date, effectif.heure)
      .then((l) => actif && setACeMoment(l))
      .catch(() => actif && setACeMoment([]));
    return () => {
      actif = false;
    };
  }, [cleMoment, momentOk]);

  // Services de l'hôpital qui ont au moins un médecin (ordre alphabétique)
  const services = useMemo(() => {
    const vus = new Map<number, string>();
    for (const m of tous ?? []) if (m.serviceId && !vus.has(m.serviceId)) vus.set(m.serviceId, m.service);
    return [...vus].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [tous]);

  const disponibles = (aCeMoment ?? []).filter((m) => m.serviceId === serviceId && m.enService);

  // Le médecin choisi n'est plus dans le service / plus disponible à ce moment : on le retire
  useEffect(() => {
    if (valeur && aCeMoment && !disponibles.some((m) => m.id === valeur)) onChange(null);
  }, [aCeMoment, serviceId]);

  const pret = !!serviceId && momentOk;

  return (
    <div className={s.hospBloc}>
      {/* Service · date et heure · médecin · documents : sur la même ligne */}
      <div className={s.ligneReferenceInterne}>
        <div>
          <h3 className={s.sousTitre}>
            <FaHospitalUser aria-hidden="true" /> Service <em className={s.requis}>*</em>
          </h3>
          <SelectRecherche
            id="reference-service"
            options={services}
            value={serviceId}
            onChange={(id) => {
              setServiceId(id);
              onChange(null);
            }}
            placeholder={tous ? (services.length ? '-- Choisir le service --' : 'Aucun service avec un médecin actif') : 'Chargement…'}
            placeholderRecherche="Rechercher un service…"
            aucunResultat="Aucun service ne correspond"
          />
        </div>

        <ChampMoment moment={moment} onMoment={onMoment} />

        {/* Médecin : ceux du service disponibles maintenant (urgente) ou à la date et l'heure choisies */}
        <div>
          <h3 className={s.sousTitre}>
            <FaUserMd aria-hidden="true" /> Médecin <em className={s.requis}>*</em>
          </h3>
          {!pret ? (
            <div className={s.champBloqueTele}>{moment.urgente ? 'Service d’abord' : 'Service, date et heure d’abord'}</div>
          ) : (
            <SelectRecherche
              key={`${serviceId}-${cleMoment}`}
              id="medecin-reference"
              options={disponibles.map((m) => ({ id: m.id, name: nomAffiche(m), detail: m.creneau ?? undefined }))}
              value={valeur}
              onChange={onChange}
              placeholder={aCeMoment ? (disponibles.length ? '-- Choisir le médecin --' : 'Aucun médecin disponible à ce moment') : 'Chargement…'}
              placeholderRecherche="Rechercher un médecin…"
              aucunResultat="Aucun médecin ne correspond"
            />
          )}
        </div>

        {/* Documents à partager (télé-expertise) */}
        <div>{documents}</div>
      </div>
      <p className={s.note}>
        {moment.urgente
          ? 'Urgente : seuls les médecins du service disponibles maintenant sont proposés. Réponse attendue en moins de 30 minutes.'
          : 'Seuls les médecins du service disponibles à la date et l’heure choisies sont proposés. Réponse attendue en 24 à 48 heures.'}
      </p>
    </div>
  );
}

/**
 * CONSULTATION > ISSUE « TÉLÉ-EXPERTISE » EN EXTERNE
 * Service des autres établissements de la DMHP auquel la télé-expertise est adressée, et documents à partager, sur la même ligne.
 * Seuls les médecins de ce service pourront la prendre en charge.
 */
export function ChoixServiceExterne({
  valeur,
  onChange,
  moment,
  onMoment,
  documents,
}: {
  valeur: number | null;
  onChange: (id: number | null) => void;
  moment: MomentReference;
  onMoment: (m: MomentReference) => void;
  documents?: ReactNode;
}) {
  const { api } = useEspaceConsultation();
  const [services, setServices] = useState<{ id: number; libelle: string; hopitaux: number }[] | null>(null);

  useEffect(() => {
    api
      .servicesExternes()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

  return (
    <div className={s.hospBloc}>
      <div className={s.ligneReferenceExterne}>
        <div>
          <h3 className={s.sousTitre}>
            <FaHospitalUser aria-hidden="true" /> Service <em className={s.requis}>*</em>
          </h3>
          <SelectRecherche
            id="reference-service-externe"
            options={(services ?? []).map((x) => ({ id: x.id, name: x.libelle, detail: `${x.hopitaux} établissement${x.hopitaux > 1 ? 's' : ''}` }))}
            value={valeur}
            onChange={onChange}
            placeholder={services ? (services.length ? '-- Choisir le service --' : 'Aucun service dans les hôpitaux de la DMHP') : 'Chargement…'}
            placeholderRecherche="Rechercher un service…"
            aucunResultat="Aucun service ne correspond"
          />
        </div>
        <ChampMoment moment={moment} onMoment={onMoment} />
        <div>{documents}</div>
      </div>
      <p className={s.note}>
        Seuls les médecins de ce service, dans les hôpitaux de la DMHP, verront la télé-expertise et pourront la prendre en charge.{' '}
        {moment.urgente ? 'Urgente : réponse attendue en moins de 30 minutes.' : 'Réponse attendue en 24 à 48 heures.'}
      </p>
    </div>
  );
}
