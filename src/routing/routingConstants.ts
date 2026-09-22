/**
 * Business context: centralizes routing values shared by the editable-route
 * workflow and the BRouter client, so product limits and provider tolerances
 * cannot drift between the two.
 */

/**
 * Maximum geodesic distance in metres between the user's click and the point
 * BRouter snapped to. Larger values may attach a waypoint to an unrelated way,
 * in which case the section falls back to a straight line.
 */
export const MAX_SNAP_DISTANCE = 300;

/**
 * Maximum direct distance in metres between consecutive waypoints when network
 * routing is enabled. Above 20 km a single section no longer describes the
 * hiker's intended corridor reliably; lowering the value requires more
 * waypoints, while raising it permits more ambiguous and slower requests to
 * the shared public BRouter instance.
 */
export const MAX_NETWORK_SECTION_DIRECT_DISTANCE_METERS = 20_000;
