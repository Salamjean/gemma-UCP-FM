import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { FaBed, FaCheck, FaLock, FaMinus, FaPlus, FaTimes, FaUser, FaUsers } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte } from '../../../../services/alertes';
import { fcfa } from '../../../../services/format';
import c from '../../../../styles/espace.module.css';
import type { ChambreDetail, ChambreSaisie, TypeChambre } from '../../../../types';
import { baseHopital } from '../../../../services/contexteHopital';
import styles from './ChambreForm.module.css';

const LITS_MAX = 20; // comme Laravel (nbBed max:20)

interface LigneLit {
  cle: string;
  id?: number;
  numero: string;
  occupe?: boolean;
}

let compteur = 0;
const cle = () => `n${Date.now()}-${compteur++}`;

/** Prochain numéro de lit libre (1, 2, 3…) */
const prochainNumero = (lits: LigneLit[]) => {
  const pris = new Set(lits.map((l) => l.numero.trim().toLowerCase()));
  let n = 1;
  while (pris.has(String(n))) n++;
  return String(n);
};

interface Props {
  /** Chambre existante = mode modification (le type ne change pas, comme Laravel) */
  chambre?: ChambreDetail;
  boutonTexte: string;
  envoi: boolean;
  onEnregistrer: (data: ChambreSaisie) => void;
}

/**
 * HÔPITAL > HOSPITALISATION > CHAMBRES — formulaire partagé (Ajouter / Modifier).
 * Règles Laravel (BedroomController) : numéro obligatoire, prix entier, description ≥ 3 car.,
 * collective : 1 à 20 lits numérotés ; individuelle : un seul lit. Le prix s'applique à tous les lits.
 */
export default function ChambreForm({ chambre, boutonTexte, envoi, onEnregistrer }: Props) {
  const edition = !!chambre;
  const [type, setType] = useState<TypeChambre>(chambre?.type ?? 'individual');
  const [numero, setNumero] = useState(chambre?.numero ?? '');
  const [prix, setPrix] = useState(chambre ? String(chambre.prix) : '');
  const [description, setDescription] = useState(chambre?.description ?? '');
  const [lits, setLits] = useState<LigneLit[]>(
    chambre ? chambre.lits.map((l) => ({ cle: `e${l.id}`, id: l.id, numero: l.numero, occupe: l.occupe })) : [{ cle: cle(), numero: '1' }],
  );
  const [verifier, setVerifier] = useState(false);

  const collective = type === 'collective';

  const changerType = (t: TypeChambre) => {
    if (edition || t === type) return;
    setType(t);
    // Individuelle : un seul lit ; collective : 2 lits pour commencer
    setLits(t === 'individual' ? [{ cle: cle(), numero: '1' }] : [{ cle: cle(), numero: '1' }, { cle: cle(), numero: '2' }]);
  };

  const ajouterLit = () => {
    if (lits.length >= LITS_MAX) return void alerte.echec(`Une chambre ne peut pas avoir plus de ${LITS_MAX} lits.`);
    setLits((l) => [...l, { cle: cle(), numero: prochainNumero(l) }]);
  };

  const retirerLit = (l: LigneLit) => {
    if (l.occupe) return;
    if (lits.length <= 1) return void alerte.echec('La chambre doit garder au moins un lit.');
    setLits((x) => x.filter((y) => y.cle !== l.cle));
  };

  /** Retire le dernier lit libre (bouton "−") */
  const retirerDernier = () => {
    const dernier = [...lits].reverse().find((l) => !l.occupe);
    if (dernier) retirerLit(dernier);
  };

  const numeros = lits.map((l) => l.numero.trim().toLowerCase());
  const erreurs = {
    numero: !numero.trim(),
    prix: !/^\d+$/.test(prix),
    description: description.trim() !== '' && description.trim().length < 3,
    lits: lits.some((l) => !l.numero.trim()) || numeros.some((n, i) => numeros.indexOf(n) !== i),
  };

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifier(true);
    if (erreurs.numero) return void alerte.echec('Le numéro de la chambre est obligatoire.');
    if (erreurs.prix) return void alerte.echec('Le prix doit être un nombre entier (FCFA).');
    if (erreurs.description) return void alerte.echec('La description doit contenir au moins 3 caractères.');
    if (erreurs.lits) return void alerte.echec('Chaque lit doit avoir un numéro, et deux lits ne peuvent pas avoir le même.');
    onEnregistrer({
      ...(edition ? {} : { type }),
      numero: numero.trim(),
      prix: Number(prix),
      description: description.trim() || undefined,
      lits: lits.map((l) => ({ ...(l.id ? { id: l.id } : {}), numero: l.numero.trim() })),
    });
  };

  const occupes = lits.filter((l) => l.occupe).length;

  return (
    <div className={styles.grille}>
      <form className={c.bloc} onSubmit={soumettre} noValidate>
        {/* --- Type --- */}
        <h2 className={c.blocTitre}>Type de chambre</h2>
        <div className={styles.types} role="radiogroup" aria-label="Type de chambre">
          {([
            { id: 'individual', libelle: 'Individuelle', detail: 'Un seul lit, un patient', icone: FaUser },
            { id: 'collective', libelle: 'Collective', detail: 'Plusieurs lits (jusqu’à 20)', icone: FaUsers },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={type === t.id}
              className={`${styles.type} ${type === t.id ? styles.typeActif : ''}`}
              onClick={() => changerType(t.id)}
              disabled={edition && type !== t.id}
              title={edition ? 'Le type ne peut pas être changé après la création' : undefined}
            >
              <t.icone className={styles.typeIcone} aria-hidden="true" />
              <strong>{t.libelle}</strong>
              <small>{t.detail}</small>
              {type === t.id && <motion.span layoutId="type-chambre" className={styles.typeCoche}><FaCheck /></motion.span>}
            </button>
          ))}
        </div>

        {/* --- Informations --- */}
        <h2 className={`${c.blocTitre} ${styles.espace}`}>Informations</h2>
        <div className={styles.champs}>
          <div className={`${styles.champ} ${verifier && erreurs.numero ? styles.invalide : ''}`}>
            <label htmlFor="numero">N° de chambre <span className={styles.requis}>*</span></label>
            <input id="numero" maxLength={191} placeholder="Ex. A1, VIP, 104" value={numero} onChange={(e) => setNumero(e.target.value)} autoFocus={!edition} />
          </div>
          <div className={`${styles.champ} ${verifier && erreurs.prix ? styles.invalide : ''}`}>
            <label htmlFor="prix">Prix par jour <span className={styles.requis}>*</span></label>
            <div className={styles.prix}>
              <input id="prix" inputMode="numeric" placeholder="15000" value={prix} onChange={(e) => setPrix(e.target.value.replace(/\D/g, '').slice(0, 9))} />
              <span>FCFA</span>
            </div>
          </div>
          <div className={`${styles.champ} ${styles.large} ${verifier && erreurs.description ? styles.invalide : ''}`}>
            <label htmlFor="description">Description <span className={styles.facultatif}>(facultatif)</span></label>
            <input id="description" maxLength={191} placeholder="Ex. Climatisée, 1er étage, salle d'eau" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        {/* --- Lits --- */}
        <div className={styles.litsEntete}>
          <h2 className={c.blocTitre}>{collective ? 'Lits de la chambre' : 'Lit de la chambre'}</h2>
          {collective && (
            <div className={styles.compteurLits} aria-label="Nombre de lits">
              <button type="button" onClick={retirerDernier} disabled={lits.length <= Math.max(1, occupes)} aria-label="Retirer un lit">
                <FaMinus />
              </button>
              <strong>{lits.length}</strong>
              <button type="button" onClick={ajouterLit} disabled={lits.length >= LITS_MAX} aria-label="Ajouter un lit">
                <FaPlus />
              </button>
            </div>
          )}
        </div>
        <p className={styles.aide}>
          {collective
            ? 'Numérotez chaque lit (1, 2, 3… ou A, B…). Les lits occupés par un patient ne peuvent pas être retirés.'
            : 'Une chambre individuelle a un seul lit ; vous pouvez changer son numéro.'}
        </p>
        <ul className={`${styles.lits} ${verifier && erreurs.lits ? styles.litsInvalides : ''}`}>
          <AnimatePresence initial={false}>
            {lits.map((l, i) => {
              const doublon = l.numero.trim() !== '' && numeros.indexOf(l.numero.trim().toLowerCase()) !== i;
              return (
                <motion.li
                  key={l.cle}
                  layout
                  className={`${styles.lit} ${l.occupe ? styles.litOccupe : ''} ${verifier && (!l.numero.trim() || doublon) ? styles.litErreur : ''}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.18 }}
                >
                  <FaBed className={styles.litIcone} aria-hidden="true" />
                  <label>
                    <span>Lit</span>
                    <input value={l.numero} maxLength={20} onChange={(e) => setLits((x) => x.map((y) => (y.cle === l.cle ? { ...y, numero: e.target.value } : y)))} aria-label={`Numéro du lit ${i + 1}`} />
                  </label>
                  {l.occupe ? (
                    <span className={styles.litEtat} title="Lit occupé par un patient : il ne peut pas être retiré">
                      <FaLock aria-hidden="true" /> Occupé
                    </span>
                  ) : (
                    collective && (
                      <button type="button" className={styles.litRetirer} onClick={() => retirerLit(l)} aria-label={`Retirer le lit ${l.numero}`}>
                        <FaTimes />
                      </button>
                    )
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <footer className={styles.pied}>
          <Link to={`${baseHopital()}/hospitalisation/chambres`} className={c.secondaire}>Annuler</Link>
          <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
            <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : boutonTexte}
          </motion.button>
        </footer>
      </form>

      {/* --- Aperçu --- */}
      <aside className={`${c.bloc} ${styles.apercu}`} aria-label="Aperçu de la chambre">
        <p className={styles.apercuTitre}>Aperçu</p>
        <div className={styles.porte}>
          <span>Chambre</span>
          <strong className={numero.trim() ? '' : styles.vide}>{numero.trim() || '—'}</strong>
        </div>
        <span className={`${c.badge} ${collective ? styles.badgeCollective : styles.badgeIndividuelle}`}>{collective ? 'Collective' : 'Individuelle'}</span>
        <div className={styles.plan}>
          {lits.map((l) => (
            <span key={l.cle} className={l.occupe ? styles.planOccupe : ''} title={l.occupe ? `Lit ${l.numero} : occupé` : `Lit ${l.numero} : libre`}>
              <FaBed aria-hidden="true" />
              <small>{l.numero || '?'}</small>
            </span>
          ))}
        </div>
        <dl className={styles.infos}>
          <div>
            <dt>Lits</dt>
            <dd>{lits.length}{occupes > 0 && ` (${occupes} occupé${occupes > 1 ? 's' : ''})`}</dd>
          </div>
          <div>
            <dt>Prix par jour et par lit</dt>
            <dd>{/^\d+$/.test(prix) ? fcfa(Number(prix)) : '—'}</dd>
          </div>
          <div>
            <dt>Exemple : 5 jours</dt>
            <dd>{/^\d+$/.test(prix) ? fcfa(Number(prix) * 5) : '—'}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
