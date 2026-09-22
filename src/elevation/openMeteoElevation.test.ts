/**
 * Business context: protects the batched Open-Meteo elevation client shared by
 * route profiles and point inspection. Long profiles must be split into
 * provider-sized requests and reassembled in the original order.
 */
import type { Coordinate } from 'ol/coordinate.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ELEVATION_BATCH_SIZE, fetchElevations } from './openMeteoElevation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchElevations', () => {
  it('splits requests into batches of 100 and preserves input order', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const latitudes = new URL(String(input)).searchParams
        .get('latitude')!
        .split(',')
        .map(Number);

      return {
        ok: true,
        status: 200,
        // Echo the latitude so the test can verify ordering across batches.
        json: async () => ({ elevation: latitudes }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const lonLats: Coordinate[] = Array.from({ length: 250 }, (_value, index) => [
      -3.7,
      40 + index / 1_000,
    ]);

    const elevations = await fetchElevations(lonLats, new AbortController().signal);

    expect(ELEVATION_BATCH_SIZE).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls
        .map(([input]) =>
          new URL(String(input)).searchParams.get('latitude')!.split(',').length,
        )
        .sort((first, second) => first - second),
    ).toEqual([50, 100, 100]);
    expect(elevations).toHaveLength(250);
    expect(elevations[0]).toBeCloseTo(40, 6);
    expect(elevations[249]).toBeCloseTo(40.249, 6);
  });

  it('rejects HTTP failures and malformed elevations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, status: 429 } as Response),
    );

    await expect(
      fetchElevations([[-3.7, 40.4]], new AbortController().signal),
    ).rejects.toThrow('429');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ elevation: [null] }),
      } as Response),
    );

    await expect(
      fetchElevations([[-3.7, 40.4]], new AbortController().signal),
    ).rejects.toThrow('does not match');
  });

  it('returns an empty list without contacting the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchElevations([], new AbortController().signal)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
