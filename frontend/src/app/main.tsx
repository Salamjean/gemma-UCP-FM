import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Application installable (PWA) : service worker (public/sw.js), enregistré après le chargement de la page
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
