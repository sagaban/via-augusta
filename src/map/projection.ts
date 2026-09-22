/**
 * Business context: centralizes the application's map projection and the
 * Spanish reference systems used at user-facing boundaries. The map and all
 * editable geometry use Web Mercator (EPSG:3857) because every IGN WMTS layer
 * and the hiking overlay publish GoogleMapsCompatible tiles, so nothing needs
 * to be reprojected in the browser. Web Mercator is not metric at Spanish
 * latitudes: every user-facing distance is therefore computed geodesically.
 * WGS 84 remains the exchange format for geolocation, search, routing, and GPX,
 * and ETRS89 / UTM (EPSG:25828–25831) is offered for coordinate display and input.
 */
import type { Coordinate } from 'ol/coordinate.js';
import type Projection from 'ol/proj/Projection.js';
import {
  get as getProjection,
  getTransform,
  transform,
  type TransformFunction,
} from 'ol/proj.js';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4';

/** Projected coordinate reference system used by the complete map. */
export const MAP_PROJECTION_CODE = 'EPSG:3857';
/** External longitude/latitude reference system used by GPX and browser APIs. */
export const WGS84_PROJECTION_CODE = 'EPSG:4326';

/** UTM zones covering Spanish territory: 28 (Canarias) through 31 (Baleares, Cataluña). */
export const SPANISH_UTM_ZONES = [28, 29, 30, 31] as const;

/** One UTM zone that covers part of Spain. */
export type SpanishUtmZone = (typeof SPANISH_UTM_ZONES)[number];

/** ETRS89 / UTM coordinate as shown to Spanish users. */
export interface UtmCoordinate {
  /** UTM zone number (northern hemisphere). */
  zone: SpanishUtmZone;
  /** Easting in metres. */
  easting: number;
  /** Northing in metres. */
  northing: number;
}

/** EPSG code of the ETRS89 / UTM projection for one zone. */
export function utmProjectionCode(zone: SpanishUtmZone): string {
  return `EPSG:258${zone}`;
}

/** Registers ETRS89 / UTM zones through proj4 and returns the map projection. */
function registerProjections(): Projection {
  for (const zone of SPANISH_UTM_ZONES) {
    proj4.defs(
      utmProjectionCode(zone),
      `+proj=utm +zone=${zone} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs`,
    );
  }

  register(proj4);

  const projection = getProjection(MAP_PROJECTION_CODE);

  if (!projection) {
    throw new Error('EPSG:3857 is not available in OpenLayers.');
  }

  return projection;
}

/** Registered singleton imported by map sources and the root view. */
export const MAP_PROJECTION = registerProjections();

/** Cached transforms avoid repeated projection-registry lookups for GPX arrays. */
const WGS84_TO_MAP_TRANSFORM = getTransform(
  WGS84_PROJECTION_CODE,
  MAP_PROJECTION_CODE,
);
const MAP_TO_WGS84_TRANSFORM = getTransform(
  MAP_PROJECTION_CODE,
  WGS84_PROJECTION_CODE,
);

/**
 * Transforms an ordered coordinate collection through one flat-array operation.
 * OpenLayers accepts a stride of two, which avoids one projection-dispatch call
 * per GPX point while preserving a fresh nested coordinate array for callers.
 *
 * @param coordinates - Ordered source coordinates.
 * @param transformCoordinates - Cached OpenLayers flat-coordinate transform.
 * @returns Newly allocated coordinates in the destination projection.
 */
function transformCoordinateArray(
  coordinates: Coordinate[],
  transformCoordinates: TransformFunction,
): Coordinate[] {
  if (coordinates.length === 0) {
    return [];
  }

  const flatCoordinates = new Array<number>(coordinates.length * 2);

  for (let index = 0; index < coordinates.length; index += 1) {
    flatCoordinates[index * 2] = coordinates[index][0];
    flatCoordinates[index * 2 + 1] = coordinates[index][1];
  }

  const transformed = transformCoordinates(flatCoordinates, undefined, 2, 2);
  const result = new Array<Coordinate>(coordinates.length);

  for (let index = 0; index < coordinates.length; index += 1) {
    result[index] = [transformed[index * 2], transformed[index * 2 + 1]];
  }

  return result;
}

/** Converts WGS 84 longitude/latitude to the application's map geometry. */
export function fromWgs84(coordinate: Coordinate): Coordinate {
  return transform(coordinate, WGS84_PROJECTION_CODE, MAP_PROJECTION_CODE);
}

/**
 * Converts an ordered GPX coordinate array to map geometry in one batch.
 * @param coordinates - WGS 84 longitude/latitude points.
 * @returns Newly allocated EPSG:3857 coordinates in the same order.
 */
export function fromWgs84Coordinates(
  coordinates: Coordinate[],
): Coordinate[] {
  return transformCoordinateArray(coordinates, WGS84_TO_MAP_TRANSFORM);
}

/** Converts one map coordinate to WGS 84 longitude/latitude. */
export function toWgs84(coordinate: Coordinate): Coordinate {
  return transform(coordinate, MAP_PROJECTION_CODE, WGS84_PROJECTION_CODE);
}

/**
 * Converts an ordered map coordinate array to WGS 84 in one batch.
 * @param coordinates - EPSG:3857 map coordinates.
 * @returns Newly allocated longitude/latitude coordinates in the same order.
 */
export function toWgs84Coordinates(
  coordinates: Coordinate[],
): Coordinate[] {
  return transformCoordinateArray(coordinates, MAP_TO_WGS84_TRANSFORM);
}

/**
 * Chooses the standard UTM zone for one longitude, clamped to the Spanish zones.
 * @param longitude - WGS 84 longitude in degrees.
 */
export function utmZoneForLongitude(longitude: number): SpanishUtmZone {
  const zone = Math.floor((longitude + 180) / 6) + 1;
  const minimumZone = SPANISH_UTM_ZONES[0];
  const maximumZone = SPANISH_UTM_ZONES[SPANISH_UTM_ZONES.length - 1];

  return Math.min(maximumZone, Math.max(minimumZone, zone)) as SpanishUtmZone;
}

/** Tells whether a number is one of the supported Spanish UTM zones. */
export function isSpanishUtmZone(zone: number): zone is SpanishUtmZone {
  return (SPANISH_UTM_ZONES as readonly number[]).includes(zone);
}

/**
 * Converts one map coordinate to ETRS89 / UTM in its natural zone.
 * @param coordinate - EPSG:3857 map coordinate.
 */
export function toUtm(coordinate: Coordinate): UtmCoordinate {
  const wgs84 = toWgs84(coordinate);
  const zone = utmZoneForLongitude(wgs84[0]);
  const [easting, northing] = transform(
    wgs84,
    WGS84_PROJECTION_CODE,
    utmProjectionCode(zone),
  );

  return { zone, easting, northing };
}

/**
 * Converts one ETRS89 / UTM coordinate to WGS 84 longitude/latitude.
 * @param utm - Zone, easting, and northing in metres.
 */
export function utmToWgs84(utm: UtmCoordinate): Coordinate {
  return transform(
    [utm.easting, utm.northing],
    utmProjectionCode(utm.zone),
    WGS84_PROJECTION_CODE,
  );
}
