import { useEffect, useMemo, useState } from 'react';
import { FaArrowRight, FaSearch } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { Reattribution } from '../../../types';
import s from '../Regulation/Regulation.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

/** RÉGULATEUR > HISTORIQUE — réattributions de l'hôpital (200 dernières), avec la raison et le motif */
export default function Historique() {
  const [liste, setListe] = useState<Reattribution[] | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    api.regulateur
      .historique()
      .then(setListe)
      .catch((e) => alerte.echec(`Impossible de charger l'historique : ${messageErreur(e)}`));
  }, []);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = liste ?? [];
    return q ? l.filter((r) => [r.patient, r.consultation, r.ancienMedecin, r.nouveauMedecin, r.motif, r.regulateur].some((v) => v?.toLowerCase().includes(q))) : l;
  }, [liste, recherche]);
  const pg = usePagination(filtres);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Régulation</p>
          <h1 className={c.titre}>Historique des réattributions</h1>
        </div>
      </header>

      <section className={c.bloc}>
        <div className={c.filtres}>
          <label className={`${c.champ} ${c.recherche} ${s.recherche}`}>
            <FaSearch aria-hidden="true" />
            <input type="search" placeholder="Patient, médecin, motif…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une réattribution" />
          </label>
        </div>

        <div className={c.tableWrap}>
          <table className={`${c.table} ${c.centre}`}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Patient</th>
                <th scope="col">Réattribution</th>
                <th scope="col">Raison</th>
                <th scope="col">Motif</th>
                <th scope="col">Par</th>
              </tr>
            </thead>
            <tbody>
              {!liste && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    Chargement…
                  </td>
                </tr>
              )}
              {liste && filtres.length === 0 && (
                <tr>
                  <td colSpan={6} className={c.vide}>
                    Aucune réattribution pour l'instant.
                  </td>
                </tr>
              )}
              {pg.lignes.map((r) => (
                <tr key={r.id}>
                  <td>{dateHeure(r.date)}</td>
                  <td>
                    <strong>{r.patient}</strong>
                    <span className={c.sousTexte}>{r.consultation}</span>
                  </td>
                  <td>
                    {r.ancienMedecin ?? 'Aucun médecin'} <FaArrowRight aria-label="vers" /> <strong>{r.nouveauMedecin}</strong>
                  </td>
                  <td>{r.raison ?? '—'}</td>
                  <td>{r.motif ?? '—'}</td>
                  <td>{r.regulateur ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationTableau pagination={pg} />
      </section>
    </div>
  );
}
