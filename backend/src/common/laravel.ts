import * as bcrypt from 'bcryptjs';

/**
 * COMPATIBILITÉ AVEC LARAVEL (même base de données)
 */

/** Date "YYYY-MM-DD HH:MM:SS" en UTC, comme les created_at / updated_at de Laravel (timezone UTC) */
export function laravelNow(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Hash de mot de passe identique à bcrypt() de Laravel : "$2y$", coût 12.
 * (bcryptjs produit "$2a$" — même algorithme, seul le préfixe change)
 */
export async function laravelHash(password: string): Promise<string> {
  const hash = await bcrypt.hash(password, 12);
  return hash.replace(/^\$2[ab]\$/, '$2y$');
}
