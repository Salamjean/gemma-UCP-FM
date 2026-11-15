import { useState } from 'react';
import { FaFileExcel } from 'react-icons/fa';
import { alerte, messageErreur } from '../../services/alertes';
import { api } from '../../services/api';
import c from '../../styles/espace.module.css';

/** Une colonne du fichier : titre + valeur tirée de la ligne */
export interface ColonneExport<T> {
  titre: string;
  valeur: (ligne: T) => string | number | null | undefined;
  /** Largeur en caractères (sinon calculée d'après le contenu) */
  largeur?: number;
}

/** Une feuille d'un classeur à plusieurs onglets (tableaux de bord) — créer avec feuilleExport() */
export interface FeuilleExport {
  titre: string;
  colonnes: ColonneExport<never>[];
  lignes: unknown[];
}

/** Feuille typée (les valeurs des colonnes sont vérifiées sur le type des lignes) */
export const feuilleExport = <T,>(titre: string, colonnes: ColonneExport<T>[], lignes: T[]): FeuilleExport =>
  ({ titre, colonnes, lignes }) as unknown as FeuilleExport;

interface Props<T> {
  /** Nom du fichier sans extension, ex. "patients" → patients_2026-11-15.xlsx */
  fichier: string;
  /** Titre écrit en haut de la feuille, ex. "Liste des patients" */
  titre: string;
  colonnes?: ColonneExport<T>[];
  /** Tableau de bord : plusieurs onglets (à la place de colonnes / lignes) */
  feuilles?: FeuilleExport[];
  /** Lignes affichées (filtres et recherche appliqués) */
  lignes?: T[];
  /** Liste paginée côté serveur : charge TOUTES les lignes au moment de l'export (à la place de `lignes`) */
  charger?: () => Promise<T[]>;
  /** Module du journal d'audit, ex. "PATIENT" */
  module: string;
}

const BLEU = 'FF1F6FC6';
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * PARTAGÉ — bouton « Exporter Excel » des listes et tableaux de bord (espaces admin UCP-FM et hôpital).
 * Liste : `colonnes` + `lignes` (ou `charger`) ; tableau de bord : `feuilles` (un onglet par bloc).
 * Crée un vrai fichier .xlsx avec les lignes affichées (titre, date, en-têtes figés et filtrables),
 * puis trace l'export dans le journal d'audit (EXPORT_EXCEL), comme Laravel.
 * La bibliothèque exceljs n'est chargée qu'au clic.
 */
export default function ExportExcel<T>({ fichier, titre, colonnes, feuilles, lignes: lignesAffichees, charger, module }: Props<T>) {
  const [envoi, setEnvoi] = useState(false);

  const exporter = async () => {
    setEnvoi(true);
    try {
      const liste: FeuilleExport[] = feuilles ?? [
        feuilleExport(titre, colonnes ?? [], charger ? await charger() : (lignesAffichees ?? [])),
      ];
      const total = liste.reduce((n, f) => n + f.lignes.length, 0);
      if (total === 0) return void alerte.info('Aucune ligne à exporter.');
      const { Workbook } = await import('exceljs');
      const classeur = new Workbook();
      classeur.creator = 'Gemma FM';
      classeur.created = new Date();

      for (const f of liste) {
        const cols = f.colonnes as ColonneExport<unknown>[];
        const lignes = f.lignes;
        const feuille = classeur.addWorksheet(f.titre.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));

        // Titre (du classeur et de la feuille) + date d'export
        feuille.addRow([feuilles ? `${titre} — ${f.titre}` : titre]).font = { bold: true, size: 14, color: { argb: BLEU } };
        feuille.addRow([`Exporté le ${new Date().toLocaleString('fr-FR')} · ${lignes.length} ligne${lignes.length > 1 ? 's' : ''}`]).font = { italic: true, color: { argb: 'FF64748B' } };
        feuille.addRow([]);

        // En-têtes
        const entete = feuille.addRow(cols.map((col) => col.titre));
        entete.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLEU } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        entete.height = 22;

        // Données
        for (const ligne of lignes) {
          feuille.addRow(
            cols.map((col) => {
              const v = col.valeur(ligne);
              return v === null || v === undefined || v === '' ? '—' : v;
            }),
          );
        }

        // Largeurs, en-têtes figés et filtres automatiques
        cols.forEach((col, i) => {
          const contenu = [col.titre, ...lignes.slice(0, 500).map((l) => String(col.valeur(l) ?? ''))];
          feuille.getColumn(i + 1).width = col.largeur ?? Math.min(50, Math.max(10, ...contenu.map((x) => x.length + 2)));
        });
        const ligneEntete = 4;
        feuille.views = [{ state: 'frozen', ySplit: ligneEntete }];
        if (cols.length) feuille.autoFilter = { from: { row: ligneEntete, column: 1 }, to: { row: ligneEntete, column: cols.length } };
      }

      const buffer = await classeur.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fichier}_${aujourdhui()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // Journal d'audit (sans bloquer : le fichier est déjà téléchargé)
      api.exports.journal({ module, description: `Exportation Excel : ${titre} (${total} lignes${liste.length > 1 ? `, ${liste.length} onglets` : ''})` }).catch(() => undefined);
    } catch (e) {
      alerte.echec(`Export Excel impossible : ${messageErreur(e)}`);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <button type="button" className={c.secondaire} onClick={exporter} disabled={envoi} title="Télécharger les lignes affichées au format Excel">
      <FaFileExcel aria-hidden="true" style={{ color: '#1d6f42' }} /> {envoi ? 'Export…' : 'Exporter Excel'}
    </button>
  );
}
