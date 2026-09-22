/**
 * Business context: centralizes deployment identity so the same build works
 * on a custom domain or below a GitHub Pages project path such as
 * `/via-augusta/`. Vite provides the base path; the public site URL and
 * repository link are optional build variables.
 */

/** Root-relative application base path, always ending with `/`. */
export const BASE_PATH: string = (() => {
  const base = (import.meta.env as Record<string, unknown> | undefined)
    ?.BASE_URL;
  const value = typeof base === 'string' && base ? base : '/';
  return value.endsWith('/') ? value : `${value}/`;
})();

/** Reads an optional non-empty build variable. */
function readEnvironmentString(key: string): string | null {
  const value = (import.meta.env as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Public site URL including the base path, ending with `/`. Falls back to the
 * current browser origin so local development and previews stay coherent.
 */
export function siteUrl(): string {
  const configured = readEnvironmentString('VITE_SITE_URL');

  if (configured) {
    return configured.endsWith('/') ? configured : `${configured}/`;
  }

  return typeof window === 'undefined'
    ? BASE_PATH
    : `${window.location.origin}${BASE_PATH}`;
}

/** Public source repository of this deployment, when configured. */
export const REPOSITORY_URL = readEnvironmentString('VITE_REPOSITORY_URL');

/** Upstream project this application is derived from. */
export const UPSTREAM_PROJECT = {
  name: 'Via Helvetica',
  author: 'Philippe De Pol',
  url: 'https://github.com/egofree71/via-helvetica',
} as const;
