/**
 * Business context: protects the lightweight point-height lookup used by
 * desktop map-position inspection so coordinate display does not depend on an
 * unvalidated provider response.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPointHeight } from './pointHeight';
import { fromWgs84 } from './projection';

describe('fetchPointHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests one WGS 84 point and parses the returned height', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elevation: [2_428] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      fetchPointHeight(fromWgs84([-3.9561, 40.8500]), controller.signal),
    ).resolves.toBe(2_428);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request, options] = fetchMock.mock.calls[0];
    const url = new URL(String(request));
    expect(url.hostname).toBe('api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('40.850000');
    expect(url.searchParams.get('longitude')).toBe('-3.956100');
    expect(options).toEqual({ signal: controller.signal });
  });

  it('rejects an invalid provider height instead of displaying it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elevation: ['n/a'] }),
      }),
    );

    await expect(
      fetchPointHeight(fromWgs84([-3.7, 40.4]), new AbortController().signal),
    ).rejects.toThrow();
  });

  it('rejects HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
    );

    await expect(
      fetchPointHeight(fromWgs84([-3.7, 40.4]), new AbortController().signal),
    ).rejects.toThrow('429');
  });
});
