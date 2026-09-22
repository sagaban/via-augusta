/**
 * Business context: protects the product default and browser persistence used
 * by the optional hiking-route overlay.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveInitialHikingTrailsVisibility } from './useMapViewControls';

const HIKING_TRAILS_STORAGE_KEY = 'via-augusta.hiking-trails-visible';

describe('initial rendered-layer visibility', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the hiking-route overlay enabled for new visitors', () => {
    expect(resolveInitialHikingTrailsVisibility()).toBe(true);
  });

  it('restores an explicit choice from browser storage', () => {
    window.localStorage.setItem(HIKING_TRAILS_STORAGE_KEY, 'false');

    expect(resolveInitialHikingTrailsVisibility()).toBe(false);
  });
});
