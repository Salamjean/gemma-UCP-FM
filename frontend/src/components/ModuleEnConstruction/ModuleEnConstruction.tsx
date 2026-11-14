import { FaTools } from 'react-icons/fa';
import styles from './ModuleEnConstruction.module.css';

interface Props {
  /** Module (ex. "Hôpital") */
  module: string;
  /** Page (ex. "Liste") */
  titre: string;
}

/** Affiché par les pages pas encore développées */
export default function ModuleEnConstruction({ module, titre }: Props) {
  return (
    <section className={styles.box}>
      <FaTools className={styles.icon} aria-hidden="true" />
      <p className={styles.module}>{module}</p>
      <h1 className={styles.title}>{titre}</h1>
      <p className={styles.text}>Cette page est en cours de développement.</p>
    </section>
  );
}
