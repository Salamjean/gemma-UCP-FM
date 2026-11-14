import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_HOME } from '../../../config/roles';
import { ROUTES } from '../../../config/site';
import { useAuth } from '../../../context/AuthContext';
import { alerte, messageErreur } from '../../../services/alertes';
import { tokenStorage } from '../../../services/token';
import type { LoginCredentials } from '../../../types';
import form from '../AuthForm.module.css';
import { EyeIcon, LockIcon, UserIcon } from '../AuthIcons';

/** Apparition des éléments du formulaire, l'un après l'autre */
const item = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.45 + i * 0.08, duration: 0.5 },
});

/**
 * AUTH > CONNEXION — formulaire de login (backend POST /api/auth/login)
 * La carte, le logo et l'image de fond sont dans layouts/AuthLayout.
 */
export default function Connexion() {
  const { user, checking, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const rememberedEmail = tokenStorage.getRememberedEmail();
  const [values, setValues] = useState<LoginCredentials>({ email: rememberedEmail, password: '' });
  const [remember, setRemember] = useState(rememberedEmail !== '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Déjà connecté → directement dans son espace
  if (!checking && user && !loading) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const connected = await login({ ...values, remember });
      const fullName = [connected.prenom, connected.name].filter(Boolean).join(' ');
      // Page demandée avant connexion (si elle est dans son espace), sinon son tableau de bord
      const home = ROLE_HOME[connected.role];
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith(home) ? from : home, { replace: true });
      // Comme Laravel ("Bienvenue!") : pop-up de succès à l'arrivée dans l'espace
      alerte.succes(fullName ? `Bienvenue ${fullName} !` : 'Bienvenue !');
    } catch (err) {
      alerte.echec(messageErreur(err));
      setLoading(false);
    }
  };

  return (
    <>
      <motion.p className={form.subtitle} {...item(0)}>
        Connectez-vous pour continuer
      </motion.p>

      <form className={form.form} onSubmit={handleSubmit}>
        <motion.label className={form.field} {...item(1)}>
          <span className={form.icon}>
            <UserIcon />
          </span>
          <input
            className={form.input}
            type="email"
            placeholder="Adresse email"
            aria-label="Adresse email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            autoComplete="email"
            required
          />
        </motion.label>

        <motion.div className={form.field} {...item(2)}>
          <span className={form.icon}>
            <LockIcon />
          </span>
          <input
            className={form.input}
            type={showPassword ? 'text' : 'password'}
            placeholder="Mot de passe"
            aria-label="Mot de passe"
            value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className={form.iconButton}
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            <EyeIcon crossed={!showPassword} />
          </button>
        </motion.div>

        {/* "Se souvenir de moi" à gauche, "Mot de passe oublié ?" à droite, sur la même ligne */}
        <motion.div className={form.options} {...item(3)}>
          <label className={form.remember}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Se souvenir de moi ?
          </label>
          <Link to={ROUTES.motDePasseOublie} className={form.oublie}>
            Mot de passe oublié ?
          </Link>
        </motion.div>

        <motion.button
          type="submit"
          className={form.submit}
          disabled={loading}
          whileTap={{ scale: 0.97 }}
          {...item(4)}
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </motion.button>
      </form>
    </>
  );
}
