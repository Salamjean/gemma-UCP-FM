import { Module } from '@nestjs/common';
import { ProfilController } from './profil.controller';
import { ProfilService } from './profil.service';

/** « Mon profil » : chaque utilisateur modifie ses propres données et son mot de passe */
@Module({ controllers: [ProfilController], providers: [ProfilService] })
export class ProfilModule {}
