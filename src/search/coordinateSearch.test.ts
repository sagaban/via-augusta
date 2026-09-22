/**
 * Business context: protects local coordinate search against regressions in
 * accepted WGS 84 and ETRS89 / UTM formats, axis-order detection, map-extent
 * validation, and rejection of text that must remain a normal place search.
 */
import { describe, expect, it } from 'vitest';
import { fromWgs84, toUtm } from '../map/projection';
import {
  isCoordinateSearchDraft,
  parseCoordinateSearch,
} from './coordinateSearch';

describe('WGS 84 coordinate search', () => {
  it.each([
    ['40.4168, -3.7038', 40.4168, -3.7038],
    ['-3.7038 40.4168', 40.4168, -3.7038],
    ['40.4168; -3.7038', 40.4168, -3.7038],
    ['40,4168 ; -3,7038', 40.4168, -3.7038],
  ])(
    'recognizes %s without depending on one axis order or separator',
    (searchText, latitude, longitude) => {
      const parsed = parseCoordinateSearch(searchText);

      expect(parsed.kind).toBe('result');

      if (parsed.kind !== 'result') {
        return;
      }

      expect(parsed.result).toMatchObject({
        label: '40.4168, -3.7038',
        origin: 'wgs84',
        latitude,
        longitude,
      });
    },
  );

  it.each([
    '48.8566, 2.3522',
    '2.3522, 48.8566',
    '-48, -174',
  ])('reports supported coordinates outside the Spanish map: %s', (searchText) => {
    expect(parseCoordinateSearch(searchText)).toEqual({
      kind: 'outside-map',
    });
  });
});

describe('UTM coordinate search', () => {
  const madridUtm = toUtm(fromWgs84([-3.7038, 40.4168]));
  const easting = Math.round(madridUtm.easting);
  const northing = Math.round(madridUtm.northing);

  it.each([
    `30T ${easting} ${northing}`,
    `30 ${easting} ${northing}`,
    `30S, ${easting}, ${northing}`,
    `${easting} ${northing}`,
    `${easting}, ${northing}`,
    `${northing}; ${easting}`,
  ])('recognizes zoned, zone-less, and reversed input: %s', (searchText) => {
    const parsed = parseCoordinateSearch(searchText);

    expect(parsed.kind).toBe('result');

    if (parsed.kind !== 'result') {
      return;
    }

    expect(parsed.result.origin).toBe('utm');
    expect(parsed.result.label).toBe(`30 ${easting} ${northing}`);
    expect(parsed.result.latitude).toBeCloseTo(40.4168, 4);
    expect(parsed.result.longitude).toBeCloseTo(-3.7038, 4);
  });

  it('assumes zone 28 for zone-less Canary Islands northings', () => {
    const teide = toUtm(fromWgs84([-16.6423, 28.2727]));
    const parsed = parseCoordinateSearch(
      `${Math.round(teide.easting)} ${Math.round(teide.northing)}`,
    );

    expect(teide.zone).toBe(28);
    expect(parsed.kind).toBe('result');

    if (parsed.kind === 'result') {
      expect(parsed.result.label.startsWith('28 ')).toBe(true);
      expect(parsed.result.latitude).toBeCloseTo(28.2727, 4);
      expect(parsed.result.longitude).toBeCloseTo(-16.6423, 4);
    }
  });

  it('honours an explicit zone that differs from the default', () => {
    const barcelona = toUtm(fromWgs84([2.1734, 41.3851]));
    const parsed = parseCoordinateSearch(
      `31T ${Math.round(barcelona.easting)} ${Math.round(barcelona.northing)}`,
    );

    expect(parsed.kind).toBe('result');

    if (parsed.kind === 'result') {
      expect(parsed.result.longitude).toBeCloseTo(2.1734, 4);
      expect(parsed.result.latitude).toBeCloseTo(41.3851, 4);
    }
  });

  it('reports plausible UTM input outside the navigable map extent', () => {
    expect(parseCoordinateSearch('30 440000 4940000')).toEqual({
      kind: 'outside-map',
    });
  });
});

describe('coordinate-search strictness', () => {
  it.each([
    '28013 Madrid',
    '1204 2026',
    '40,4, -3,7',
    'Madrid 40.4 -3.7',
  ])('leaves non-coordinate text to the normal place search: %s', (searchText) => {
    expect(parseCoordinateSearch(searchText)).toEqual({
      kind: 'not-coordinate',
    });
  });
});

describe('coordinate-search drafts', () => {
  it.each([
    '30 440291 44',
    '440291, 44',
    '440291 4',
    '40.41,',
  ])('keeps unfinished coordinate-like input local: %s', (searchText) => {
    expect(isCoordinateSearchDraft(searchText)).toBe(true);
  });

  it.each([
    '28013',
    '28013 Madrid',
    'Madrid 40.4',
    '40.4168, -3.7038',
  ])('preserves place searches and complete coordinates: %s', (searchText) => {
    expect(isCoordinateSearchDraft(searchText)).toBe(false);
  });
});
