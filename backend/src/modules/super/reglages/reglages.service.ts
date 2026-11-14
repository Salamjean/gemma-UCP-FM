import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';

export interface IconesInfo {
  logo: string | null;
  loading: string | null;
  favicon: string | null;
  updatedAt: number;
}

/**
 * SUPER > RÉGLAGES
 * Reprend Laravel : app/Http/Controllers/Super/SettingController.php
 *   icon, uploadLogo, logoIconUpdate
 * Gère les icônes de l'application (logo, icône de chargement, favicon).
 */
@Injectable()
export class ReglagesService {
  private readonly logger = new Logger(ReglagesService.name);

  private getIconDir(): string {
    return join(process.cwd(), 'uploads', 'iconFavicon');
  }

  /** Retourne les icônes actuelles et leur chemin relatif */
  async getIcones(): Promise<IconesInfo> {
    const dir = this.getIconDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const files = existsSync(dir) ? readdirSync(dir) : [];

    const logoFile = files.find((f) => f.startsWith('logo.')) ?? null;
    const loadingFile = files.find((f) => f.startsWith('loading.')) ?? null;
    const faviconFile = files.find((f) => f.startsWith('favicon.')) ?? null;

    return {
      logo: logoFile ? `iconFavicon/${logoFile}` : null,
      loading: loadingFile ? `iconFavicon/${loadingFile}` : null,
      favicon: faviconFile ? `iconFavicon/${faviconFile}` : null,
      // Version = date de modification la plus récente : change seulement quand une icône change
      // (sert à forcer les navigateurs à recharger l'image : ?v=…)
      updatedAt: Math.max(0, ...[logoFile, loadingFile, faviconFile].filter(Boolean).map((f) => Math.floor(statSync(join(dir, f as string)).mtimeMs))),
    };
  }

  /**
   * Met à jour les icônes fournies (même comportement que Laravel logoIconUpdate)
   * Formats : PNG pour logo et loading ; ICO, PNG, JPG, JPEG, SVG pour favicon
   */
  async updateIcones(files: {
    logo?: Express.Multer.File[];
    loading?: Express.Multer.File[];
    favicon?: Express.Multer.File[];
  }) {
    const dir = this.getIconDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // --- 1. Logo ---
    const logo = files.logo?.[0];
    if (logo) {
      const ext = extname(logo.originalname).slice(1).toLowerCase();
      if (ext !== 'png' && !logo.mimetype.includes('png')) {
        throw new BadRequestException('Le logo doit être une image au format PNG.');
      }
      // Supprime anciens logos éventuels
      await this.deleteOld(dir, 'logo');
      await writeFile(join(dir, 'logo.png'), logo.buffer);
    }

    // --- 2. Loading ---
    const loading = files.loading?.[0];
    if (loading) {
      const ext = extname(loading.originalname).slice(1).toLowerCase();
      if (ext !== 'png' && !loading.mimetype.includes('png')) {
        throw new BadRequestException("L'icône de chargement doit être une image au format PNG.");
      }
      await this.deleteOld(dir, 'loading');
      await writeFile(join(dir, 'loading.png'), loading.buffer);
    }

    // --- 3. Favicon ---
    const favicon = files.favicon?.[0];
    if (favicon) {
      const ext = extname(favicon.originalname).slice(1).toLowerCase();
      const autorises = ['ico', 'png', 'jpg', 'jpeg', 'svg'];
      if (!autorises.includes(ext)) {
        throw new BadRequestException('Le favicon doit être au format ICO, PNG, JPG, JPEG ou SVG.');
      }
      await this.deleteOld(dir, 'favicon');
      await writeFile(join(dir, `favicon.${ext}`), favicon.buffer);
    }

    const current = await this.getIcones();
    return {
      message: 'Informations modifiées avec succès.',
      icons: current,
    };
  }

  private async deleteOld(dir: string, base: string) {
    if (!existsSync(dir)) return;
    const files = readdirSync(dir).filter((f) => f.startsWith(`${base}.`));
    for (const f of files) {
      await unlink(join(dir, f)).catch(() => undefined);
    }
  }
}

