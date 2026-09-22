/**
 * Business context: configures the localized static application. The base
 * path comes from `VITE_BASE_PATH` so the same build can be served from a
 * custom domain root or below a GitHub Pages project path.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Normalizes the deployment base path to `/…/`. */
function resolveBasePath(): string {
  const value = process.env.VITE_BASE_PATH || '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
  build: {
    rolldownOptions: {
      // Each generated HTML file keeps its directory in dist for GitHub Pages.
      input: [
        'index.html',
        'es/index.html',
        'en/index.html',
        'releases/index.html',
        'es/releases/index.html',
        'en/releases/index.html',
      ],
    },
  },
});
