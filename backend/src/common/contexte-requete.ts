import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Contexte de la requête HTTP en cours (accessible partout pendant son traitement, sans le passer en paramètre).
 * Sert à l'admin UCP-FM qui ouvre un hôpital : l'en-tête « X-Hopital-Id » indique l'hôpital sur lequel
 * travaillent les modules de l'espace hôpital (voir hopitalDuCompte).
 */
export const contexteRequete = new AsyncLocalStorage<{ req: Request }>();

/** Middleware Express : toute la suite du traitement de la requête s'exécute dans ce contexte */
export function brancherContexteRequete(req: Request, _res: Response, next: NextFunction) {
  contexteRequete.run({ req }, next);
}

/** En-tête envoyé par l'espace admin quand il ouvre un hôpital */
export const ENTETE_HOPITAL = 'x-hopital-id';

/** Identifiant de l'hôpital ouvert par l'admin (en-tête valide), sinon null */
export function hopitalDemande(req: Request | undefined): number | null {
  const v = req?.headers?.[ENTETE_HOPITAL];
  const id = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(id) && id > 0 ? id : null;
}
