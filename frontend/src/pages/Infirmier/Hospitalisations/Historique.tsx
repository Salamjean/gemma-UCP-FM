import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaCalendarAlt,
  FaCalendarCheck,
  FaHistory,
  FaNotesMedical,
  FaRedo,
  FaUserMd,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type {
  InfirmierHospitalisationHistoriqueItem,
} from '../../../types';
import s from './Hospitalisations.module.css';

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * INFIRMIER > HOSPITALISATIONS > HISTORIQUE
 * Équivalent Laravel : infirmier.hospitalisation.history (list.blade.php)
 */
export default function Historique() {
  const navigate = useNavigate();
  const [chargement, setChargement] = useState(true);
  const [items, setItems] = useState<InfirmierHospitalisationHistoriqueItem[]>([]);
  const [recherche, setRecherche] = useState('');

  const charger = async () => {
    setChargement(true);
    try {
      const res = await api.infirmier.hospitalisations.historique();
      setItems(res);
    } catch (e) {
      alerte.echec(`Erreur lors du chargement de l’historique : ${messageErreur(e)}`);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const filtres = useMemo(() => {
    if (!recherche.trim()) return items;
    const q = recherche.toLowerCase();
    return items.filter(
      (it) =>
        it.patient.nom.toLowerCase().includes(q) ||
        it.patient.code.toLowerCase().includes(q) ||
        (it.code && it.code.toLowerCase().includes(q)) ||
        it.medecin.nom.toLowerCase().includes(q) ||
        it.motif.toLowerCase().includes(q),
    );
  }, [items, recherche]);

  return (
    <div className={c.page}>
      {/* En-tête */}
      <header className={s.entete}>
        <div className={s.enteteGauche}>
          <div className={s.iconeHospitalisation} style={{ background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}>
            <FaHistory aria-hidden="true" />
          </div>
          <div>
            <p className={c.surtitre}>Espace Infirmier · Hospitalisations</p>
            <h1 className={c.titre} style={{ margin: 0 }}>Historique des Séjours Clôturés</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Archives des hospitalisations terminées, bilans de surveillance et motifs de sortie.
            </p>
          </div>
        </div>
        <div className={c.boutons}>
          <button
            type="button"
            className={c.secondaire}
            onClick={charger}
            disabled={chargement}
          >
            <FaRedo aria-hidden="true" /> Actualiser
          </button>
        </div>
      </header>

      {/* Tableau Principal */}
      <motion.section
        className={c.bloc}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={s.barreOutils}>
          <div className={s.recherche}>
            <svg
              className={s.rechercheIcone}
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher par patient, N° dossier ou médecin traitant..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', color: '#64748b' }}>
            <span>
              <strong>{filtres.length}</strong> séjour(s) archivé(s)
            </span>
          </div>
        </div>

        <div className={c.tableWrapper}>
          <table className={c.table}>
            <thead>
              <tr>
                <th>N° Dossier &amp; Patient</th>
                <th>Médecin Traitant</th>
                <th>Motif / Diagnostic</th>
                <th>Date d'admission</th>
                <th>Date de sortie</th>
                <th style={{ textAlign: 'center' }}>Durée</th>
                <th style={{ textAlign: 'center' }}>Statut</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr>
                  <td colSpan={8} className={c.vide}>
                    Chargement de l’historique des hospitalisations...
                  </td>
                </tr>
              ) : filtres.length === 0 ? (
                <tr>
                  <td colSpan={8} className={c.vide}>
                    {recherche
                      ? 'Aucun dossier ne correspond à votre recherche.'
                      : 'Aucune hospitalisation clôturée dans l’historique.'}
                  </td>
                </tr>
              ) : (
                filtres.map((item) => {
                  const patient = item.patient;
                  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
                  const photo = patient.imgUrl
                    ? patient.imgUrl.startsWith('http')
                      ? patient.imgUrl
                      : uploadUrl('patient', patient.imgUrl)
                    : null;

                  return (
                    <tr key={item.id}>
                      {/* Patient */}
                      <td>
                        <div className={s.patientCell}>
                          {photo ? (
                            <img src={photo} alt="" className={s.avatar} />
                          ) : (
                            <span className={`${s.avatarInitiales} ${feminin ? s.avatarF : ''}`}>
                              {initiales(patient.nom)}
                            </span>
                          )}
                          <div>
                            <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>
                              {patient.nom}
                            </strong>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              N° Dossier : <strong>{patient.code}</strong>
                              {patient.telephone && ` · ${patient.telephone}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Médecin */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FaUserMd style={{ color: '#059669' }} />
                            {item.medecin.nom}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {item.medecin.specialite}
                          </span>
                        </div>
                      </td>

                      {/* Motif */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: '0.84rem', color: '#334155' }}>
                            {item.motif}
                          </span>
                          {item.motSortie && (
                            <span style={{ fontSize: '0.74rem', color: '#059669', fontStyle: 'italic' }}>
                              Sortie : {item.motSortie}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date d'entrée */}
                      <td>
                        <span style={{ fontSize: '0.82rem', color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <FaCalendarAlt style={{ color: '#94a3b8' }} />
                          {formatDate(item.dateDebut)}
                        </span>
                      </td>

                      {/* Date de sortie */}
                      <td>
                        <span style={{ fontSize: '0.82rem', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <FaCalendarCheck style={{ color: '#059669' }} />
                          {formatDate(item.dateFin)}
                        </span>
                      </td>

                      {/* Durée */}
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a' }}>
                          {item.nbJours != null ? `${item.nbJours} j` : '—'}
                        </span>
                      </td>

                      {/* Statut */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`${c.badge} ${c.badgeVert}`}>
                          Clôturé
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={s.btnSuivi}
                          onClick={() => navigate(`/infirmier/hospitalisations/${item.id}/suivi`)}
                        >
                          <FaNotesMedical aria-hidden="true" />
                          Dossier de suivi
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

    </div>
  );
}
