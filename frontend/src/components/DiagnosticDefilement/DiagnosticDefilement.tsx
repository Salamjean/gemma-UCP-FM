import { useEffect, useRef, useState } from 'react';
import s from './DiagnosticDefilement.module.css';

/** Activé depuis « Mon profil » ; reste actif (même après rechargement) jusqu'à « Fermer » */
export const CLE_DIAGNOSTIC_DEFILEMENT = 'gemma-diagnostic-defilement';
export const EVT_DIAGNOSTIC_DEFILEMENT = 'gemma-diagnostic-defilement';

export const diagnosticDefilementActif = () => {
  try {
    return localStorage.getItem(CLE_DIAGNOSTIC_DEFILEMENT) === '1';
  } catch {
    return false;
  }
};

export const activerDiagnosticDefilement = (actif: boolean) => {
  try {
    if (actif) localStorage.setItem(CLE_DIAGNOSTIC_DEFILEMENT, '1');
    else localStorage.removeItem(CLE_DIAGNOSTIC_DEFILEMENT);
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new Event(EVT_DIAGNOSTIC_DEFILEMENT));
};

/** Nom court d'un élément : balise.classe#id */
const nomElement = (el: Element | null) => {
  if (!el) return '—';
  if (el === document.documentElement) return 'html';
  if (el === document.body) return 'body';
  const classe = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${classe}`.slice(0, 80);
};

/** Premier ancêtre qui peut défiler verticalement (overflow auto/scroll ET contenu plus haut que la zone) */
const defilableVertical = (el: Element | null): Element | null => {
  let x: Element | null = el;
  while (x && x !== document.body && x !== document.documentElement) {
    const st = getComputedStyle(x);
    if (/(auto|scroll)/.test(st.overflowY) && x.scrollHeight > x.clientHeight + 1) return x;
    x = x.parentElement;
  }
  return document.scrollingElement;
};

/** touch-action le plus restrictif sur le chemin du doigt (« none » / « pan-x » bloquent le défilement vertical) */
const touchActions = (el: Element | null) => {
  const res: string[] = [];
  let x: Element | null = el;
  while (x) {
    const ta = getComputedStyle(x).touchAction;
    if (ta && ta !== 'auto') res.push(`${nomElement(x)} → ${ta}`);
    x = x.parentElement;
  }
  return res;
};

const styleDe = (el: Element | null) => {
  if (!el) return '—';
  const st = getComputedStyle(el);
  return `overflow ${st.overflowX}/${st.overflowY} · h ${Math.round(el.clientHeight)}/${Math.round(el.scrollHeight)} · position ${st.position}`;
};

interface Mesures {
  geste: string;
  zone: string;
  touchAction: string[];
  mouvements: number;
  bloques: number;
  dernierDefilement: string;
  defilementsPage: number;
}

/**
 * DIAGNOSTIC DU DÉFILEMENT (tablette / PWA installée) — panneau qui laisse passer les gestes vers la page.
 * Montre le mode (application ou navigateur), le conteneur qui fait défiler la page, et, pendant un essai de défilement :
 * où le doigt s'est posé, quelle zone capte le geste, les « touch-action », les gestes bloqués par un script.
 */
export default function DiagnosticDefilement() {
  const [actif, setActif] = useState(diagnosticDefilementActif());
  const [, setTick] = useState(0);
  const [copie, setCopie] = useState(false);
  const m = useRef<Mesures>({ geste: '—', zone: '—', touchAction: [], mouvements: 0, bloques: 0, dernierDefilement: '—', defilementsPage: 0 });

  useEffect(() => {
    const maj = () => setActif(diagnosticDefilementActif());
    window.addEventListener(EVT_DIAGNOSTIC_DEFILEMENT, maj);
    return () => window.removeEventListener(EVT_DIAGNOSTIC_DEFILEMENT, maj);
  }, []);

  useEffect(() => {
    if (!actif) return;
    const rafraichir = () => setTick((t) => t + 1);
    const debut = (e: TouchEvent) => {
      const cible = e.target as Element | null;
      const zone = defilableVertical(cible);
      m.current = {
        ...m.current,
        geste: nomElement(cible),
        zone: `${nomElement(zone)} (${styleDe(zone)})`,
        touchAction: touchActions(cible),
        mouvements: 0,
        bloques: 0,
      };
      rafraichir();
    };
    // Après les autres écouteurs (phase de bouillonnement sur window) : a-t-on bloqué le geste ?
    const mouvement = (e: TouchEvent) => {
      m.current.mouvements += 1;
      if (e.defaultPrevented) m.current.bloques += 1;
      if (m.current.mouvements % 5 === 1) rafraichir();
    };
    const defilement = (e: Event) => {
      const t = e.target;
      const el = t === document ? document.scrollingElement : (t as Element);
      m.current.dernierDefilement = `${nomElement(el)} (scrollTop ${Math.round((el as Element)?.scrollTop ?? 0)})`;
      if (t === document) m.current.defilementsPage += 1;
      rafraichir();
    };
    window.addEventListener('touchstart', debut, { passive: true, capture: true });
    window.addEventListener('touchmove', mouvement, { passive: true });
    document.addEventListener('scroll', defilement, { passive: true, capture: true });
    const t = setInterval(rafraichir, 1500);
    return () => {
      window.removeEventListener('touchstart', debut, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', mouvement);
      document.removeEventListener('scroll', defilement, { capture: true } as EventListenerOptions);
      clearInterval(t);
    };
  }, [actif]);

  if (!actif) return null;

  const se = document.scrollingElement;
  const vv = window.visualViewport;
  const mode = ['standalone', 'minimal-ui', 'fullscreen', 'browser'].find((x) => window.matchMedia(`(display-mode: ${x})`).matches) ?? '?';
  const lignes: [string, string][] = [
    ['Mode', `${mode === 'browser' ? 'navigateur' : `application installée (${mode})`}`],
    ['Écran', `fenêtre ${window.innerWidth}×${window.innerHeight} · visible ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} zoom ${vv.scale.toFixed(2)}` : '?'} · dpr ${window.devicePixelRatio}`],
    ['Page défile par', `${nomElement(se)} · scrollTop ${Math.round(se?.scrollTop ?? 0)} / max ${Math.round((se?.scrollHeight ?? 0) - (se?.clientHeight ?? 0))}`],
    ['html', styleDe(document.documentElement)],
    ['body', styleDe(document.body)],
    // Origine d'un blocage : style posé par un script (menu ☰) ou classes de SweetAlert2
    ['Blocage body', `style « ${document.body.style.overflow || '—'} » · classes « ${document.body.className || '—'} » · html « ${document.documentElement.className || '—'} »`],
    ['#root', styleDe(document.getElementById('root'))],
    ['Doigt posé sur', m.current.geste],
    ['Zone qui capte', m.current.zone],
    ['touch-action', m.current.touchAction.length ? m.current.touchAction.slice(0, 3).join(' | ') : 'aucune restriction'],
    ['Mouvements', `${m.current.mouvements} (bloqués par un script : ${m.current.bloques})`],
    ['Dernier défilement', `${m.current.dernierDefilement} · défilements de la page : ${m.current.defilementsPage}`],
    ['Navigateur', navigator.userAgent],
  ];
  const texte = lignes.map(([a, b]) => `${a} : ${b}`).join('\n');

  return (
    <div className={s.panneau} role="status" aria-live="off">
      <div className={s.entete}>
        <strong>Diagnostic du défilement</strong>
        <span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(texte)
                .then(() => {
                  setCopie(true);
                  setTimeout(() => setCopie(false), 1500);
                })
                .catch(() => undefined);
            }}
          >
            {copie ? 'Copié' : 'Copier'}
          </button>
          <button type="button" onClick={() => activerDiagnosticDefilement(false)}>
            Fermer
          </button>
        </span>
      </div>
      <dl>
        {lignes.map(([a, b]) => (
          <div key={a}>
            <dt>{a}</dt>
            <dd>{b}</dd>
          </div>
        ))}
      </dl>
      <p>Essayez de faire défiler la page verticalement (là où ça bloque), puis copiez ce texte ou faites une capture.</p>
    </div>
  );
}
