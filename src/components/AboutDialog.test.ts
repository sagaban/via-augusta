/**
 * Business context: protects the About dialog's consistent header dismissal and
 * ensures its initial focus announces the information panel instead of making
 * the first project link appear preselected.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import AboutDialog from './AboutDialog';

describe('AboutDialog', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let originalShowModal: PropertyDescriptor | undefined;
  let originalClose: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.setItem('via-augusta-language', 'es');
    window.history.replaceState({}, '', '/es/');

    originalShowModal = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'showModal',
    );
    originalClose = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'close',
    );

    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }

    container.remove();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');

    if (originalShowModal) {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'showModal',
        originalShowModal,
      );
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
        .showModal;
    }

    if (originalClose) {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'close',
        originalClose,
      );
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
    }

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('focuses the title and exposes one header close button', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(AboutDialog, {
            isOpen: true,
            onClose,
          }),
        ),
      );
    });

    expect(document.activeElement).toBe(
      container.querySelector('#about-dialog-title'),
    );
    expect(container.querySelector('.about-dialog-footer')).toBeNull();
    expect(container.querySelectorAll('.about-dialog button')).toHaveLength(1);
    expect(container.textContent).toContain('0.1.0');
    expect(container.textContent).toContain(
      'Via Augusta está pensada sobre todo para preparar una ruta en una pantalla grande',
    );
    expect(container.textContent).toContain(
      'Las rutas no se guardan en ningún servidor de Via Augusta',
    );
    expect(container.textContent).toContain('Via Helvetica (Philippe De Pol)');

    const closeButton = container.querySelector<HTMLButtonElement>(
      '.about-dialog-icon-close',
    );

    expect(closeButton?.getAttribute('aria-label')).toBe('Cerrar');
    expect(closeButton?.textContent).toBe('×');

    await act(async () => {
      closeButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      language: 'es',
      expected:
        'Via Augusta está pensada sobre todo para preparar una ruta en una pantalla grande',
    },
    {
      language: 'en',
      expected:
        'Via Augusta is designed primarily for planning a route on a large screen',
    },
  ])(
    'localizes the intended-use guidance in $language',
    async ({ language, expected }) => {
      window.localStorage.setItem('via-augusta-language', language);
      window.history.replaceState({}, '', `/${language}/`);

      await act(async () => {
        root?.render(
          createElement(
            I18nProvider,
            null,
            createElement(AboutDialog, {
              isOpen: true,
              onClose: vi.fn(),
            }),
          ),
        );
      });

      expect(container.textContent).toContain(expected);
    },
  );

  it.each([
    {
      language: 'es',
      expected: [
        'Mapas y ortofotos',
        'CC BY 4.0 scne.es · IGN',
        '© Waymarked Trails',
        '© OpenStreetMap',
        'BRouter',
        'Photon',
        'Copernicus DEM GLO-90',
        'método MIDE',
      ],
    },
    {
      language: 'en',
      expected: [
        'Maps and orthophotos',
        'CC BY 4.0 scne.es · IGN',
        '© Waymarked Trails',
        'BRouter',
        'Open-Meteo',
        'MIDE method',
      ],
    },
  ])(
    'localizes map and data credits in $language',
    async ({ language, expected }) => {
      window.localStorage.setItem('via-augusta-language', language);
      window.history.replaceState({}, '', `/${language}/`);

      await act(async () => {
        root?.render(
          createElement(
            I18nProvider,
            null,
            createElement(AboutDialog, {
              isOpen: true,
              onClose: vi.fn(),
            }),
          ),
        );
      });

      for (const text of expected) {
        expect(container.textContent).toContain(text);
      }
    },
  );
});
