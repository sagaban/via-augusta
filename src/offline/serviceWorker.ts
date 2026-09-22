/**
 * Business context: registers the offline service worker in production builds
 * and hands it the URLs of the scripts and styles the page actually loaded.
 * Hashed Vite assets are unknown to the worker at install time, and the first
 * visit loads them before the worker controls the page, so this explicit hand-
 * off is what makes the application start without a network afterwards.
 */
import { BASE_PATH } from '../site';

/** Collects same-origin script, style, icon, and manifest URLs of the page. */
function collectAppShellUrls(): string[] {
  const urls = new Set<string>([window.location.href.split('#')[0]]);

  document
    .querySelectorAll<HTMLScriptElement>('script[src]')
    .forEach((element) => urls.add(element.src));
  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"], link[rel="modulepreload"], link[rel="icon"], link[rel="manifest"], link[rel="apple-touch-icon"]',
    )
    .forEach((element) => urls.add(element.href));

  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.name.startsWith(window.location.origin)) {
      urls.add(entry.name);
    }
  }

  return [...urls].filter((url) => url.startsWith(window.location.origin));
}

/** Sends the current app shell to the active worker for caching. */
export async function cacheAppShell(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: 'cache-app-shell',
    urls: collectAppShellUrls(),
  });
}

/** Registers the worker once the page has loaded (production only). */
export function registerOfflineServiceWorker(): void {
  const isProduction = Boolean(
    (import.meta.env as Record<string, unknown> | undefined)?.PROD,
  );

  if (!isProduction || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${BASE_PATH}sw.js`, { scope: BASE_PATH })
      .then(() => cacheAppShell())
      .catch((error) => {
        console.error('Unable to register the offline service worker.', error);
      });
  });
}
