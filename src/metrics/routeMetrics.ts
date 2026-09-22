/**
 * Business context: derives the compact planning statistics shown for the
 * current route. Distance is calculated geodesically in the browser. Editable
 * routes are resampled locally and their elevations requested from the
 * Copernicus DEM through Open-Meteo, while imported GPX files reuse their
 * complete embedded elevations when possible. The ordered profile samples also
 * feed an estimate based on the MIDE hiking-time method used in Spain.
 */
import type { Coordinate } from 'ol/coordinate.js';
import LineString from 'ol/geom/LineString.js';
import { getDistance, getLength } from 'ol/sphere.js';
import { fetchElevations } from '../elevation/openMeteoElevation';
import {
  MAP_PROJECTION_CODE,
  toWgs84Coordinates,
} from '../map/projection';

/** Target spacing in metres between elevation samples along the route. */
const PROFILE_SAMPLE_INTERVAL_METERS = 20;
/** Minimum profile size required to calculate ascent and descent. */
const PROFILE_MIN_SAMPLE_POINTS = 2;
/**
 * Maximum combined response size requested from the profile service. Independent
 * route segments share this budget so provider fragmentation cannot multiply
 * profile size while ordinary hikes retain roughly 20 metre sampling.
 */
const PROFILE_MAX_SAMPLE_POINTS = 1_000;
/**
 * Number of neighbouring samples on either side used by the local moving
 * average. The 90 m DEM produces small steps between cells; smoothing prevents
 * them from inflating ascent and descent without flattening genuine climbs.
 */
const PROFILE_SMOOTHING_OFFSET = 2;
/** MIDE reference horizontal walking speed in metres per hour. */
const MIDE_HORIZONTAL_SPEED_METERS_PER_HOUR = 4_000;
/** MIDE reference ascent rate in metres per hour. */
const MIDE_ASCENT_METERS_PER_HOUR = 400;
/** MIDE reference descent rate in metres per hour. */
const MIDE_DESCENT_METERS_PER_HOUR = 600;
/**
 * Horizontal length of the sections to which the MIDE combination rule is
 * applied. MIDE is meant for homogeneous stretches rather than 20 m samples;
 * about one kilometre keeps local climbs visible while avoiding sample noise.
 */
const MIDE_SECTION_LENGTH_METERS = 1_000;

/** Availability state for altitude-dependent itinerary figures. */
export type RouteElevationStatus = 'loading' | 'ready' | 'error';

/** One ordered elevation sample along the route. */
export interface RouteElevationPoint {
  /** Cumulative distance from the start of the route in metres. */
  distanceMeters: number;
  /** Profile elevation in metres. */
  elevationMeters: number;
}

/** Elevation values used by the route summary and optional profile chart. */
export interface RouteElevationSummary {
  /** Accumulated positive elevation change in metres. */
  ascentMeters: number;
  /** Accumulated negative elevation change in metres, expressed positively. */
  descentMeters: number;
  /** Ordered samples used by the elevation chart. */
  points: RouteElevationPoint[];
}

/** One imported GPX segment with a complete altitude for every map coordinate. */
export interface ImportedRouteElevationSegment {
  /** Ordered segment geometry in the map projection. */
  coordinates: Coordinate[];
  /** Embedded GPX elevations matching the coordinate array one-for-one. */
  elevationsMeters: number[];
}

/** Monotone lookup state reused while sampling one imported elevation series. */
interface ImportedElevationCursor {
  /** First source point whose distance is at or beyond the current sample. */
  upperIndex: number;
}

/**
 * Resamples a route at evenly spaced geodesic distances.
 *
 * @param lonLats - Ordered WGS 84 route vertices.
 * @param sampleCount - Number of samples including both endpoints.
 * @returns Sample positions and their cumulative distances in metres.
 */
export function resampleRouteGeodesically(
  lonLats: Coordinate[],
  sampleCount: number,
): { positions: Coordinate[]; distancesMeters: number[] } {
  const cumulativeDistances = [0];

  for (let index = 1; index < lonLats.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] +
        getDistance(lonLats[index - 1], lonLats[index]),
    );
  }

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
  const positions: Coordinate[] = [];
  const distancesMeters: number[] = [];
  let segmentIndex = 1;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const targetDistance = (totalDistance * sample) / (sampleCount - 1);

    while (
      segmentIndex < cumulativeDistances.length - 1 &&
      cumulativeDistances[segmentIndex] < targetDistance
    ) {
      segmentIndex += 1;
    }

    const startDistance = cumulativeDistances[segmentIndex - 1];
    const segmentLength = cumulativeDistances[segmentIndex] - startDistance;
    const ratio =
      segmentLength > 0
        ? Math.min(1, Math.max(0, (targetDistance - startDistance) / segmentLength))
        : 0;
    const start = lonLats[segmentIndex - 1];
    const end = lonLats[segmentIndex];

    positions.push([
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
    ]);
    distancesMeters.push(targetDistance);
  }

  return { positions, distancesMeters };
}

/**
 * Applies a centred moving average while keeping both profile endpoints exact.
 * @param values - Raw elevation samples.
 * @param offset - Neighbours used on each side.
 */
export function smoothElevations(values: number[], offset: number): number[] {
  return values.map((value, index) => {
    if (index === 0 || index === values.length - 1) {
      return value;
    }

    const start = Math.max(0, index - offset);
    const end = Math.min(values.length - 1, index + offset);
    let total = 0;

    for (let cursor = start; cursor <= end; cursor += 1) {
      total += values[cursor];
    }

    return total / (end - start + 1);
  });
}

/** Calculates the ideal amount of elevation samples before applying a budget. */
function targetProfileSampleCount(distanceMeters: number): number {
  return Math.max(
    PROFILE_MIN_SAMPLE_POINTS,
    Math.ceil(distanceMeters / PROFILE_SAMPLE_INTERVAL_METERS) + 1,
  );
}

/** Applies the global safety cap to one continuous route profile. */
function profileSampleCount(distanceMeters: number): number {
  return Math.min(
    PROFILE_MAX_SAMPLE_POINTS,
    targetProfileSampleCount(distanceMeters),
  );
}

/** Measurable route segment paired with its geodesic length and sample budget. */
interface MeasurableProfileSegment {
  /** Independent route geometry in the map projection. */
  segment: Coordinate[];
  /** Geodesic segment length in metres. */
  distanceMeters: number;
  /** Number of elevation points requested for this segment. */
  sampleCount: number;
}

/**
 * Shares the global profile budget across independent route segments.
 *
 * Every measurable segment keeps at least its two endpoints. Remaining points
 * are distributed in proportion to the density each segment would request on
 * its own, while largest fractional remainders consume the final rounding slots.
 *
 * @param segments - Independent route geometries in the map projection.
 * @returns Measurable segments with a combined sample count no greater than 1,000.
 * @throws {Error} When more independent segments exist than the budget can represent.
 */
function allocateSegmentProfileSamples(
  segments: Coordinate[][],
): MeasurableProfileSegment[] {
  const measurableSegments = segments
    .map((segment) => ({
      segment,
      distanceMeters: calculateRouteDistance(segment),
    }))
    .filter(
      ({ segment, distanceMeters }) =>
        segment.length >= 2 && distanceMeters > 0,
    );

  if (
    measurableSegments.length * PROFILE_MIN_SAMPLE_POINTS >
    PROFILE_MAX_SAMPLE_POINTS
  ) {
    throw new Error(
      'Elevation profile contains too many independent route segments.',
    );
  }

  const desiredSampleCounts = measurableSegments.map(({ distanceMeters }) =>
    targetProfileSampleCount(distanceMeters),
  );
  const desiredTotal = desiredSampleCounts.reduce(
    (total, sampleCount) => total + sampleCount,
    0,
  );

  if (desiredTotal <= PROFILE_MAX_SAMPLE_POINTS) {
    return measurableSegments.map((segment, index) => ({
      ...segment,
      sampleCount: desiredSampleCounts[index],
    }));
  }

  const minimumTotal =
    measurableSegments.length * PROFILE_MIN_SAMPLE_POINTS;
  const remainingBudget = PROFILE_MAX_SAMPLE_POINTS - minimumTotal;
  const desiredExtraCounts = desiredSampleCounts.map(
    (sampleCount) => sampleCount - PROFILE_MIN_SAMPLE_POINTS,
  );
  const desiredExtraTotal = desiredExtraCounts.reduce(
    (total, sampleCount) => total + sampleCount,
    0,
  );
  const allocations = desiredExtraCounts.map((desiredExtraCount, index) => {
    const exactShare =
      (remainingBudget * desiredExtraCount) / desiredExtraTotal;
    const allocatedExtraCount = Math.floor(exactShare);

    return {
      index,
      allocatedExtraCount,
      remainder: exactShare - allocatedExtraCount,
    };
  });
  let unallocatedPoints =
    remainingBudget -
    allocations.reduce(
      (total, allocation) => total + allocation.allocatedExtraCount,
      0,
    );

  // Largest remainders keep the proportional distribution deterministic while
  // ensuring rounding never pushes the combined provider request above 1,000.
  for (const allocation of [...allocations].sort(
    (first, second) =>
      second.remainder - first.remainder || first.index - second.index,
  )) {
    if (unallocatedPoints === 0) {
      break;
    }

    allocation.allocatedExtraCount += 1;
    unallocatedPoints -= 1;
  }

  return measurableSegments.map((segment, index) => ({
    ...segment,
    sampleCount:
      PROFILE_MIN_SAMPLE_POINTS + allocations[index].allocatedExtraCount,
  }));
}

/**
 * Calculates geodesic route length from the displayed map geometry.
 * @param coordinates - Ordered route vertices in the map projection.
 * @returns Horizontal distance in metres, or zero for fewer than two points.
 */
export function calculateRouteDistance(coordinates: Coordinate[]): number {
  if (coordinates.length < 2) {
    return 0;
  }

  const line = new LineString(
    coordinates.map((coordinate) => [coordinate[0], coordinate[1]]),
  );
  return getLength(line, { projection: MAP_PROJECTION_CODE });
}

/** Calculates total geodesic length without inventing links across GPX gaps. */
export function calculateRouteSegmentsDistance(segments: Coordinate[][]): number {
  return segments.reduce(
    (total, segment) => total + calculateRouteDistance(segment),
    0,
  );
}

/** Measures cumulative geodesic distances at each imported GPX coordinate. */
function measureImportedSegment(coordinates: Coordinate[]): number[] {
  const lonLatCoordinates = toWgs84Coordinates(coordinates);
  const cumulativeDistances = [0];

  for (let index = 1; index < lonLatCoordinates.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[cumulativeDistances.length - 1] +
        getDistance(lonLatCoordinates[index - 1], lonLatCoordinates[index]),
    );
  }

  return cumulativeDistances;
}

/**
 * Interpolates an imported GPX elevation at one cumulative segment distance.
 * Samples are requested in ascending order, so the shared cursor advances only
 * forward instead of rescanning a dense recording from its first point.
 *
 * @param cumulativeDistances - Ordered source-point distances in metres.
 * @param elevationsMeters - Elevations matching the source points one-for-one.
 * @param distanceMeters - Requested segment-local cumulative distance.
 * @param cursor - Mutable monotone lookup position for this segment only.
 * @returns Linearly interpolated elevation in metres.
 */
function importedElevationAtDistance(
  cumulativeDistances: number[],
  elevationsMeters: number[],
  distanceMeters: number,
  cursor: ImportedElevationCursor,
): number {
  if (distanceMeters <= 0) {
    return elevationsMeters[0];
  }

  const lastIndex = cumulativeDistances.length - 1;
  const totalDistanceMeters = cumulativeDistances[lastIndex];

  if (distanceMeters >= totalDistanceMeters) {
    cursor.upperIndex = lastIndex;
    return elevationsMeters[lastIndex];
  }

  while (
    cursor.upperIndex < cumulativeDistances.length &&
    cumulativeDistances[cursor.upperIndex] < distanceMeters
  ) {
    cursor.upperIndex += 1;
  }

  const lowerIndex = Math.max(0, cursor.upperIndex - 1);
  const lowerDistance = cumulativeDistances[lowerIndex];
  const upperDistance = cumulativeDistances[cursor.upperIndex];
  const distanceSpan = upperDistance - lowerDistance;
  const fraction =
    distanceSpan > 0
      ? (distanceMeters - lowerDistance) / distanceSpan
      : 0;

  return (
    elevationsMeters[lowerIndex] +
    (elevationsMeters[cursor.upperIndex] - elevationsMeters[lowerIndex]) *
      fraction
  );
}

/**
 * Builds a regular profile from complete elevations embedded in a GPX file.
 *
 * GPX track points are often distributed irregularly because they preserve map
 * bends as well as profile samples. Resampling the embedded altitude function at
 * a roughly 20 metre interval prevents dense bends from
 * producing a visibly jagged chart while retaining the file's own elevations.
 * Deliberate gaps remain independent for distance and elevation accumulation.
 *
 * @param segments - Imported map geometry with complete matching elevations.
 * @returns Combined route statistics and regularly spaced profile samples.
 * @throws {Error} If no segment contains a valid measurable elevation series.
 */
export function createImportedRouteElevationSummary(
  segments: ImportedRouteElevationSegment[],
): RouteElevationSummary {
  let ascentMeters = 0;
  let descentMeters = 0;
  let cumulativeRouteDistanceMeters = 0;
  const points: RouteElevationPoint[] = [];

  for (const segment of segments) {
    if (
      segment.coordinates.length < 2 ||
      segment.coordinates.length !== segment.elevationsMeters.length ||
      segment.elevationsMeters.some((elevation) => !Number.isFinite(elevation))
    ) {
      continue;
    }

    const cumulativeDistances = measureImportedSegment(segment.coordinates);
    const segmentDistanceMeters =
      cumulativeDistances[cumulativeDistances.length - 1] ?? 0;

    if (segmentDistanceMeters <= 0) {
      continue;
    }

    const sampleCount = profileSampleCount(segmentDistanceMeters);
    const segmentPoints: RouteElevationPoint[] = [];
    const elevationCursor: ImportedElevationCursor = { upperIndex: 1 };

    for (let index = 0; index < sampleCount; index += 1) {
      const distanceMeters =
        sampleCount === 1
          ? 0
          : (index / (sampleCount - 1)) * segmentDistanceMeters;
      segmentPoints.push({
        distanceMeters: cumulativeRouteDistanceMeters + distanceMeters,
        elevationMeters: importedElevationAtDistance(
          cumulativeDistances,
          segment.elevationsMeters,
          distanceMeters,
          elevationCursor,
        ),
      });
    }

    for (let index = 1; index < segmentPoints.length; index += 1) {
      const difference =
        segmentPoints[index].elevationMeters -
        segmentPoints[index - 1].elevationMeters;

      if (difference > 0) {
        ascentMeters += difference;
      } else {
        descentMeters -= difference;
      }
    }

    points.push(...segmentPoints);
    cumulativeRouteDistanceMeters += segmentDistanceMeters;
  }

  if (points.length < PROFILE_MIN_SAMPLE_POINTS) {
    throw new Error('Imported elevation profile contains too few valid samples.');
  }

  return { ascentMeters, descentMeters, points };
}

/**
 * Retrieves elevation profiles for independent GPX segments and combines their
 * totals without adding ascent, descent, or distance across deliberate gaps.
 *
 * @param segments - Independent itinerary lines in the map projection.
 * @param signal - Abort signal used when another GPX or route replaces the request.
 * @returns Combined ascent, descent, and cumulative samples without gap connectors.
 * @throws {Error} If no usable segment profile can be retrieved or validated.
 */
export async function fetchRouteSegmentsElevationSummary(
  segments: Coordinate[][],
  signal: AbortSignal,
): Promise<RouteElevationSummary> {
  let ascentMeters = 0;
  let descentMeters = 0;
  let cumulativeDistanceMeters = 0;
  const points: RouteElevationPoint[] = [];
  const measurableSegments = allocateSegmentProfileSamples(segments);

  for (const { segment, distanceMeters, sampleCount } of measurableSegments) {
    const summary = await fetchRouteElevationSummary(
      segment,
      distanceMeters,
      signal,
      sampleCount,
    );

    ascentMeters += summary.ascentMeters;
    descentMeters += summary.descentMeters;
    points.push(
      ...summary.points.map((point) => ({
        ...point,
        distanceMeters: point.distanceMeters + cumulativeDistanceMeters,
      })),
    );
    cumulativeDistanceMeters += distanceMeters;
  }

  if (points.length < PROFILE_MIN_SAMPLE_POINTS) {
    throw new Error('Elevation profile contains too few valid samples.');
  }

  return { ascentMeters, descentMeters, points };
}

/**
 * Retrieves and accumulates smoothed elevations along the current route.
 *
 * @param coordinates - Ordered route vertices in the map projection.
 * @param distanceMeters - Already calculated route distance used to size the profile.
 * @param signal - Abort signal used when route history changes before completion.
 * @param requestedSampleCount - Optional share of a multi-segment global budget.
 * @returns Total ascent and descent in metres.
 * @throws {Error} If the route, sample budget, or profile response is invalid.
 */
export async function fetchRouteElevationSummary(
  coordinates: Coordinate[],
  distanceMeters: number,
  signal: AbortSignal,
  requestedSampleCount = profileSampleCount(distanceMeters),
): Promise<RouteElevationSummary> {
  if (coordinates.length < 2 || distanceMeters <= 0) {
    throw new Error('An elevation profile requires a route line.');
  }

  if (
    !Number.isInteger(requestedSampleCount) ||
    requestedSampleCount < PROFILE_MIN_SAMPLE_POINTS ||
    requestedSampleCount > PROFILE_MAX_SAMPLE_POINTS
  ) {
    throw new Error('Elevation profile sample count is outside safe limits.');
  }

  const { positions, distancesMeters } = resampleRouteGeodesically(
    toWgs84Coordinates(coordinates),
    requestedSampleCount,
  );
  const elevations = smoothElevations(
    await fetchElevations(positions, signal),
    PROFILE_SMOOTHING_OFFSET,
  );
  const points: RouteElevationPoint[] = elevations.map(
    (elevationMeters, index) => ({
      distanceMeters: distancesMeters[index],
      elevationMeters,
    }),
  );

  if (points.length < PROFILE_MIN_SAMPLE_POINTS) {
    throw new Error('Elevation profile contains too few valid samples.');
  }

  let ascentMeters = 0;
  let descentMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    const difference =
      points[index].elevationMeters - points[index - 1].elevationMeters;

    if (difference > 0) {
      ascentMeters += difference;
    } else {
      descentMeters -= difference;
    }
  }

  return {
    ascentMeters,
    descentMeters,
    points,
  };
}

/**
 * Combines horizontal and vertical walking times with the MIDE rule: the
 * larger of both plus half of the smaller.
 * @returns Section time in minutes.
 */
function combineMideTimes(
  horizontalMeters: number,
  ascentMeters: number,
  descentMeters: number,
): number {
  const horizontalHours =
    horizontalMeters / MIDE_HORIZONTAL_SPEED_METERS_PER_HOUR;
  const verticalHours =
    ascentMeters / MIDE_ASCENT_METERS_PER_HOUR +
    descentMeters / MIDE_DESCENT_METERS_PER_HOUR;

  return (
    (Math.max(horizontalHours, verticalHours) +
      Math.min(horizontalHours, verticalHours) / 2) *
    60
  );
}

/**
 * Estimates walking time with the MIDE method (Método de Información de
 * Excursiones): 4 km/h horizontally, 400 m/h up, and 600 m/h down, combined
 * per section as the larger time plus half of the smaller one.
 *
 * The profile is split into sections of about one kilometre so the rule is
 * applied to meaningful stretches instead of individual samples. Repeated
 * profile distances mark gaps between independent GPX segments and are ignored.
 *
 * @param points - Ordered cumulative-distance and elevation profile samples.
 * @returns Estimated walking time in minutes, excluding breaks.
 */
export function estimateHikingDuration(
  points: RouteElevationPoint[],
): number {
  let durationMinutes = 0;
  let sectionHorizontalMeters = 0;
  let sectionAscentMeters = 0;
  let sectionDescentMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];
    const horizontalDistanceMeters =
      currentPoint.distanceMeters - previousPoint.distanceMeters;

    if (
      !Number.isFinite(horizontalDistanceMeters) ||
      horizontalDistanceMeters <= 0
    ) {
      continue;
    }

    const elevationDifferenceMeters =
      currentPoint.elevationMeters - previousPoint.elevationMeters;

    sectionHorizontalMeters += horizontalDistanceMeters;

    if (elevationDifferenceMeters > 0) {
      sectionAscentMeters += elevationDifferenceMeters;
    } else {
      sectionDescentMeters -= elevationDifferenceMeters;
    }

    if (sectionHorizontalMeters >= MIDE_SECTION_LENGTH_METERS) {
      durationMinutes += combineMideTimes(
        sectionHorizontalMeters,
        sectionAscentMeters,
        sectionDescentMeters,
      );
      sectionHorizontalMeters = 0;
      sectionAscentMeters = 0;
      sectionDescentMeters = 0;
    }
  }

  return (
    durationMinutes +
    combineMideTimes(
      sectionHorizontalMeters,
      sectionAscentMeters,
      sectionDescentMeters,
    )
  );
}
