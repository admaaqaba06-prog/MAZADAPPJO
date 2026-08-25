import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Dissolve the boot splash.
 *
 * The overlay lives in index.html as a SIBLING of #root, because createRoot()
 * replaces #root's children the moment React mounts — a splash inside it can
 * only cut, never fade.
 *
 * NO TIMER GATES THE NORMAL PATH, and there is no minimum display time. The
 * fade starts on the first frame after React has painted, so a fast load gets a
 * fast dissolve. The double requestAnimationFrame is what buys "has painted"
 * rather than "has rendered": render() only schedules the commit, so one frame
 * later the DOM exists and the second frame is after the browser has actually
 * put it on screen. Fading on the first would dissolve to a blank page.
 *
 * BUT rAF DOES NOT FIRE IN A PAGE THAT IS NOT BEING PAINTED. A link opened in a
 * background tab — an entirely ordinary thing for users to do — loads, mounts,
 * and never gets a frame, so an rAF-only dismissal leaves the splash pinned over
 * a fully loaded app until the user switches to the tab and even then only if
 * something re-arms it. Measured directly: with visibilityState 'hidden', zero
 * rAF callbacks ran in 800ms.
 *
 * So the dismissal is armed from two independent directions and guarded by a
 * flag so it only happens once. rAF wins whenever the page is visible, which is
 * the overwhelmingly common case and stays frame-accurate; the timeout is what
 * covers the hidden-tab case. The timeout does not slow the normal path down —
 * it is simply never the one that gets there first.
 *
 * Note this is the SHELL being ready, not the session. If Firebase is still
 * restoring auth, App renders <BootSplash />, which is styled identically — so
 * the handoff is invisible and the wait keeps looking like one continuous
 * screen rather than two loaders in a row.
 */
function dismissBootSplash(): void {
  const overlay = document.getElementById('boot-overlay');
  if (!overlay) return;

  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;

    overlay.classList.add('boot-splash--out');
    overlay.setAttribute('aria-busy', 'false');

    // Remove after the fade so the overlay can never trap a click. The timeout
    // is a backstop for every case where transitionend does not arrive: a
    // hidden tab runs no transitions at all, reduced-motion may collapse it,
    // and a backgrounded tab mid-fade simply stops.
    const remove = () => overlay.remove();
    overlay.addEventListener('transitionend', remove, { once: true });
    window.setTimeout(remove, 600);
  };

  // The normal path: the frame after the app has actually painted.
  requestAnimationFrame(() => {
    requestAnimationFrame(dismiss);
  });

  // The hidden-tab path. Also covers a tab that becomes visible later, where
  // rAF only resumes on focus.
  window.setTimeout(dismiss, 1500);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') dismiss();
  }, { once: true });
}

dismissBootSplash();

// Register the PWA Service Worker (only in production to avoid caching issues during development)
if ('serviceWorker' in navigator) {
  if ((import.meta as any).env?.DEV) {
    // Unregister any active service workers in development to prevent fetch and caching issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Successfully unregistered stale service worker in development');
          }
        });
      }
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('MAZZADO Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('MAZZADO Service Worker registration failed:', err);
        });
    });
  }
}

