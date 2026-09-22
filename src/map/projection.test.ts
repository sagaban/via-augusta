/**
 * Business context: protects the WGS 84 / Web Mercator exchange boundary used
 * by GPX, search, routing, and browser geolocation, plus the ETRS89 / UTM
 * conversion shown to Spanish users. Batch conversion must preserve the exact
 * coordinate order and numerical result of the single-point API.
 */
import { describe, expect, it } from 'vitest';
import {
  fromWgs84,
  fromWgs84Coordinates,
  toUtm,
  toWgs84,
  toWgs84Coordinates,
  utmToWgs84,
  utmZoneForLongitude,
} from './projection';

describe('projection coordinate batches', () => {
  it('matches single-point WGS 84 to map conversion without mutating input', () => {
    const coordinates = [
      [-3.7038, 40.4168],
      [2.1734, 41.3851],
      [-16.2519, 28.4636],
    ];
    const original = coordinates.map((coordinate) => [...coordinate]);

    const projected = fromWgs84Coordinates(coordinates);

    expect(projected).toHaveLength(coordinates.length);
    expect(coordinates).toEqual(original);

    for (let index = 0; index < coordinates.length; index += 1) {
      const expected = fromWgs84(coordinates[index]);
      expect(projected[index][0]).toBeCloseTo(expected[0], 8);
      expect(projected[index][1]).toBeCloseTo(expected[1], 8);
    }
  });

  it('round-trips map coordinates to WGS 84 and handles empty arrays', () => {
    const coordinates = fromWgs84Coordinates([
      [-5.9845, 37.3891],
      [-0.3763, 39.4699],
    ]);
    const geographic = toWgs84Coordinates(coordinates);

    for (let index = 0; index < coordinates.length; index += 1) {
      const expected = toWgs84(coordinates[index]);
      expect(geographic[index][0]).toBeCloseTo(expected[0], 8);
      expect(geographic[index][1]).toBeCloseTo(expected[1], 8);
    }

    expect(fromWgs84Coordinates([])).toEqual([]);
    expect(toWgs84Coordinates([])).toEqual([]);
  });
});

describe('ETRS89 / UTM', () => {
  it('chooses the natural zone and clamps it to the Spanish zones', () => {
    expect(utmZoneForLongitude(-16.5)).toBe(28);
    expect(utmZoneForLongitude(-8.5)).toBe(29);
    expect(utmZoneForLongitude(-3.7)).toBe(30);
    expect(utmZoneForLongitude(2.2)).toBe(31);
    expect(utmZoneForLongitude(12)).toBe(31);
  });

  it('converts Puerta del Sol to zone 30 and back', () => {
    const utm = toUtm(fromWgs84([-3.7038, 40.4168]));

    expect(utm.zone).toBe(30);
    expect(utm.easting).toBeCloseTo(440_291, -1);
    expect(utm.northing).toBeCloseTo(4_474_254, -1);

    const [longitude, latitude] = utmToWgs84(utm);
    expect(longitude).toBeCloseTo(-3.7038, 6);
    expect(latitude).toBeCloseTo(40.4168, 6);
  });
});
