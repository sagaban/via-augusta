/**
 * Business context: protects the IndexedDB records of offline routes,
 * especially that deleting one route never releases tiles another still uses.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  deleteSavedRoute,
  getSavedRoute,
  listSavedRoutes,
  putSavedRoute,
  type SavedRoute,
} from './offlineStore';

function route(id: string, savedAt: number, tileUrls: string[]): SavedRoute {
  return {
    id,
    name: `Ruta ${id}`,
    savedAt,
    gpx: '<gpx/>',
    baseMapStyle: 'color',
    extent: [0, 0, 1, 1],
    distanceMeters: 1_000,
    maxZoom: 16,
    tileUrls,
    tileBytes: 2_048,
  };
}

describe('offlineStore', () => {
  it('stores, lists newest first, and reads complete routes', async () => {
    await putSavedRoute(route('a', 1, ['t1']));
    await putSavedRoute(route('b', 2, ['t2', 't3']));

    const list = await listSavedRoutes();
    expect(list.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(list[0]).not.toHaveProperty('gpx');
    expect(list[0].tileCount).toBe(2);
    expect((await getSavedRoute('a'))?.gpx).toBe('<gpx/>');
  });

  it('releases only the tiles no remaining route references', async () => {
    await putSavedRoute(route('c', 3, ['shared', 'only-c']));
    await putSavedRoute(route('d', 4, ['shared', 'only-d']));

    expect(await deleteSavedRoute('c')).toEqual(['only-c']);
    expect(await getSavedRoute('c')).toBeNull();
    expect(await deleteSavedRoute('missing')).toEqual([]);
  });
});
