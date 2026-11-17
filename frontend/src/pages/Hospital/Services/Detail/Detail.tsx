import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { FaArrowLeft, FaCheck, FaEdit, FaLock, FaPowerOff, FaTrashAlt } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { ServiceDetail } from '../../../../types';
import EditeurActes, { ligneInvalide, versActe, type LigneActe } from '../EditeurActes';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Detail.module.css';
import { PaginationTableau, usePagination } from '../../../../components/Pagination';

type Action = { type: 'statut' } | { type: 'supprimer' } | { type: 'acte'; ligne: LigneActe };

/**
 * HÔPITAL > SERVICES > FICHE D'UN SERVICE
 * Équivalent Laravel : hospital.service.show (users/hospital/service/show.blade.php)
 *   - bouton "œil" de la liste    → /hopital/services/:id           (lecture)
 *   - bouton "crayon" de la liste → /hopital/services/:id/modifier  (edition : description, ajout / retrait d’actes)
 */
export default function Detail({ edition = false }: { edition?: boolean }) {
  const { id } = useParams();
  const serviceId = Number(id);
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [description, setDescription] = useState('');
  const [lignes, setLignes] = useState<LigneActe[]>([]);
  const [verifier, setVerifier] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    api.hospital.services
      .detail(serviceId)
      .then((s) => {
        setService(s);
        setDescription(s.description ?? '');
        setLignes(
          s.actes.map((a) => ({
            cle: `e${a.id}`,
            existantId: a.id,
            libelle: a.libelle,
            prix: String(a.prix),
            description: a.description ?? '',
            verrouille: a.verrouille,
          })),
        );
        setVerifier(false);
      })
      .catch((e) => {
        setIntrouvable(true);
        alerte.echec(messageErreur(e));
      });
  }, [serviceId]);

  useEffect(charger, [charger]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifier(true);
    if (lignes.some(ligneInvalide)) {
      alerte.echec('Chaque acte doit avoir un intitulé.');
      return;
    }
    setEnvoi(true);
    try {
      const r = await api.hospital.services.modifier(serviceId, {
        description: description.trim(),
        actesExistants: lignes
          .filter((l) => l.existantId)
          .map((l) => ({ id: l.existantId!, prix: Number(l.prix), description: l.description.trim() || undefined })),
        nouveauxActes: lignes.filter((l) => !l.existantId).map(versActe),
      });
      await alerte.succes(r.message);
      navigate(`${baseHopital()}/services/${serviceId}`);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const executer = async () => {
    if (!action || !service) return;
    setEnCours(true);
    try {
      if (action.type === 'statut') {
        const r = await api.hospital.services.basculerStatut(serviceId);
        setService({ ...service, actif: r.actif });
        alerte.succes(r.message);
      } else if (action.type === 'supprimer') {
        const r = await api.hospital.services.supprimer(serviceId);
        await alerte.succes(r.message);
        navigate(`${baseHopital()}/services/liste`);
      } else {
        const r = await api.hospital.services.supprimerActe(serviceId, action.ligne.existantId!);
        // Retire la ligne sans perdre les autres saisies en cours
        setLignes((l) => l.filter((x) => x.cle !== action.ligne.cle));
        alerte.succes(r.message);
      }
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setAction(null);
      setEnCours(false);
    }
  };

  // Tableaux : 10 lignes par page (hooks avant tout retour anticipé)
  const pg = usePagination(service?.actes);

  if (!service) {
    return (
      <div className={c.page}>
        <section className={c.bloc}>
          <p className={c.vide}>{introuvable ? 'Service introuvable.' : 'Chargement…'}</p>
          {introuvable && (
            <Link to={`${baseHopital()}/services/liste`} className={c.secondaire}>
              <FaArrowLeft aria-hidden="true" /> Liste des services
            </Link>
          )}
        </section>
      </div>
    );
  }

  const existants = lignes.filter((l) => l.existantId);
  const nouveaux = lignes.length - existants.length;

  const textes = action && {
    statut: service.actif
      ? { titre: 'Désactiver ce service ?', message: `« ${service.libelle} » ne sera plus proposé tant qu'il ne sera pas réactivé.`, bouton: 'Désactiver', ton: 'danger' as const }
      : { titre: 'Activer ce service ?', message: `« ${service.libelle} » sera de nouveau proposé.`, bouton: 'Activer', ton: 'normal' as const },
    supprimer: { titre: 'Supprimer ce service ?', message: `« ${service.libelle} » et tous ses actes seront supprimés de votre hôpital.`, bouton: 'Supprimer', ton: 'danger' as const },
    acte: {
      titre: 'Retirer cet acte ?',
      message: action.type === 'acte' ? `« ${action.ligne.libelle} » ne sera plus pratiqué dans ce service.` : '',
      bouton: 'Retirer',
      ton: 'danger' as const,
    },
  }[action.type];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Services · {edition ? 'Modifier' : 'Fiche'}</p>
          <h1 className={`${c.titre} ${styles.titre}`}>
            {service.libelle}
            <span className={`${c.badge} ${service.actif ? c.badgeOk : styles.badgeKo}`}>{service.actif ? 'Activé' : 'Désactivé'}</span>
          </h1>
        </div>
        <div className={c.boutons}>
          {edition ? (
            <Link to={`${baseHopital()}/services/${serviceId}`} className={c.secondaire}>
              <FaArrowLeft aria-hidden="true" /> Retour à la fiche
            </Link>
          ) : (
            <>
              <Link to={`${baseHopital()}/services/liste`} className={c.secondaire}>
                <FaArrowLeft aria-hidden="true" /> Liste
              </Link>
              <Link to={`${baseHopital()}/services/${serviceId}/modifier`} className={c.principal}>
                <FaEdit aria-hidden="true" /> Modifier
              </Link>
            </>
          )}
          <button type="button" className={c.secondaire} onClick={() => setAction({ type: 'statut' })}>
            <FaPowerOff aria-hidden="true" /> {service.actif ? 'Désactiver' : 'Activer'}
          </button>
          <button type="button" className={c.danger} onClick={() => setAction({ type: 'supprimer' })}>
            <FaTrashAlt aria-hidden="true" /> Supprimer
          </button>
        </div>
      </header>

      <div className={styles.resume}>
        {[
          { libelle: 'Actes pratiqués', valeur: String(existants.length) },
          { libelle: 'Actes du catalogue à ajouter', valeur: String(service.disponibles.filter((d) => !lignes.some((l) => l.prestationServiceId === d.id)).length) },
        ].map((k, i) => (
          <motion.div key={k.libelle} className={styles.resumeCase} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span>{k.libelle}</span>
            <strong>{k.valeur}</strong>
          </motion.div>
        ))}
      </div>

      {!edition ? (
        /* --- Lecture seule --- */
        <section className={c.bloc}>
          <p className={styles.descriptionLecture}>{service.description || <span className={c.sousTexte}>Aucune description.</span>}</p>
          <h2 className={`${c.blocTitre} ${styles.espace}`}>Actes médicaux</h2>
          <div className={c.tableWrap}>
            <table className={`${c.table} ${c.centre}`}>
              <thead>
                <tr>
                  <th scope="col">Acte médical / prestation</th>
                  <th scope="col">Précision</th>
                  <th scope="col">Suppression</th>
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((a, i) => (
                  <motion.tr key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}>
                    <td><strong>{a.libelle}</strong></td>
                    <td>{a.description ?? '—'}</td>
                    <td>
                      {a.verrouille ? (
                        <span className={c.sousTexte} title="Acte affecté à un médecin ou déjà utilisé en consultation">
                          <FaLock aria-hidden="true" /> Verrouillé
                        </span>
                      ) : (
                        <span className={c.sousTexte}>Possible</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationTableau pagination={pg} />
        </section>
      ) : (
      <form className={c.bloc} onSubmit={enregistrer} noValidate>
        <div className={styles.champ}>
          <label htmlFor="description">Description du service <span className={styles.facultatif}>(facultatif)</span></label>
          <input id="description" maxLength={5000} placeholder="Ex. Ouvert 24h/24, au rez-de-chaussée" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <h2 className={`${c.blocTitre} ${styles.espace}`}>Actes médicaux</h2>
        <EditeurActes
          lignes={lignes}
          onChange={setLignes}
          catalogue={service.disponibles}
          verifier={verifier}
          onRetirerExistant={(ligne) => setAction({ type: 'acte', ligne })}
        />

        <footer className={styles.pied}>
          {nouveaux > 0 && <span className={styles.nouveaux}>{nouveaux} nouvel{nouveaux > 1 ? 's' : ''} acte{nouveaux > 1 ? 's' : ''} à enregistrer</span>}
          <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
            <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </motion.button>
        </footer>
      </form>
      )}

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
