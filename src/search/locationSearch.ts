/**
 * Business context: defines the small place-or-coordinate result contract and
 * adapts OpenStreetMap places from the Photon geocoder to it. Only place,
 * nature, and mountain-infrastructure objects are requested so peaks, passes,
 * huts, and villages are not buried under shops and bus stops. Repeated text
 * searches are cached for the browser session so common typing and deletion
 * cycles do not issue the same provider request again.
 */
import type { Language } from '../i18n/translations';
import { MAP_BOUNDS_WGS84 } from '../map/config';

/** Public Photon endpoint; override with `VITE_PHOTON_URL` for a self-hosted instance. */
const DEFAULT_SEARCH_ENDPOINT = 'https://photon.komoot.io/api/';

/** Maximum results displayed by the compact search panel. */
const RESULT_LIMIT = 8;
/**
 * Maximum exact searches retained for the browser session. The small LRU bound
 * prevents an unusually long session from growing memory without limit while
 * preserving the recent queries most likely to be revisited.
 */
const SEARCH_CACHE_LIMIT = 64;

/**
 * OSM key or key:value filters sent to Photon. Several `osm_tag` parameters
 * are combined with OR by the provider.
 */
const PHOTON_OSM_TAG_FILTERS = [
  'place',
  'natural',
  'mountain_pass',
  'tourism:alpine_hut',
  'tourism:wilderness_hut',
  'tourism:camp_site',
  'waterway:waterfall',
  'boundary:national_park',
  'boundary:protected_area',
  'leisure:nature_reserve',
] as const;

/** Place categories translated by the interface. */
export const SEARCH_ORIGINS = ['locality', 'peak', 'nature', 'hut', 'area'] as const;

/** Place category used to translate provider results in the interface. */
export type SearchOrigin = (typeof SEARCH_ORIGINS)[number];

/** Locally recognized coordinate system shown beneath a coordinate result. */
export type CoordinateSearchOrigin = 'wgs84' | 'utm';

/** Category shared by provider-backed places and local coordinate results. */
export type LocationSearchOrigin = SearchOrigin | CoordinateSearchOrigin;

/** Loose top-level GeoJSON contract returned by Photon. */
interface PhotonResponse {
  /** Candidate locations; absent features are treated as an empty response. */
  features?: PhotonFeature[];
}

/** Untrusted provider item validated before it enters the typed UI contract. */
interface PhotonFeature {
  geometry?: {
    /** Longitude and latitude. */
    coordinates?: unknown;
  };
  properties?: {
    osm_type?: unknown;
    osm_id?: unknown;
    osm_key?: unknown;
    osm_value?: unknown;
    name?: unknown;
    city?: unknown;
    county?: unknown;
    state?: unknown;
    country?: unknown;
  };
}

/** Normalized location result returned to the React component. */
export interface LocationSearchResult {
  /** Stable identifier built from provider or normalized coordinate data. */
  id: string;
  /** Plain-text display label safe to render directly through React. */
  label: string;
  /** Language-neutral place or coordinate category translated by the UI. */
  origin: LocationSearchOrigin;
  /** Validated WGS84 latitude in decimal degrees. */
  latitude: number;
  /** Validated WGS84 longitude in decimal degrees. */
  longitude: number;
}

const locationSearchCache = new Map<string, LocationSearchResult[]>();

/** Reads a non-empty trimmed provider string. */
function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== ''
    ? value.replace(/\s+/g, ' ').trim()
    : null;
}

/** Reads a finite number without accepting surprising coercions. */
function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Maps one OSM key/value pair to the compact category shown to the user.
 * @param key - OSM key such as `place` or `natural`.
 * @param value - OSM value such as `peak` or `village`.
 * @returns The interface category, or null for unsupported objects.
 */
export function classifyPhotonOrigin(
  key: string,
  value: string,
): SearchOrigin | null {
  if (key === 'place') {
    return 'locality';
  }

  if (
    key === 'mountain_pass' ||
    (key === 'natural' && ['peak', 'volcano', 'saddle', 'ridge'].includes(value))
  ) {
    return 'peak';
  }

  if (key === 'tourism') {
    return 'hut';
  }

  if (key === 'boundary' || key === 'leisure') {
    return 'area';
  }

  if (key === 'natural' || key === 'waterway') {
    return 'nature';
  }

  return null;
}

/**
 * Builds the exact session-cache key. Unicode normalization makes visually
 * identical composed and decomposed accents share an entry, while the language
 * remains part of the key because Photon localizes returned labels.
 */
function createLocationSearchCacheKey(
  searchText: string,
  language: Language,
): string {
  const normalizedText = searchText
    .trim()
    .normalize('NFC')
    .toLocaleLowerCase(language);

  return `${language}:${normalizedText}`;
}

function cloneLocationSearchResults(
  results: LocationSearchResult[],
): LocationSearchResult[] {
  return results.map((result) => ({ ...result }));
}

/**
 * Returns an exact successful search cached for the current browser session.
 * Reading an entry promotes it so the bounded cache keeps recently reused
 * queries rather than merely the most recently created ones.
 * @param searchText - User-entered place text.
 * @param language - Language used for localized provider labels.
 * @returns A defensive result copy, or null when no exact entry is cached.
 */
export function getCachedLocationSearch(
  searchText: string,
  language: Language,
): LocationSearchResult[] | null {
  const cacheKey = createLocationSearchCacheKey(searchText, language);
  const cachedResults = locationSearchCache.get(cacheKey);

  if (cachedResults === undefined) {
    return null;
  }

  locationSearchCache.delete(cacheKey);
  locationSearchCache.set(cacheKey, cachedResults);

  return cloneLocationSearchResults(cachedResults);
}

function cacheLocationSearchResults(
  searchText: string,
  language: Language,
  results: LocationSearchResult[],
): void {
  const cacheKey = createLocationSearchCacheKey(searchText, language);

  locationSearchCache.delete(cacheKey);
  locationSearchCache.set(
    cacheKey,
    cloneLocationSearchResults(results),
  );

  while (locationSearchCache.size > SEARCH_CACHE_LIMIT) {
    const oldestKey = locationSearchCache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    locationSearchCache.delete(oldestKey);
  }
}

/** Clears the session cache, primarily for deterministic regression tests. */
export function clearLocationSearchCache(): void {
  locationSearchCache.clear();
}

/**
 * Searches OpenStreetMap places inside the Spanish map extent.
 * Exact successful responses, including empty result lists, are retained in a
 * bounded session cache. Errors and in-flight promises are deliberately not
 * cached so each request keeps its own cancellation lifecycle.
 * @param searchText - User-entered place text.
 * @param language - Interface language; English requests English names when OSM has them.
 * @param signal - Abort signal owned by the debounced React effect.
 * @returns Valid, deduplicated locations in provider order.
 * @throws {Error} If Photon returns a non-successful HTTP response.
 */
export async function searchLocations(
  searchText: string,
  language: Language,
  signal: AbortSignal,
): Promise<LocationSearchResult[]> {
  const cachedResults = getCachedLocationSearch(searchText, language);

  if (cachedResults !== null) {
    return cachedResults;
  }

  const parameters = new URLSearchParams({
    q: searchText,
    limit: String(RESULT_LIMIT * 2),
    bbox: MAP_BOUNDS_WGS84.join(','),
  });

  // Photon has no Spanish label index; omitting `lang` returns local names,
  // which in Spain are the official Spanish or co-official toponyms.
  if (language === 'en') {
    parameters.set('lang', 'en');
  }

  for (const filter of PHOTON_OSM_TAG_FILTERS) {
    parameters.append('osm_tag', filter);
  }

  const endpoint =
    (import.meta.env as Record<string, unknown> | undefined)?.VITE_PHOTON_URL;
  const response = await fetch(
    `${typeof endpoint === 'string' && endpoint ? endpoint : DEFAULT_SEARCH_ENDPOINT}?${parameters}`,
    {
      signal,
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Photon returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as PhotonResponse;
  const uniqueResults = new Map<string, LocationSearchResult>();

  for (const feature of payload.features ?? []) {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    const longitude = Array.isArray(coordinates)
      ? readFiniteNumber(coordinates[0])
      : null;
    const latitude = Array.isArray(coordinates)
      ? readFiniteNumber(coordinates[1])
      : null;
    const name = readText(properties.name);
    const origin = classifyPhotonOrigin(
      readText(properties.osm_key) ?? '',
      readText(properties.osm_value) ?? '',
    );

    if (latitude === null || longitude === null || !name || !origin) {
      continue;
    }

    const context = [
      readText(properties.city) ?? readText(properties.county),
      readText(properties.state),
    ].filter((part): part is string => part !== null && part !== name);
    const label = [name, ...new Set(context)].join(', ');
    // Photon often returns the same OSM object as node and way; ~1 km rounding
    // merges those while keeping distinct same-named places apart.
    const duplicateKey = `${label.toLocaleLowerCase(language)}:${origin}:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;

    if (uniqueResults.has(duplicateKey)) {
      continue;
    }

    uniqueResults.set(duplicateKey, {
      id: `${origin}:${String(properties.osm_type ?? '')}${String(
        properties.osm_id ?? duplicateKey,
      )}`,
      label,
      origin,
      latitude,
      longitude,
    });
  }

  const results = Array.from(uniqueResults.values()).slice(
    0,
    RESULT_LIMIT,
  );

  cacheLocationSearchResults(searchText, language, results);

  return cloneLocationSearchResults(results);
}
