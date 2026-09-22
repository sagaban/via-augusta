/**
 * Business context: keeps routes saved for offline use in the browser's
 * IndexedDB. Each record holds the exact GPX (with elevations, so the profile
 * and statistics work without a network) and the list of tile URLs stored for
 * it in Cache Storage, so deleting a route can release tiles no other saved
 * route still needs. Nothing leaves the device.
 */
import type { Extent } from 'ol/extent.js';
import type { BaseMapStyle } from '../map/config';

const DATABASE_NAME = 'via-augusta-offline';
const DATABASE_VERSION = 1;
const ROUTE_STORE = 'routes';

/** Cache Storage bucket holding tiles downloaded for saved routes. */
export const OFFLINE_TILE_CACHE = 'via-augusta-tiles-v1';

/** One route saved for offline use. */
export interface SavedRoute {
  /** Random identifier. */
  id: string;
  /** User-visible route name, also written into the GPX. */
  name: string;
  /** Save time as epoch milliseconds. */
  savedAt: number;
  /** Complete GPX document. */
  gpx: string;
  /** Background whose tiles were stored. */
  baseMapStyle: BaseMapStyle;
  /** Route extent in EPSG:3857, used to frame the map when opening it. */
  extent: Extent;
  /** Horizontal route length in metres. */
  distanceMeters: number;
  /** Closest zoom level stored for this route. */
  maxZoom: number;
  /** Exact tile request URLs stored in Cache Storage. */
  tileUrls: string[];
  /** Bytes of the tiles downloaded for this route. */
  tileBytes: number;
}

/** Compact listing entry without the heavy GPX and tile arrays. */
export type SavedRouteSummary = Omit<SavedRoute, 'gpx' | 'tileUrls'> & {
  tileCount: number;
};

/** Wraps one IndexedDB request in a promise. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Opens (and creates on first use) the offline database. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(ROUTE_STORE)) {
        database.createObjectStore(ROUTE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs one operation in a transaction and closes the connection afterwards. */
async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(ROUTE_STORE, mode);
    const result = await requestToPromise(
      operation(transaction.objectStore(ROUTE_STORE)),
    );

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    return result;
  } finally {
    database.close();
  }
}

/** Creates a random route identifier. */
export function createSavedRouteId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Stores or replaces one saved route. */
export async function putSavedRoute(route: SavedRoute): Promise<void> {
  await withStore('readwrite', (store) => store.put(route));
}

/** Reads one complete saved route. */
export async function getSavedRoute(id: string): Promise<SavedRoute | null> {
  const route = await withStore<SavedRoute | undefined>('readonly', (store) =>
    store.get(id),
  );
  return route ?? null;
}

/** Reads every complete saved route. */
async function getAllSavedRoutes(): Promise<SavedRoute[]> {
  return withStore<SavedRoute[]>('readonly', (store) => store.getAll());
}

/** Lists saved routes, newest first, without their GPX and tile lists. */
export async function listSavedRoutes(): Promise<SavedRouteSummary[]> {
  const routes = await getAllSavedRoutes();

  return routes
    .map(({ gpx, tileUrls, ...summary }) => {
      void gpx;
      return { ...summary, tileCount: tileUrls.length };
    })
    .sort((first, second) => second.savedAt - first.savedAt);
}

/**
 * Deletes one saved route and returns the tile URLs that no other saved route
 * references any more, so the caller can remove them from Cache Storage.
 */
export async function deleteSavedRoute(id: string): Promise<string[]> {
  const routes = await getAllSavedRoutes();
  const target = routes.find((route) => route.id === id);

  if (!target) {
    return [];
  }

  const stillReferenced = new Set(
    routes
      .filter((route) => route.id !== id)
      .flatMap((route) => route.tileUrls),
  );

  await withStore('readwrite', (store) => store.delete(id));

  return target.tileUrls.filter((url) => !stillReferenced.has(url));
}
