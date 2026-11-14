import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaCalendarAlt,
  FaCheck,
  FaClock,
  FaFileAlt,
  FaHourglassHalf,
  FaPlus,
  FaRedo,
  FaShieldAlt,
  FaTimes,
} from 'react-icons/fa';
import { alerte, messageErreur } from '../../../services/alertes';
import { apiAgent, type EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { InfirmierPermissionItem } from '../../../types';
import s from './Permissions.module.css';

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
 * INFIRMIER > PERMISSIONS
 * Équivalent Laravel : users.permission.permission
 */
export default function Permissions({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const source = apiAgent(espace);
  const [chargement, setChargement] = useState(true);
  const [items, setItems] = useState<InfirmierPermissionItem[]>([]);
  const [recherche, setRecherche] = useState('');

  // Modal Nouvelle Demande
  const [modalOuvert, setModalOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [debutDate, setDebutDate] = useState('');
  const [finDate, setFinDate] = useState('');
  const [debutHeure, setDebutHeure] = useState('');
  const [finHeure, setFinHeure] = useState('');
  const [description, setDescription] = useState('');

  const charger = async () => {
    setChargement(true);
    try {
      const res = await source.permissions.liste();
      setItems(res);
    } catch (e) {
      alerte.echec(`Erreur de chargement des permissions : ${messageErreur(e)}`);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const handleCreer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debutDate || !finDate || !description.trim()) {
      alerte.attention('Veuillez renseigner les dates et le motif de votre absence.');
      return;
    }

    setEnvoi(true);
    try {
      const res = await source.permissions.creer({
        beging_date: debutDate,
        end_date: finDate,
        beging_time: debutHeure || undefined,
        end_time: finHeure || undefined,
        description,
      });
      alerte.succes(res.message);
      setModalOuvert(false);
      setDebutDate('');
      setFinDate('');
      setDebutHeure('');
      setFinHeure('');
      setDescription('');
      charger();
    } catch (err) {
      alerte.echec(`Erreur lors de la soumission : ${messageErreur(err)}`);
    } finally {
      setEnvoi(false);
    }
  };

  const filtres = useMemo(() => {
    if (!recherche.trim()) return items;
    const q = recherche.toLowerCase();
    return items.filter(
      (it) =>
        it.code.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        (it.debutDate && it.debutDate.includes(q)) ||
        (it.finDate && it.finDate.includes(q)),
    );
  }, [items, recherche]);

  return (
    <div className={c.page}>
      {/* En-tête */}
      <header className={s.entete}>
        <div className={s.enteteGauche}>
          <div className={s.iconePermission}>
            <FaShieldAlt aria-hidden="true" />
          </div>
          <div>
            <p className={c.surtitre}>Espace Personnel · {espace === 'medecin' ? 'Médecin' : espace === 'regulateur' ? 'Régulateur' : 'Infirmier'}</p>
            <h1 className={c.titre} style={{ margin: 0 }}>Permissions &amp; Demandes d'absence</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Soumettez vos demandes de permission exceptionnelle et consultez l'état de validation de la direction.
            </p>
          </div>
        </div>
        <div className={c.boutons}>
          <button
            type="button"
            className={c.principal}
            onClick={() => setModalOuvert(true)}
          >
            <FaPlus aria-hidden="true" /> Nouvelle demande
          </button>
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
              placeholder="Rechercher par référence, motif ou date..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', color: '#64748b' }}>
            <span>
              <strong>{filtres.length}</strong> demande(s) de permission
            </span>
          </div>
        </div>

        <div className={c.tableWrapper}>
          <table className={c.table}>
            <thead>
              <tr>
                <th>Réf. Demande</th>
                <th>Période d'absence</th>
                <th>Horaires</th>
                <th>Motif &amp; Justification</th>
                <th>Date de soumission</th>
                <th style={{ textAlign: 'center' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    Chargement de vos demandes de permission...
                  </td>
                </tr>
              ) : filtres.length === 0 ? (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    {recherche
                      ? 'Aucune demande ne correspond à cette recherche.'
                      : 'Vous n’avez aucune demande de permission enregistrée.'}
                  </td>
                </tr>
              ) : (
                filtres.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <strong style={{ color: 'var(--dash-blue)', fontSize: '0.88rem' }}>
                        {it.code}
                      </strong>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                        <FaCalendarAlt style={{ color: '#64748b' }} />
                        <span>Du <strong>{formatDate(it.debutDate)}</strong> au <strong>{formatDate(it.finDate)}</strong></span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#64748b' }}>
                        <FaClock style={{ color: '#94a3b8' }} />
                        <span>{it.debutHeure && it.finHeure ? `${it.debutHeure} - ${it.finHeure}` : 'Journée complète'}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                        {it.description}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {formatDate(it.createdAt)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {it.statut === 'agree' ? (
                        <span className={`${c.badge} ${c.badgeVert}`}>
                          <FaCheck style={{ marginRight: 4 }} /> Validée
                        </span>
                      ) : it.statut === 'reject' ? (
                        <span className={`${c.badge} ${c.badgeRouge}`}>
                          <FaTimes style={{ marginRight: 4 }} /> Refusée
                        </span>
                      ) : (
                        <span className={`${c.badge} ${c.badgeOrange}`}>
                          <FaHourglassHalf style={{ marginRight: 4 }} /> En attente
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* =========================================================
          MODAL NOUVELLE DEMANDE DE PERMISSION
          ========================================================= */}
      {modalOuvert && (
        <div className={s.modalBackdrop} onClick={() => setModalOuvert(false)}>
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className={s.iconePermission} style={{ width: 44, height: 44, fontSize: '1.2rem' }}>
                  <FaFileAlt />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    Nouvelle Demande de Permission
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    La demande sera examinée par la direction de votre établissement
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={s.modalClose}
                onClick={() => setModalOuvert(false)}
                aria-label="Fermer"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleCreer}>
              <div className={s.modalBody}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <div className={s.champForm}>
                    <label htmlFor="debutDate">Date de début *</label>
                    <input
                      type="date"
                      id="debutDate"
                      value={debutDate}
                      onChange={(e) => setDebutDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className={s.champForm}>
                    <label htmlFor="finDate">Date de fin *</label>
                    <input
                      type="date"
                      id="finDate"
                      value={finDate}
                      onChange={(e) => setFinDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <div className={s.champForm}>
                    <label htmlFor="debutHeure">Heure de début (Optionnel)</label>
                    <input
                      type="time"
                      id="debutHeure"
                      value={debutHeure}
                      onChange={(e) => setDebutHeure(e.target.value)}
                    />
                  </div>
                  <div className={s.champForm}>
                    <label htmlFor="finHeure">Heure de fin (Optionnel)</label>
                    <input
                      type="time"
                      id="finHeure"
                      value={finHeure}
                      onChange={(e) => setFinHeure(e.target.value)}
                    />
                  </div>
                </div>

                <div className={s.champForm}>
                  <label htmlFor="desc">Motif circonstancié de la demande *</label>
                  <textarea
                    id="desc"
                    rows={4}
                    placeholder="Précisez la raison de votre demande d'absence (obligations familiales, raison médicale, formation...)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={s.modalFooter}>
                <button
                  type="button"
                  className={c.secondaire}
                  onClick={() => setModalOuvert(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={c.principal}
                  disabled={envoi}
                >
                  <FaCheck aria-hidden="true" />
                  {envoi ? 'Envoi en cours…' : 'Transmettre la demande'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

