/**
 * Business context: orchestrates the three offline actions offered to the
 * user — save the current route with its map, reopen a saved route, and
 * delete one — on top of the tile planner, tile downloader, IndexedDB store,
 * and service worker.
 */
import type { Coordinate } from 'ol/coordinate.js';
import { MAP_EXTENT, type BaseMapStyle } from '../map/config';
import {
  createSavedRouteId,
  deleteSavedRoute,
  getSavedRoute,
  putSavedRoute,
  type SavedRoute,
} from './offlineStore';
import { cacheAppShell } from './serviceWorker';
import { planOfflineTiles, routeExtent } from './tileCorridor';
import {
  deleteCachedTiles,
  downloadTiles,
  requestPersistentStorage,
  tileUrlsForStyle,
  type TileDownloadProgress,
} from './tileDownload';

/** Whether this browser offers every API offline routes need. */
export function isOfflineStorageSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'caches' in window &&
    'indexedDB' in window
  );
}

/** Inputs describing the route being saved. */
export interface SaveRouteOfflineInput {
  /** User-confirmed route name. */
  name: string;
  /** Complete GPX document, with elevations when available. */
  gpx: string;
  /** Route lines in EPSG:3857. */
  segments: Coordinate[][];
  /** Horizontal route length in metres. */
  distanceMeters: number;
  /** Background whose tiles are stored. */
  baseMapStyle: BaseMapStyle;
}

/**
 * Downloads the map around a route and stores the route for offline use.
 * @returns Downloaded bytes and the count of tiles that failed.
 */
export async function saveRouteOffline(
  input: SaveRouteOfflineInput,
  signal: AbortSignal,
  onProgress: (progress: TileDownloadProgress) => void,
): Promise<{ bytes: number; failed: number }> {
  const plan = planOfflineTiles(input.segments, MAP_EXTENT);
  const urls = tileUrlsForStyle(input.baseMapStyle, plan.tiles);

  onProgress({ done: 0, total: urls.length, failed: 0 });
  // Ask early: some browsers only honour persistence during a user gesture.
  void requestPersistentStorage();

  const result = await downloadTiles(urls, signal, onProgress);
  const route: SavedRoute = {
    id: createSavedRouteId(),
    name: input.name,
    savedAt: Date.now(),
    gpx: input.gpx,
    baseMapStyle: input.baseMapStyle,
    extent: routeExtent(input.segments),
    distanceMeters: input.distanceMeters,
    maxZoom: plan.maxZoom,
    tileUrls: result.urls,
    tileBytes: result.bytes,
  };

  await putSavedRoute(route);
  // Make sure the application itself also opens without a network.
  await cacheAppShell().catch(() => undefined);

  return { bytes: result.bytes, failed: result.failed };
}

/** Reads one saved route as a GPX file ready for the normal import flow. */
export async function loadSavedRouteFile(
  id: string,
): Promise<{ file: File; route: SavedRoute } | null> {
  const route = await getSavedRoute(id);

  if (!route) {
    return null;
  }

  return {
    route,
    file: new File([route.gpx], `${route.name}.gpx`, {
      type: 'application/gpx+xml',
    }),
  };
}

/** Deletes a saved route and the tiles no other saved route needs. */
export async function removeSavedRoute(id: string): Promise<void> {
  await deleteCachedTiles(await deleteSavedRoute(id));
}
