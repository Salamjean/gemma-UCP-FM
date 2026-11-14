import { useState, type FormEvent } from 'react';
import AnimatedTitle from '../../../components/AnimatedTitle';
import Button from '../../../components/Button';
import Reveal from '../../../components/Reveal';
import { SITE } from '../../../config/site';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import type { ContactMessage } from '../../../types';
import styles from './Contact.module.css';

const EMPTY: ContactMessage = { name: '', email: '', message: '' };

/** PAGE CONTACT — coordonnées + formulaire (envoi : backend POST /api/contact) */
export default function Contact() {
  const [form, setForm] = useState<ContactMessage>(EMPTY);
  const [envoi, setEnvoi] = useState(false);

  const update = (field: keyof ContactMessage, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      await api.sendContact(form);
      setForm(EMPTY);
      alerte.succes('Merci ! Votre message a bien été envoyé.');
    } catch (err) {
      alerte.echec(messageErreur(err, "L'envoi a échoué, veuillez réessayer."));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <main className={`page ${styles.page}`}>
      <div className={styles.info}>
        <Reveal y={0} x={-20}>
          <p className={styles.eyebrow}>
            <span className={styles.line} /> CONTACT
          </p>
        </Reveal>
        <AnimatedTitle text="Parlons de votre projet" />
        <Reveal delay={0.3}>
          <ul className={styles.details}>
            <li>{SITE.contact.email}</li>
            <li>{SITE.contact.phone}</li>
            <li>{SITE.contact.address}</li>
          </ul>
        </Reveal>
      </div>

      <Reveal delay={0.35} x={40} y={0}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.field}
            placeholder="Votre nom"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
          />
          <input
            className={styles.field}
            type="email"
            placeholder="Votre email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
          />
          <textarea
            className={styles.field}
            placeholder="Votre message"
            rows={6}
            value={form.message}
            onChange={(e) => update('message', e.target.value)}
            required
          />
          <Button type="submit" disabled={envoi} className={styles.submit}>
            {envoi ? 'Envoi…' : 'Envoyer'}
          </Button>
        </form>
      </Reveal>
    </main>
  );
}
