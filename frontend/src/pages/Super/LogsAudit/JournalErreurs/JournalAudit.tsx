import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaDesktop, FaDownload, FaFileExcel, FaListAlt, FaPlusCircle, FaSearch } from 'react-icons/fa';
import Pagination from '../../../../components/Pagination';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { FiltresAudit, JournalAudit as Journal } from '../../../../types';
import styles from './JournalErreurs.module.css';

/** Libellés lisibles des types d'action (les codes restent ceux de Laravel) */
const LIBELLES_ACTION: Record<string, string> = {
  CONNEXION: 'Connexion',
  ECHEC_CONNEXION: 'Échec de connexion',
  ENREGISTREMENT: 'Enregistrement',
  MODIFICATION: 'Modification',
  SUPPRESSION: 'Suppression',
  TELECHARGEMENT_PDF: 'Téléchargement PDF',
  TELECHARGEMENT_LOG: 'Téléchargement log',
  EXPORT_EXCEL: 'Export Excel',
  EXPORT_SAGE: 'Export Sage (.txt)',
  DIFFUSION_PUSH: 'Diffusion push',
  RELANCE_PUSH: 'Relance push',
  SUPPRESSION_NOTIFICATION: 'Suppression notification',
};
const libelleAction = (a: string) => LIBELLES_ACTION[a] ?? a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, ' ');

/** Couleur de badge par famille d'action (fond uni léger) */
function couleurAction(a: string) {
  if (a.includes('ECHEC') || a.includes('SUPPRESSION')) return { background: '#fde0e6', color: '#c4213f' };
  if (a.includes('CONNEXION')) return { background: '#eaf3fe', color: '#1f6fc6' };
  if (a.includes('EXPORT') || a.includes('TELECHARGEMENT')) return { background: '#fff3df', color: '#b56b00' };
  if (a.includes('ENREGISTREMENT') || a.includes('PUSH')) return { background: '#e3f5ee', color: '#0b7a54' };
  return { background: '#efe9fd', color: '#6a3fd6' };
}

const dateHeure = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

/** Onglet "Journal d'audit" : filtres, statistiques, tableau paginé, export Excel */
export default function JournalAudit() {
  const [filtres, setFiltres] = useState<FiltresAudit>({ page: 1 });
  const [recherche, setRecherche] = useState('');
  const [data, setData] = useState<Journal | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  // Recherche : petite attente pendant la frappe
  useEffect(() => {
    const t = setTimeout(() => setFiltres((f) => (f.recherche === recherche ? f : { ...f, recherche, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [recherche]);

  useEffect(() => {
    api.super.logs
      .audit(filtres)
      .then((d) => {
        setData(d);
        // La période par défaut (30 derniers jours) vient du backend
        setFiltres((f) => (f.debut && f.fin ? f : { ...f, debut: d.periode.debut, fin: d.periode.fin }));
      })
      .catch((e) => alerte.echec(`Impossible de charger le journal : ${messageErreur(e)}`));
  }, [filtres]);

  const maj = (champ: keyof FiltresAudit, valeur: string) => setFiltres((f) => ({ ...f, [champ]: valeur, page: 1 }));

  const exporter = async () => {
    setExportEnCours(true);
    try {
      await api.super.logs.exporterAudit({ ...filtres, page: undefined });
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setExportEnCours(false);
    }
  };

  const s = data?.statistiques;
  const compteurs = s
    ? [
        { icone: FaListAlt, valeur: s.total, libelle: 'Opérations tracées', fond: '#eaf3fe', texte: '#1f6fc6' },
        { icone: FaDownload, valeur: s.telechargements, libelle: 'Téléchargements & exports', fond: '#fff3df', texte: '#b56b00' },
        { icone: FaPlusCircle, valeur: s.creations, libelle: 'Enregistrements', fond: '#e3f5ee', texte: '#0b7a54' },
        { icone: FaDesktop, valeur: s.machines, libelle: 'Appareils distincts', fond: '#efe9fd', texte: '#6a3fd6' },
      ]
    : [];

  return (
    <div className={c.page}>
      <div className={`${c.compteurs} ${c.compteursQuatre}`}>
        {compteurs.map((k, i) => (
          <motion.div key={k.libelle} className={c.compteur} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
              <k.icone aria-hidden="true" />
            </span>
            <span className={c.compteurTexte}>
              <strong>{k.valeur.toLocaleString('fr-FR')}</strong>
              <span>{k.libelle}</span>
            </span>
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <label className={`${c.champ} ${c.recherche} ${styles.rechercheChamp}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Utilisateur, description, IP, appareil…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher dans le journal" />
          </label>
          <select className={c.champ} value={filtres.hopital ?? 'ALL'} onChange={(e) => maj('hopital', e.target.value)} aria-label="Hôpital">
            <option value="ALL">Tous les hôpitaux</option>
            {data?.filtres.hopitaux.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
          <select className={c.champ} value={filtres.action ?? 'ALL'} onChange={(e) => maj('action', e.target.value)} aria-label="Type d'action">
            <option value="ALL">Toutes les actions</option>
            {data?.filtres.actions.map((a) => (
              <option key={a} value={a}>{libelleAction(a)}</option>
            ))}
          </select>
          <select className={c.champ} value={filtres.role ?? 'ALL'} onChange={(e) => maj('role', e.target.value)} aria-label="Rôle">
            <option value="ALL">Tous les rôles</option>
            {data?.filtres.roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <label className={styles.periode}>
            Du
            <input type="date" className={c.champ} value={filtres.debut ?? ''} max={filtres.fin} onChange={(e) => maj('debut', e.target.value)} aria-label="Date de début" />
            au
            <input type="date" className={c.champ} value={filtres.fin ?? ''} min={filtres.debut} onChange={(e) => maj('fin', e.target.value)} aria-label="Date de fin" />
          </label>
          <button type="button" className={c.secondaire} onClick={exporter} disabled={exportEnCours || !data?.total}>
            <FaFileExcel aria-hidden="true" /> {exportEnCours ? 'Export…' : 'Export Excel'}
          </button>
        </div>

        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col">Date & heure</th>
                <th scope="col">Utilisateur</th>
                <th scope="col">Hôpital</th>
                <th scope="col">Action</th>
                <th scope="col">Module</th>
                <th scope="col">Description</th>
                <th scope="col">Adresse IP</th>
                <th scope="col">Appareil</th>
              </tr>
            </thead>
            <tbody>
              {data?.lignes.map((l) => (
                <tr key={l.id}>
                  <td className={styles.nowrap}>{dateHeure(l.date)}</td>
                  <td>
                    <strong>{l.utilisateur || '—'}</strong>
                    <span className={c.sousTexte}>{l.role}</span>
                  </td>
                  <td>{l.hopital ?? <span className={c.sousTexte}>Global / Admin</span>}</td>
                  <td>
                    <span className={c.badge} style={couleurAction(l.action)}>{libelleAction(l.action)}</span>
                  </td>
                  <td className={styles.nowrap}>{l.module ?? '—'}</td>
                  <td className={styles.description}>{l.description}</td>
                  <td className={styles.mono}>{l.ip ?? '—'}</td>
                  <td>
                    <span className={styles.mono}>{l.appareil ?? '—'}</span>
                    <span className={c.sousTexte} title={l.navigateur ?? ''}>{l.navigateur?.split(' (')[0]}</span>
                  </td>
                </tr>
              ))}
              {data && data.lignes.length === 0 && (
                <tr><td colSpan={8} className={c.vide}>Aucune opération sur cette période avec ces filtres.</td></tr>
              )}
              {!data && <tr><td colSpan={8} className={c.vide}>Chargement…</td></tr>}
            </tbody>
          </table>
        </div>
        {data && (
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setFiltres((f) => ({ ...f, page: p }))} resume={`${data.total} opération(s)`} />
        )}
      </section>
    </div>
  );
}
