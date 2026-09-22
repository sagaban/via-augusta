/**
 * Business context: protects the product-level limit that keeps one snapped
 * route section close enough for a hiker to express the intended corridor.
 * The check must remain purely local, geodesic (Web Mercator inflates planar
 * distances at Spanish latitudes), and reject overlong sections before any
 * routing request can begin.
 */
import { getDistance } from 'ol/sphere.js';
import { describe, expect, it } from 'vitest';
import { fromWgs84 } from '../map/projection';
import { MAX_NETWORK_SECTION_DIRECT_DISTANCE_METERS } from './routingConstants';
import {
  assertNetworkRouteSectionDistance,
  getRouteSectionDirectDistanceMeters,
  RouteSectionTooLongError,
} from './routeSectionLimit';

/** Degrees of latitude spanning roughly the requested distance along a meridian. */
function latitudeOffset(distanceMeters: number): number {
  return distanceMeters / 111_132;
}

describe('routeSectionLimit', () => {
  const start = fromWgs84([-3.7, 40.4]);

  it('accepts a section just below the limit and rejects one just above', () => {
    const below = fromWgs84([
      -3.7,
      40.4 + latitudeOffset(MAX_NETWORK_SECTION_DIRECT_DISTANCE_METERS - 200),
    ]);
    const above = fromWgs84([
      -3.7,
      40.4 + latitudeOffset(MAX_NETWORK_SECTION_DIRECT_DISTANCE_METERS + 200),
    ]);

    expect(() => assertNetworkRouteSectionDistance(start, below)).not.toThrow();
    expect(() => assertNetworkRouteSectionDistance(start, above)).toThrow(
      RouteSectionTooLongError,
    );
  });

  it('measures geodesic rather than inflated Web Mercator distance', () => {
    const end = fromWgs84([-3.6, 40.4]);
    const planarDistance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const directDistance = getRouteSectionDirectDistanceMeters(start, end);

    expect(directDistance).toBeCloseTo(getDistance([-3.7, 40.4], [-3.6, 40.4]), 3);
    expect(planarDistance / directDistance).toBeGreaterThan(1.25);
  });

  it('reports the direct distance and configured maximum', () => {
    const end = fromWgs84([-3.7, 40.4 + latitudeOffset(25_000)]);

    try {
      assertNetworkRouteSectionDistance(start, end);
      throw new Error('Expected the route section to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(RouteSectionTooLongError);
      expect((error as RouteSectionTooLongError).distanceMeters).toBeCloseTo(
        25_000,
        -2,
      );
      expect(
        (error as RouteSectionTooLongError).maximumDistanceMeters,
      ).toBe(MAX_NETWORK_SECTION_DIRECT_DISTANCE_METERS);
    }
  });
});
