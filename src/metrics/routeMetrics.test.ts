/**
 * Business context: protects route statistics shared by editable itineraries
 * and imported GPX files. Distances must not bridge disconnected segments,
 * elevation totals must stay segment-local, and the MIDE walking-time
 * estimate must remain stable across refactoring.
 */
import type { Coordinate } from 'ol/coordinate.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromWgs84 } from '../map/projection';
import {
  calculateRouteDistance,
  calculateRouteSegmentsDistance,
  createImportedRouteElevationSummary,
  estimateHikingDuration,
  fetchRouteElevationSummary,
  fetchRouteSegmentsElevationSummary,
  resampleRouteGeodesically,
  smoothElevations,
} from './routeMetrics';

/** Metres per degree of latitude, used to build routes of known length. */
const METERS_PER_LATITUDE_DEGREE = 111_132;

/** Map coordinate `northMeters` north of a point near Cercedilla (Madrid). */
function point(northMeters: number, eastDegrees = 0): Coordinate {
  return fromWgs84([
    -4.05 + eastDegrees,
    40.74 + northMeters / METERS_PER_LATITUDE_DEGREE,
  ]);
}

/** Open-Meteo-like response echoing one elevation per requested latitude. */
function stubElevationProvider(
  elevationAt: (index: number, total: number) => number,
) {
  const requestedCounts: number[] = [];
  let served = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const count = new URL(String(input)).searchParams
      .get('latitude')!
      .split(',').length;
    const offset = served;
    served += count;
    requestedCounts.push(count);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        elevation: Array.from({ length: count }, (_value, index) =>
          elevationAt(offset + index, count),
        ),
      }),
    } as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requestedCounts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('route metrics', () => {
  it('calculates geodesic route distance in metres despite Web Mercator scale', () => {
    const distance = calculateRouteDistance([point(0), point(1_000)]);

    expect(distance).toBeGreaterThan(995);
    expect(distance).toBeLessThan(1_005);
  });

  it('sums independent GPX segments without inventing a connector across their gap', () => {
    const firstSegment = [point(0), point(1_000)];
    const secondSegment = [point(0, 1), point(1_000, 1)];

    const total = calculateRouteSegmentsDistance([
      firstSegment,
      secondSegment,
    ]);

    expect(total).toBeCloseTo(
      calculateRouteDistance(firstSegment) +
        calculateRouteDistance(secondSegment),
      8,
    );
    expect(total).toBeLessThan(2_100);
  });

  it('accumulates embedded GPX ascent and descent independently per segment', () => {
    const summary = createImportedRouteElevationSummary([
      {
        coordinates: [point(0), point(100)],
        elevationsMeters: [500, 550],
      },
      {
        coordinates: [point(0, 1), point(100, 1)],
        elevationsMeters: [900, 850],
      },
    ]);

    expect(summary.ascentMeters).toBeCloseTo(50, 8);
    expect(summary.descentMeters).toBeCloseTo(50, 8);

    const firstRepeatedDistanceIndex = summary.points.findIndex(
      (point, index) =>
        index > 0 &&
        point.distanceMeters === summary.points[index - 1].distanceMeters,
    );
    expect(firstRepeatedDistanceIndex).toBeGreaterThan(0);
    expect(summary.points[firstRepeatedDistanceIndex - 1].elevationMeters).toBe(
      550,
    );
    expect(summary.points[firstRepeatedDistanceIndex].elevationMeters).toBe(900);
  });

  it('interpolates irregular embedded GPX elevations across ascending samples', () => {
    const coordinates = [point(0), point(10), point(100)];
    const firstSectionDistance = calculateRouteDistance(coordinates.slice(0, 2));
    const totalDistance = calculateRouteDistance(coordinates);
    const summary = createImportedRouteElevationSummary([
      {
        coordinates,
        elevationsMeters: [500, 600, 700],
      },
    ]);
    const firstInteriorSample = summary.points[1];
    const expectedElevation =
      600 +
      ((firstInteriorSample.distanceMeters - firstSectionDistance) /
        (totalDistance - firstSectionDistance)) *
        100;

    expect(firstInteriorSample.distanceMeters).toBeGreaterThan(
      firstSectionDistance,
    );
    expect(firstInteriorSample.elevationMeters).toBeCloseTo(
      expectedElevation,
      8,
    );
    expect(summary.ascentMeters).toBeCloseTo(200, 8);
    expect(summary.descentMeters).toBe(0);
  });

  it('rejects imported elevation data with no valid measurable segment', () => {
    expect(() =>
      createImportedRouteElevationSummary([
        {
          coordinates: [point(0)],
          elevationsMeters: [500],
        },
      ]),
    ).toThrow('too few valid samples');
  });

  it('applies the MIDE flat pace and ignores repeated-distance GPX gaps', () => {
    const flatDuration = estimateHikingDuration([
      { distanceMeters: 0, elevationMeters: 500 },
      { distanceMeters: 1_000, elevationMeters: 500 },
    ]);
    const durationWithGap = estimateHikingDuration([
      { distanceMeters: 0, elevationMeters: 500 },
      { distanceMeters: 1_000, elevationMeters: 500 },
      { distanceMeters: 1_000, elevationMeters: 900 },
      { distanceMeters: 2_000, elevationMeters: 900 },
    ]);

    // 1 km at 4 km/h.
    expect(flatDuration).toBeCloseTo(15, 8);
    expect(durationWithGap).toBeCloseTo(30, 8);
  });

  it('adds the larger of horizontal and vertical time plus half of the smaller', () => {
    const ascent = estimateHikingDuration([
      { distanceMeters: 0, elevationMeters: 0 },
      { distanceMeters: 1_000, elevationMeters: 400 },
    ]);
    const descent = estimateHikingDuration([
      { distanceMeters: 0, elevationMeters: 600 },
      { distanceMeters: 1_000, elevationMeters: 0 },
    ]);

    // Vertical 60 min dominates; half of the 15 min horizontal time is added.
    expect(ascent).toBeCloseTo(67.5, 8);
    expect(descent).toBeCloseTo(67.5, 8);
  });

  it('applies the MIDE rule per kilometre section instead of over the whole route', () => {
    const upAndDown = estimateHikingDuration([
      { distanceMeters: 0, elevationMeters: 0 },
      { distanceMeters: 1_000, elevationMeters: 400 },
      { distanceMeters: 2_000, elevationMeters: 0 },
    ]);

    // 67.5 min up; down: 40 min vertical + 7.5 min horizontal.
    expect(upAndDown).toBeCloseTo(115, 8);
  });

  it('resamples a route at evenly spaced geodesic distances', () => {
    const lonLats: Coordinate[] = [
      [-4.05, 40.74],
      [-4.05, 40.745],
      [-4.05, 40.76],
    ];
    const { positions, distancesMeters } = resampleRouteGeodesically(
      lonLats,
      5,
    );

    expect(positions).toHaveLength(5);
    expect(positions[0]).toEqual(lonLats[0]);
    expect(positions[4][1]).toBeCloseTo(40.76, 10);
    expect(positions[2][1]).toBeCloseTo(40.75, 6);

    for (let index = 1; index < distancesMeters.length; index += 1) {
      expect(distancesMeters[index] - distancesMeters[index - 1]).toBeCloseTo(
        distancesMeters[4] / 4,
        6,
      );
    }
  });

  it('smooths interior samples while keeping both endpoints exact', () => {
    expect(smoothElevations([0, 0, 10, 0, 0], 1)).toEqual([0, 10 / 3, 10 / 3, 10 / 3, 0]);
    expect(smoothElevations([5, 7], 2)).toEqual([5, 7]);
  });

  it('builds a smoothed Open-Meteo profile at 20 m spacing', async () => {
    const { fetchMock, requestedCounts } = stubElevationProvider(
      (index) => 500 + index * 2,
    );
    const coordinates = [point(0), point(1_000)];
    const distance = calculateRouteDistance(coordinates);

    const summary = await fetchRouteElevationSummary(
      coordinates,
      distance,
      new AbortController().signal,
    );

    // ceil(distance / 20) + 1 samples, in a single batch of at most 100.
    const sampleCount = Math.ceil(distance / 20) + 1;
    expect(requestedCounts).toEqual([sampleCount]);
    expect(summary.points).toHaveLength(sampleCount);
    expect(summary.points[0]).toEqual({ distanceMeters: 0, elevationMeters: 500 });
    const last = summary.points[sampleCount - 1];
    expect(last.distanceMeters).toBeCloseTo(distance, 6);
    expect(last.elevationMeters).toBe(500 + (sampleCount - 1) * 2);
    expect(summary.ascentMeters).toBeCloseTo((sampleCount - 1) * 2, 8);
    expect(summary.descentMeters).toBeCloseTo(0, 8);

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.hostname).toBe('api.open-meteo.com');
    expect(Number(requestUrl.searchParams.get('latitude')!.split(',')[0])).toBeCloseTo(
      40.74,
      5,
    );
  });

  it('rejects an elevation response that does not match the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ elevation: [500] }),
      }) as Response),
    );

    await expect(
      fetchRouteElevationSummary(
        [point(0), point(1_000)],
        1_000,
        new AbortController().signal,
      ),
    ).rejects.toThrow('does not match');
  });

  it('shares one 1,000-point profile budget across independent segments', async () => {
    const { requestedCounts } = stubElevationProvider(() => 500);

    const summary = await fetchRouteSegmentsElevationSummary(
      [
        [point(0), point(20_000)],
        [point(0, 1), point(40_000, 1)],
      ],
      new AbortController().signal,
    );

    expect(requestedCounts.every((count) => count <= 100)).toBe(true);
    expect(
      requestedCounts.reduce((total, count) => total + count, 0),
    ).toBe(1_000);
    expect(summary.points).toHaveLength(1_000);
  });
});
