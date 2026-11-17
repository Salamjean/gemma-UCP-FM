import { useEffect, useState } from 'react';
import { abonner, contexteSecurise, dejaInstallee, installationPossible } from './installation';
import s from './InstallerApplication.module.css';

type Etat = { libelle: string; ok: boolean | null; detail: string };

/**
 * PWA — DIAGNOSTIC (ouvrir n'importe quelle page avec « ?diagnostic-pwa » dans l'adresse)
 * Affiche sur l'appareil lui-même ce que le navigateur voit : HTTPS, service worker, manifeste, icônes,
 * et si Chrome propose la vraie installation. Sert à comprendre un « Créer un raccourci » sur une tablette.
 */
export default function DiagnosticPwa() {
  const [etats, setEtats] = useState<Etat[]>([]);
  const [possible, setPossible] = useState(installationPossible());

  useEffect(() => abonner(() => setPossible(installationPossible())), []);

  useEffect(() => {
    let actif = true;
    (async () => {
      const liste: Etat[] = [];
      const securise = contexteSecurise();
      liste.push({ libelle: 'Adresse sécurisée (HTTPS)', ok: securise, detail: `${location.protocol}//${location.host}` });

      // Service worker
      if (!('serviceWorker' in navigator)) {
        liste.push({ libelle: 'Service worker', ok: false, detail: 'Non pris en charge par ce navigateur (ou adresse non sécurisée)' });
      } else {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          liste.push({
            libelle: 'Service worker enregistré',
            ok: !!reg,
            detail: reg ? `actif : ${reg.active ? 'oui' : 'non'} · contrôle la page : ${navigator.serviceWorker.controller ? 'oui' : 'non (rechargez la page)'}` : 'aucun',
          });
          if (!reg) {
            try {
              await navigator.serviceWorker.register('/sw.js');
              liste.push({ libelle: 'Nouvel essai d’enregistrement', ok: true, detail: 'réussi : rechargez la page' });
            } catch (e) {
              liste.push({ libelle: 'Nouvel essai d’enregistrement', ok: false, detail: (e as Error).message });
            }
          }
        } catch (e) {
          liste.push({ libelle: 'Service worker', ok: false, detail: (e as Error).message });
        }
      }

      // Fichier du service worker : doit être du JavaScript (pas une page d'avertissement d'un tunnel)
      try {
        const r = await fetch('/sw.js', { cache: 'no-store' });
        const type = r.headers.get('content-type') ?? '';
        liste.push({ libelle: 'Fichier sw.js', ok: r.ok && type.includes('javascript'), detail: `${r.status} · ${type || 'type inconnu'}` });
      } catch (e) {
        liste.push({ libelle: 'Fichier sw.js', ok: false, detail: (e as Error).message });
      }

      // Manifeste + icônes
      try {
        const lien = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        const r = await fetch(lien?.href ?? '/manifest.webmanifest', { cache: 'no-store' });
        const m = await r.json();
        liste.push({ libelle: 'Manifeste', ok: r.ok, detail: `${m.name} · affichage « ${m.display} » · début ${m.start_url}` });
        for (const taille of ['192x192', '512x512']) {
          const icone = (m.icons ?? []).find((i: { sizes: string }) => i.sizes === taille);
          if (!icone) {
            liste.push({ libelle: `Icône ${taille}`, ok: false, detail: 'absente du manifeste' });
            continue;
          }
          const ri = await fetch(icone.src, { cache: 'no-store' });
          liste.push({ libelle: `Icône ${taille}`, ok: ri.ok && (ri.headers.get('content-type') ?? '').includes('image'), detail: `${ri.status} · ${icone.src}` });
        }
      } catch (e) {
        liste.push({ libelle: 'Manifeste', ok: false, detail: `illisible : ${(e as Error).message}` });
      }

      liste.push({ libelle: 'Déjà ouverte comme application', ok: dejaInstallee() ? true : null, detail: dejaInstallee() ? 'oui' : 'non' });
      liste.push({ libelle: 'Navigateur', ok: null, detail: navigator.userAgent });
      if (actif) setEtats(liste);
    })();
    return () => {
      actif = false;
    };
  }, []);

  return (
    <div className={s.diagnostic} role="dialog" aria-label="Diagnostic de l'installation">
      <strong>Diagnostic de l’installation (PWA)</strong>
      <ul>
        {etats.map((e) => (
          <li key={e.libelle}>
            <span className={e.ok === true ? s.ok : e.ok === false ? s.ko : s.neutre}>{e.ok === true ? '✔' : e.ok === false ? '✖' : '•'}</span>
            <span>
              <b>{e.libelle}</b>
              <small>{e.detail}</small>
            </span>
          </li>
        ))}
        <li>
          <span className={possible ? s.ok : s.ko}>{possible ? '✔' : '✖'}</span>
          <span>
            <b>Chrome propose « Installer »</b>
            <small>{possible ? 'oui : utilisez le bouton « Installer »' : 'pas encore (attendez 30 s sur la page et interagissez, puis rechargez)'}</small>
          </span>
        </li>
      </ul>
      <button type="button" onClick={() => location.replace(location.pathname)}>
        Fermer
      </button>
    </div>
  );
}
