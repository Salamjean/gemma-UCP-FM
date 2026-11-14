import { AnimatePresence, motion } from 'framer-motion';
import { FaLock, FaPlus, FaTrashAlt } from 'react-icons/fa';
import type { ActeSaisi, ElementCatalogue } from '../../../../types';
import styles from './EditeurActes.module.css';

/** Une ligne du tableau des actes (prix gardé en texte pendant la saisie) */
export interface LigneActe {
  cle: string;
  /** Acte déjà enregistré pour ce service (prestation_hospitals.id) */
  existantId?: number;
  /** Acte du catalogue (prestation_services.id) */
  prestationServiceId?: number;
  libelle: string;
  prix: string;
  description: string;
  /** Acte affecté à un médecin / déjà consulté : non supprimable */
  verrouille?: boolean;
}

let compteur = 0;
export const nouvelleCle = () => `l${Date.now()}-${compteur++}`;

/** Ligne invalide : intitulé ou prix manquant / incorrect */
export const ligneInvalide = (l: LigneActe) => !l.libelle.trim() || l.prix.trim() === '' || !/^\d+$/.test(l.prix.trim());

/** Conversion pour l'API (nouveaux actes uniquement) */
export const versActe = (l: LigneActe): ActeSaisi => ({
  ...(l.prestationServiceId ? { prestationServiceId: l.prestationServiceId } : { libelle: l.libelle.trim() }),
  prix: Number(l.prix),
  description: l.description.trim() || undefined,
});

interface Props {
  lignes: LigneActe[];
  onChange: (lignes: LigneActe[]) => void;
  /** Actes du catalogue du service, proposés en un clic */
  catalogue: ElementCatalogue[];
  /** Afficher les erreurs de saisie (après un essai d'enregistrement) */
  verifier: boolean;
  /** Retrait d'un acte déjà enregistré (confirmation + API gérées par la page) */
  onRetirerExistant?: (ligne: LigneActe) => void;
}

/**
 * HÔPITAL > SERVICES — tableau des actes médicaux et de leurs prix (FCFA).
 * Utilisé par "Ajouter un service" et par la fiche d'un service.
 */
export default function EditeurActes({ lignes, onChange, catalogue, verifier, onRetirerExistant }: Props) {
  const maj = (cle: string, champ: 'libelle' | 'prix' | 'description', valeur: string) =>
    onChange(lignes.map((l) => (l.cle === cle ? { ...l, [champ]: champ === 'prix' ? valeur.replace(/[^\d]/g, '') : valeur } : l)));

  const retirer = (l: LigneActe) => {
    if (l.existantId) onRetirerExistant?.(l);
    else onChange(lignes.filter((x) => x.cle !== l.cle));
  };

  const ajouterLibre = () => onChange([...lignes, { cle: nouvelleCle(), libelle: '', prix: '', description: '' }]);

  const ajouterCatalogue = (a: ElementCatalogue) =>
    onChange([...lignes, { cle: nouvelleCle(), prestationServiceId: a.id, libelle: a.libelle, prix: '', description: '' }]);

  // Actes du catalogue pas encore dans le tableau
  const proposes = catalogue.filter((a) => !lignes.some((l) => l.prestationServiceId === a.id));

  return (
    <div className={styles.editeur}>
      <div className={styles.entetes} aria-hidden="true">
        <span>Acte médical / prestation</span>
        <span>Prix</span>
        <span>Précision (facultatif)</span>
        <span />
      </div>

      <ul className={styles.lignes}>
        <AnimatePresence initial={false}>
          {lignes.map((l, i) => {
            const libreInvalide = verifier && !l.libelle.trim();
            const prixInvalide = verifier && (l.prix.trim() === '' || !/^\d+$/.test(l.prix));
            const fixe = !!l.existantId || !!l.prestationServiceId;
            return (
              <motion.li
                key={l.cle}
                className={styles.ligne}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className={styles.cellule}>
                  {fixe ? (
                    <span className={styles.libelleFixe}>
                      {l.libelle}
                      <small>{l.existantId ? 'Déjà pratiqué' : 'Catalogue'}</small>
                    </span>
                  ) : (
                    <input
                      className={`${styles.champ} ${libreInvalide ? styles.invalide : ''}`}
                      placeholder="Ex. Échographie pelvienne"
                      value={l.libelle}
                      maxLength={191}
                      onChange={(e) => maj(l.cle, 'libelle', e.target.value)}
                      aria-label={`Intitulé de l'acte ${i + 1}`}
                      autoFocus={!l.libelle}
                    />
                  )}
                </div>
                <div className={`${styles.cellule} ${styles.prix} ${prixInvalide ? styles.invalide : ''}`}>
                  <input
                    className={styles.champ}
                    inputMode="numeric"
                    placeholder="0"
                    value={l.prix}
                    onChange={(e) => maj(l.cle, 'prix', e.target.value)}
                    aria-label={`Prix de ${l.libelle || `l'acte ${i + 1}`} en FCFA`}
                  />
                  <span className={styles.devise}>FCFA</span>
                </div>
                <div className={styles.cellule}>
                  <input
                    className={styles.champ}
                    placeholder="Ex. Hors produits"
                    value={l.description}
                    maxLength={2000}
                    onChange={(e) => maj(l.cle, 'description', e.target.value)}
                    aria-label={`Précision pour ${l.libelle || `l'acte ${i + 1}`}`}
                  />
                </div>
                <div className={styles.cellule}>
                  {l.verrouille ? (
                    <span className={styles.verrou} title="Acte affecté à un médecin ou déjà utilisé en consultation : suppression impossible">
                      <FaLock aria-label="Suppression impossible" />
                    </span>
                  ) : (
                    <button type="button" className={styles.retirer} onClick={() => retirer(l)} title="Retirer cet acte" aria-label={`Retirer ${l.libelle || `l'acte ${i + 1}`}`}>
                      <FaTrashAlt />
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {lignes.length === 0 && <li className={styles.vide}>Aucun acte pour l'instant.</li>}
      </ul>

      <div className={styles.pied}>
        <button type="button" className={styles.ajouter} onClick={ajouterLibre}>
          <FaPlus aria-hidden="true" /> Ajouter un acte
        </button>
        {proposes.length > 0 && (
          <div className={styles.suggestions}>
            <span>Du catalogue :</span>
            {proposes.map((a) => (
              <motion.button key={a.id} type="button" className={styles.suggestion} onClick={() => ajouterCatalogue(a)} whileTap={{ scale: 0.95 }}>
                <FaPlus aria-hidden="true" /> {a.libelle}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
