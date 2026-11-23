import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaCamera, FaCheck, FaEnvelope, FaEye, FaEyeSlash, FaHospital, FaIdBadge, FaKey, FaStethoscope, FaTimes, FaUserEdit } from 'react-icons/fa';
import { DEFAULT_AVATAR, ROLE_LABELS } from '../../config/roles';
import { useAuth } from '../../context/AuthContext';
import { alerte, messageErreur } from '../../services/alertes';
import { api, uploadUrl } from '../../services/api';
import c from '../../styles/espace.module.css';
import type { ProfilUtilisateur } from '../../types';
import s from './Profil.module.css';

const PHOTO_MAX = 3 * 1024 * 1024;

type Champ = ProfilUtilisateur['modifiables'][number];

/** Libellés des champs selon le rôle */
const libelle = (champ: Champ, role: ProfilUtilisateur['role']) =>
  ({
    nom: role === 'hospital' ? 'Nom de l’établissement' : 'Nom',
    prenom: 'Prénom(s)',
    contact: 'Contact',
    adresse: 'Adresse',
    district: 'District sanitaire',
    // Colonne Laravel nom_direction_generale, affichée « Direction régionale »
    direction: 'Direction régionale',
  })[champ];

const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

/**
 * MON PROFIL — page commune à tous les rôles (admin DMHP, hôpital, médecin, infirmier·ère, régulateur).
 * Comme les pages « profil » de Laravel : chacun modifie ses coordonnées et sa photo (logo pour l'hôpital) ;
 * le nom des agents, l'email et le matricule restent gérés par l'hôpital. Changement de mot de passe avec l'actuel.
 */
export default function Profil() {
  const { user, rafraichir } = useAuth();
  const [profil, setProfil] = useState<ProfilUtilisateur | null>(null);
  const [valeurs, setValeurs] = useState<Partial<Record<Champ, string>>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [mdp, setMdp] = useState({ actuel: '', nouveau: '', confirmation: '' });
  const [voirMdp, setVoirMdp] = useState(false);
  const [envoiMdp, setEnvoiMdp] = useState(false);

  const charger = () =>
    api.profil
      .lire()
      .then((p) => {
        setProfil(p);
        setValeurs({ nom: p.nom ?? '', prenom: p.prenom ?? '', contact: p.contact ?? '', adresse: p.adresse ?? '', district: p.district ?? '', direction: p.direction ?? '' });
      })
      .catch((e) => alerte.echec(`Impossible de charger votre profil : ${messageErreur(e)}`));
  useEffect(() => {
    charger();
  }, []);

  // Aperçu de la nouvelle photo
  useEffect(() => {
    if (!photo) return setApercu(null);
    const url = URL.createObjectURL(photo);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const choisirPhoto = (f?: File) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/.test(f.type)) return void alerte.echec('Photo : formats acceptés jpg ou png.');
    if (f.size > PHOTO_MAX) return void alerte.echec('Photo trop lourde (3 Mo maximum).');
    setPhoto(f);
  };

  if (!profil || !user) return <p className={c.vide}>Chargement de votre profil…</p>;

  const avatarDefaut = DEFAULT_AVATAR[user.role];
  const photoAffichee = apercu ?? (profil.photo ? uploadUrl(profil.dossierPhoto, profil.photo) : avatarDefaut);
  const v = (k: Champ) => valeurs[k] ?? '';
  const maj = (k: Champ, x: string) => setValeurs((o) => ({ ...o, [k]: x }));

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    const contact = v('contact');
    if (profil.modifiables.includes('contact') && contact && !/^\d{10}$/.test(contact)) return void alerte.echec('Le contact doit contenir exactement 10 chiffres.');
    if (profil.modifiables.includes('nom') && v('nom').trim().length < 3) return void alerte.echec('Le nom doit contenir au moins 3 caractères.');
    const f = new FormData();
    for (const k of profil.modifiables) f.set(k, v(k).trim());
    if (photo) f.set('image', photo);
    setEnvoi(true);
    try {
      const r = await api.profil.modifier(f);
      setPhoto(null);
      await Promise.all([charger(), rafraichir()]); // nom et photo de la sidebar mis à jour
      alerte.succes(r.message);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const changerMotDePasse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mdp.actuel) return void alerte.echec('Saisissez votre mot de passe actuel.');
    if (mdp.nouveau.length < 8) return void alerte.echec('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    if (mdp.nouveau !== mdp.confirmation) return void alerte.echec('La confirmation ne correspond pas au nouveau mot de passe.');
    setEnvoiMdp(true);
    try {
      const r = await api.profil.motDePasse(mdp);
      setMdp({ actuel: '', nouveau: '', confirmation: '' });
      alerte.succes(r.message);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoiMdp(false);
    }
  };

  const nomAffiche = [profil.nom, profil.role === 'hospital' ? null : profil.prenom].filter(Boolean).join(' ');
  const infos = [
    { icone: FaEnvelope, titre: 'Email de connexion', valeur: profil.email },
    { icone: FaIdBadge, titre: profil.role === 'hospital' ? 'Référence' : 'Matricule', valeur: profil.matricule },
    { icone: FaHospital, titre: 'Hôpital', valeur: profil.hopital },
    { icone: FaStethoscope, titre: 'Service', valeur: profil.service },
  ].filter((x) => x.valeur);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Mon espace</p>
          <h1 className={c.titre}>Mon profil</h1>
        </div>
      </header>

      <div className={s.grille}>
        {/* ---------- Carte d'identité ---------- */}
        <motion.aside className={`${c.bloc} ${s.carte}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <label className={s.photo} title="Changer la photo (jpg, png — 3 Mo max.)">
            <img src={photoAffichee} alt="" onError={(e) => (e.currentTarget.src = avatarDefaut)} />
            <span className={s.photoBouton}>
              <FaCamera aria-hidden="true" />
            </span>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => choisirPhoto(e.target.files?.[0])} aria-label={profil.role === 'hospital' ? 'Changer le logo' : 'Changer la photo'} />
          </label>
          {photo && (
            <button type="button" className={s.retirer} onClick={() => setPhoto(null)}>
              <FaTimes aria-hidden="true" /> Annuler la nouvelle {profil.role === 'hospital' ? 'image' : 'photo'}
            </button>
          )}
          <p className={s.nom}>{nomAffiche || '—'}</p>
          <span className={`${c.badge} ${s.role}`}>{ROLE_LABELS[user.role]}</span>
          <dl className={s.infos}>
            {infos.map((x) => (
              <div key={x.titre}>
                <dt>
                  <x.icone aria-hidden="true" /> {x.titre}
                </dt>
                <dd>{x.valeur}</dd>
              </div>
            ))}
          </dl>
          {profil.membreDepuis && <p className={s.depuis}>Compte créé le {dateFr(profil.membreDepuis)}</p>}
        </motion.aside>

        <div className={s.colonne}>
          {/* ---------- Informations ---------- */}
          <motion.form className={c.bloc} onSubmit={enregistrer} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h2 className={s.titreBloc}>
              <FaUserEdit aria-hidden="true" /> Mes informations
            </h2>
            {/* Tous les rôles : les champs modifiables sur une même ligne (une colonne par champ) */}
            <div className={`${s.champs} ${s.uneLigne}`} style={{ ['--colonnes' as string]: profil.modifiables.length }}>
              {profil.modifiables.map((k) => (
                <label key={k} className={s.champ}>
                  <span>
                    {libelle(k, profil.role)}
                    {(k === 'nom' || (k === 'contact' && profil.role !== 'admin' && profil.role !== 'hospital')) && <em className={s.requis}> *</em>}
                  </span>
                  <input
                    value={v(k)}
                    maxLength={k === 'contact' ? 10 : 191}
                    inputMode={k === 'contact' ? 'numeric' : undefined}
                    placeholder={k === 'contact' ? '0700000000' : ''}
                    onChange={(e) => maj(k, k === 'contact' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)}
                  />
                </label>
              ))}
            </div>
            {profil.role !== 'admin' && profil.role !== 'hospital' && (
              <p className={s.aide}>Votre nom, votre email et votre matricule sont gérés par votre hôpital : adressez-vous à lui pour les modifier.</p>
            )}
            <div className={s.pied}>
              <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
                <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Enregistrer'}
              </motion.button>
            </div>
          </motion.form>

          {/* ---------- Mot de passe ---------- */}
          <motion.form className={c.bloc} onSubmit={changerMotDePasse} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className={s.titreBloc}>
              <FaKey aria-hidden="true" /> Mot de passe
            </h2>
            <div className={s.champs}>
              {(
                [
                  ['actuel', 'Mot de passe actuel', 'current-password'],
                  ['nouveau', 'Nouveau mot de passe', 'new-password'],
                  ['confirmation', 'Confirmation', 'new-password'],
                ] as const
              ).map(([k, l, auto]) => (
                <label key={k} className={`${s.champ} ${k === 'actuel' ? s.large : ''}`}>
                  <span>{l}</span>
                  <span className={s.mdp}>
                    <input type={voirMdp ? 'text' : 'password'} autoComplete={auto} value={mdp[k]} onChange={(e) => setMdp((o) => ({ ...o, [k]: e.target.value }))} />
                    {k === 'actuel' && (
                      <button type="button" onClick={() => setVoirMdp((x) => !x)} aria-label={voirMdp ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}>
                        {voirMdp ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <p className={s.aide}>Au moins 8 caractères. Vous resterez connecté·e sur cet appareil.</p>
            <div className={s.pied}>
              <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoiMdp}>
                <FaKey aria-hidden="true" /> {envoiMdp ? 'Modification…' : 'Changer le mot de passe'}
              </motion.button>
            </div>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
