import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { laravelHash, laravelNow } from '../../common/laravel';
import { ADMIN_ROLE, EMAIL_ADMIN } from '../../modules/users/role-profiles';

/** Compte d'administration UCP-FM créé au démarrage s'il n'existe pas */
export const ADMIN_PAR_DEFAUT = { email: EMAIL_ADMIN, motDePasse: '1234', nom: 'Admin', prenom: 'UCP-FM' };

/**
 * SEEDER — exécuté à chaque lancement du backend (après les migrations TypeORM).
 * Crée le compte « admin@gmail.com » (mot de passe 1234) avec le rôle « admin » :
 * il ouvre l'espace d'administration UCP-FM (gestion des hôpitaux UCP-FM). D'autres comptes « admin » peuvent exister.
 * Idempotent : si l'email existe déjà, seul un ancien rôle « super » est converti en « admin » (mot de passe conservé).
 */
@Injectable()
export class AdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger('Seeder');

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async onApplicationBootstrap() {
    try {
      const [existe] = await this.db.query('SELECT id, role_as FROM users WHERE email = ? LIMIT 1', [ADMIN_PAR_DEFAUT.email]);
      if (existe) {
        if (existe.role_as === 'super') {
          // Ancienne version de ce seeder (rôle « super ») : passage au rôle « admin »
          await this.db.query('UPDATE users SET role_as = ?, updated_at = ? WHERE id = ?', [ADMIN_ROLE, laravelNow(), existe.id]);
          this.logger.log(`${ADMIN_PAR_DEFAUT.email} : rôle « super » remplacé par « ${ADMIN_ROLE} ».`);
        } else if (existe.role_as !== ADMIN_ROLE) {
          this.logger.warn(`${ADMIN_PAR_DEFAUT.email} existe déjà avec le rôle « ${existe.role_as} » : non modifié.`);
        }
        return;
      }
      const now = laravelNow();
      await this.db.query(
        'INSERT INTO users (name, prenom, email, role_as, password, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [ADMIN_PAR_DEFAUT.nom, ADMIN_PAR_DEFAUT.prenom, ADMIN_PAR_DEFAUT.email, ADMIN_ROLE, await laravelHash(ADMIN_PAR_DEFAUT.motDePasse), now, now, now],
      );
      this.logger.log(`Compte d'administration créé : ${ADMIN_PAR_DEFAUT.email} (mot de passe : ${ADMIN_PAR_DEFAUT.motDePasse})`);
    } catch (e) {
      // Le démarrage du backend ne doit jamais échouer à cause du seeder
      this.logger.error(`Création du compte d'administration impossible : ${e instanceof Error ? e.message : e}`);
    }
  }
}
