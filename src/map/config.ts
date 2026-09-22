/**
 * Business context: centralizes the official IGN layer identifiers, the
 * GoogleMapsCompatible WMTS grid, geographic limits, and zoom policy used by
 * the map. Keeping these provider and scale decisions together prevents
 * individual components from inventing incompatible projections or visibility
 * thresholds.
 */
import type { Coordinate } from 'ol/coordinate.js';
import { transformExtent } from 'ol/proj.js';
import WMTS from 'ol/source/WMTS.js';
import XYZ from 'ol/source/XYZ.js';
import { createXYZ } from 'ol/tilegrid.js';
import WMTSTileGrid from 'ol/tilegrid/WMTS.js';
import {
  fromWgs84,
  MAP_PROJECTION,
  MAP_PROJECTION_CODE,
  WGS84_PROJECTION_CODE,
} from './projection';

/** Backgrounds available through the official IGN WMTS services. */
export type BaseMapStyle = 'color' | 'gray' | 'aerial';

/** Default background used when the application starts. */
export const DEFAULT_BASE_MAP_STYLE: BaseMapStyle = 'color';

/** One IGN WMTS layer published in the GoogleMapsCompatible matrix set. */
interface IgnWmtsLayer {
  /** WMTS service endpoint. */
  url: string;
  /** Provider layer identifier. */
  layer: string;
  /** Image format published by the layer. */
  format: 'image/jpeg' | 'image/png';
}

/** Provider layers for each selectable background. */
const IGN_BASE_MAP_LAYERS: Record<BaseMapStyle, IgnWmtsLayer> = {
  // Mapa Topográfico Nacional: the multi-scale official raster series.
  color: {
    url: 'https://www.ign.es/wmts/mapa-raster',
    layer: 'MTN',
    format: 'image/jpeg',
  },
  // IGN Base in grey keeps the route and overlays dominant.
  gray: {
    url: 'https://www.ign.es/wmts/ign-base',
    layer: 'IGNBase-gris',
    format: 'image/jpeg',
  },
  // PNOA maximum-actuality orthophotography.
  aerial: {
    url: 'https://www.ign.es/wmts/pnoa-ma',
    layer: 'OI.OrthoimageCoverage',
    format: 'image/jpeg',
  },
};

/** HTML attribution required by the IGN (CC BY 4.0 scne.es). */
const IGN_ATTRIBUTION =
  '<a href="https://www.scne.es/" target="_blank" rel="noopener noreferrer">CC BY 4.0 scne.es</a>';

/** Waymarked Trails hiking-route overlay built from OpenStreetMap relations. */
const HIKING_TRAILS_TILE_URL =
  'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png';

/** Attribution required by Waymarked Trails and OpenStreetMap. */
const HIKING_TRAILS_ATTRIBUTION =
  '<a href="https://hiking.waymarkedtrails.org/" target="_blank" rel="noopener noreferrer">© Waymarked Trails</a>, ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>';

/**
 * This extent is not the exact administrative boundary. It covers the
 * peninsula, the Balearic and Canary Islands, Ceuta, and Melilla with a small
 * margin, while preventing navigation to areas that are irrelevant to the project.
 *
 * Coordinate order: west, south, east, north (WGS 84 / EPSG:4326).
 */
export const MAP_BOUNDS_WGS84 = [-18.6, 27.3, 4.9, 44.2];

/**
 * Checks the unprojected coordinate against the product's documented map
 * bounds before projection.
 * @param coordinate - Longitude and latitude in decimal WGS 84 degrees.
 * @returns True when the coordinate belongs to the supported Spanish map area.
 */
export function isWgs84CoordinateInsideMapBounds(
  coordinate: Coordinate,
): boolean {
  const [longitude, latitude] = coordinate;
  const [west, south, east, north] = MAP_BOUNDS_WGS84;

  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= west &&
    longitude <= east &&
    latitude >= south &&
    latitude <= north
  );
}

/** Initial map centre near the geographic middle of the peninsula. */
export const DEFAULT_MAP_CENTER = fromWgs84([-3.7, 40.1]);

/** Navigable map extent derived from the documented WGS84 margin. */
export const MAP_EXTENT = transformExtent(
  MAP_BOUNDS_WGS84,
  WGS84_PROJECTION_CODE,
  MAP_PROJECTION_CODE,
);

/*
 * Zoom values are standard Web Mercator levels. IGN services publish levels
 * 0 through 20 in the GoogleMapsCompatible matrix set.
 */
export const MAP_ZOOM = {
  initial: 6,
  minimum: 5,
  maximum: 20,
} as const;

/** Highest zoom level published by the IGN WMTS services. */
const IGN_MAX_TILE_ZOOM = 20;

/**
 * OpenLayers treats a layer's minZoom as an exclusive boundary. From level 11
 * (about 76 m/px at 40° N) the hiking network becomes readable without
 * covering national-map labels at overview scales.
 */
export const HIKING_TRAILS_MIN_ZOOM = 10;

/**
 * Minimum user-adjustable information-layer opacity ratio. A visible layer
 * below 20% can look broken while its visibility toggle remains enabled;
 * lowering this value increases that ambiguity, while raising it reduces the
 * useful adjustment range.
 */
export const MINIMUM_MAP_LAYER_OPACITY = 0.2;

/**
 * Default opacity ratio (0 = transparent, 1 = opaque) for the hiking-route
 * overlay. A value of 0.8 keeps GR, PR, and SL routes clearly readable while
 * still revealing labels and terrain details beneath.
 */
export const DEFAULT_HIKING_TRAILS_OPACITY = 0.8;

/** Browser geolocation reveals nearby streets and trails at this level. */
export const USER_LOCATION_ZOOM = 16;

/** Place search opens at a local planning level. */
export const LOCATION_SEARCH_ZOOM = 14;
/** Exact coordinate search opens at the same level as explicit geolocation. */
export const COORDINATE_SEARCH_ZOOM = USER_LOCATION_ZOOM;

/** GPX framing may zoom this close for very short itineraries. */
export const IMPORTED_ROUTE_MAX_ZOOM = 17;

/** Shared GoogleMapsCompatible grid used by every IGN WMTS source. */
const GOOGLE_MAPS_COMPATIBLE_TILE_GRID = (() => {
  const grid = createXYZ({
    extent: MAP_PROJECTION.getExtent(),
    maxZoom: IGN_MAX_TILE_ZOOM,
    tileSize: 256,
  });

  return new WMTSTileGrid({
    origin: [MAP_PROJECTION.getExtent()[0], MAP_PROJECTION.getExtent()[3]],
    resolutions: grid.getResolutions(),
    matrixIds: grid.getResolutions().map((_, index) => String(index)),
    tileSize: 256,
  });
})();

/**
 * Creates one KVP-encoded IGN WMTS source in the GoogleMapsCompatible grid.
 * @param definition - Service URL, layer identifier, and image format.
 * @returns A non-wrapping OpenLayers source with the required attribution.
 */
function createIgnWmtsSource(definition: IgnWmtsLayer): WMTS {
  return new WMTS({
    url: definition.url,
    layer: definition.layer,
    matrixSet: 'GoogleMapsCompatible',
    style: 'default',
    format: definition.format,
    projection: MAP_PROJECTION_CODE,
    requestEncoding: 'KVP',
    tileGrid: GOOGLE_MAPS_COMPATIBLE_TILE_GRID,
    attributions: IGN_ATTRIBUTION,
    crossOrigin: 'anonymous',
    wrapX: false,
  });
}

/** Creates one official IGN background. */
export function createBaseMapSource(style: BaseMapStyle): WMTS {
  return createIgnWmtsSource(IGN_BASE_MAP_LAYERS[style]);
}

/** Creates the rendered GR/PR/SL hiking-route overlay. */
export function createHikingTrailsSource(): XYZ {
  return new XYZ({
    url: HIKING_TRAILS_TILE_URL,
    attributions: HIKING_TRAILS_ATTRIBUTION,
    crossOrigin: 'anonymous',
    maxZoom: 18,
    wrapX: false,
  });
}
