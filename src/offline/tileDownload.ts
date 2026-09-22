/**
 * Business context: downloads the planned tiles of one background into Cache
 * Storage. URLs are produced by the very OpenLayers source the map uses, so
 * the service worker later finds each tile under the exact request URL. Only
 * official IGN backgrounds are stored; OSM-based overlay servers do not allow
 * bulk prefetching.
 */
import { createBaseMapSource, type BaseMapStyle } from '../map/config';
import { MAP_PROJECTION } from '../map/projection';
import { OFFLINE_TILE_CACHE } from './offlineStore';
import type { TileAddress } from './tileCorridor';

/** Parallel tile requests; low enough to stay polite to the IGN servers. */
const DOWNLOAD_CONCURRENCY = 6;

/** Progress reported while tiles are stored. */
export interface TileDownloadProgress {
  /** Tiles processed so far, including ones already cached. */
  done: number;
  /** Total tiles in the plan. */
  total: number;
  /** Tiles that could not be downloaded. */
  failed: number;
}

/** Outcome of a completed download. */
export interface TileDownloadResult {
  /** Tile URLs now present in the cache. */
  urls: string[];
  /** Bytes newly downloaded (already-cached tiles are not counted again). */
  bytes: number;
  /** Tiles that could not be downloaded. */
  failed: number;
}

/**
 * Builds the exact tile request URLs of one background for planned tiles.
 * @param style - IGN background.
 * @param tiles - Planned tile addresses.
 */
export function tileUrlsForStyle(
  style: BaseMapStyle,
  tiles: TileAddress[],
): string[] {
  const source = createBaseMapSource(style);
  const urlFunction = source.getTileUrlFunction();

  return tiles
    .map(({ z, x, y }) => urlFunction([z, x, y], 1, MAP_PROJECTION))
    .filter((url): url is string => typeof url === 'string');
}

/**
 * Stores every URL in the tile cache, skipping those already present.
 * @param urls - Tile request URLs.
 * @param signal - Cancels the remaining downloads.
 * @param onProgress - Receives progress after each tile.
 * @throws {DOMException} AbortError when cancelled.
 */
export async function downloadTiles(
  urls: string[],
  signal: AbortSignal,
  onProgress: (progress: TileDownloadProgress) => void,
): Promise<TileDownloadResult> {
  if (typeof caches === 'undefined') {
    throw new Error('Cache Storage is not available in this browser.');
  }

  const cache = await caches.open(OFFLINE_TILE_CACHE);
  const stored: string[] = [];
  let done = 0;
  let failed = 0;
  let bytes = 0;
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < urls.length) {
      signal.throwIfAborted();
      const url = urls[nextIndex];
      nextIndex += 1;

      try {
        if (!(await cache.match(url))) {
          const response = await fetch(url, { mode: 'cors', signal });
          const contentType = response.headers.get('content-type') ?? '';

          // IGN answers missing tiles with XML exceptions; never store those.
          if (!response.ok || !contentType.startsWith('image/')) {
            throw new Error(`Tile request failed with ${response.status}.`);
          }

          const body = await response.blob();
          bytes += body.size;
          await cache.put(
            url,
            new Response(body, {
              headers: { 'Content-Type': contentType },
            }),
          );
        }

        stored.push(url);
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        failed += 1;
      }

      done += 1;
      onProgress({ done, total: urls.length, failed });
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(DOWNLOAD_CONCURRENCY, urls.length) },
      worker,
    ),
  );

  return { urls: stored, bytes, failed };
}

/** Removes tiles that no saved route references any more. */
export async function deleteCachedTiles(urls: string[]): Promise<void> {
  if (typeof caches === 'undefined' || urls.length === 0) {
    return;
  }

  const cache = await caches.open(OFFLINE_TILE_CACHE);
  await Promise.all(urls.map((url) => cache.delete(url)));
}

/**
 * Asks the browser not to evict offline data under storage pressure. Mobile
 * browsers may grant this silently (installed PWA) or ignore it.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
