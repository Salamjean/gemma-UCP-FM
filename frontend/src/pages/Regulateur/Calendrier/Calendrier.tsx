import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaChevronLeft, FaChevronRight, FaSearch, FaUserCheck, FaUserMd, FaUserSlash } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { CalendrierMedecins, JourCalendrier } from '../../../types';
import r from '../Regulation/Regulation.module.css';
import s from './Calendrier.module.css';

/** "AAAA-MM-JJ" en heure locale */
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const decaler = (date: string, jours: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + jours);
  return isoLocal(d);
};
const jourMois = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const libelleSemaine = (debut: string, fin: string) => {
  const f = (x: string, annee = false) => new Date(`${x}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...(annee ? { year: 'numeric' } : {}) });
  return `Semaine du ${f(debut)} au ${f(fin, true)}`;
};

/** Contenu d'une case : permission > créneau de travail > repos */
function Case({ j }: { j: JourCalendrier }) {
  if (j.permission?.statut === 'agree') {
    return (
      <span className={`${s.case} ${s.casePermission}`} title={j.permission.motif ?? undefined}>
        Permission
        {j.permission.heures && <small>{j.permission.heures}</small>}
      </span>
    );
  }
  const creneau = j.journeeEntiere ? 'Toute la journée' : `${j.debut} – ${j.fin}`;
  return (
    <span className={`${s.case} ${j.travaille ? s.caseService : s.caseRepos}`}>
      {j.travaille ? creneau : 'Repos'}
      {j.permission?.statut === 'pending' && (
        <small className={s.demande} title={j.permission.motif ?? undefined}>
          Permission demandée
        </small>
      )}
    </span>
  );
}

/**
 * RÉGULATEUR > CALENDRIER — tous les médecins de l'hôpital et leurs disponibilités de la semaine :
 * créneau de chaque jour (planning), repos, permissions accordées ou demandées, et disponibilité maintenant.
 */
export default function Calendrier() {
  const [semaine, setSemaine] = useState(() => isoLocal(new Date()));
  const [data, setData] = useState<CalendrierMedecins | null>(null);
  const [chargement, setChargement] = useState(false);
  const [service, setService] = useState('');
  const [recherche, setRecherche] = useState('');
  const [disponiblesSeulement, setDisponiblesSeulement] = useState(false);
  const aujourdhui = isoLocal(new Date());

  useEffect(() => {
    setChargement(true);
    api.regulateur
      .calendrier(semaine)
      .then(setData)
      .catch((e) => alerte.echec(`Impossible de charger le calendrier : ${messageErreur(e)}`))
      .finally(() => setChargement(false));
  }, [semaine]);

  const medecins = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (data?.medecins ?? [])
      .filter((m) => !service || m.service === service)
      .filter((m) => !disponiblesSeulement || m.disponibleMaintenant)
      .filter((m) => !q || [m.nom, m.service, m.specialite].some((v) => v?.toLowerCase().includes(q)));
  }, [data, service, recherche, disponiblesSeulement]);

  const disponibles = (data?.medecins ?? []).filter((m) => m.disponibleMaintenant).length;
  const enPermission = (data?.medecins ?? []).filter((m) => m.jours.some((j) => j.date === aujourdhui && j.permission?.statut === 'agree')).length;
  const compteurs = [
    { libelle: 'Médecins', valeur: data?.medecins.length, icone: FaUserMd, fond: '#eaf3fe', texte: '#1f6fc6' },
    { libelle: 'Disponibles maintenant', valeur: disponibles, icone: FaUserCheck, fond: '#e3f5ee', texte: '#0b7a54' },
    { libelle: "En permission aujourd'hui", valeur: enPermission, icone: FaUserSlash, fond: '#fdeaee', texte: '#c4213f' },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Régulation · {data?.hopital ?? '…'}</p>
          <h1 className={c.titre}>Calendrier des médecins</h1>
        </div>
        <div className={s.navigation}>
          <button type="button" className={c.secondaire} onClick={() => setSemaine((x) => decaler(x, -7))} aria-label="Semaine précédente">
            <FaChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className={c.secondaire} onClick={() => setSemaine(aujourdhui)}>
            Cette semaine
          </button>
          <button type="button" className={c.secondaire} onClick={() => setSemaine((x) => decaler(x, 7))} aria-label="Semaine suivante">
            <FaChevronRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={r.compteurs}>
        {compteurs.map((k, i) => (
          <motion.div key={k.libelle} className={c.compteur} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
              <k.icone aria-hidden="true" />
            </span>
            <span className={c.compteurTexte}>
              <strong>{k.valeur ?? '…'}</strong>
              <span>{k.libelle}</span>
            </span>
          </motion.div>
        ))}
      </div>

      <section className={c.bloc}>
        <p className={s.semaine}>{data ? libelleSemaine(data.semaine.debut, data.semaine.fin) : 'Chargement…'}</p>
        <div className={c.filtres}>
          <select className={`${c.champ} ${s.service}`} value={service} onChange={(e) => setService(e.target.value)} aria-label="Filtrer par service">
            <option value="">Tous les services</option>
            {data?.services.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <label className={`${c.champ} ${c.recherche} ${r.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Médecin, service, spécialité…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un médecin" />
          </label>
          <label className={r.coche}>
            <input type="checkbox" checked={disponiblesSeulement} onChange={(e) => setDisponiblesSeulement(e.target.checked)} /> Disponibles maintenant
          </label>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre} ${s.table}`}>
            <thead>
              <tr>
                <th scope="col">Médecin</th>
                {data?.semaine.jours.map((j) => (
                  <th key={j.date} scope="col" className={j.date === aujourdhui ? s.colonneJour : undefined}>
                    {j.nom.slice(0, 3)}
                    <small>{jourMois(j.date)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(!data || chargement) && medecins.length === 0 && (
                <tr>
                  <td colSpan={8} className={c.vide}>
                    Chargement…
                  </td>
                </tr>
              )}
              {data && !chargement && medecins.length === 0 && (
                <tr>
                  <td colSpan={8} className={c.vide}>
                    Aucun médecin ne correspond à ces filtres.
                  </td>
                </tr>
              )}
              {medecins.map((m) => (
                <tr key={m.id} className={m.actif ? undefined : s.inactif}>
                  <td className={s.medecin}>
                    <strong>{m.nom}</strong>
                    <span className={c.sousTexte}>
                      {m.specialite}
                      {m.service ? ` · ${m.service}` : ''}
                    </span>
                    <span className={`${c.badge} ${m.disponibleMaintenant ? c.badgeOk : r.badgeKo}`}>{m.disponibleMaintenant ? 'Disponible maintenant' : m.raison}</span>
                  </td>
                  {m.jours.map((j) => (
                    <td key={j.date} className={j.date === aujourdhui ? s.colonneJour : undefined}>
                      <Case j={j} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={s.legende}>
          <span className={`${s.case} ${s.caseService}`}>Créneau de service</span>
          <span className={`${s.case} ${s.caseRepos}`}>Repos</span>
          <span className={`${s.case} ${s.casePermission}`}>Permission accordée</span>
          <span className={`${s.case} ${s.caseRepos}`}>
            <small className={s.demande}>Permission demandée</small>
          </span>
        </div>
      </section>
    </div>
  );
}
