/**
 * Business context: protects the compact release announcement, its localized
 * static-history link, and acknowledgement actions on small map viewports.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import ReleaseNotesDialog from './ReleaseNotesDialog';

describe('ReleaseNotesDialog', () => {
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

  it('lists the first-release highlights in the compact dialog', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(ReleaseNotesDialog, {
            isOpen: true,
            onClose,
          }),
        ),
      );
    });

    expect(
      container.querySelectorAll('.release-notes-list > li'),
    ).toHaveLength(4);
    expect(container.textContent).toContain('Novedades de Via Augusta 0.1.0');
    expect(container.textContent).toContain('Mapas oficiales del IGN:');

    const historyLink = container.querySelector<HTMLAnchorElement>(
      '.release-notes-dialog-footer a',
    );

    expect(historyLink?.getAttribute('href')).toBe('/es/releases/');
    expect(historyLink?.target).toBe('_blank');
  });
});
