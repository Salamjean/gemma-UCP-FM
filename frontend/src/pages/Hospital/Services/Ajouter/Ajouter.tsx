import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaBookMedical, FaCheck, FaInfoCircle, FaPenFancy } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import SelectRecherche from '../../../../components/SelectRecherche';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import { fcfa } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { ElementCatalogue } from '../../../../types';
import EditeurActes, { ligneInvalide, nouvelleCle, versActe, type LigneActe } from '../EditeurActes';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './Ajouter.module.css';

type Mode = 'catalogue' | 'nouveau';

/**
 * HÔPITAL > SERVICES > AJOUTER
 * Équivalent Laravel : hospital.service.add (users/hospital/service/add.blade.php)
 *   1. un service du catalogue OU un nouveau service
 *   2. les actes médicaux pratiqués et leurs prix (FCFA)
 * Sans acte : Laravel crée une « Consultation <service> » à 0 FCFA.
 */
export default function Ajouter() {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState<ElementCatalogue[] | null>(null);
  const [mode, setMode] = useState<Mode>('catalogue');
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [actesCatalogue, setActesCatalogue] = useState<ElementCatalogue[]>([]);
  const [lignes, setLignes] = useState<LigneActe[]>([]);
  const [verifier, setVerifier] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.hospital.services
      .catalogue()
      .then((liste) => {
        setCatalogue(liste);
        if (liste.length === 0) setMode('nouveau');
      })
      .catch((e) => {
        setCatalogue([]);
        setMode('nouveau');
        alerte.echec(`Impossible de charger le catalogue : ${messageErreur(e)}`);
      });
  }, []);

  // Service du catalogue choisi : ses actes sont pré-remplis (il ne reste qu'à saisir les prix)
  useEffect(() => {
    setActesCatalogue([]);
    if (mode !== 'catalogue' || !serviceId) return;
    let annule = false;
    api.hospital.services
      .actesCatalogue(serviceId)
      .then((actes) => {
        if (annule) return;
        setActesCatalogue(actes);
        setLignes(actes.map((a) => ({ cle: nouvelleCle(), prestationServiceId: a.id, libelle: a.libelle, prix: '', description: '' })));
      })
      .catch((e) => alerte.echec(messageErreur(e)));
    return () => {
      annule = true;
    };
  }, [mode, serviceId]);

  const changerMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setVerifier(false);
    // Les actes du catalogue n'ont de sens que pour un service du catalogue
    setLignes(m === 'nouveau' ? [{ cle: nouvelleCle(), libelle: 'Consultation standard', prix: '', description: '' }] : []);
  };

  const libelle = mode === 'catalogue' ? catalogue?.find((s) => s.id === serviceId)?.libelle ?? '' : nom.trim();
  const serviceManquant = mode === 'catalogue' ? !serviceId : !nom.trim();
  const prixSaisis = lignes.filter((l) => /^\d+$/.test(l.prix)).map((l) => Number(l.prix));

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifier(true);
    if (serviceManquant) {
      alerte.echec(mode === 'catalogue' ? 'Veuillez sélectionner un service du catalogue.' : 'Veuillez indiquer le nom du nouveau service.');
      return;
    }
    if (lignes.some(ligneInvalide)) {
      alerte.echec('Chaque acte doit avoir un intitulé et un prix (en FCFA). Retirez les lignes inutiles.');
      return;
    }
    setEnvoi(true);
    try {
      const r = await api.hospital.services.creer({
        ...(mode === 'catalogue' ? { serviceId: serviceId! } : { nouveauService: nom.trim() }),
        description: description.trim() || undefined,
        actes: lignes.map(versActe),
      });
      await alerte.succes(r.message);
      navigate(`${baseHopital()}/services/liste`);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const disponibles = catalogue?.length ?? 0;

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Services</p>
          <h1 className={c.titre}>Ajouter un service</h1>
        </div>
        <Link to={`${baseHopital()}/services/liste`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des services
        </Link>
      </header>

      <div className={styles.grille}>
        <form className={c.bloc} onSubmit={enregistrer} noValidate>
          {/* --- 1. Le service --- */}
          <h2 className={c.blocTitre}>1. Le service</h2>
          <div className={styles.modes} role="radiogroup" aria-label="Type d'ajout">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'catalogue'}
              className={`${styles.mode} ${mode === 'catalogue' ? styles.modeActif : ''}`}
              onClick={() => changerMode('catalogue')}
              disabled={disponibles === 0}
            >
              <FaBookMedical className={styles.modeIcone} aria-hidden="true" />
              <strong>Service du catalogue</strong>
              <small>
                {catalogue === null
                  ? 'Chargement…'
                  : disponibles === 0
                    ? 'Tous les services du catalogue sont déjà ouverts'
                    : `${disponibles} service${disponibles > 1 ? 's' : ''} disponible${disponibles > 1 ? 's' : ''}`}
              </small>
              {mode === 'catalogue' && <motion.span layoutId="mode-service" className={styles.modeCoche}><FaCheck /></motion.span>}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'nouveau'}
              className={`${styles.mode} ${mode === 'nouveau' ? styles.modeActif : ''}`}
              onClick={() => changerMode('nouveau')}
            >
              <FaPenFancy className={styles.modeIcone} aria-hidden="true" />
              <strong>Nouveau service</strong>
              <small>Créer un service personnalisé</small>
              {mode === 'nouveau' && <motion.span layoutId="mode-service" className={styles.modeCoche}><FaCheck /></motion.span>}
            </button>
          </div>

          <div className={styles.ligne}>
            <AnimatePresence mode="wait" initial={false}>
              {mode === 'catalogue' ? (
                <motion.div key="catalogue" className={styles.champ} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <label htmlFor="service">Service <span className={styles.requis}>*</span></label>
                  <SelectRecherche
                    id="service"
                    options={(catalogue ?? []).map((s) => ({ id: s.id, name: s.libelle }))}
                    value={serviceId}
                    onChange={setServiceId}
                    placeholder="-- Choisissez un service --"
                    placeholderRecherche="Rechercher un service…"
                    aucunResultat="Aucun service trouvé"
                    invalide={verifier && !serviceId}
                  />
                </motion.div>
              ) : (
                <motion.div key="nouveau" className={`${styles.champ} ${verifier && !nom.trim() ? styles.invalide : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <label htmlFor="nom">Nom du nouveau service <span className={styles.requis}>*</span></label>
                  <input id="nom" maxLength={191} placeholder="Ex. Cardiologie" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
                </motion.div>
              )}
            </AnimatePresence>
            <div className={styles.champ}>
              <label htmlFor="description">Description <span className={styles.facultatif}>(facultatif)</span></label>
              <input id="description" maxLength={5000} placeholder="Ex. Ouvert 24h/24, au rez-de-chaussée" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          {/* --- 2. Les actes --- */}
          <h2 className={`${c.blocTitre} ${styles.espace}`}>2. Actes médicaux & tarifs</h2>
          <p className={styles.aide}>
            <FaInfoCircle aria-hidden="true" />
            {mode === 'catalogue' && !serviceId
              ? 'Choisissez d’abord le service : ses actes habituels s’afficheront ici, il ne restera qu’à saisir les prix.'
              : 'Indiquez le prix (en FCFA) de chaque acte pratiqué. Sans aucun acte, une consultation standard à 0 FCFA est créée.'}
          </p>
          <EditeurActes lignes={lignes} onChange={setLignes} catalogue={actesCatalogue} verifier={verifier} />

          <footer className={styles.pied}>
            <Link to={`${baseHopital()}/services/liste`} className={c.secondaire}>Annuler</Link>
            <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
              <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Enregistrer le service'}
            </motion.button>
          </footer>
        </form>

        {/* --- Récapitulatif en direct --- */}
        <aside className={`${c.bloc} ${styles.recap}`} aria-label="Récapitulatif">
          <p className={styles.recapTitre}>Récapitulatif</p>
          <p className={`${styles.recapNom} ${libelle ? '' : styles.recapVide}`}>{libelle || 'Service à choisir'}</p>
          <span className={`${c.badge} ${mode === 'catalogue' ? styles.badgeCatalogue : styles.badgeNouveau}`}>
            {mode === 'catalogue' ? 'Catalogue' : 'Nouveau service'}
          </span>
          <dl className={styles.recapChiffres}>
            <div>
              <dt>Actes</dt>
              <dd>{lignes.length}</dd>
            </div>
            <div>
              <dt>Prix le plus bas</dt>
              <dd>{prixSaisis.length ? fcfa(Math.min(...prixSaisis)) : '—'}</dd>
            </div>
            <div>
              <dt>Prix le plus haut</dt>
              <dd>{prixSaisis.length ? fcfa(Math.max(...prixSaisis)) : '—'}</dd>
            </div>
          </dl>
          <ul className={styles.recapActes}>
            {lignes.filter((l) => l.libelle.trim()).map((l) => (
              <li key={l.cle}>
                <span>{l.libelle}</span>
                <strong>{/^\d+$/.test(l.prix) ? fcfa(Number(l.prix)) : '…'}</strong>
              </li>
            ))}
          </ul>
          <p className={styles.recapNote}>Le service sera activé dès l'enregistrement.</p>
        </aside>
      </div>
    </div>
  );
}
