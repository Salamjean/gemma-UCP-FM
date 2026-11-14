import type { ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import styles from './Button.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** si fourni, le bouton devient un lien vers cette page */
  to?: string;
};

/** Bouton bleu uni (style du bouton "Connexion") */
export default function Button({ to, className, children, ...props }: ButtonProps) {
  const classes = `${styles.button} ${className ?? ''}`;
  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
