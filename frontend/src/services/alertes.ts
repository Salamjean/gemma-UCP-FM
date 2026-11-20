import Swal, { type SweetAlertIcon } from 'sweetalert2';
import { debloquerDefilement } from './defilement';

/**
 * POP-UPS DE MESSAGES (SweetAlert2) — comme Laravel (resources/views/partials/_footer.blade.php) :
 *   Swal.fire({ text, icon: 'success' | 'error' | 'info' | 'warning' }) avec un bouton OK.
 * Utiliser partout : alerte.succes('…'), alerte.echec('…'), alerte.info('…'), alerte.attention('…').
 * Apparence (police, coins) : styles/global.css → section "SweetAlert2".
 */
const BLEU = '#3596f7';

function afficher(icon: SweetAlertIcon, text: string) {
  const fenetre = Swal.fire({
    text,
    icon,
    confirmButtonText: 'OK',
    confirmButtonColor: BLEU,
    buttonsStyling: true,
    returnFocus: false,
    // Ne pas forcer « height: auto » sur <html>/<body> (perturbait le défilement sur tablette)
    heightAuto: false,
  });
  // Message fermé : le défilement de la page est rétabli s'il est resté bloqué (classes de SweetAlert2 non retirées)
  void fenetre.finally(() => setTimeout(debloquerDefilement, 350));
  return fenetre;
}

export const alerte = {
  succes: (text: string) => afficher('success', text),
  echec: (text: string) => afficher('error', text),
  info: (text: string) => afficher('info', text),
  attention: (text: string) => afficher('warning', text),
};

/** Message d'une erreur attrapée (Error, texte…) */
export const messageErreur = (e: unknown, defaut = 'Une erreur est survenue.') =>
  e instanceof Error && e.message ? e.message : defaut;
