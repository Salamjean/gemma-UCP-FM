import { useEffect, useMemo, useState } from 'react';
import { FaHospitalAlt, FaHospitalUser, FaRegCalendarAlt, FaRegClock, FaUserMd, FaVideo } from 'react-icons/fa';
import HorsDistrict from '../../../../components/HorsDistrict/HorsDistrict';
import SelectRecherche from '../../../../components/SelectRecherche/SelectRecherche';
import type { MedecinReference } from '../../../../types';
import { useEspaceConsultation } from './espace';
import { Segments } from './FormulairePrenatal';
import s from './FormulaireConsultation.module.css';

export interface TelemedecineSaisie {
  /** En interne (service de l'hôpital) ou en externe (service de la DMHP) */
  portee: 'interne' | 'externe' | null;
  /** Interne : service de l'hôpital (service_hospitals.id) ; externe : service (services.id) */
  serviceId: number | null;
  /** Externe : hôpital de la DMHP (facultatif) */
  hopitalId: number | null;
  /** Médecin (facultatif) : sans médecin, tous les médecins du service la reçoivent */
  medecinId: number | null;
  medecinNom: string | null;
  /** AAAA-MM-JJ */
  date: string;
  /** HH:MM */
  heure: string;
  /** Externe : hôpitaux hors du district (sinon : du district du demandeur) */
  horsDistrict: boolean;
}

const dateLocale = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const telemedecineVide = (): TelemedecineSaisie => ({
  portee: null,
  serviceId: null,
  hopitalId: null,
  medecinId: null,
  medecinNom: null,
  date: dateLocale(new Date()),
  heure: '',
  horsDistrict: false,
});

/** Date + heure renseignées et pas dans le passé */
export const momentTelemedecineValide = (t: TelemedecineSaisie) =>
  /^\d{4}-\d{2}-\d{2}$/.test(t.date) && /^\d{2}:\d{2}$/.test(t.heure) && new Date(`${t.date}T${t.heure}`) >= new Date();

/** Champs à envoyer au serveur (médecin et hôpital seulement s'ils sont choisis) */
export const telemedecinePayload = (t: TelemedecineSaisie) => ({
  telePortee: t.portee,
  teleDate: t.date,
  teleHeure: t.heure,
  ...(t.portee === 'interne' ? { teleServiceHospitalId: t.serviceId } : { teleServiceId: t.serviceId }),
  ...(t.portee === 'externe' && t.hopitalId ? { teleHopitalId: t.hopitalId } : {}),
  ...(t.portee === 'externe' ? { externeHorsDistrict: t.horsDistrict } : {}),
  ...(t.medecinId && (t.portee === 'interne' || t.hopitalId) ? { teleMedecinId: t.medecinId } : {}),
});

/** Ce qui manque pour programmer (null si tout est bon) */
export const telemedecineManque = (t: TelemedecineSaisie) =>
  !t.portee
    ? 'Téléconsultation : précisez si elle est en interne ou en externe.'
    : !t.serviceId
      ? 'Téléconsultation : choisissez le service.'
      : !momentTelemedecineValide(t)
        ? 'Choisissez une date et une heure de téléconsultation à venir.'
        : null;

const INTERNE = 'En interne';
const EXTERNE = 'En externe';
const TOUS_LES_MEDECINS = 'Tous les médecins du service';
const nomAffiche = (m: MedecinReference) => (/^dr\.?\s/i.test(m.nom) || m.sageFemme ? m.nom : `Dr ${m.nom}`);

/**
 * CONSULTATION > ISSUE « TÉLÉCONSULTATION » — même système que la télé-expertise :
 *   - en interne : service de l'hôpital (obligatoire) · date · heure · médecin (facultatif) ;
 *   - en externe : service de la DMHP (obligatoire) · hôpital (facultatif) · médecin (facultatif, après l'hôpital) · date · heure.
 * Avec un médecin : programmée avec lui (disponible à ce moment). Sans médecin : tous les médecins du service visé
 * la reçoivent dans leur Télémédecine ; le premier qui la prend en charge l'obtient, elle disparaît chez les autres.
 */
export default function IssueTelemedecine({ valeur, onChange }: { valeur: TelemedecineSaisie; onChange: (v: TelemedecineSaisie) => void }) {
  const { api } = useEspaceConsultation();
  const externe = valeur.portee === 'externe';
  const momentOk = momentTelemedecineValide(valeur);
  const maj = (p: Partial<TelemedecineSaisie>) => onChange({ ...valeur, ...p });

  // Interne : médecins de l'hôpital (liste des services), puis leur disponibilité au moment choisi
  const [tousInternes, setTousInternes] = useState<MedecinReference[] | null>(null);
  // Externe : services de la DMHP, hôpitaux du service
  const [servicesExt, setServicesExt] = useState<{ id: number; libelle: string; hopitaux: number }[] | null>(null);
  const [hopitaux, setHopitaux] = useState<{ id: number; nom: string }[] | null>(null);
  // Médecins proposés (service + hôpital + moment)
  const [medecins, setMedecins] = useState<MedecinReference[] | null>(null);

  useEffect(() => {
    if (valeur.portee === 'interne' && !tousInternes)
      api
        .medecinsReference()
        .then(setTousInternes)
        .catch(() => setTousInternes([]));
  }, [valeur.portee]);

  // Externe : services des hôpitaux du district (ou hors du district)
  useEffect(() => {
    setServicesExt(null);
    if (valeur.portee !== 'externe') return;
    let actif = true;
    api
      .servicesExternes(valeur.horsDistrict)
      .then((l) => actif && setServicesExt(l))
      .catch(() => actif && setServicesExt([]));
    return () => {
      actif = false;
    };
  }, [valeur.portee, valeur.horsDistrict]);

  useEffect(() => {
    setHopitaux(null);
    if (!externe || !valeur.serviceId) return;
    let actif = true;
    api
      .hopitauxService(valeur.serviceId, valeur.horsDistrict)
      .then((l) => actif && setHopitaux(l))
      .catch(() => actif && setHopitaux([]));
    return () => {
      actif = false;
    };
  }, [externe, valeur.serviceId, valeur.horsDistrict]);

  // Médecins disponibles au moment choisi : interne → du service ; externe → du service dans l'hôpital choisi
  useEffect(() => {
    setMedecins(null);
    if (!valeur.serviceId || !momentOk || (externe && !valeur.hopitalId)) return;
    let actif = true;
    const charge = externe ? api.medecinsService(valeur.serviceId, valeur.hopitalId!, valeur.date, valeur.heure) : api.medecinsReference(valeur.date, valeur.heure);
    charge
      .then((l) => {
        if (!actif) return;
        const proposes = l.filter((m) => m.enService && (externe || m.serviceId === valeur.serviceId));
        setMedecins(proposes);
        // Le médecin choisi n'est plus disponible à ce moment : on le retire
        if (valeur.medecinId && !proposes.some((m) => m.id === valeur.medecinId)) maj({ medecinId: null, medecinNom: null });
      })
      .catch(() => actif && setMedecins([]));
    return () => {
      actif = false;
    };
  }, [valeur.portee, valeur.serviceId, valeur.hopitalId, valeur.date, valeur.heure, momentOk]);

  // Services de l'hôpital qui ont au moins un médecin (interne)
  const servicesInternes = useMemo(() => {
    const vus = new Map<number, string>();
    for (const m of tousInternes ?? []) if (m.serviceId && !vus.has(m.serviceId)) vus.set(m.serviceId, m.service);
    return [...vus].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [tousInternes]);

  const passe = /^\d{4}-\d{2}-\d{2}$/.test(valeur.date) && /^\d{2}:\d{2}$/.test(valeur.heure) && !momentOk;
  const nomHopital = hopitaux?.find((h) => h.id === valeur.hopitalId)?.nom;

  const champService = (
    <div>
      <h3 className={s.sousTitre}>
        <FaHospitalUser aria-hidden="true" /> Service <em className={s.requis}>*</em>
      </h3>
      <SelectRecherche
        key={`service-${valeur.portee}`}
        id="tele-service"
        options={
          externe
            ? (servicesExt ?? []).map((x) => ({ id: x.id, name: x.libelle, detail: `${x.hopitaux} établissement${x.hopitaux > 1 ? 's' : ''}` }))
            : servicesInternes
        }
        value={valeur.serviceId}
        onChange={(id) => maj({ serviceId: id, hopitalId: null, medecinId: null, medecinNom: null })}
        placeholder={(externe ? servicesExt : tousInternes) ? '-- Choisir le service --' : 'Chargement…'}
        placeholderRecherche="Rechercher un service…"
        aucunResultat="Aucun service ne correspond"
      />
    </div>
  );

  const champDate = (
    <div>
      <h3 className={s.sousTitre}>
        <FaRegCalendarAlt aria-hidden="true" /> Date <em className={s.requis}>*</em>
      </h3>
      <input type="date" aria-label="Date de la téléconsultation" min={dateLocale(new Date())} value={valeur.date} onChange={(e) => maj({ date: e.target.value })} />
    </div>
  );

  const champHeure = (
    <div>
      <h3 className={s.sousTitre}>
        <FaRegClock aria-hidden="true" /> Heure <em className={s.requis}>*</em>
      </h3>
      <input type="time" aria-label="Heure de la téléconsultation" value={valeur.heure} onChange={(e) => maj({ heure: e.target.value })} />
    </div>
  );

  const champHopital = (
    <div>
      <h3 className={s.sousTitre}>
        <FaHospitalAlt aria-hidden="true" /> Hôpital <small className={s.facultatif}>(facultatif)</small>
      </h3>
      {!valeur.serviceId ? (
        <div className={s.champBloqueTele}>Service d’abord</div>
      ) : (
        <SelectRecherche
          key={`hopitaux-${valeur.serviceId}`}
          id="tele-hopital"
          options={(hopitaux ?? []).map((h) => ({ id: h.id, name: h.nom }))}
          value={valeur.hopitalId}
          onChange={(id) => maj({ hopitalId: id, medecinId: null, medecinNom: null })}
          optionVide={valeur.horsDistrict ? 'Tous les hôpitaux hors du district' : 'Tous les hôpitaux du district'}
          placeholder={hopitaux ? (valeur.horsDistrict ? 'Tous les hôpitaux hors du district' : 'Tous les hôpitaux du district') : 'Chargement…'}
          placeholderRecherche="Rechercher un hôpital…"
          aucunResultat="Aucun hôpital ne correspond"
        />
      )}
    </div>
  );

  const bloque = !valeur.serviceId ? 'Service d’abord' : externe && !valeur.hopitalId ? 'Hôpital d’abord' : !momentOk ? 'Date et heure d’abord' : null;
  const champMedecin = (
    <div>
      <h3 className={s.sousTitre}>
        <FaUserMd aria-hidden="true" /> Médecin <small className={s.facultatif}>(facultatif)</small>
      </h3>
      {bloque ? (
        <div className={s.champBloqueTele}>{bloque}</div>
      ) : (
        <SelectRecherche
          key={`medecins-${valeur.serviceId}-${valeur.hopitalId}-${valeur.date}-${valeur.heure}`}
          id="tele-medecin"
          options={(medecins ?? []).map((m) => ({ id: m.id, name: nomAffiche(m), detail: m.creneau ?? undefined }))}
          value={valeur.medecinId}
          onChange={(id) => maj({ medecinId: id, medecinNom: medecins?.find((m) => m.id === id)?.nom ?? null })}
          optionVide={TOUS_LES_MEDECINS}
          placeholder={medecins ? TOUS_LES_MEDECINS : 'Chargement…'}
          placeholderRecherche="Rechercher un médecin…"
          aucunResultat="Aucun médecin ne correspond"
        />
      )}
    </div>
  );

  return (
    <div className={s.hospBloc}>
      <div className={s.ligneChoix}>
        <span className={s.sousTitre}>
          <FaVideo aria-hidden="true" /> Téléconsultation <em className={s.requis}>*</em>
        </span>
        <Segments
          nom="Téléconsultation en interne ou en externe"
          valeur={valeur.portee}
          options={[
            ['interne', INTERNE],
            ['externe', EXTERNE],
          ]}
          onChange={(x) => x && onChange({ ...telemedecineVide(), date: valeur.date, heure: valeur.heure, portee: x === 'externe' ? 'externe' : 'interne' })}
        />
      </div>

      {valeur.portee && (
        <>
          {/* Externe : hôpitaux du district (par défaut) ou hors du district */}
          {externe && (
            <HorsDistrict
              id="tele-hors-district"
              valeur={valeur.horsDistrict}
              onChange={(v) => maj({ horsDistrict: v, serviceId: null, hopitalId: null, medecinId: null, medecinNom: null })}
            />
          )}
          {/* Interne : service · date · heure · médecin — externe : service · hôpital · date · heure · médecin (sur la même ligne) */}
          <div className={externe ? s.ligneTeleCinq : s.ligneTeleQuatre}>
            {champService}
            {externe ? (
              <>
                {champHopital}
                {champDate}
                {champHeure}
                {champMedecin}
              </>
            ) : (
              <>
                {champDate}
                {champHeure}
                {champMedecin}
              </>
            )}
          </div>
          {passe && (
            <p className={s.noteErreur} role="alert">
              La date et l’heure ne peuvent pas être dans le passé.
            </p>
          )}
          <p className={s.note}>
            {valeur.medecinId
              ? 'La téléconsultation est programmée avec ce médecin, disponible à ce moment : elle apparaît dans son onglet Télémédecine.'
              : !externe
                ? 'Sans médecin choisi, tous les médecins du service dans votre hôpital la reçoivent : le premier qui la prend en charge l’obtient, elle disparaît alors chez les autres.'
                : valeur.hopitalId
                  ? `Tous les médecins de ce service à ${nomHopital ?? 'l’hôpital choisi'} la reçoivent : le premier qui la prend en charge l’obtient, elle disparaît alors chez les autres.`
                  : `Tous les médecins de ce service dans les hôpitaux ${valeur.horsDistrict ? 'hors de votre district' : 'de votre district'} la reçoivent : le premier qui la prend en charge l’obtient, elle disparaît alors chez les autres.`}
          </p>
        </>
      )}
    </div>
  );
}
