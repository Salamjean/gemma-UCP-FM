import { useMemo, useState } from 'react';
import SelectRecherche from '../../../components/SelectRecherche';
import { fcfa } from '../../../services/format';
import type { OptionsAccueilInfirmier } from '../../../types';
import s from './Accueil.module.css';

export interface ValeurAffectation {
  prestationId: number | null;
  doctorId: number | null;
  /** affectation par un médecin : l'infirmier·ère qui prendra les constantes */
  infirmierId?: number | null;
  motif: string;
}

interface Props {
  options: OptionsAccueilInfirmier;
  valeur: ValeurAffectation;
  onChange: (v: ValeurAffectation) => void;
  /** Afficher les erreurs (après un essai d'envoi) */
  verifier: boolean;
}

/**
 * PARTAGÉ (inscription / recherche) — champs de l'affectation :
 *   Service → Prestation (actes du service) · Médecin (obligatoire : du même service ET disponible maintenant) · Montant · Motif.
 * L'affectation crée directement la consultation du jour (pas de caisse).
 */
export default function ChampsAffectation({ options, valeur, onChange, verifier }: Props) {
  /** Médecin qui affecte : il choisit aussi l'infirmier·ère (qui décidera de l'orientation) */
  const parMedecin = (options.infirmiers?.length ?? 0) > 0;
  const maj = (champ: Partial<ValeurAffectation>) => onChange({ ...valeur, ...champ });
  const prestation = options.prestations.find((p) => p.id === valeur.prestationId);

  // Services de l'hôpital (déduits des prestations, dans l'ordre alphabétique)
  const services = useMemo(() => [...new Set(options.prestations.map((p) => p.service))].sort((a, b) => a.localeCompare(b, 'fr')), [options.prestations]);
  const [service, setService] = useState<string | null>(prestation?.service ?? null);
  const prestationsDuService = options.prestations.filter((p) => p.service === service);
  // Médecins disponibles maintenant ET affectés à ce service (service_hospitals.id des prestations du service)
  const idsService = new Set(prestationsDuService.map((p) => p.serviceId));
  const medecinsDuService = options.medecins.filter((m) => idsService.has(m.serviceId));

  const choisirService = (index: number | null) => {
    const nom = index === null ? null : services[index];
    setService(nom);
    // Un seul acte dans le service : il est choisi d'office
    const actes = options.prestations.filter((p) => p.service === nom);
    // Changement de service : le médecin choisi n'est plus forcément de ce service
    maj({ prestationId: actes.length === 1 ? actes[0].id : null, doctorId: null });
  };

  return (
    <div className={s.affectation}>
      <div className={s.ligne3}>
        <div className={s.champ}>
          <label htmlFor="service">
            Service <span className={s.requis}>*</span>
          </label>
          <SelectRecherche
            id="service"
            options={services.map((nom, i) => ({ id: i, name: nom }))}
            value={service === null ? null : services.indexOf(service)}
            onChange={choisirService}
            placeholder="-- Choisir le service --"
            placeholderRecherche="Rechercher un service…"
            aucunResultat="Aucun service (voir l'onglet Services de l'hôpital)"
            invalide={verifier && !service}
          />
        </div>
        <div className={s.champ}>
          <label htmlFor="prestation">
            Prestation <span className={s.requis}>*</span>
          </label>
          {service ? (
            <SelectRecherche
              key={service}
              id="prestation"
              options={prestationsDuService.map((p) => ({ id: p.id, name: p.libelle, detail: fcfa(p.prix) }))}
              value={valeur.prestationId}
              onChange={(id) => maj({ prestationId: id })}
              placeholder="-- Choisir la prestation --"
              placeholderRecherche="Rechercher un acte…"
              aucunResultat="Aucune prestation dans ce service"
              invalide={verifier && !valeur.prestationId}
            />
          ) : (
            <div className={s.champBloque}>Choisissez d'abord le service</div>
          )}
        </div>
        <div className={s.champ}>
          <label htmlFor="medecin">
            Médecin <span className={s.requis}>*</span>
          </label>
          {!service ? (
            <div className={s.champBloque}>Choisissez d'abord le service</div>
          ) : medecinsDuService.length > 0 ? (
            <SelectRecherche
              key={service}
              id="medecin"
              options={medecinsDuService.map((m) => ({ id: m.id, name: m.nom }))}
              value={valeur.doctorId}
              onChange={(id) => maj({ doctorId: id })}
              placeholder="-- Choisir le médecin --"
              placeholderRecherche="Rechercher un médecin…"
              aucunResultat="Aucun médecin trouvé"
              invalide={verifier && !valeur.doctorId}
            />
          ) : (
            <div className={`${s.champBloque} ${s.champAlerte}`} title="Aucun médecin de ce service n'a de créneau en ce moment (voir leurs jours de disponibilité)">
              Aucun médecin de ce service disponible maintenant
            </div>
          )}
        </div>
        {parMedecin && (
          <div className={s.champ}>
            <label htmlFor="infirmier">
              Infirmier·ère <span className={s.requis}>*</span>
            </label>
            <SelectRecherche
              id="infirmier"
              options={options.infirmiers.map((i) => ({ id: i.id, name: i.nom, detail: i.service ?? undefined }))}
              value={valeur.infirmierId ?? null}
              onChange={(id) => maj({ infirmierId: id })}
              placeholder="-- Choisir l'infirmier·ère --"
              placeholderRecherche="Rechercher un·e infirmier·ère…"
              aucunResultat="Aucun·e infirmier·ère trouvé·e"
              invalide={verifier && !valeur.infirmierId}
            />
          </div>
        )}
        <div className={s.champ}>
          <span className={s.etiquette}>Montant</span>
          <div className={s.montant}>{prestation ? fcfa(prestation.prix) : '—'}</div>
        </div>
      </div>
      <div className={`${s.champ} ${verifier && !valeur.motif.trim() ? s.invalide : ''}`}>
        <label htmlFor="motif">
          Motif de la consultation <span className={s.requis}>*</span>
        </label>
        <input id="motif" maxLength={500} placeholder="Ex. Fièvre et maux de tête depuis 3 jours" value={valeur.motif} onChange={(e) => maj({ motif: e.target.value })} />
      </div>
    </div>
  );
}
