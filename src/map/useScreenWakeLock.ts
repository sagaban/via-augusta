/**
 * Business context: keeps the phone screen on while the hiker's location is
 * tracked, so the route and position stay visible without unlocking the phone
 * at every junction. Browsers release the lock whenever the page is hidden,
 * so it is requested again each time the page becomes visible.
 */
import { useEffect } from 'react';

/** Minimal Screen Wake Lock surface, absent from older TypeScript DOM libs. */
interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
}

/**
 * Holds a screen wake lock while `active` is true and the page is visible.
 * Unsupported browsers and refused requests (for example in battery saver
 * mode) are ignored: the screen then simply follows the system timeout.
 *
 * @param active - Whether the screen should stay on.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & WakeLockNavigator).wakeLock;

    if (!active || !wakeLock) {
      return;
    }

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) {
        return;
      }

      try {
        const next = await wakeLock.request('screen');

        if (disposed) {
          await next.release();
          return;
        }

        sentinel = next;
      } catch {
        // Refused or unavailable; the app keeps working normally.
      }
    };

    const handleVisibilityChange = () => {
      void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
