import { dirname, isAbsolute, join } from 'path';

/**
 * CHEMINS VERS LE PROJET LARAVEL (même machine / même serveur)
 * Déduits de LARAVEL_PUBLIC_PATH (backend/.env) = dossier public/ de Laravel.
 */
export function laravelRoot(): string | null {
  const publicPath = process.env.LARAVEL_PUBLIC_PATH;
  return publicPath ? dirname(publicPath) : null;
}

/** Fichier des logs Laravel : storage/logs/laravel.log */
export function laravelLogFile(): string | null {
  const root = laravelRoot();
  return root ? join(root, 'storage', 'logs', 'laravel.log') : null;
}

/**
 * Compte de service Firebase (envoi des notifications push) :
 * FIREBASE_CREDENTIALS dans backend/.env, sinon celui de Laravel (storage/app/firebase-service-account.json).
 */
export function firebaseCredentialsFile(): string | null {
  const root = laravelRoot();
  const env = process.env.FIREBASE_CREDENTIALS;
  if (env) return isAbsolute(env) || !root ? env : join(root, env);
  return root ? join(root, 'storage', 'app', 'firebase-service-account.json') : null;
}
