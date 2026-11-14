import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../config/site';
import form from '../AuthForm.module.css';

/**
 * AUTH > MOT DE PASSE OUBLIÉ
 * TODO : formulaire de réinitialisation quand le backend gérera l'envoi d'emails.
 */
export default function MotDePasseOublie() {
  return (
    <>
      <motion.p
        className={form.subtitle}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        Pour réinitialiser votre mot de passe, contactez l'administrateur de votre établissement.
      </motion.p>
      <p className={form.footer}>
        <Link to={ROUTES.connexion}>← Retour à la connexion</Link>
      </p>
    </>
  );
}
