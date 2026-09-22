/**
 * Business context: exposes OpenStreetMap-based hiking routing to the editable
 * route workflow through the public BRouter HTTP API. The editing domain only
 * needs a snapped first waypoint and one routed geometry per section, so this
 * client hides the provider format and maps "no path here" answers to `null`,
 * which the caller turns into an explicit straight fallback section.
 */
import type { Coordinate } from 'ol/coordinate.js';
import { getDistance } from 'ol/sphere.js';
import { fromWgs84Coordinates, toWgs84 } from '../map/projection';
import { MAX_SNAP_DISTANCE } from './routingConstants';

/** Default public BRouter endpoint; override with `VITE_BROUTER_URL`. */
const DEFAULT_BROUTER_URL = 'https://brouter.de/brouter';

/**
 * Default routing profile. `hiking-mountain` accepts marked mountain paths
 * (SAC/sac_scale tags) that the plain hiking profile avoids, which suits the
 * Pyrenees, Picos de Europa, Sierra Nevada, and similar terrain.
 */
const DEFAULT_BROUTER_PROFILE = 'hiking-mountain';

/**
 * Northward offset in degrees used to build the tiny helper route for snapping
 * one isolated point. About 10 metres keeps both ends on the same way.
 */
const SNAP_HELPER_OFFSET_DEGREES = 0.0001;

/**
 * Fragments of BRouter error messages meaning that no usable path exists near
 * the requested positions. These are expected planning outcomes rather than
 * provider failures, so the section falls back to a straight line.
 */
const NO_ROUTE_ERROR_FRAGMENTS = [
  'not mapped',
  'no track found',
  'target island',
  'start island',
  'position not mapped',
] as const;

/** Routed geometry returned for one section. */
export interface RoutedNetworkPath {
  /** Ordered coordinates from the snapped start to the snapped destination. */
  coordinates: Coordinate[];
  /** Geodesic distance in metres between the requested start and its snapped position. */
  snapDistanceStart: number;
  /** Geodesic distance in metres between the requested end and its snapped position. */
  snapDistanceEnd: number;
}

/** Non-blocking routing-session notice. BRouter currently emits none. */
export type RoutingNotice = never;

/** Receives non-blocking routing-session notices. */
export type RoutingNoticeListener = (notice: RoutingNotice) => void;

/** Minimal routing contract consumed by the editable-route workflow. */
export interface RoutingLoader {
  snap(coordinate: Coordinate, signal: AbortSignal): Promise<Coordinate | null>;
  route(
    startCoordinate: Coordinate,
    endCoordinate: Coordinate,
    signal: AbortSignal,
  ): Promise<RoutedNetworkPath | null>;
}

/** Provider settings, mostly injectable for tests. */
export interface BRouterRoutingLoaderOptions {
  /** BRouter endpoint including the `/brouter` path. */
  baseUrl?: string;
  /** BRouter profile name. */
  profile?: string;
  /** Fetch implementation, defaulting to the browser's global fetch. */
  fetchImplementation?: typeof fetch;
}

/** Reads an optional Vite environment string without failing outside Vite. */
function readEnvironmentString(key: string): string | undefined {
  const value = (import.meta.env as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

/** Formats one WGS 84 coordinate as BRouter's `lon,lat` token. */
function formatLonLat([longitude, latitude]: Coordinate): string {
  return `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

/**
 * Extracts WGS 84 line coordinates from a BRouter GeoJSON response.
 * @param payload - Untrusted parsed JSON.
 * @returns Longitude/latitude pairs, or `null` when the shape is unusable.
 */
export function readBRouterLineCoordinates(
  payload: unknown,
): Coordinate[] | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const features = (payload as { features?: unknown }).features;

  if (!Array.isArray(features) || features.length === 0) {
    return null;
  }

  const geometry = (features[0] as { geometry?: unknown })?.geometry as
    | { type?: unknown; coordinates?: unknown }
    | undefined;

  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const coordinates: Coordinate[] = [];

  for (const position of geometry.coordinates) {
    if (
      Array.isArray(position) &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1])
    ) {
      coordinates.push([position[0], position[1]]);
    }
  }

  return coordinates.length >= 2 ? coordinates : null;
}

/** Tells whether a BRouter error body means "no path", not "provider failure". */
export function isBRouterNoRouteMessage(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return NO_ROUTE_ERROR_FRAGMENTS.some((fragment) =>
    normalizedMessage.includes(fragment),
  );
}

/**
 * Session-scoped BRouter client. It keeps the same lifecycle surface as the
 * former Worker-backed loader so the editable-route hook stays provider-neutral.
 */
export class BRouterRoutingLoader implements RoutingLoader {
  private readonly baseUrl: string;
  private readonly profile: string;
  private readonly fetchImplementation: typeof fetch;
  private disposed = false;

  constructor(options: BRouterRoutingLoaderOptions = {}) {
    this.baseUrl =
      options.baseUrl ??
      readEnvironmentString('VITE_BROUTER_URL') ??
      DEFAULT_BROUTER_URL;
    this.profile =
      options.profile ??
      readEnvironmentString('VITE_BROUTER_PROFILE') ??
      DEFAULT_BROUTER_PROFILE;
    this.fetchImplementation =
      options.fetchImplementation ?? ((...args) => fetch(...args));
  }

  /** BRouter has no session notices; the method keeps the hook contract simple. */
  subscribeToNotices(listener: RoutingNoticeListener): () => void {
    void listener;
    return () => undefined;
  }

  /**
   * Snaps one isolated first waypoint to the nearest routable way.
   * @param coordinate - User-selected coordinate in the map projection.
   * @param signal - Route-session cancellation signal.
   * @returns Snapped map coordinate, or `null` when no nearby way exists.
   */
  async snap(
    coordinate: Coordinate,
    signal: AbortSignal,
  ): Promise<Coordinate | null> {
    const [longitude, latitude] = toWgs84(coordinate);
    const lineCoordinates = await this.requestLine(
      [
        [longitude, latitude],
        [longitude, latitude + SNAP_HELPER_OFFSET_DEGREES],
      ],
      signal,
    );

    if (!lineCoordinates) {
      return null;
    }

    const snapped = lineCoordinates[0];

    if (getDistance([longitude, latitude], snapped) > MAX_SNAP_DISTANCE) {
      return null;
    }

    return fromWgs84Coordinates([snapped])[0];
  }

  /**
   * Routes one section between two waypoints.
   * @param startCoordinate - Existing route endpoint in the map projection.
   * @param endCoordinate - Newly selected destination in the map projection.
   * @param signal - Route-session cancellation signal.
   * @returns Routed path, or `null` for a straight fallback.
   */
  async route(
    startCoordinate: Coordinate,
    endCoordinate: Coordinate,
    signal: AbortSignal,
  ): Promise<RoutedNetworkPath | null> {
    const start = toWgs84(startCoordinate);
    const end = toWgs84(endCoordinate);
    const lineCoordinates = await this.requestLine([start, end], signal);

    if (!lineCoordinates) {
      return null;
    }

    const snapDistanceStart = getDistance(start, lineCoordinates[0]);
    const snapDistanceEnd = getDistance(
      end,
      lineCoordinates[lineCoordinates.length - 1],
    );

    if (
      snapDistanceStart > MAX_SNAP_DISTANCE ||
      snapDistanceEnd > MAX_SNAP_DISTANCE
    ) {
      return null;
    }

    return {
      coordinates: fromWgs84Coordinates(lineCoordinates),
      snapDistanceStart,
      snapDistanceEnd,
    };
  }

  /** Marks the session closed; in-flight requests are cancelled by their signals. */
  dispose(): void {
    this.disposed = true;
  }

  /**
   * Performs one BRouter request.
   * @returns WGS 84 line, or `null` when BRouter reports that no path exists.
   * @throws {Error} On network, HTTP, or format failures.
   */
  private async requestLine(
    lonLats: Coordinate[],
    signal: AbortSignal,
  ): Promise<Coordinate[] | null> {
    if (this.disposed) {
      throw new Error('The routing session has been disposed.');
    }

    const requestUrl = new URL(this.baseUrl);
    // BRouter expects literal `|` and `,` separators in `lonlats`.
    const query = [
      `lonlats=${lonLats.map(formatLonLat).join('|')}`,
      `profile=${encodeURIComponent(this.profile)}`,
      'alternativeidx=0',
      'format=geojson',
    ].join('&');
    const response = await this.fetchImplementation(
      `${requestUrl.origin}${requestUrl.pathname}?${query}`,
      { signal },
    );

    if (!response.ok) {
      const message = await response.text().catch(() => '');

      if (isBRouterNoRouteMessage(message)) {
        return null;
      }

      throw new Error(
        `BRouter request failed with ${response.status}: ${message.slice(0, 200)}`,
      );
    }

    const coordinates = readBRouterLineCoordinates(await response.json());

    if (!coordinates) {
      throw new Error('BRouter returned no usable line geometry.');
    }

    return coordinates;
  }
}
