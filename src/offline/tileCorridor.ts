/**
 * Business context: decides which map tiles must be stored so a saved route
 * stays usable without a network connection. Instead of the route's bounding
 * box, which explodes for diagonal routes at close zooms, only the tiles inside
 * a corridor around the line are kept, plus a small national overview so the
 * map never opens on an empty canvas.
 */
import type { Coordinate } from 'ol/coordinate.js';
import type { Extent } from 'ol/extent.js';
import { toWgs84 } from '../map/projection';

/** Half the side of the Web Mercator square in metres. */
const WEB_MERCATOR_HALF_SIZE = 20_037_508.342_789_244;

/** Closest zoom level stored for offline use (MTN 1:25,000 detail). */
export const OFFLINE_MAX_ZOOM = 16;
/** First zoom level at which only the route corridor is stored. */
export const OFFLINE_CORRIDOR_MIN_ZOOM = 10;
/** Zoom levels stored for the whole route bounding box (regional context). */
export const OFFLINE_ROUTE_BBOX_ZOOMS = [8, 9] as const;
/** Zoom levels stored for the whole country so the start view is never blank. */
export const OFFLINE_OVERVIEW_ZOOMS = [5, 6, 7] as const;

/**
 * Ground distance in metres kept on each side of the route. One kilometre
 * covers detours, nearby huts, and bail-out paths without multiplying storage.
 */
export const OFFLINE_CORRIDOR_BUFFER_METERS = 1_000;

/** Safety cap so an unusually long route cannot fill the device storage. */
export const OFFLINE_MAX_TILE_COUNT = 5_000;

/** One XYZ tile address in the GoogleMapsCompatible grid. */
export interface TileAddress {
  z: number;
  x: number;
  y: number;
}

/** Side length of one tile in map units at a zoom level. */
function tileSize(zoom: number): number {
  return (2 * WEB_MERCATOR_HALF_SIZE) / 2 ** zoom;
}

/** Clamps a tile index to the valid range of a zoom level. */
function clampIndex(value: number, zoom: number): number {
  return Math.min(2 ** zoom - 1, Math.max(0, value));
}

/** Column of the tile that contains one map x coordinate. */
function tileX(x: number, zoom: number): number {
  return clampIndex(
    Math.floor((x + WEB_MERCATOR_HALF_SIZE) / tileSize(zoom)),
    zoom,
  );
}

/** Row of the tile that contains one map y coordinate (rows grow southward). */
function tileY(y: number, zoom: number): number {
  return clampIndex(
    Math.floor((WEB_MERCATOR_HALF_SIZE - y) / tileSize(zoom)),
    zoom,
  );
}

/** Stable key used to deduplicate tile addresses. */
function tileKey({ z, x, y }: TileAddress): string {
  return `${z}/${x}/${y}`;
}

/**
 * Lists every tile intersecting an extent at one zoom level.
 * @param extent - Map extent in EPSG:3857.
 * @param zoom - Web Mercator zoom level.
 */
export function tilesForExtent(extent: Extent, zoom: number): TileAddress[] {
  const tiles: TileAddress[] = [];
  const minX = tileX(extent[0], zoom);
  const maxX = tileX(extent[2], zoom);
  const minY = tileY(extent[3], zoom);
  const maxY = tileY(extent[1], zoom);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ z: zoom, x, y });
    }
  }

  return tiles;
}

/**
 * Lists the tiles within a buffer around route lines at one zoom level.
 *
 * The line is sampled at a quarter of the tile size and each sample adds the
 * square of tiles within the buffer, so no tile touched by the corridor is
 * missed while the result stays proportional to the route length.
 *
 * @param segments - Route lines in EPSG:3857.
 * @param zoom - Web Mercator zoom level.
 * @param bufferMeters - Ground distance kept on each side of the line.
 */
export function tilesForCorridor(
  segments: Coordinate[][],
  zoom: number,
  bufferMeters = OFFLINE_CORRIDOR_BUFFER_METERS,
): TileAddress[] {
  const size = tileSize(zoom);
  const step = size / 4;
  const tiles = new Map<string, TileAddress>();

  const addAround = (point: Coordinate) => {
    // Web Mercator stretches ground distances by 1 / cos(latitude).
    const latitude = toWgs84(point)[1];
    const buffer = bufferMeters / Math.cos((latitude * Math.PI) / 180);

    for (const tile of tilesForExtent(
      [point[0] - buffer, point[1] - buffer, point[0] + buffer, point[1] + buffer],
      zoom,
    )) {
      tiles.set(tileKey(tile), tile);
    }
  };

  for (const segment of segments) {
    if (segment.length === 1) {
      addAround(segment[0]);
    }

    for (let index = 1; index < segment.length; index += 1) {
      const start = segment[index - 1];
      const end = segment[index];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const steps = Math.max(1, Math.ceil(length / step));

      for (let sample = 0; sample <= steps; sample += 1) {
        const ratio = sample / steps;
        addAround([
          start[0] + (end[0] - start[0]) * ratio,
          start[1] + (end[1] - start[1]) * ratio,
        ]);
      }
    }
  }

  return [...tiles.values()];
}

/** Bounding extent of route lines in EPSG:3857. */
export function routeExtent(segments: Coordinate[][]): Extent {
  const extent: Extent = [Infinity, Infinity, -Infinity, -Infinity];

  for (const segment of segments) {
    for (const [x, y] of segment) {
      extent[0] = Math.min(extent[0], x);
      extent[1] = Math.min(extent[1], y);
      extent[2] = Math.max(extent[2], x);
      extent[3] = Math.max(extent[3], y);
    }
  }

  return extent;
}

/** Result of planning an offline download. */
export interface OfflineTilePlan {
  /** Deduplicated tiles, ordered from overview to detail. */
  tiles: TileAddress[];
  /** Closest zoom level included (lower than the maximum when capped). */
  maxZoom: number;
}

/**
 * Plans every tile needed to follow a route offline: the national overview,
 * the regional bounding box, and the route corridor down to 1:25,000 detail.
 * If the plan exceeds the tile cap, the closest zoom levels are dropped first.
 *
 * @param segments - Route lines in EPSG:3857.
 * @param nationalExtent - Map extent of the whole supported territory.
 */
export function planOfflineTiles(
  segments: Coordinate[][],
  nationalExtent: Extent,
): OfflineTilePlan {
  const bbox = routeExtent(segments);
  const baseTiles = [
    ...OFFLINE_OVERVIEW_ZOOMS.flatMap((zoom) =>
      tilesForExtent(nationalExtent, zoom),
    ),
    ...OFFLINE_ROUTE_BBOX_ZOOMS.flatMap((zoom) => tilesForExtent(bbox, zoom)),
  ];
  const corridorByZoom: TileAddress[][] = [];

  for (let zoom = OFFLINE_CORRIDOR_MIN_ZOOM; zoom <= OFFLINE_MAX_ZOOM; zoom += 1) {
    corridorByZoom.push(tilesForCorridor(segments, zoom));
  }

  let maxZoom = OFFLINE_MAX_ZOOM;

  while (
    maxZoom > OFFLINE_CORRIDOR_MIN_ZOOM &&
    baseTiles.length +
      corridorByZoom
        .slice(0, maxZoom - OFFLINE_CORRIDOR_MIN_ZOOM + 1)
        .reduce((total, tiles) => total + tiles.length, 0) >
      OFFLINE_MAX_TILE_COUNT
  ) {
    maxZoom -= 1;
  }

  const unique = new Map<string, TileAddress>();

  for (const tile of [
    ...baseTiles,
    ...corridorByZoom.slice(0, maxZoom - OFFLINE_CORRIDOR_MIN_ZOOM + 1).flat(),
  ]) {
    unique.set(tileKey(tile), tile);
  }

  return { tiles: [...unique.values()], maxZoom };
}
