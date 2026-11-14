import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { FaChartBar, FaChartLine, FaTable } from 'react-icons/fa';
import { Bar, Line } from 'react-chartjs-2';
import styles from './Graphique.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);
ChartJS.defaults.font.family = "'Poppins', sans-serif";

export interface Serie {
  label: string;
  data: number[];
  /** Ligne : une couleur. Barres : une couleur par barre (comme Laravel) */
  couleur: string | string[];
  fond: string | string[];
}

interface GraphiqueProps {
  type: 'line' | 'bar';
  titre: string;
  libelles: string[];
  series: Serie[];
  index: number;
}

/**
 * PARTAGÉ (tableaux de bord super, hôpital…) — Graphique Chart.js (mêmes réglages que Laravel)
 * + infobulle au survol. En haut à droite, un interrupteur "Graphique / Tableau" permet de basculer
 * entre le graphique et le même contenu en tableau (lecture sans couleurs).
 */
export default function Graphique({ type, titre, libelles, series, index }: GraphiqueProps) {
  const [vue, setVue] = useState<'graphique' | 'tableau'>('graphique');
  const totaux = series.map((s) => s.data.reduce((t, v) => t + (Number(v) || 0), 0));
  const vues = [
    { id: 'graphique' as const, libelle: 'Graphique', icone: type === 'line' ? FaChartLine : FaChartBar },
    { id: 'tableau' as const, libelle: 'Tableau', icone: FaTable },
  ];

  const options: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false }, // infobulle sur toute la colonne du mois
    plugins: { legend: { position: 'top', labels: { boxWidth: 34, font: { size: 10 } } } },
    scales: {
      // mois à l'horizontale ; si la place manque, Chart.js en saute un sur deux plutôt que de les superposer
      x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 6 } },
      y: { ticks: { font: { size: 10 } } },
    },
    animation: { duration: 900, delay: (ctx) => ctx.dataIndex * 40 },
  };

  const data = {
    labels: libelles,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.data,
      borderColor: s.couleur,
      backgroundColor: s.fond,
      borderWidth: type === 'line' ? 2 : 1,
      pointRadius: 4,
      pointHoverRadius: 6,
    })),
  };

  return (
    <motion.section
      className={styles.bloc}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 + index * 0.1 }}
      aria-label={titre}
    >
      <header className={styles.entete}>
        <h3 className={styles.titre}>{titre}</h3>
        <div className={styles.interrupteur} role="tablist" aria-label={`Affichage : ${titre}`}>
          {vues.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={vue === v.id}
              className={`${styles.option} ${vue === v.id ? styles.optionActive : ''}`}
              onClick={() => setVue(v.id)}
            >
              {vue === v.id && <motion.span layoutId={`vue-graphique-${index}`} className={styles.optionFond} transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className={styles.optionTexte}>
                <v.icone aria-hidden="true" /> {v.libelle}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className={styles.zone}>
        <AnimatePresence mode="wait" initial={false}>
          {vue === 'graphique' ? (
            <motion.div key="graphique" className={styles.vue} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {type === 'line' ? (
                <Line data={data as ChartData<'line'>} options={options as ChartOptions<'line'>} />
              ) : (
                <Bar data={data as ChartData<'bar'>} options={options as ChartOptions<'bar'>} />
              )}
            </motion.div>
          ) : (
            <motion.div key="tableau" className={`${styles.vue} ${styles.tableauWrap}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <table className={styles.tableau}>
                <caption className={styles.masque}>{titre}</caption>
                <thead>
                  <tr>
                    <th scope="col">Mois</th>
                    {series.map((s) => (
                      <th key={s.label} scope="col">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {libelles.map((mois, i) => (
                    <tr key={mois}>
                      <th scope="row">{mois}</th>
                      {series.map((s) => (
                        <td key={s.label}>{(s.data[i] ?? 0).toLocaleString('fr-FR')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {totaux.map((t, i) => (
                      <td key={series[i].label}>{t.toLocaleString('fr-FR')}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
