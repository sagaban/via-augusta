/**
 * Business context: tracks connectivity and, while offline, stops the map
 * zooming beyond the closest level stored for saved routes. Without the limit
 * a hiker zooming in past 1:25,000 would see an empty map instead of the
 * detailed tiles that are actually on the device.
 */
import { useEffect, useState, type RefObject } from 'react';
import { MAP_ZOOM } from '../map/config';
import type { MapLoadStatus, MapRuntime } from '../map/mapRuntime';
import { OFFLINE_MAX_ZOOM } from './tileCorridor';

/**
 * @param mapRuntimeRef - Shared OpenLayers runtime.
 * @param status - Map load status; the effect re-runs once the map exists.
 * @returns Whether the browser currently reports being offline.
 */
export function useOfflineMapZoomLimit(
  mapRuntimeRef: RefObject<MapRuntime | null>,
  status: MapLoadStatus,
): boolean {
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );

  useEffect(() => {
    const update = () => setIsOffline(navigator.onLine === false);

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const view = mapRuntimeRef.current?.map.getView();

    if (!view) {
      return;
    }

    view.setMaxZoom(isOffline ? OFFLINE_MAX_ZOOM : MAP_ZOOM.maximum);
  }, [isOffline, mapRuntimeRef, status]);

  return isOffline;
}
