/**
 * Business context: protects the BRouter adapter used for path-following. The
 * editor relies on `null` meaning "no path here, draw a straight section" and
 * on thrown errors meaning "the provider failed", so both mappings must stay
 * stable without contacting the live service.
 */
import type { Coordinate } from 'ol/coordinate.js';
import { describe, expect, it, vi } from 'vitest';
import { fromWgs84, toWgs84 } from '../map/projection';
import {
  BRouterRoutingLoader,
  isBRouterNoRouteMessage,
  readBRouterLineCoordinates,
} from './brouterRouting';

/** Builds a BRouter-like GeoJSON FeatureCollection. */
function lineCollection(coordinates: unknown[][]) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {},
      },
    ],
  };
}

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function errorResponse(status: number, message: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => message,
  } as Response;
}

function createLoader(fetchImplementation: ReturnType<typeof vi.fn>) {
  return new BRouterRoutingLoader({
    baseUrl: 'https://brouter.example/brouter',
    profile: 'hiking-mountain',
    fetchImplementation: fetchImplementation as unknown as typeof fetch,
  });
}

const START: Coordinate = fromWgs84([-3.8877, 40.7847]);
const END: Coordinate = fromWgs84([-3.905, 40.795]);

describe('readBRouterLineCoordinates', () => {
  it('keeps longitude/latitude and drops elevation and invalid positions', () => {
    expect(
      readBRouterLineCoordinates(
        lineCollection([
          [-3.88, 40.78, 1794],
          ['x', 40.79],
          [-3.9, 40.8, 1850],
        ]),
      ),
    ).toEqual([
      [-3.88, 40.78],
      [-3.9, 40.8],
    ]);
  });

  it('rejects payloads without a usable line', () => {
    expect(readBRouterLineCoordinates(null)).toBeNull();
    expect(readBRouterLineCoordinates({ features: [] })).toBeNull();
    expect(readBRouterLineCoordinates(lineCollection([[-3.88, 40.78]]))).toBeNull();
  });
});

describe('isBRouterNoRouteMessage', () => {
  it.each([
    'from-position not mapped in existing datafile',
    'no track found at pass=0',
    'target island detected for section 0',
  ])('treats "%s" as an expected no-route answer', (message) => {
    expect(isBRouterNoRouteMessage(message)).toBe(true);
  });

  it('does not hide genuine provider failures', () => {
    expect(
      isBRouterNoRouteMessage('operation killed by thread-priority-watchdog'),
    ).toBe(false);
  });
});

describe('BRouterRoutingLoader', () => {
  it('requests a GeoJSON hiking route with literal lonlats separators', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse(
        lineCollection([
          [...toWgs84(START), 1_700],
          [-3.895, 40.79, 1_750],
          [...toWgs84(END), 1_800],
        ]),
      ),
    );
    const loader = createLoader(fetchMock);
    const signal = new AbortController().signal;

    const path = await loader.route(START, END, signal);

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://brouter.example/brouter?lonlats=-3.887700,40.784700|-3.905000,40.795000' +
        '&profile=hiking-mountain&alternativeidx=0&format=geojson',
    );
    expect(options).toEqual({ signal });
    expect(path?.coordinates).toHaveLength(3);
    expect(path?.coordinates[0][0]).toBeCloseTo(START[0], 3);
    expect(path?.coordinates[2][1]).toBeCloseTo(END[1], 3);
    expect(path?.snapDistanceStart).toBeLessThan(1);
    expect(path?.snapDistanceEnd).toBeLessThan(1);
  });

  it('returns null for a no-route answer so the editor draws a straight section', async () => {
    const loader = createLoader(
      vi.fn().mockResolvedValue(
        errorResponse(400, 'from-position not mapped in existing datafile'),
      ),
    );

    await expect(
      loader.route(START, END, new AbortController().signal),
    ).resolves.toBeNull();
  });

  it('returns null when the snapped ends are too far from the requested points', async () => {
    const loader = createLoader(
      vi.fn().mockResolvedValue(
        okResponse(
          lineCollection([
            [-3.8, 40.7],
            [...toWgs84(END)],
          ]),
        ),
      ),
    );

    await expect(
      loader.route(START, END, new AbortController().signal),
    ).resolves.toBeNull();
  });

  it('throws on provider failures', async () => {
    const loader = createLoader(
      vi.fn().mockResolvedValue(errorResponse(503, 'Service Unavailable')),
    );

    await expect(
      loader.route(START, END, new AbortController().signal),
    ).rejects.toThrow('503');
  });

  it('snaps one point through a tiny helper route and returns its start', async () => {
    const snapped = [-3.8878, 40.7848];
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse(lineCollection([snapped, [-3.8878, 40.7849]])),
    );
    const loader = createLoader(fetchMock);

    const result = await loader.snap(START, new AbortController().signal);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'lonlats=-3.887700,40.784700|-3.887700,40.784800',
    );
    expect(result).not.toBeNull();
    expect(toWgs84(result!)[0]).toBeCloseTo(snapped[0], 6);
    expect(toWgs84(result!)[1]).toBeCloseTo(snapped[1], 6);
  });

  it('refuses requests after disposal', async () => {
    const fetchMock = vi.fn();
    const loader = createLoader(fetchMock);
    loader.dispose();

    await expect(
      loader.snap(START, new AbortController().signal),
    ).rejects.toThrow('disposed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
