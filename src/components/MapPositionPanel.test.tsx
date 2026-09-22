/**
 * Business context: protects the compact desktop position panel so WGS 84 and
 * UTM remain unambiguous, copy actions use exactly the displayed coordinates,
 * and point-height failure never hides the local coordinate values.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { fromWgs84 } from '../map/projection';
import type { MapPositionInspection } from '../map/useMapPositionInspection';
import MapPositionPanel, {
  formatUtmMapPosition,
  formatWgs84MapPosition,
} from './MapPositionPanel';

/** Puerta del Sol, Madrid. */
const readyInspection: MapPositionInspection = {
  coordinate: fromWgs84([-3.7038, 40.4168]),
  wgs84Coordinate: [-3.7038, 40.4168],
  elevationStatus: 'ready',
  elevationMeters: 731.4,
};

describe('MapPositionPanel', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let clipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.setItem('via-augusta-language', 'es');
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
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

    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }

    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('formats WGS 84 and UTM in the intended user-facing order', () => {
    expect(formatWgs84MapPosition([-3.7038, 40.4168])).toBe(
      '40.41680, -3.70380',
    );
    expect(formatUtmMapPosition(readyInspection.coordinate)).toMatch(
      /^30 4402\d\d 44742\d\d$/,
    );
  });

  it('shows coordinates and elevation and copies each displayed coordinate', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onClose = vi.fn();

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(MapPositionPanel, {
            inspection: readyInspection,
            onClose,
          }),
        ),
      );
    });

    const utmText = formatUtmMapPosition(readyInspection.coordinate);

    expect(container.textContent).toContain('Posición en el mapa');
    expect(container.textContent).toContain('40.41680, -3.70380');
    expect(container.textContent).toContain(utmText);
    expect(container.textContent).toContain('731 m');

    const copyButtons = container.querySelectorAll<HTMLButtonElement>(
      '.map-position-copy',
    );
    expect(copyButtons).toHaveLength(2);

    await act(async () => copyButtons[0].click());
    await act(async () => copyButtons[1].click());

    expect(writeText).toHaveBeenNthCalledWith(1, '40.41680, -3.70380');
    expect(writeText).toHaveBeenNthCalledWith(2, utmText);

    container.querySelector<HTMLButtonElement>(
      '.map-information-choice-close',
    )?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps coordinates visible when elevation is unavailable', async () => {
    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          null,
          createElement(MapPositionPanel, {
            inspection: {
              ...readyInspection,
              elevationStatus: 'error',
              elevationMeters: null,
            },
            onClose: vi.fn(),
          }),
        ),
      );
    });

    expect(container.textContent).toContain('40.41680, -3.70380');
    expect(container.textContent).toContain('Altitud no disponible');
  });
});
