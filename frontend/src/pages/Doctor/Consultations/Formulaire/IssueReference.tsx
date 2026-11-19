import { useEffect, useMemo, useState } from 'react';
import { FaHospitalAlt, FaHospitalUser, FaShareSquare, FaUserMd } from 'react-icons/fa';
import HorsDistrict from '../../../../components/HorsDistrict/HorsDistrict';
import SelectRecherche from '../../../../components/SelectRecherche/SelectRecherche';
import type { MedecinReference } from '../../../../types';
import { useEspaceConsultation } from './espace';
import { Segments } from './FormulairePrenatal';
import s from './FormulaireConsultation.module.css';

export interface ReferenceSaisie {
  /** En interne (service de l'hôpital) ou en externe (service de la DMHP) */
  portee: 'interne' | 'externe' | null;
  /** Interne : service de l'hôpital (service_hospitals.id) ; externe : service (services.id) */
  serviceId: number | null;
  /** Externe : hôpital de la DMHP (facultatif) */
  hopitalId: number | null;
  /** Médecin (facultatif) : sans médecin, tous les médecins du service visé */
  medecinId: number | null;
  /** Externe : hôpitaux hors du district (sinon : du district du demandeur) */
  horsDistrict: boolean;
}

export const referenceVide = (): ReferenceSaisie => ({ portee: null, serviceId: null, hopitalId: null, medecinId: null, horsDistrict: false });

/**
 * Interne + médecin choisi : l'ANCIEN « Envoyer au médecin » — la consultation n'est pas terminée, elle passe à ce médecin
 * avec la saisie. Sinon : vraie référence (consultation terminée, fiche de référence pour le patient).
 */
export const referenceEnvoiDirect = (r: ReferenceSaisie) => r.portee === 'interne' && !!r.medecinId;

/** Ce qui manque (null si tout est bon) */
export const referenceManque = (r: ReferenceSaisie) =>
  !r.portee ? 'Référence : précisez si elle est en interne ou en externe.' : !r.serviceId ? 'Référence : choisissez le service.' : null;

/** Champs envoyés au serveur pour une vraie référence (issue « reference ») */
export const referencePayload = (r: ReferenceSaisie) => ({
  modeSortie: 'reference',
  referencePortee: r.portee,
  ...(r.portee === 'interne' ? { referenceServiceHospitalId: r.serviceId } : { referenceServiceId: r.serviceId }),
  ...(r.portee === 'externe' && r.hopitalId ? { referenceHopitalId: r.hopitalId } : {}),
  ...(r.portee === 'externe' ? { externeHorsDistrict: r.horsDistrict } : {}),
  ...(r.medecinId && (r.portee === 'interne' || r.hopitalId) ? { medecinReferenceId: r.medecinId } : {}),
});

const TOUS_LES_MEDECINS = 'Tous les médecins du service';
const nomAffiche = (m: MedecinReference) => (/^dr\.?\s/i.test(m.nom) || m.sageFemme ? m.nom : `Dr ${m.nom}`);

/**
 * INFIRMIER·ÈRE > ISSUE « RÉFÉRENCE » — comme la télé-expertise et la téléconsultation :
 *   - en interne : service de l'hôpital (obligatoire) · médecin (facultatif, en service maintenant) ;
 *   - en externe : service de la DMHP (obligatoire) · hôpital (facultatif) · médecin (facultatif, après l'hôpital).
 * Sans médecin : tous les médecins du service visé reçoivent le patient (le premier qui le prend en charge l'obtient).
 * Une fiche de référence est imprimée pour le patient (sauf interne avec médecin : la consultation lui est simplement envoyée).
 */
export default function IssueReference({
  valeur,
  onChange,
  envoiDirect = true,
}: {
  valeur: ReferenceSaisie;
  onChange: (v: ReferenceSaisie) => void;
  /** Infirmier·ère : en interne avec un médecin choisi, la consultation lui est envoyée sans être terminée (médecin : non) */
  envoiDirect?: boolean;
}) {
  const { api } = useEspaceConsultation();
  const externe = valeur.portee === 'externe';
  const maj = (p: Partial<ReferenceSaisie>) => onChange({ ...valeur, ...p });

  const [tousInternes, setTousInternes] = useState<MedecinReference[] | null>(null);
  const [servicesExt, setServicesExt] = useState<{ id: number; libelle: string; hopitaux: number }[] | null>(null);
  const [hopitaux, setHopitaux] = useState<{ id: number; nom: string }[] | null>(null);
  const [medecinsExt, setMedecinsExt] = useState<MedecinReference[] | null>(null);

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

  // Externe : médecins du service dans l'hôpital choisi, en service maintenant
  useEffect(() => {
    setMedecinsExt(null);
    if (!externe || !valeur.serviceId || !valeur.hopitalId) return;
    let actif = true;
    api
      .medecinsService(valeur.serviceId, valeur.hopitalId)
      .then((l) => actif && setMedecinsExt(l))
      .catch(() => actif && setMedecinsExt([]));
    return () => {
      actif = false;
    };
  }, [externe, valeur.serviceId, valeur.hopitalId]);

  const servicesInternes = useMemo(() => {
    const vus = new Map<number, string>();
    for (const m of tousInternes ?? []) if (m.serviceId && !vus.has(m.serviceId)) vus.set(m.serviceId, m.service);
    return [...vus].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [tousInternes]);

  // Médecins proposés : en service maintenant, du service choisi
  const medecins = externe ? medecinsExt : tousInternes;
  const proposes = (medecins ?? []).filter((m) => m.enService && (externe || m.serviceId === valeur.serviceId));
  const nomHopital = hopitaux?.find((h) => h.id === valeur.hopitalId)?.nom;
  const bloque = !valeur.serviceId ? 'Service d’abord' : externe && !valeur.hopitalId ? 'Hôpital d’abord' : null;

  return (
    <div className={s.hospBloc}>
      <div className={s.ligneChoix}>
        <span className={s.sousTitre}>
          <FaShareSquare aria-hidden="true" /> Référence <em className={s.requis}>*</em>
        </span>
        <Segments
          nom="Référence en interne ou en externe"
          valeur={valeur.portee}
          options={[
            ['interne', 'En interne'],
            ['externe', 'En externe'],
          ]}
          onChange={(x) => x && onChange({ ...referenceVide(), portee: x === 'externe' ? 'externe' : 'interne' })}
        />
      </div>

      {valeur.portee && (
        <>
          {/* Externe : hôpitaux du district (par défaut) ou hors du district */}
          {externe && (
            <HorsDistrict
              id="reference-hors-district"
              valeur={valeur.horsDistrict}
              onChange={(v) => maj({ horsDistrict: v, serviceId: null, hopitalId: null, medecinId: null })}
            />
          )}
          {/* Interne : service · médecin — externe : service · hôpital · médecin (sur la même ligne) */}
          <div className={externe ? s.ligneReferenceTrois : s.ligneReferenceDeux}>
            <div>
              <h3 className={s.sousTitre}>
                <FaHospitalUser aria-hidden="true" /> Service <em className={s.requis}>*</em>
              </h3>
              <SelectRecherche
                key={`service-${valeur.portee}`}
                id="reference-patient-service"
                options={
                  externe
                    ? (servicesExt ?? []).map((x) => ({ id: x.id, name: x.libelle, detail: `${x.hopitaux} établissement${x.hopitaux > 1 ? 's' : ''}` }))
                    : servicesInternes
                }
                value={valeur.serviceId}
                onChange={(id) => maj({ serviceId: id, hopitalId: null, medecinId: null })}
                placeholder={(externe ? servicesExt : tousInternes) ? '-- Choisir le service --' : 'Chargement…'}
                placeholderRecherche="Rechercher un service…"
                aucunResultat="Aucun service ne correspond"
              />
            </div>

            {externe && (
              <div>
                <h3 className={s.sousTitre}>
                  <FaHospitalAlt aria-hidden="true" /> Hôpital <small className={s.facultatif}>(facultatif)</small>
                </h3>
                {!valeur.serviceId ? (
                  <div className={s.champBloqueTele}>Service d’abord</div>
                ) : (
                  <SelectRecherche
                    key={`hopitaux-${valeur.serviceId}`}
                    id="reference-patient-hopital"
                    options={(hopitaux ?? []).map((h) => ({ id: h.id, name: h.nom }))}
                    value={valeur.hopitalId}
                    onChange={(id) => maj({ hopitalId: id, medecinId: null })}
                    optionVide={valeur.horsDistrict ? 'Tous les hôpitaux hors du district' : 'Tous les hôpitaux du district'}
                    placeholder={hopitaux ? (valeur.horsDistrict ? 'Tous les hôpitaux hors du district' : 'Tous les hôpitaux du district') : 'Chargement…'}
                    placeholderRecherche="Rechercher un hôpital…"
                    aucunResultat="Aucun hôpital ne correspond"
                  />
                )}
              </div>
            )}

            <div>
              <h3 className={s.sousTitre}>
                <FaUserMd aria-hidden="true" /> Médecin <small className={s.facultatif}>(facultatif)</small>
              </h3>
              {bloque ? (
                <div className={s.champBloqueTele}>{bloque}</div>
              ) : (
                <SelectRecherche
                  key={`medecins-${valeur.portee}-${valeur.serviceId}-${valeur.hopitalId ?? 0}`}
                  id="reference-patient-medecin"
                  options={proposes.map((m) => ({ id: m.id, name: nomAffiche(m), detail: m.creneau ?? undefined }))}
                  value={valeur.medecinId}
                  onChange={(id) => maj({ medecinId: id })}
                  optionVide={TOUS_LES_MEDECINS}
                  placeholder={medecins ? TOUS_LES_MEDECINS : 'Chargement…'}
                  placeholderRecherche="Rechercher un médecin…"
                  aucunResultat="Aucun médecin ne correspond"
                />
              )}
            </div>
          </div>

          <p className={s.note}>
            {envoiDirect && referenceEnvoiDirect(valeur)
              ? 'La consultation n’est pas terminée : elle est envoyée à ce médecin (en service maintenant), qui la poursuit avec ce que vous avez saisi.'
              : valeur.medecinId
                ? 'Le patient est référé à ce médecin : une fiche de référence s’ouvrira, à imprimer et à remettre au patient.'
                : !externe
                  ? 'Sans médecin choisi, tous les médecins du service dans votre hôpital reçoivent le patient (le premier qui le prend en charge l’obtient). Une fiche de référence s’ouvrira pour le patient.'
                  : valeur.hopitalId
                    ? `Tous les médecins de ce service à ${nomHopital ?? 'l’hôpital choisi'} reçoivent le patient (le premier qui le prend en charge l’obtient). Une fiche de référence s’ouvrira pour le patient.`
                    : `Tous les médecins de ce service dans les hôpitaux ${valeur.horsDistrict ? 'hors de votre district' : 'de votre district'} reçoivent le patient (le premier qui le prend en charge l’obtient). Une fiche de référence s’ouvrira pour le patient.`}
          </p>
        </>
      )}
    </div>
  );
}
