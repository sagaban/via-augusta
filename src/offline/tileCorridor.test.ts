/**
 * Business context: protects the tile plan that decides what a saved route
 * can show offline — enough context to navigate, without filling the phone.
 */
import { describe, expect, it } from 'vitest';
import { MAP_EXTENT } from '../map/config';
import { fromWgs84 } from '../map/projection';
import {
  OFFLINE_MAX_TILE_COUNT,
  OFFLINE_MAX_ZOOM,
  planOfflineTiles,
  tilesForCorridor,
  tilesForExtent,
} from './tileCorridor';

/** Straight test route in the Sierra de Guadarrama, about 10 km long. */
const ROUTE = [[fromWgs84([-4.0106, 40.7864]), fromWgs84([-3.8920, 40.7866])]];

describe('tilesForExtent', () => {
  it('matches the standard XYZ address of a known point', () => {
    const point = fromWgs84([-3.7038, 40.4168]);
    const [tile] = tilesForExtent([...point, ...point], 12);

    // Puerta del Sol lies in tile 12/2005/1544 of the Web Mercator grid.
    expect(tile).toEqual({ z: 12, x: 2005, y: 1544 });
  });
});

describe('tilesForCorridor', () => {
  it('stays proportional to the route instead of its bounding box', () => {
    const diagonal = [[fromWgs84([-4.2, 40.6]), fromWgs84([-3.8, 40.9])]];
    const corridor = tilesForCorridor(diagonal, 16);
    const [[start, end]] = diagonal;
    const box = tilesForExtent(
      [
        Math.min(start[0], end[0]),
        Math.min(start[1], end[1]),
        Math.max(start[0], end[0]),
        Math.max(start[1], end[1]),
      ],
      16,
    );

    expect(corridor.length).toBeGreaterThan(0);
    expect(corridor.length).toBeLessThan(box.length / 4);
  });

  it('keeps a buffer on both sides of the line', () => {
    const tiles = tilesForCorridor(ROUTE, 16);
    const rows = new Set(tiles.map((tile) => tile.y));

    // An east-west line with 1 km on each side spans several tile rows at z16.
    expect(rows.size).toBeGreaterThanOrEqual(4);
  });
});

describe('planOfflineTiles', () => {
  it('includes overview, regional, and detailed levels without duplicates', () => {
    const plan = planOfflineTiles(ROUTE, MAP_EXTENT);
    const zooms = new Set(plan.tiles.map((tile) => tile.z));
    const keys = new Set(plan.tiles.map(({ z, x, y }) => `${z}/${x}/${y}`));

    expect(plan.maxZoom).toBe(OFFLINE_MAX_ZOOM);
    expect([...zooms].sort((a, b) => a - b)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(keys.size).toBe(plan.tiles.length);
    expect(plan.tiles.length).toBeLessThan(1_000);
  });

  it('drops the closest zoom levels first when a route is extremely long', () => {
    const longRoute = [[fromWgs84([-8.5, 42.9]), fromWgs84([2.2, 41.4])]];
    const plan = planOfflineTiles(longRoute, MAP_EXTENT);

    expect(plan.maxZoom).toBeLessThan(OFFLINE_MAX_ZOOM);
    expect(plan.tiles.length).toBeLessThanOrEqual(OFFLINE_MAX_TILE_COUNT);
  });
});
