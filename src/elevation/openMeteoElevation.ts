/**
 * Business context: supplies terrain elevations for route profiles and
 * explicit point inspection. Spain has no CORS-friendly national elevation
 * REST service comparable to a profile endpoint, so the application samples
 * the Copernicus GLO-90 digital elevation model through the free Open-Meteo
 * elevation API. The model is coarser than the IGN MDT, which is why profiles
 * are smoothed before ascent and descent are accumulated.
 */
import type { Coordinate } from 'ol/coordinate.js';

/** Public Open-Meteo endpoint; override with `VITE_ELEVATION_URL`. */
const DEFAULT_ELEVATION_ENDPOINT = 'https://api.open-meteo.com/v1/elevation';

/** Maximum coordinates accepted by Open-Meteo in one request. */
export const ELEVATION_BATCH_SIZE = 100;

/**
 * Parallel requests used for long profiles. A small value stays well below the
 * provider's fair-use rate while keeping a 1,000-sample profile responsive.
 */
const ELEVATION_REQUEST_CONCURRENCY = 3;

/** Resolves the configured endpoint without failing outside Vite. */
function elevationEndpoint(): string {
  const configured = (
    import.meta.env as Record<string, unknown> | undefined
  )?.VITE_ELEVATION_URL;

  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.trim()
    : DEFAULT_ELEVATION_ENDPOINT;
}

/**
 * Fetches one batch of at most 100 elevations.
 * @param lonLats - WGS 84 longitude/latitude pairs.
 * @param signal - Abort signal owned by the caller.
 * @returns Elevations in metres, in input order.
 * @throws {Error} On HTTP failures or when the response length does not match.
 */
async function fetchElevationBatch(
  lonLats: Coordinate[],
  signal: AbortSignal,
): Promise<number[]> {
  const parameters = new URLSearchParams({
    latitude: lonLats.map(([, latitude]) => latitude.toFixed(6)).join(','),
    longitude: lonLats.map(([longitude]) => longitude.toFixed(6)).join(','),
  });
  const response = await fetch(`${elevationEndpoint()}?${parameters}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Elevation request failed with ${response.status}.`);
  }

  const payload: unknown = await response.json();
  const elevations = (payload as { elevation?: unknown } | null)?.elevation;

  if (
    !Array.isArray(elevations) ||
    elevations.length !== lonLats.length ||
    !elevations.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error('Elevation response does not match the requested points.');
  }

  return elevations as number[];
}

/**
 * Fetches terrain elevations for any number of points, in batches.
 * @param lonLats - WGS 84 longitude/latitude pairs.
 * @param signal - Abort signal owned by the caller.
 * @returns Elevations in metres, in input order.
 */
export async function fetchElevations(
  lonLats: Coordinate[],
  signal: AbortSignal,
): Promise<number[]> {
  const batches: Coordinate[][] = [];

  for (let index = 0; index < lonLats.length; index += ELEVATION_BATCH_SIZE) {
    batches.push(lonLats.slice(index, index + ELEVATION_BATCH_SIZE));
  }

  const results = new Array<number[]>(batches.length);
  let nextBatchIndex = 0;

  const worker = async () => {
    while (nextBatchIndex < batches.length) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      results[batchIndex] = await fetchElevationBatch(
        batches[batchIndex],
        signal,
      );
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(ELEVATION_REQUEST_CONCURRENCY, batches.length) },
      worker,
    ),
  );

  return results.flat();
}
