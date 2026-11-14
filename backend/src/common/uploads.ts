import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';

/**
 * ENVOI D'IMAGES — même emplacement que Laravel (helpers.php → uploadImage) :
 *   <LARAVEL_PUBLIC_PATH>/assets/uploads/<dossier>/<horodatage>.<ext>
 * Les images sont donc visibles par Laravel ET par ce projet.
 */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png']; // comme FileTypeValidate de Laravel
export const IMAGE_MAX_SIZE = 3 * 1024 * 1024; // 3 Mo

export function uploadsRoot(): string | null {
  const publicPath = process.env.LARAVEL_PUBLIC_PATH;
  return publicPath ? join(publicPath, 'assets', 'uploads') : null;
}

/** Supprime une ancienne image (comme deleteUploadImage de Laravel) — sans erreur si absente */
export async function deleteImage(dossier: string, filename: string | null | undefined): Promise<void> {
  const root = uploadsRoot();
  if (!root || !filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) return;
  await unlink(join(root, dossier, filename)).catch(() => undefined);
}

/** Enregistre l'image et renvoie le nom de fichier à stocker en base (ex. img_url) */
export async function saveImage(file: Express.Multer.File, dossier: string): Promise<string> {
  const ext = extname(file.originalname).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext) || !file.mimetype.startsWith('image/')) {
    throw new BadRequestException('Image : formats acceptés jpg, jpeg, png');
  }
  const root = uploadsRoot();
  if (!root) throw new InternalServerErrorException('LARAVEL_PUBLIC_PATH manquant dans backend/.env');

  const dir = join(root, dossier);
  await mkdir(dir, { recursive: true });
  // Laravel utilise time().ext ; on ajoute quelques caractères pour éviter deux fichiers du même nom
  const filename = `${Math.floor(Date.now() / 1000)}${randomBytes(3).toString('hex')}.${ext}`;
  await writeFile(join(dir, filename), file.buffer);
  return filename;
}
