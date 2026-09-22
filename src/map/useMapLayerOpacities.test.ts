/**
 * Business context: protects the product defaults, explicit browser
 * preferences, and focused OpenLayers updates behind the shared information-
 * layer opacity sliders.
 */
import { act, createElement, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { MINIMUM_MAP_LAYER_OPACITY } from './config';
import type { MapRuntime } from './mapRuntime';
import {
  DEFAULT_MAP_LAYER_OPACITIES,
  normalizeMapLayerOpacity,
  resolveInitialMapLayerOpacities,
  useMapLayerOpacities,
  type MapLayerOpacitiesController,
} from './useMapLayerOpacities';

const HIKING_TRAILS_STORAGE_KEY =
  'via-augusta.hiking-trails-opacity';

interface OpacityHarnessProps {
  mapRuntimeRef: RefObject<MapRuntime | null>;
  onController: (controller: MapLayerOpacitiesController) => void;
}

/** Exposes the hook controller without introducing a second state owner. */
function OpacityHarness({
  mapRuntimeRef,
  onController,
}: OpacityHarnessProps) {
  onController(
    useMapLayerOpacities({
      mapRuntimeRef,
      initialOpacities: { ...DEFAULT_MAP_LAYER_OPACITIES },
    }),
  );

  return null;
}

/** Creates only the imperative setters exercised by the opacity hook. */
function createRuntimeHarness() {
  return {
    setHikingTrailsOpacity: vi.fn(),
  } as unknown as MapRuntime;
}

describe('map information-layer opacity preferences', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    root = null;
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it(
    'starts the hiking-route overlay at its readable default',
    () => {
      const opacities = resolveInitialMapLayerOpacities();

      expect(opacities.hikingTrails).toBe(0.8);
      expect(opacities).toEqual(DEFAULT_MAP_LAYER_OPACITIES);
    },
  );

  it('restores valid ratios and ignores malformed stored values', () => {
    window.localStorage.setItem(HIKING_TRAILS_STORAGE_KEY, '0.35');
    expect(resolveInitialMapLayerOpacities().hikingTrails).toBe(0.35);

    window.localStorage.setItem(HIKING_TRAILS_STORAGE_KEY, 'unexpected');
    expect(resolveInitialMapLayerOpacities().hikingTrails).toBe(
      DEFAULT_MAP_LAYER_OPACITIES.hikingTrails,
    );
  });

  it('migrates stored ratios that would leave a visible layer unreadable', () => {
    window.localStorage.setItem(HIKING_TRAILS_STORAGE_KEY, '0');

    expect(resolveInitialMapLayerOpacities().hikingTrails).toBe(
      MINIMUM_MAP_LAYER_OPACITY,
    );
  });

  it('clamps slider ratios to the user-adjustable range', () => {
    expect(normalizeMapLayerOpacity(-0.5)).toBe(
      MINIMUM_MAP_LAYER_OPACITY,
    );
    expect(normalizeMapLayerOpacity(0.1)).toBe(
      MINIMUM_MAP_LAYER_OPACITY,
    );
    expect(normalizeMapLayerOpacity(0.45)).toBe(0.45);
    expect(normalizeMapLayerOpacity(2)).toBe(1);
    expect(normalizeMapLayerOpacity(Number.NaN)).toBe(1);
  });

  it('persists and applies the visitor choice without writing defaults', async () => {
    const runtime = createRuntimeHarness();
    const mapRuntimeRef: RefObject<MapRuntime | null> = {
      current: runtime,
    };
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const controllerRef: {
      current: MapLayerOpacitiesController | null;
    } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(OpacityHarness, {
          mapRuntimeRef,
          onController: (nextController) => {
            controllerRef.current = nextController;
          },
        }),
      );
    });

    // Product defaults already reached OpenLayers during runtime construction;
    // mounting the React controller must not turn them into user preferences.
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(runtime.setHikingTrailsOpacity).not.toHaveBeenCalled();

    await act(async () => {
      controllerRef.current?.setLayerOpacity('hikingTrails', 0.5);
    });

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(
      HIKING_TRAILS_STORAGE_KEY,
      '0.5',
    );
    expect(runtime.setHikingTrailsOpacity).toHaveBeenCalledTimes(1);
    expect(runtime.setHikingTrailsOpacity).toHaveBeenCalledWith(0.5);
  });
});
