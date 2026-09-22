/**
 * Business context: retrieves one terrain elevation for explicit map-position
 * inspection without building a route profile. The request stays independent
 * from itinerary metrics so a desktop right-click can fail without affecting
 * route planning or any current itinerary.
 */
import type { Coordinate } from 'ol/coordinate.js';
import { fetchElevations } from '../elevation/openMeteoElevation';
import { toWgs84 } from './projection';

/**
 * Fetches the terrain elevation for one map coordinate.
 *
 * @param coordinate - Point in the application's map projection.
 * @param signal - Abort signal invalidated by a newer click, dismissal, or unmount.
 * @returns Terrain elevation in metres.
 * @throws {Error} When the provider fails or returns an invalid height.
 */
export async function fetchPointHeight(
  coordinate: Coordinate,
  signal: AbortSignal,
): Promise<number> {
  const [x, y] = coordinate;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Point-height lookup requires a finite map coordinate.');
  }

  const [heightMeters] = await fetchElevations([toWgs84(coordinate)], signal);
  return heightMeters;
}
