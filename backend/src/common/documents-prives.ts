import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import type { DataSource } from 'typeorm';

/**
 * DOCUMENTS JOINTS À UNE RÉFÉRENCE (interne / externe)
 *   - informations (libellé, nom d'origine, type, taille, auteur) : table « fm_documents_references » (créée par la migration Gemma FM) ;
 *   - fichiers : stockage PRIVÉ de Laravel (jamais public/), <LARAVEL_PUBLIC_PATH>/../storage/app/gemma-fm/references/consultation-<id>/
 * Le téléchargement passe uniquement par une route authentifiée.
 */
export const DOCUMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
export const DOCUMENT_MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
export const DOCUMENTS_MAX_PAR_ENVOI = 20;

export interface DocumentPrive {
  id: string;
  libelle: string;
  fichier: string;
  nom: string;
  type: string;
  taille: number;
  ajouteLe: string;
  ajoutePar: number | null;
}

function dossier(consultationId: number): string {
  const publicPath = process.env.LARAVEL_PUBLIC_PATH;
  if (!publicPath) throw new InternalServerErrorException('LARAVEL_PUBLIC_PATH manquant dans backend/.env');
  if (!Number.isInteger(consultationId) || consultationId <= 0) throw new BadRequestException('Consultation invalide.');
  return join(publicPath, '..', 'storage', 'app', 'gemma-fm', 'references', `consultation-${consultationId}`);
}

/** Multer lit les noms de fichiers en latin1 : on retrouve les accents (UTF-8) */
const nomUtf8 = (nom: string) => (/[\u0080-ÿ]/.test(nom) ? Buffer.from(nom, 'latin1').toString('utf8') : nom);

const versDocument = (r: Record<string, unknown>): DocumentPrive => ({
  id: String(r.id),
  libelle: String(r.libelle),
  fichier: String(r.fichier),
  nom: String(r.nom_original),
  type: String(r.type),
  taille: Number(r.taille),
  ajouteLe: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  ajoutePar: r.ajoute_par != null ? Number(r.ajoute_par) : null,
});

export async function listerDocuments(db: DataSource, consultationId: number): Promise<DocumentPrive[]> {
  const rows: Record<string, unknown>[] = await db.query('SELECT * FROM fm_documents_references WHERE consultation_id = ? ORDER BY numero', [consultationId]);
  return rows.map(versDocument);
}

/** Nombre de documents par consultation (listes) */
export async function compterDocuments(db: DataSource, consultationIds: number[]): Promise<Map<number, number>> {
  const ids = [...new Set(consultationIds.filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) return new Map();
  const rows: { consultation_id: number; n: number }[] = await db.query(
    'SELECT consultation_id, COUNT(*) AS n FROM fm_documents_references WHERE consultation_id IN (?) GROUP BY consultation_id',
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.consultation_id), Number(r.n)]));
}

/** Vérifie les fichiers et leurs libellés AVANT toute écriture */
export function verifierDocuments(fichiers: Express.Multer.File[], libelles: string[]) {
  if (!fichiers.length) throw new BadRequestException('Aucun document reçu.');
  if (fichiers.length > DOCUMENTS_MAX_PAR_ENVOI) throw new BadRequestException(`${DOCUMENTS_MAX_PAR_ENVOI} documents maximum par envoi.`);
  fichiers.forEach((f, i) => {
    const nom = nomUtf8(f.originalname);
    const ext = extname(nom).slice(1).toLowerCase();
    if (!DOCUMENT_EXTENSIONS.includes(ext)) throw new BadRequestException(`« ${nom} » : formats acceptés ${DOCUMENT_EXTENSIONS.join(', ')}.`);
    if (f.size > DOCUMENT_MAX_SIZE) throw new BadRequestException(`« ${nom} » dépasse 10 Mo.`);
    const libelle = (libelles[i] ?? '').trim();
    if (!libelle) throw new BadRequestException(`Veuillez préciser le libellé du document « ${nom} ».`);
    if (libelle.length > 191) throw new BadRequestException('Libellé trop long (191 caractères maximum).');
  });
}

/** Enregistre les fichiers puis leurs informations (InnoDB : tout ou rien ; fichiers retirés en cas d'échec) */
export async function ajouterDocuments(db: DataSource, consultationId: number, fichiers: Express.Multer.File[], libelles: string[], auteur: number) {
  verifierDocuments(fichiers, libelles);
  const dir = dossier(consultationId);
  await mkdir(dir, { recursive: true });
  const ecrits: string[] = [];
  try {
    const lignes: (string | number)[][] = [];
    for (const [i, f] of fichiers.entries()) {
      const nom = nomUtf8(f.originalname);
      const id = randomBytes(8).toString('hex');
      const fichier = `${id}.${extname(nom).slice(1).toLowerCase()}`;
      await writeFile(join(dir, fichier), f.buffer);
      ecrits.push(join(dir, fichier));
      lignes.push([id, consultationId, libelles[i].trim(), fichier, nom.slice(0, 255), (f.mimetype || 'application/octet-stream').slice(0, 150), f.size, auteur]);
    }
    await db.transaction(async (t) => {
      for (const l of lignes) {
        await t.query(
          'INSERT INTO fm_documents_references (id, consultation_id, libelle, fichier, nom_original, type, taille, ajoute_par, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
          l,
        );
      }
    });
    return lignes.length;
  } catch (e) {
    await Promise.all(ecrits.map((p) => unlink(p).catch(() => undefined)));
    throw e;
  }
}

export async function lireDocument(db: DataSource, consultationId: number, id: string): Promise<{ doc: DocumentPrive; contenu: Buffer } | null> {
  const [r] = await db.query('SELECT * FROM fm_documents_references WHERE id = ? AND consultation_id = ? LIMIT 1', [id, consultationId]);
  if (!r) return null;
  const doc = versDocument(r);
  const contenu = await readFile(join(dossier(consultationId), doc.fichier)).catch(() => null);
  return contenu ? { doc, contenu } : null;
}

export async function supprimerDocument(db: DataSource, consultationId: number, id: string): Promise<boolean> {
  const [r] = await db.query('SELECT fichier FROM fm_documents_references WHERE id = ? AND consultation_id = ? LIMIT 1', [id, consultationId]);
  if (!r) return false;
  await db.query('DELETE FROM fm_documents_references WHERE id = ? AND consultation_id = ?', [id, consultationId]);
  await unlink(join(dossier(consultationId), String(r.fichier))).catch(() => undefined);
  return true;
}
