/**
 * Business context: protects localized entry URLs and client-side language
 * changes so switching language never reloads the map or loses route state.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  I18nProvider,
  languageFromPathname,
  useI18n,
} from './I18nContext';

function LanguageProbe() {
  const { language, setLanguage } = useI18n();

  return createElement(
    'div',
    null,
    createElement('output', { 'data-language': true }, language),
    createElement(
      'button',
      { type: 'button', onClick: () => setLanguage('en') },
      'EN',
    ),
  );
}

describe('localized language URLs', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    document.head.innerHTML = `
      <meta name="description" content="" />
      <link rel="canonical" href="https://example.org/" />
      <meta property="og:locale" content="es_ES" />
      <meta property="og:locale:alternate" content="en_GB" />
      <meta property="og:title" content="" />
      <meta property="og:description" content="" />
      <meta property="og:url" content="" />
      <meta property="og:image:alt" content="" />
      <meta name="twitter:title" content="" />
      <meta name="twitter:description" content="" />
      <meta name="twitter:image:alt" content="" />
      <script id="structured-data" type="application/ld+json">{}</script>
    `;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }

    container.remove();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('recognizes only supported root language segments', () => {
    expect(languageFromPathname('/es/')).toBe('es');
    expect(languageFromPathname('/en/?map=1')).toBe('en');
    expect(languageFromPathname('/fr/')).toBeNull();
    expect(languageFromPathname('/benchmarks/routing/')).toBeNull();
    expect(languageFromPathname('/')).toBeNull();
  });

  it('gives the localized path priority over a stored preference', async () => {
    window.localStorage.setItem('via-augusta-language', 'en');
    window.history.replaceState({}, '', '/es/');

    await act(async () => {
      root?.render(createElement(I18nProvider, null, createElement(LanguageProbe)));
    });

    expect(container.querySelector('output')?.textContent).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toContain('Planificador');
    expect(
      JSON.parse(
        document.querySelector<HTMLScriptElement>('#structured-data')
          ?.textContent ?? '{}',
      ).inLanguage,
    ).toBe('es');
    expect(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ).toBe(`${window.location.origin}/es/`);
  });

  it('changes the path without navigation and preserves query and hash', async () => {
    window.localStorage.setItem('via-augusta-language', 'es');
    window.history.replaceState({}, '', '/es/?map=1#route');
    const pushState = vi.spyOn(window.history, 'pushState');

    await act(async () => {
      root?.render(createElement(I18nProvider, null, createElement(LanguageProbe)));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/en/');
    expect(window.location.search).toBe('?map=1');
    expect(window.location.hash).toBe('#route');
    expect(container.querySelector('output')?.textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('normalizes the x-default root to the resolved localized path', async () => {
    window.localStorage.setItem('via-augusta-language', 'en');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    await act(async () => {
      root?.render(createElement(I18nProvider, null, createElement(LanguageProbe)));
    });

    expect(window.location.pathname).toBe('/en/');
    expect(container.querySelector('output')?.textContent).toBe('en');
    expect(replaceState).toHaveBeenCalledWith(
      expect.objectContaining({ viaAugustaLanguage: 'en' }),
      '',
      '/en/',
    );
    expect(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ).toBe(`${window.location.origin}/en/`);
  });
});
