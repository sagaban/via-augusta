/**
 * Regression tests for the Photon location-search adapter. The suite protects
 * cache identity, request filters, provider validation, category mapping, and
 * deduplication without contacting the live Photon endpoint.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyPhotonOrigin,
  clearLocationSearchCache,
  getCachedLocationSearch,
  searchLocations,
} from './locationSearch';

function jsonResponse(
  payload: unknown,
  status = 200,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function photonFeature(
  id: number,
  name: unknown,
  coordinates: unknown,
  options: {
    key?: string;
    value?: string;
    city?: string;
    county?: string;
    state?: string;
  } = {},
) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      osm_type: 'N',
      osm_id: id,
      osm_key: options.key ?? 'place',
      osm_value: options.value ?? 'village',
      name,
      city: options.city,
      county: options.county,
      state: options.state,
    },
  };
}

afterEach(() => {
  clearLocationSearchCache();
  vi.unstubAllGlobals();
});

describe('location search request', () => {
  it('limits results to the Spanish extent and hiking-relevant OSM tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchLocations('Peñalara', 'es', new AbortController().signal);
    await searchLocations('Peñalara', 'en', new AbortController().signal);

    const spanishUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const englishUrl = new URL(String(fetchMock.mock.calls[1][0]));

    expect(spanishUrl.hostname).toBe('photon.komoot.io');
    expect(spanishUrl.searchParams.get('q')).toBe('Peñalara');
    expect(spanishUrl.searchParams.get('bbox')).toBe('-18.6,27.3,4.9,44.2');
    expect(spanishUrl.searchParams.getAll('osm_tag')).toContain('natural');
    expect(spanishUrl.searchParams.getAll('osm_tag')).toContain('place');
    expect(spanishUrl.searchParams.has('lang')).toBe(false);
    expect(englishUrl.searchParams.get('lang')).toBe('en');
  });
});

describe('location search cache', () => {
  it('reuses normalized exact searches while keeping languages independent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          features: [
            photonFeature(1, 'Sevilla', [-5.9845, 37.3891], {
              value: 'city',
              state: 'Andalucía',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          features: [
            photonFeature(1, 'Seville', [-5.9845, 37.3891], {
              value: 'city',
              state: 'Andalusia',
            }),
          ],
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const spanishResults = await searchLocations(
      'Cádiz',
      'es',
      new AbortController().signal,
    );
    const normalizedCacheHit = await searchLocations(
      '  CÁDIZ  ',
      'es',
      new AbortController().signal,
    );
    const englishResults = await searchLocations(
      'Cádiz',
      'en',
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(spanishResults[0].label).toBe('Sevilla, Andalucía');
    expect(normalizedCacheHit).toEqual(spanishResults);
    expect(normalizedCacheHit).not.toBe(spanishResults);
    expect(englishResults[0].label).toBe('Seville, Andalusia');
  });

  it('caches empty successful responses but never caches failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ features: [] }))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          features: [photonFeature(2, 'Cercedilla', [-4.0567, 40.7406])],
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      searchLocations('no-result-query', 'en', new AbortController().signal),
    ).resolves.toEqual([]);
    await expect(
      searchLocations('no-result-query', 'en', new AbortController().signal),
    ).resolves.toEqual([]);

    await expect(
      searchLocations('retry-query', 'en', new AbortController().signal),
    ).rejects.toThrow('HTTP 503');
    await expect(
      searchLocations('retry-query', 'en', new AbortController().signal),
    ).resolves.toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('evicts the least recently used query after 64 exact entries', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const searchText = url.searchParams.get('q') ?? '';

      return jsonResponse({
        features: [photonFeature(3, searchText, [-3.7, 40.4])],
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    for (let index = 0; index < 65; index += 1) {
      await searchLocations(
        `place-${index}`,
        'es',
        new AbortController().signal,
      );
    }

    expect(getCachedLocationSearch('place-0', 'es')).toBeNull();
    expect(getCachedLocationSearch('place-64', 'es')).toHaveLength(1);

    await searchLocations('place-0', 'es', new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(66);
  });
});

describe('location search provider normalization', () => {
  it('rejects missing or non-numeric coordinates and unsupported objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          photonFeature(10, 'String latitude', [-3.7, '40.4']),
          photonFeature(11, 'Missing coordinates', undefined),
          photonFeature(12, '', [-3.7, 40.4]),
          photonFeature(13, 'Bus stop', [-3.7, 40.4], {
            key: 'highway',
            value: 'bus_stop',
          }),
          photonFeature(14, 'Peñalara', [-3.9561, 40.85], {
            key: 'natural',
            value: 'peak',
            county: 'Segovia',
            state: 'Castilla y León',
          }),
        ],
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const results = await searchLocations(
      'coordinate-validation',
      'es',
      new AbortController().signal,
    );

    expect(results).toEqual([
      {
        id: 'peak:N14',
        label: 'Peñalara, Segovia, Castilla y León',
        origin: 'peak',
        latitude: 40.85,
        longitude: -3.9561,
      },
    ]);
  });

  it('removes duplicate labels within one category but keeps other categories', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          photonFeature(20, 'Teide', [-16.6423, 28.2727], {
            key: 'natural',
            value: 'volcano',
            county: 'Santa Cruz de Tenerife',
          }),
          photonFeature(21, '  Teide  ', [-16.64, 28.27], {
            key: 'natural',
            value: 'volcano',
            county: 'Santa Cruz de Tenerife',
          }),
          photonFeature(22, 'Teide', [-16.6429, 28.2734], {
            key: 'place',
            value: 'locality',
            county: 'Santa Cruz de Tenerife',
          }),
        ],
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const results = await searchLocations(
      'label-normalization',
      'es',
      new AbortController().signal,
    );

    expect(results.map((result) => [result.origin, result.label])).toEqual([
      ['peak', 'Teide, Santa Cruz de Tenerife'],
      ['locality', 'Teide, Santa Cruz de Tenerife'],
    ]);
  });
});

describe('classifyPhotonOrigin', () => {
  it.each([
    ['place', 'village', 'locality'],
    ['natural', 'peak', 'peak'],
    ['natural', 'saddle', 'peak'],
    ['mountain_pass', 'yes', 'peak'],
    ['tourism', 'alpine_hut', 'hut'],
    ['boundary', 'national_park', 'area'],
    ['natural', 'spring', 'nature'],
    ['waterway', 'waterfall', 'nature'],
    ['shop', 'travel_agency', null],
  ])('maps %s=%s to %s', (key, value, expected) => {
    expect(classifyPhotonOrigin(key, value)).toBe(expected);
  });
});
