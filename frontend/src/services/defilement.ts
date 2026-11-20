import Swal from 'sweetalert2';

/** Classes posées par SweetAlert2 sur <html> / <body> pendant l'affichage d'un message (bloquent le défilement) */
const CLASSES_SWAL = ['swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop', 'swal2-iosfix', 'swal2-toast-shown'];

/**
 * Rétablit le défilement de la page s'il est resté bloqué alors que plus rien ne doit le bloquer :
 * menu ☰ du site public fermé brutalement, ou message (SweetAlert2) fermé sans que ses classes soient retirées.
 * Sans effet si un message est encore affiché.
 */
export function debloquerDefilement() {
  if (Swal.isVisible()) return;
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  for (const el of [document.documentElement, document.body]) el.classList.remove(...CLASSES_SWAL);
}
