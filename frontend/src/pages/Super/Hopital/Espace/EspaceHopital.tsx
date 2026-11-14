import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { FaArrowLeft, FaEdit } from 'react-icons/fa';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api, uploadUrl } from '../../../../services/api';
import { nommerHopital, ouvrirHopital } from '../../../../services/contexteHopital';
import type { HopitalSupervision } from '../../../../types';
import * as Assurances from '../../../Hospital/Assurances';
import * as Consultations from '../../../Hospital/Consultations';
import * as Declarations from '../../../Hospital/Declarations';
import * as Hospitalisation from '../../../Hospital/Hospitalisation';
import * as Patients from '../../../Hospital/Patients';
import * as Permissions from '../../../Hospital/Permissions';
import * as PersonnelSante from '../../../Hospital/PersonnelSante';
import * as Services from '../../../Hospital/Services';
import * as SpecialitesMedicales from '../../../Hospital/SpecialitesMedicales';
import Modifier from '../Modifier/Modifier';
import VueEnsemble from './VueEnsemble';
import s from './EspaceHopital.module.css';

const PHOTO_DEFAUT = '/images/dashboard/avatar-hospital.gif';

/** Pages de l'espace hôpital disponibles dans l'onglet (mêmes chemins que l'espace hôpital) */
const PAGES: { chemin: string; element: ReactNode }[] = [
  { chemin: 'personnel-sante/medecins', element: <PersonnelSante.ListeAgents type="medecin" /> },
  { chemin: 'personnel-sante/sages-femmes', element: <PersonnelSante.ListeAgents type="sage-femme" /> },
  { chemin: 'personnel-sante/infirmiers', element: <PersonnelSante.ListeAgents type="infirmier" /> },
  { chemin: 'personnel-sante/regulateurs', element: <PersonnelSante.ListeAgents type="regulateur" /> },
  { chemin: 'personnel-sante/ajouter', element: <PersonnelSante.Ajouter /> },
  { chemin: 'personnel-sante/:type/:id/modifier', element: <PersonnelSante.Modifier /> },
  { chemin: 'specialites/liste', element: <SpecialitesMedicales.Liste /> },
  { chemin: 'specialites/ajouter', element: <SpecialitesMedicales.Ajouter /> },
  { chemin: 'specialites/:id/modifier', element: <SpecialitesMedicales.Modifier /> },
  { chemin: 'services/liste', element: <Services.Liste /> },
  { chemin: 'services/ajouter', element: <Services.Ajouter /> },
  { chemin: 'services/:id', element: <Services.Detail /> },
  { chemin: 'services/:id/modifier', element: <Services.Detail edition /> },
  { chemin: 'assurances/liste', element: <Assurances.Liste /> },
  { chemin: 'assurances/ajouter', element: <Assurances.Ajouter /> },
  { chemin: 'assurances/:id/modifier', element: <Assurances.Modifier /> },
  { chemin: 'hospitalisation/chambres', element: <Hospitalisation.GestionChambres /> },
  { chemin: 'hospitalisation/chambres/ajouter', element: <Hospitalisation.AjouterChambre /> },
  { chemin: 'hospitalisation/chambres/:id/modifier', element: <Hospitalisation.ModifierChambre /> },
  { chemin: 'hospitalisation/liste', element: <Hospitalisation.Hospitalisations /> },
  { chemin: 'hospitalisation/liste/:id', element: <Hospitalisation.HospitalisationDetail /> },
  { chemin: 'hospitalisation/observations', element: <Hospitalisation.Observations /> },
  { chemin: 'hospitalisation/observations/:id', element: <Hospitalisation.ObservationDetail /> },
  { chemin: 'patients/liste', element: <Patients.Liste /> },
  { chemin: 'patients/:id', element: <Patients.Detail /> },
  { chemin: 'consultations/nouvelles', element: <Consultations.Nouvelles /> },
  { chemin: 'consultations/historique', element: <Consultations.Historique /> },
  { chemin: 'consultations/:id', element: <Consultations.Detail /> },
  { chemin: 'declarations/naissances', element: <Declarations.ListeNaissances /> },
  { chemin: 'declarations/naissances/:id', element: <Declarations.DetailNaissance /> },
  { chemin: 'declarations/deces', element: <Declarations.ListeDeces /> },
  { chemin: 'declarations/deces/:id', element: <Declarations.DetailDeces /> },
  { chemin: 'permissions/en-attente', element: <Permissions.ListePermissions statut="pending" /> },
  { chemin: 'permissions/accordees', element: <Permissions.ListePermissions statut="agree" /> },
  { chemin: 'permissions/refusees', element: <Permissions.ListePermissions statut="reject" /> },
];

/**
 * ADMIN UCP-FM > HÔPITAL OUVERT (bouton « Ouvrir » de la liste)
 * En-tête de l'établissement + page de la rubrique choisie dans la sidebar : vue d'ensemble, personnel, services, assurances, hospitalisation,
 * patients, consultations, déclarations, permissions (consultation seule : pas de réponse).
 */
export default function EspaceHopital() {
  const { id } = useParams();
  const hopitalId = Number(id);
  const [data, setData] = useState<HopitalSupervision | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Contexte de l'hôpital ouvert (avant le rendu des pages, pour leurs appels au serveur)
  ouvrirHopital(Number.isInteger(hopitalId) ? hopitalId : null);
  useLayoutEffect(() => {
    ouvrirHopital(hopitalId);
    return () => ouvrirHopital(null);
  }, [hopitalId]);

  useEffect(() => {
    let actif = true;
    api.super.hopitaux
      .supervision(hopitalId)
      .then((d) => {
        if (actif) setData(d);
      })
      .catch((e) => {
        if (actif) setErreur(e instanceof Error ? e.message : 'Hôpital introuvable.');
      });
    return () => {
      actif = false;
    };
  }, [hopitalId]);

  // Nom de l'hôpital en titre de la sidebar (rubriques de l'hôpital : voir menuHopital.ts)
  useEffect(() => {
    nommerHopital(data?.hopital.label ?? '');
  }, [data]);
  useEffect(() => () => nommerHopital(''), []);

  const base = `/super/hopital/${hopitalId}`;

  if (erreur) {
    return (
      <div className={s.page}>
        <p className={s.erreur}>{erreur}</p>
        <Link to="/super/hopital/liste" className={s.retour}>
          <FaArrowLeft aria-hidden="true" /> Retour à la liste
        </Link>
      </div>
    );
  }

  const h = data?.hopital;
  return (
    <div className={s.page}>
      {/* --- En-tête de l'établissement --- */}
      <motion.section className={s.entete} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <img className={s.photo} src={h?.imgUrl ? uploadUrl('hospital', h.imgUrl) : PHOTO_DEFAUT} alt="" onError={(e) => (e.currentTarget.src = PHOTO_DEFAUT)} />
        <div className={s.identite}>
          <span className={s.surtitre}>Hôpital UCP-FM {h?.reference ? `· ${h.reference}` : ''}</span>
          <h1 className={s.nom}>{h?.label ?? 'Chargement…'}</h1>
          {h && (
            <p className={s.infos}>
              {[h.localite, h.district && `District ${h.district}`, h.directionGenerale && `Direction ${h.directionGenerale}`, h.contact].filter(Boolean).join(' · ')}
            </p>
          )}
          {h && (
            <div className={s.badges}>
              <span className={`${s.badge} ${h.actif ? s.ok : s.ko}`}>{h.actif ? 'Compte actif' : 'Compte désactivé'}</span>
              <span className={`${s.badge} ${h.teleconsultation ? s.ok : s.ko}`}>Téléconsultation {h.teleconsultation ? 'activée' : 'désactivée'}</span>
            </div>
          )}
        </div>
        <div className={s.boutons}>
          <Link to="/super/hopital/liste" className={s.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Liste
          </Link>
          <Link to={`${base}/modifier`} className={s.principal}>
            <FaEdit aria-hidden="true" /> Modifier
          </Link>
        </div>
      </motion.section>

      {/* --- Contenu de l'onglet (pages de l'espace hôpital) --- */}
      <div className={s.contenu}>
        <Routes>
          <Route index element={<VueEnsemble data={data} base={base} />} />
          <Route path="modifier" element={<Modifier />} />
          {PAGES.map((p) => (
            <Route key={p.chemin} path={p.chemin} element={p.element} />
          ))}
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </div>
    </div>
  );
}
