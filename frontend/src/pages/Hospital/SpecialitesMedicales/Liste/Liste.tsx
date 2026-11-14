import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaAddressBook, FaCheckCircle, FaEdit, FaPlus, FaPowerOff, FaSearch, FaTrashAlt, FaUserMd, FaUserSlash } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import { dateCourte } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { Specialite } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Liste.module.css';

type Action = { type: 'statut' | 'supprimer'; specialite: Specialite };

/**
 * HÔPITAL > SPÉCIALITÉS MÉDICALES > LISTE
 * Équivalent Laravel : hospital.type.doctor.index (users/hospital/type_doctor/index.blade.php)
 * Données : GET /api/hospital/specialites
 */
export default function Liste() {
  const [specialites, setSpecialites] = useState<Specialite[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.hospital.specialites
      .liste()
      .then(setSpecialites)
      .catch((e) => {
        setSpecialites([]);
        alerte.echec(`Impossible de charger les spécialités : ${messageErreur(e)}`);
      });
  }, []);

  const executer = async () => {
    if (!action) return;
    const { type, specialite } = action;
    setEnCours(true);
    try {
      if (type === 'statut') {
        const r = await api.hospital.specialites.basculerStatut(specialite.id);
        setSpecialites((l) => l?.map((s) => (s.id === specialite.id ? { ...s, actif: r.actif } : s)) ?? null);
        alerte.succes(r.message);
      } else {
        const r = await api.hospital.specialites.supprimer(specialite.id);
        setSpecialites((l) => l?.filter((s) => s.id !== specialite.id) ?? null);
        alerte.succes(r.message);
      }
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setAction(null);
      setEnCours(false);
    }
  };

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!specialites || !q) return specialites ?? [];
    return specialites.filter((s) => [s.label, s.description].some((v) => v?.toLowerCase().includes(q)));
  }, [specialites, recherche]);

  const compteurs = specialites
    ? [
        { icone: FaAddressBook, valeur: specialites.length, libelle: 'Spécialités', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaCheckCircle, valeur: specialites.filter((s) => s.actif).length, libelle: 'Spécialités activées', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaUserMd, valeur: specialites.reduce((t, s) => t + (s.medecins ?? 0), 0), libelle: 'Médecins rattachés', fond: '#efe9fd', texte: '#6a3fd6' },
        { icone: FaUserSlash, valeur: specialites.filter((s) => !s.medecins).length, libelle: 'Sans médecin', fond: '#fff3df', texte: '#b56b00' },
      ]
    : [];

  const textes =
    action &&
    (action.type === 'supprimer'
      ? {
          titre: 'Supprimer cette spécialité ?',
          message:
            `« ${action.specialite.label} » ne sera plus proposée.` +
            (action.specialite.medecins ? ` ${action.specialite.medecins} médecin(s) y sont rattachés : leur fiche est conservée.` : ''),
          bouton: 'Supprimer',
          ton: 'danger' as const,
        }
      : action.specialite.actif
        ? { titre: 'Désactiver cette spécialité ?', message: `« ${action.specialite.label} » ne sera plus proposée tant qu'elle ne sera pas réactivée.`, bouton: 'Désactiver', ton: 'danger' as const }
        : { titre: 'Activer cette spécialité ?', message: `« ${action.specialite.label} » sera de nouveau proposée.`, bouton: 'Activer', ton: 'normal' as const });

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Spécialités médicales</p>
          <h1 className={c.titre}>Liste des spécialités</h1>
        </div>
        <Link to={`${baseHopital()}/specialites/ajouter`} className={c.principal}>
          <FaPlus aria-hidden="true" /> Ajouter une spécialité
        </Link>
      </header>

      <div className={`${c.compteurs} ${styles.compteurs}`}>
        {compteurs.map((k, i) => (
          <motion.div key={k.libelle} className={c.compteur} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
              <k.icone aria-hidden="true" />
            </span>
            <span className={c.compteurTexte}>
              <strong>{k.valeur.toLocaleString('fr-FR')}</strong>
              <span>{k.libelle}</span>
            </span>
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <label className={`${c.champ} ${c.recherche} ${styles.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Rechercher une spécialité…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une spécialité" />
          </label>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Spécialité</th>
                <th scope="col">Médecins</th>
                <th scope="col">Créée le</th>
                <th scope="col">Statut</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((s, i) => (
                <motion.tr key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                  <td>
                    <strong>{s.label}</strong>
                    {s.description && <span className={c.sousTexte}>{s.description}</span>}
                  </td>
                  <td>
                    <span className={`${c.badge} ${s.medecins ? styles.badgeMedecins : c.badgeNeutre}`}>
                      <FaUserMd aria-hidden="true" /> {s.medecins ?? 0}
                    </span>
                  </td>
                  <td>{dateCourte(s.creeLe)}</td>
                  <td>
                    <span className={`${c.badge} ${s.actif ? c.badgeOk : styles.badgeKo}`}>{s.actif ? 'Activée' : 'Désactivée'}</span>
                  </td>
                  <td>
                    <div className={c.actions}>
                      <Link to={`${baseHopital()}/specialites/${s.id}/modifier`} className={`${c.icone} ${styles.iconeModifier}`} title="Modifier" aria-label={`Modifier ${s.label}`}>
                        <FaEdit />
                      </Link>
                      <button
                        type="button"
                        className={`${c.icone} ${styles.iconeStatut}`}
                        title={s.actif ? 'Désactiver' : 'Activer'}
                        aria-label={`${s.actif ? 'Désactiver' : 'Activer'} ${s.label}`}
                        onClick={() => setAction({ type: 'statut', specialite: s })}
                      >
                        <FaPowerOff />
                      </button>
                      <button
                        type="button"
                        className={`${c.icone} ${c.iconeSupprimer}`}
                        title="Supprimer"
                        aria-label={`Supprimer ${s.label}`}
                        onClick={() => setAction({ type: 'supprimer', specialite: s })}
                      >
                        <FaTrashAlt />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {specialites && filtres.length === 0 && (
                <tr>
                  <td colSpan={5} className={c.vide}>
                    {recherche ? 'Aucune spécialité ne correspond à la recherche.' : 'Aucune spécialité pour le moment.'}
                  </td>
                </tr>
              )}
              {!specialites && (
                <tr>
                  <td colSpan={5} className={c.vide}>Chargement…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        ouvert={!!action}
        titre={textes?.titre ?? ''}
        message={textes?.message ?? ''}
        confirmer={textes?.bouton ?? 'Confirmer'}
        ton={textes?.ton}
        enCours={enCours}
        onConfirmer={executer}
        onAnnuler={() => setAction(null)}
      />
    </div>
  );
}
