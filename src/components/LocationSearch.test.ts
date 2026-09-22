/**
 * Business context: protects the shared search combobox against interaction
 * regressions in keyboard navigation, mobile presentation, local coordinate
 * handling, and active-option tracking without a browser-level map test.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import {
  clearLocationSearchCache,
  searchLocations,
} from '../search/locationSearch';
import LocationSearch from './LocationSearch';

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('LocationSearch keyboard navigation', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    clearLocationSearchCache();
    window.localStorage.setItem('via-augusta-language', 'en');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    clearLocationSearchCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('supports Home and End and keeps the active option visible', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        type: 'FeatureCollection',
        features: [
          {
            geometry: { coordinates: [-4.0152, 40.7288] },
            properties: {
              osm_type: 'N',
              osm_id: 1,
              osm_key: 'place',
              osm_value: 'village',
              name: 'Navacerrada',
              state: 'Comunidad de Madrid',
            },
          },
          {
            geometry: { coordinates: [-4.0578, 40.7408] },
            properties: {
              osm_type: 'N',
              osm_id: 2,
              osm_key: 'place',
              osm_value: 'village',
              name: 'Cercedilla',
              state: 'Comunidad de Madrid',
            },
          },
          {
            geometry: { coordinates: [-3.8805, 40.9039] },
            properties: {
              osm_type: 'N',
              osm_id: 3,
              osm_key: 'place',
              osm_value: 'village',
              name: 'Rascafría',
              state: 'Comunidad de Madrid',
            },
          },
        ],
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    await searchLocations(
      'sierra',
      'en',
      new AbortController().signal,
    );

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(LocationSearch, {
            onSearchFocus: vi.fn(),
            onSelect: vi.fn(),
            onClear: vi.fn(),
          }),
        ),
      );
    });

    const input = container.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, 'sierra');
    });

    const options = Array.from(
      container.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    expect(options).toHaveLength(3);

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'End',
          bubbles: true,
        }),
      );
    });

    expect(options[2].getAttribute('aria-selected')).toBe('true');

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Home',
          bubbles: true,
        }),
      );
    });

    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('focuses and dismisses the narrow-screen search surface', async () => {
    const onMobileOverlayClose = vi.fn();

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(LocationSearch, {
            isMobileOverlayOpen: true,
            onMobileOverlayClose,
            onSearchFocus: vi.fn(),
            onSelect: vi.fn(),
            onClear: vi.fn(),
          }),
        ),
      );
    });

    const search = container.querySelector<HTMLElement>('.location-search');
    const input = container.querySelector<HTMLInputElement>('input');
    const closeButton = container.querySelector<HTMLButtonElement>(
      '.location-search-mobile-close',
    );

    expect(search?.classList.contains('location-search--mobile-open')).toBe(
      true,
    );
    expect(document.activeElement).toBe(input);
    expect(closeButton?.getAttribute('aria-label')).toBe('Close search');

    await act(async () => {
      closeButton?.click();
    });

    expect(onMobileOverlayClose).toHaveBeenCalledTimes(1);
  });
});

describe('LocationSearch coordinate entry', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    clearLocationSearchCache();
    window.localStorage.setItem('via-augusta-language', 'en');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    clearLocationSearchCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a local coordinate result and selects it with Enter without fetching', async () => {
    const fetchMock = vi.fn();
    const onSelect = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(LocationSearch, {
            onSearchFocus: vi.fn(),
            onSelect,
            onClear: vi.fn(),
          }),
        ),
      );
    });

    const input = container.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    expect(input?.placeholder).toBe('Place or coordinates…');
    expect(input?.hasAttribute('aria-controls')).toBe(false);

    await act(async () => {
      setInputValue(input!, '30T 440291 4474254');
    });

    const option = container.querySelector<HTMLElement>('[role="option"]');
    expect(option?.textContent).toContain('30 440291 4474254');
    expect(option?.textContent).toContain('ETRS89 UTM coordinates');
    expect(option?.tabIndex).toBe(-1);
    expect(input?.getAttribute('aria-controls')).toBe(
      option?.closest('[role="listbox"]')?.id,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }),
      );
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      origin: 'utm',
      label: '30 440291 4474254',
    });
    expect(input?.hasAttribute('aria-controls')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unfinished coordinates local while preserving postal-code search', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ features: [] }),
    );

    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(LocationSearch, {
            onSearchFocus: vi.fn(),
            onSelect: vi.fn(),
            onClear: vi.fn(),
          }),
        ),
      );
    });

    const input = container.querySelector<HTMLInputElement>('input');

    await act(async () => {
      setInputValue(input!, '30 440291 44');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(input?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      setInputValue(input!, '28013');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('searches again after editing a selected coordinate with an unchanged label', async () => {
    const fetchMock = vi.fn();
    const onClear = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(LocationSearch, {
            onSearchFocus: vi.fn(),
            onSelect: vi.fn(),
            onClear,
          }),
        ),
      );
    });

    const input = container.querySelector<HTMLInputElement>('input');

    await act(async () => {
      setInputValue(input!, '40.417, -3.704');
    });

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }),
      );
    });

    await act(async () => {
      setInputValue(input!, '40.417, -3.705');
    });

    const option = container.querySelector<HTMLElement>('[role="option"]');

    expect(option?.textContent).toContain('40.417, -3.705');
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notifies the map when the selected search context is cleared', async () => {
    const onClear = vi.fn();

    vi.stubGlobal('fetch', vi.fn());

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(LocationSearch, {
            onSearchFocus: vi.fn(),
            onSelect: vi.fn(),
            onClear,
          }),
        ),
      );
    });

    const input = container.querySelector<HTMLInputElement>('input');

    await act(async () => {
      setInputValue(input!, '40.417, -3.704');
    });

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }),
      );
    });

    const clearButton = container.querySelector<HTMLButtonElement>(
      '.location-search-clear',
    );

    await act(async () => {
      clearButton?.click();
    });

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input?.value).toBe('');
  });

  it('explains when a valid coordinate is outside the map', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(LocationSearch, {
            onSearchFocus: vi.fn(),
            onSelect: vi.fn(),
            onClear: vi.fn(),
          }),
        ),
      );
    });

    const input = container.querySelector<HTMLInputElement>('input');

    await act(async () => {
      setInputValue(input!, '48.8566, 2.3522');
    });

    expect(container.textContent).toContain(
      'These coordinates are outside the area covered by the map.',
    );
  });
});
