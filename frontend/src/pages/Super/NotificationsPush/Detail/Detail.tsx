import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaBell, FaCheckDouble, FaMobileAlt, FaRedo, FaTrashAlt, FaUsers } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import Pagination from '../../../../components/Pagination';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import type { CategorieDiffusion, DetailDiffusion } from '../../../../types';
import c from '../../../../styles/espace.module.css';
import { CATEGORIES, CIBLES, dateHeure } from '../notifications.config';
import styles from './Detail.module.css';

const PAR_PAGE = 10;

/**
 * SUPER > NOTIFICATIONS PUSH > DÉTAIL D'UNE DIFFUSION (bouton "œil" de la liste)
 * Équivalent Laravel : super.notifications.show
 */
export default function Detail() {
  const { lot = '' } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState<DetailDiffusion | null>(null);
  const [erreur, setErreur] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState<'relancer' | 'supprimer' | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.super.notifications
      .detail(lot)
      .then(setD)
      .catch((e) => {
        setErreur(true);
        alerte.echec(messageErreur(e));
      });
  }, [lot]);

  const executer = async () => {
    if (!d || !confirmation) return;
    setEnCours(true);
    try {
      if (confirmation === 'relancer') {
        const r = await api.super.notifications.relancer(d.lot);
        (r.type === 'succes' ? alerte.succes : alerte.attention)(r.message);
      } else {
        const r = await api.super.notifications.supprimer(d.lot);
        alerte.succes(r.message);
      }
      setConfirmation(null);
      navigate('/super/notifications-push/liste');
    } catch (e) {
      setConfirmation(null);
      alerte.echec(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  if (erreur) return <p className={c.vide}>Diffusion introuvable.</p>;
  if (!d) return <p className={c.vide}>Chargement…</p>;

  const cat = CATEGORIES[d.categorie as CategorieDiffusion] ?? CATEGORIES.general;
  const cible = CIBLES[d.cible] ?? CIBLES.all;
  const lignes = d.destinataires.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
  const pages = Math.max(1, Math.ceil(d.destinataires.length / PAR_PAGE));

  const compteurs = [
    { icone: FaUsers, valeur: d.nombreDestinataires, libelle: 'Destinataires', fond: '#eaf3fe', texte: '#1f6fc6' },
    { icone: FaMobileAlt, valeur: d.push, libelle: 'Push sur téléphone', fond: '#e3f5ee', texte: '#0b7a54' },
    { icone: FaBell, valeur: d.inAppSeulement, libelle: 'In-App seulement', fond: '#fff3df', texte: '#b56b00' },
    { icone: FaCheckDouble, valeur: d.lus, libelle: 'Lues', fond: '#efe9fd', texte: '#6a3fd6' },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Détail de la diffusion · {d.lot}</p>
          <h1 className={c.titre}>{d.titre}</h1>
        </div>
        <div className={c.boutons}>
          <Link to="/super/notifications-push/liste" className={c.secondaire}>
            <FaArrowLeft aria-hidden="true" /> Liste
          </Link>
          <button type="button" className={c.principal} onClick={() => setConfirmation('relancer')}>
            <FaRedo aria-hidden="true" /> Relancer
          </button>
          <button type="button" className={c.danger} onClick={() => setConfirmation('supprimer')}>
            <FaTrashAlt aria-hidden="true" /> Supprimer
          </button>
        </div>
      </header>

      <div className={styles.haut}>
        {/* Message envoyé */}
        <motion.section className={c.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className={styles.meta}>
            <span className={c.badge} style={{ background: cat.fond, color: cat.texte }}>
              <cat.icone aria-hidden="true" /> {cat.label}
            </span>
            <span className={`${c.badge} ${c.badgeNeutre}`}>
              <cible.icone aria-hidden="true" /> {cible.label}
            </span>
          </div>
          <p className={styles.message}>{d.message}</p>
          <p className={c.sousTexte}>
            Envoyée le {dateHeure(d.date, true)} par {d.envoyePar}
          </p>
        </motion.section>

        {/* Compteurs */}
        <div className={styles.compteurs}>
          {compteurs.map((k, i) => (
            <motion.div key={k.libelle} className={c.compteur} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
                <k.icone aria-hidden="true" />
              </span>
              <span className={c.compteurTexte}>
                <strong>{k.valeur}</strong>
                <span>{k.libelle}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      <section className={c.bloc}>
        <h2 className={c.blocTitre}>Destinataires</h2>
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col">N°</th>
                <th scope="col">Code patient</th>
                <th scope="col">Nom & prénoms</th>
                <th scope="col">Téléphone</th>
                <th scope="col">Appareil</th>
                <th scope="col">Canal de réception</th>
                <th scope="col">Lecture</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((r, i) => (
                <tr key={r.id}>
                  <td className={c.sousTexte}>#{(page - 1) * PAR_PAGE + i + 1}</td>
                  <td>{r.codePatient ?? '—'}</td>
                  <td><strong>{r.nom}</strong></td>
                  <td>{r.telephone ?? '—'}</td>
                  <td>{r.appareil}</td>
                  <td>
                    <span className={`${c.badge} ${r.canal.startsWith('Push') ? c.badgeOk : c.badgeNeutre}`}>{r.canal}</span>
                  </td>
                  <td>
                    <span className={`${c.badge} ${r.lu ? c.badgeOk : c.badgeNeutre}`}>
                      {r.lu ? `Lue · ${dateHeure(r.luLe)}` : 'Non lue'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} onChange={setPage} resume={`${d.nombreDestinataires} destinataire(s)`} />
      </section>

      <ConfirmDialog
        ouvert={!!confirmation}
        titre={confirmation === 'relancer' ? 'Relancer cette notification ?' : 'Supprimer cette diffusion ?'}
        message={
          confirmation === 'relancer'
            ? `« ${d.titre} » sera de nouveau envoyée ${cible.label.toLowerCase()} (nouveau lot).`
            : `La campagne et ses ${d.nombreDestinataires} notification(s) In-App seront supprimées de l'historique.`
        }
        confirmer={confirmation === 'relancer' ? 'Relancer' : 'Supprimer'}
        ton={confirmation === 'supprimer' ? 'danger' : 'normal'}
        enCours={enCours}
        onConfirmer={executer}
        onAnnuler={() => setConfirmation(null)}
      />
    </div>
  );
}
