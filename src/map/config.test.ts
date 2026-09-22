/**
 * Business context: protects centralized map limits and provider contracts.
 * Wrong geographic bounds can accept unrelated coordinates, while a wrong
 * rendered-layer identifier can leave an apparently functional control blank.
 */
import { describe, expect, it } from 'vitest';
import {
  COORDINATE_SEARCH_ZOOM,
  createBaseMapSource,
  createHikingTrailsSource,
  DEFAULT_HIKING_TRAILS_OPACITY,
  isWgs84CoordinateInsideMapBounds,
  LOCATION_SEARCH_ZOOM,
  USER_LOCATION_ZOOM,
} from './config';

describe('IGN backgrounds', () => {
  it('uses the official WMTS layers in the GoogleMapsCompatible grid', () => {
    const color = createBaseMapSource('color');
    const gray = createBaseMapSource('gray');
    const aerial = createBaseMapSource('aerial');

    expect(color.getLayer()).toBe('MTN');
    expect(color.getUrls()).toEqual(['https://www.ign.es/wmts/mapa-raster']);
    expect(gray.getLayer()).toBe('IGNBase-gris');
    expect(aerial.getLayer()).toBe('OI.OrthoimageCoverage');

    for (const source of [color, gray, aerial]) {
      expect(source.getMatrixSet()).toBe('GoogleMapsCompatible');
      expect(source.getRequestEncoding()).toBe('KVP');
    }
  });
});

describe('hiking overlay', () => {
  it('uses the Waymarked Trails hiking tiles with a readable default opacity', () => {
    expect(createHikingTrailsSource().getUrls()).toEqual([
      'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
    ]);
    expect(DEFAULT_HIKING_TRAILS_OPACITY).toBe(0.8);
  });
});

describe('WGS 84 map bounds', () => {
  it('accepts the peninsula and both archipelagos but not distant coordinates', () => {
    expect(isWgs84CoordinateInsideMapBounds([-3.7038, 40.4168])).toBe(true); // Madrid
    expect(isWgs84CoordinateInsideMapBounds([-16.6425, 28.2724])).toBe(true); // Teide
    expect(isWgs84CoordinateInsideMapBounds([2.65, 39.57])).toBe(true); // Palma
    expect(isWgs84CoordinateInsideMapBounds([8.383, 46.987])).toBe(false); // Switzerland
    expect(isWgs84CoordinateInsideMapBounds([-174, -48])).toBe(false);
  });
});

describe('search zoom policy', () => {
  it('frames exact coordinates closer than place results', () => {
    expect(COORDINATE_SEARCH_ZOOM).toBe(USER_LOCATION_ZOOM);
    expect(COORDINATE_SEARCH_ZOOM).toBeGreaterThan(LOCATION_SEARCH_ZOOM);
  });
});
