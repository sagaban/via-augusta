/**
 * Business context: protects the tile downloader so saved routes contain
 * exactly the URLs the map requests, and never cache IGN error documents.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTiles, tileUrlsForStyle } from './tileDownload';

/** Minimal in-memory Cache Storage double. */
function stubCaches() {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => entries.get(url)),
    put: vi.fn(async (url: string, response: Response) => {
      entries.set(url, response);
    }),
    delete: vi.fn(async (url: string) => entries.delete(url)),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  return { entries, cache };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tileUrlsForStyle', () => {
  it('produces the same KVP GetTile URL the WMTS source requests', () => {
    const [url] = tileUrlsForStyle('color', [{ z: 12, x: 2005, y: 1544 }]);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      'https://www.ign.es/wmts/mapa-raster',
    );
    expect(parsed.searchParams.get('layer')).toBe('MTN');
    expect(parsed.searchParams.get('tilematrixset')).toBe('GoogleMapsCompatible');
    expect(parsed.searchParams.get('TileMatrix')).toBe('12');
    expect(parsed.searchParams.get('TileCol')).toBe('2005');
    expect(parsed.searchParams.get('TileRow')).toBe('1544');
  });
});

describe('downloadTiles', () => {
  it('stores image tiles, skips cached ones, and rejects XML errors', async () => {
    const { entries } = stubCaches();
    entries.set('cached', new Response('x'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === 'broken'
          ? new Response('<ExceptionReport/>', {
              headers: { 'content-type': 'application/xml' },
            })
          : new Response('abcd', {
              headers: { 'content-type': 'image/jpeg' },
            }),
      ),
    );
    const progress = vi.fn();

    const result = await downloadTiles(
      ['cached', 'new', 'broken'],
      new AbortController().signal,
      progress,
    );

    expect(result.urls.sort()).toEqual(['cached', 'new']);
    expect(result.failed).toBe(1);
    expect(result.bytes).toBe(4);
    expect(entries.has('broken')).toBe(false);
    expect(progress).toHaveBeenLastCalledWith({ done: 3, total: 3, failed: 1 });
  });

  it('stops when cancelled', async () => {
    stubCaches();
    vi.stubGlobal('fetch', vi.fn());
    const controller = new AbortController();
    controller.abort();

    await expect(
      downloadTiles(['a'], controller.signal, vi.fn()),
    ).rejects.toThrow();
  });
});
