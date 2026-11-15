import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../config/site';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import form from '../AuthForm.module.css';
import { EyeIcon, LockIcon, UserIcon } from '../AuthIcons';
import s from './MotDePasseOublie.module.css';

/** Délai avant de pouvoir redemander un code (même règle que le serveur) */
const DELAI_RENVOI = 60;

/**
 * AUTH > MOT DE PASSE OUBLIÉ — en 2 étapes :
 *   1. adresse email → code à 6 chiffres envoyé par email (valable 15 min) ;
 *   2. code + nouveau mot de passe (+ confirmation) → retour à la connexion.
 * Le serveur répond de la même façon que l'email existe ou non.
 */
export default function MotDePasseOublie() {
  const navigate = useNavigate();
  const [etape, setEtape] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voir, setVoir] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState(0);

  // Compte à rebours avant « Renvoyer le code »
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const demander = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return void alerte.echec('Saisissez une adresse email valide.');
    setEnvoi(true);
    try {
      const r = await api.motDePasseOublie(email.trim());
      alerte.info(r.message);
      setEtape(2);
      setAttente(DELAI_RENVOI);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const reinitialiser = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return void alerte.echec('Le code reçu par email contient 6 chiffres.');
    if (nouveau.length < 6) return void alerte.echec('Le nouveau mot de passe doit contenir au moins 6 caractères.');
    if (nouveau !== confirmation) return void alerte.echec('La confirmation ne correspond pas au nouveau mot de passe.');
    setEnvoi(true);
    try {
      const r = await api.reinitialiser({ email: email.trim(), code, nouveau, confirmation });
      await alerte.succes(r.message);
      navigate(ROUTES.connexion, { replace: true });
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <motion.p className={form.subtitle} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {etape === 1 ? 'Mot de passe oublié ? Recevez un code par email.' : 'Saisissez le code reçu et votre nouveau mot de passe.'}
      </motion.p>

      <AnimatePresence mode="wait" initial={false}>
        {etape === 1 ? (
          <motion.form
            key="email"
            className={form.form}
            onSubmit={demander}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            noValidate
          >
            <label className={form.field}>
              <span className={form.icon}>
                <UserIcon />
              </span>
              <input
                className={form.input}
                type="email"
                placeholder="Adresse email du compte"
                aria-label="Adresse email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </label>
            <motion.button type="submit" className={form.submit} disabled={envoi} whileTap={{ scale: 0.97 }}>
              {envoi ? 'Envoi…' : 'Recevoir le code'}
            </motion.button>
          </motion.form>
        ) : (
          <motion.form
            key="code"
            className={form.form}
            onSubmit={reinitialiser}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            noValidate
          >
            <p className={s.rappel}>
              Code envoyé à <strong>{email.trim()}</strong> (pensez aux courriers indésirables).{' '}
              <button type="button" className={s.lien} onClick={() => setEtape(1)}>
                Changer d’adresse
              </button>
            </p>
            <label className={form.field}>
              <span className={form.icon}>
                <LockIcon />
              </span>
              <input
                className={`${form.input} ${s.code}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code à 6 chiffres"
                aria-label="Code reçu par email"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
            </label>
            <label className={form.field}>
              <span className={form.icon}>
                <LockIcon />
              </span>
              <input
                className={form.input}
                type={voir ? 'text' : 'password'}
                placeholder="Nouveau mot de passe (6 caractères min.)"
                aria-label="Nouveau mot de passe"
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                autoComplete="new-password"
              />
              <button type="button" className={form.iconButton} onClick={() => setVoir((v) => !v)} aria-label={voir ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}>
                <EyeIcon crossed={!voir} />
              </button>
            </label>
            <label className={form.field}>
              <span className={form.icon}>
                <LockIcon />
              </span>
              <input
                className={form.input}
                type={voir ? 'text' : 'password'}
                placeholder="Confirmer le mot de passe"
                aria-label="Confirmation du mot de passe"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <motion.button type="submit" className={form.submit} disabled={envoi} whileTap={{ scale: 0.97 }}>
              {envoi ? 'Enregistrement…' : 'Changer le mot de passe'}
            </motion.button>
            <p className={s.renvoi}>
              Pas reçu ?{' '}
              <button type="button" className={s.lien} onClick={() => demander()} disabled={attente > 0 || envoi}>
                {attente > 0 ? `Renvoyer le code (${attente} s)` : 'Renvoyer le code'}
              </button>
            </p>
          </motion.form>
        )}
      </AnimatePresence>

      <p className={form.footer}>
        <Link to={ROUTES.connexion}>← Retour à la connexion</Link>
      </p>
    </>
  );
}
