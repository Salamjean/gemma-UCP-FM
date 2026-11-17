import { useEffect, useState } from 'react';
import { FaHospitalAlt, FaRegCalendarAlt, FaRegClock, FaUserMd, FaVideo } from 'react-icons/fa';
import SelectRecherche from '../../../../components/SelectRecherche/SelectRecherche';
import type { TeleconsultationHospitalItem } from '../../../../types';
import { useEspaceConsultation } from './espace';
import s from './FormulaireConsultation.module.css';

export interface TelemedecineSaisie {
  /** AAAA-MM-JJ */
  date: string;
  /** HH:MM */
  heure: string;
  hopitalId: number | null;
  medecinId: number | null;
  medecinNom: string | null;
}

const dateLocale = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const telemedecineVide = (): TelemedecineSaisie => ({ date: dateLocale(new Date()), heure: '', hopitalId: null, medecinId: null, medecinNom: null });

/** Date + heure renseignées et pas dans le passé */
export const momentTelemedecineValide = (t: TelemedecineSaisie) =>
  /^\d{4}-\d{2}-\d{2}$/.test(t.date) && /^\d{2}:\d{2}$/.test(t.heure) && new Date(`${t.date}T${t.heure}`) >= new Date();

/**
 * CONSULTATION > ISSUE « TÉLÉCONSULTATION »
 * Date et heure souhaitées → hôpital de la DMHP → médecins disponibles à ce moment (le service est celui du médecin choisi).
 * Le patient est programmé dans les télémédecines du médecin choisi.
 */
export default function IssueTelemedecine({ valeur, onChange }: { valeur: TelemedecineSaisie; onChange: (v: TelemedecineSaisie) => void }) {
  const { api } = useEspaceConsultation();
  const [hopitaux, setHopitaux] = useState<TeleconsultationHospitalItem[] | null>(null);
  const [medecins, setMedecins] = useState<{ id: number; nom: string; specialite: string; creneau?: string | null }[] | null>(null);
  const momentOk = momentTelemedecineValide(valeur);
  const maj = (p: Partial<TelemedecineSaisie>) => onChange({ ...valeur, ...p });

  // Hôpitaux (avec le nombre de médecins disponibles au moment choisi)
  useEffect(() => {
    let actif = true;
    setHopitaux(null);
    api
      .teleHopitaux(momentOk ? valeur.date : undefined, momentOk ? valeur.heure : undefined)
      .then((l) => actif && setHopitaux(l))
      .catch(() => actif && setHopitaux([]));
    return () => {
      actif = false;
    };
  }, [valeur.date, valeur.heure, momentOk]);

  // Médecins disponibles de l'hôpital choisi, au moment choisi
  useEffect(() => {
    setMedecins(null);
    if (!valeur.hopitalId || !momentOk) return;
    let actif = true;
    api
      .teleMedecins(valeur.hopitalId, valeur.date, valeur.heure)
      .then((l) => {
        if (!actif) return;
        setMedecins(l);
        // Le médecin choisi n'est plus disponible à ce moment : on le retire
        if (valeur.medecinId && !l.some((m) => m.id === valeur.medecinId)) maj({ medecinId: null, medecinNom: null });
      })
      .catch(() => actif && setMedecins([]));
    return () => {
      actif = false;
    };
  }, [valeur.hopitalId, valeur.date, valeur.heure, momentOk]);

  const passe = /^\d{4}-\d{2}-\d{2}$/.test(valeur.date) && /^\d{2}:\d{2}$/.test(valeur.heure) && !momentOk;

  return (
    <div className={s.hospBloc}>
      <h3 className={s.sousTitre}>
        <FaVideo aria-hidden="true" /> Téléconsultation programmée <em className={s.requis}>*</em>
      </h3>
      {/* Date, heure, hôpital et médecin sur la même ligne */}
      <div className={s.ligneTeleQuatre}>
        <div>
          <h3 className={s.sousTitre}>
            <FaRegCalendarAlt aria-hidden="true" /> Date
          </h3>
          <input type="date" aria-label="Date de la téléconsultation" min={dateLocale(new Date())} value={valeur.date} onChange={(e) => maj({ date: e.target.value })} />
        </div>
        <div>
          <h3 className={s.sousTitre}>
            <FaRegClock aria-hidden="true" /> Heure
          </h3>
          <input type="time" aria-label="Heure de la téléconsultation" value={valeur.heure} onChange={(e) => maj({ heure: e.target.value })} />
        </div>
        <div>
          <h3 className={s.sousTitre}>
            <FaHospitalAlt aria-hidden="true" /> Hôpital
          </h3>
          <SelectRecherche
            id="tele-hopital"
            options={(hopitaux ?? []).map((h) => ({
              id: h.id,
              name: h.name,
              detail: momentOk ? `${h.availableDoctorsCount} médecin(s) disponible(s)` : h.district,
            }))}
            value={valeur.hopitalId}
            onChange={(id) => maj({ hopitalId: id, medecinId: null, medecinNom: null })}
            placeholder={hopitaux ? (hopitaux.length ? '-- Choisir l’hôpital --' : 'Aucun hôpital avec la télémédecine active') : 'Chargement…'}
            placeholderRecherche="Rechercher un hôpital…"
            aucunResultat="Aucun hôpital ne correspond"
          />
        </div>
        <div>
          <h3 className={s.sousTitre}>
            <FaUserMd aria-hidden="true" /> Médecin
          </h3>
          {!momentOk || !valeur.hopitalId ? (
            <div className={s.champBloqueTele}>Date, heure et hôpital d’abord</div>
          ) : (
            <SelectRecherche
              key={`${valeur.hopitalId}-${valeur.date}-${valeur.heure}`}
              id="tele-medecin"
              // Service du médecin affiché sous son nom : c'est lui qui détermine le service
              options={(medecins ?? []).map((m) => ({ id: m.id, name: m.nom, detail: `${m.specialite}${m.creneau ? ` · ${m.creneau}` : ''}` }))}
              value={valeur.medecinId}
              onChange={(id) => maj({ medecinId: id, medecinNom: medecins?.find((m) => m.id === id)?.nom ?? null })}
              placeholder={medecins ? (medecins.length ? '-- Choisir le médecin --' : 'Aucun médecin disponible à ce moment') : 'Chargement…'}
              placeholderRecherche="Rechercher un médecin…"
              aucunResultat="Aucun médecin ne correspond"
            />
          )}
        </div>
      </div>
      {passe && (
        <p className={s.noteErreur} role="alert">
          La date et l’heure ne peuvent pas être dans le passé.
        </p>
      )}
      <p className={s.note}>Le service est celui du médecin choisi. Le patient apparaîtra dans l’onglet Télémédecine de ce médecin.</p>
    </div>
  );
}
