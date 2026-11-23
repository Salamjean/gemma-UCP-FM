import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService, type ContexteAudit } from '../../common/audit/audit.service';
import { envoyerEmail } from '../../common/email';
import { laravelHash, laravelNow } from '../../common/laravel';
import { UsersService } from '../users/users.service';

const VALIDITE_MIN = 15;
const ESSAIS_MAX = 5;
const DELAI_RENVOI_S = 60;

/** Réponse identique que l'email existe ou non (on ne révèle pas quels comptes existent) */
const REPONSE_DEMANDE = {
  message: 'Si un compte correspond à cette adresse, un code de réinitialisation vient d’y être envoyé. Il est valable 15 minutes.',
};

/**
 * MOT DE PASSE OUBLIÉ (la réinitialisation de Laravel est désactivée) :
 *   1. demande : code à 6 chiffres envoyé par email (même SMTP que Laravel), valable 15 min ;
 *   2. réinitialisation : email + code + nouveau mot de passe (5 essais par code).
 * Seuls les comptes autorisés sur cette application (mêmes règles que la connexion) peuvent réinitialiser.
 * Codes hachés dans fm_reinitialisations (table Gemma FM).
 */
@Injectable()
export class ReinitialisationService {
  private readonly logger = new Logger('MotDePasseOublie');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async demander(email: string, ctx: ContexteAudit) {
    const user = await this.users.findByEmailWithPassword(email.trim());
    // Compte inconnu, rôle non autorisé ou compte désactivé : même réponse, rien n'est envoyé
    if (!user || !user.email || !(await this.users.checkAccount(user)).ok) return REPONSE_DEMANDE;

    const [existant] = await this.db.query('SELECT created_at FROM fm_reinitialisations WHERE user_id = ? LIMIT 1', [user.id]);
    // Code demandé il y a moins d'une minute : rien n'est renvoyé, mais même réponse (sinon on révélerait que le compte existe)
    if (existant && Date.now() - new Date(existant.created_at).getTime() < DELAI_RENVOI_S * 1000) return REPONSE_DEMANDE;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const maintenant = new Date();
    const expire = new Date(maintenant.getTime() + VALIDITE_MIN * 60_000);
    const sql = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
    await this.db.query(
      `INSERT INTO fm_reinitialisations (user_id, code_hash, expire_le, tentatives, created_at) VALUES (?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expire_le = VALUES(expire_le), tentatives = 0, created_at = VALUES(created_at)`,
      [user.id, await bcrypt.hash(code, 10), sql(expire), sql(maintenant)],
    );

    const nom = [user.prenom, user.name].filter(Boolean).join(' ') || 'Madame, Monsieur';
    const texte = `Bonjour ${nom},\n\nVotre code de réinitialisation du mot de passe GEMMA est : ${code}\nIl est valable ${VALIDITE_MIN} minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#172b4c">
  <p>Bonjour ${nom.replace(/[<>&]/g, '')},</p>
  <p>Votre code de réinitialisation du mot de passe <strong>GEMMA</strong> est :</p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#1f6fc6">${code}</p>
  <p>Il est valable ${VALIDITE_MIN} minutes.</p>
  <p style="color:#64748b">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.</p>
</div>`;
    const envoye = await envoyerEmail(user.email, 'GEMMA — Code de réinitialisation du mot de passe', texte, html);
    if (!envoye) this.logger.warn(`Code de réinitialisation non envoyé par email pour le compte #${user.id}.`);
    await this.audit.log({ ...ctx, userId: Number(user.id) }, 'DEMANDE_REINITIALISATION', 'AUTHENTIFICATION', 'Demande de réinitialisation du mot de passe (mot de passe oublié)');
    return REPONSE_DEMANDE;
  }

  async reinitialiser(email: string, code: string, nouveau: string, confirmation: string, ctx: ContexteAudit) {
    if (!/^\d{6}$/.test(code ?? '')) throw new BadRequestException('Le code doit contenir 6 chiffres.');
    if (!nouveau || nouveau.length < 8) throw new BadRequestException('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    if (nouveau !== confirmation) throw new BadRequestException('La confirmation ne correspond pas au nouveau mot de passe.');

    const invalide = new BadRequestException('Code invalide ou expiré : demandez un nouveau code.');
    const user = await this.users.findByEmailWithPassword(email.trim());
    if (!user || !(await this.users.checkAccount(user)).ok) throw invalide;
    const [r] = await this.db.query('SELECT code_hash, expire_le, tentatives FROM fm_reinitialisations WHERE user_id = ? LIMIT 1', [user.id]);
    if (!r) throw invalide;
    const expireLe = new Date(`${String(r.expire_le instanceof Date ? r.expire_le.toISOString() : r.expire_le).replace(' ', 'T').replace(/Z?$/, 'Z')}`);
    if (expireLe.getTime() < Date.now() || Number(r.tentatives) >= ESSAIS_MAX) {
      await this.db.query('DELETE FROM fm_reinitialisations WHERE user_id = ?', [user.id]);
      throw invalide;
    }
    if (!(await bcrypt.compare(code, r.code_hash))) {
      await this.db.query('UPDATE fm_reinitialisations SET tentatives = tentatives + 1 WHERE user_id = ?', [user.id]);
      const restants = ESSAIS_MAX - Number(r.tentatives) - 1;
      throw new BadRequestException(restants > 0 ? `Code incorrect (${restants} essai${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}).` : 'Code incorrect : demandez un nouveau code.');
    }

    await this.db.query('UPDATE users SET password = ?, updated_at = ? WHERE id = ?', [await laravelHash(nouveau), laravelNow(), user.id]);
    await this.db.query('DELETE FROM fm_reinitialisations WHERE user_id = ?', [user.id]);
    await this.audit.log({ ...ctx, userId: Number(user.id) }, 'REINITIALISATION_MOT_DE_PASSE', 'AUTHENTIFICATION', 'Mot de passe réinitialisé (mot de passe oublié)');
    return { message: 'Votre mot de passe a été réinitialisé : vous pouvez vous connecter.' };
  }
}
