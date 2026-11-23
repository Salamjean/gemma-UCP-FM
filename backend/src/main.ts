import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { brancherContexteRequete } from './common/contexte-requete';
import { uploadsRoot } from './common/uploads';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Toutes les routes commencent par /api (ex. /api/auth/login)
  app.setGlobalPrefix('api');

  // Derrière Apache (reverse proxy sur la même machine) : l'IP réelle du client est lue dans X-Forwarded-For
  // (nécessaire pour la limite de requêtes par IP et le journal d'audit). Seul le proxy local est cru.
  app.set('trust proxy', 'loopback');
  // En-têtes de sécurité HTTP (nosniff, HSTS, anti-clickjacking…). Les images de /api/uploads restent
  // affichables par le frontend servi depuis un autre domaine/port.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // Contexte de requête (admin UCP-FM qui ouvre un hôpital : en-tête X-Hopital-Id lu par hopitalDuCompte)
  app.use(brancherContexteRequete);

  // Autorise le frontend React à appeler l'API
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' });

  // Valide automatiquement les DTO (voir modules/*/dto)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Images partagées avec Laravel (photos des hôpitaux, avatars…) : /api/uploads/<dossier>/<fichier>
  const uploads = uploadsRoot();
  if (uploads) {
    app.useStaticAssets(uploads, { prefix: '/api/uploads/', index: false, dotfiles: 'deny' });
  } else {
    Logger.warn('LARAVEL_PUBLIC_PATH absent de .env : photos et envois d’images désactivés', 'Bootstrap');
  }

  // Stockage local gemma FM (icônes, favicons...) : /api/uploads-local/<chemin>
  const localUploads = join(process.cwd(), 'uploads');
  if (existsSync(localUploads)) {
    app.useStaticAssets(localUploads, { prefix: '/api/uploads-local/', index: false, dotfiles: 'deny' });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`API Gemma FM : http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
