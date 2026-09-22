/**
 * Business context: protects the screen wake lock used while following a
 * route, including re-acquisition after the browser hides the page.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenWakeLock } from './useScreenWakeLock';

function Probe({ active }: { active: boolean }) {
  useScreenWakeLock(active);
  return null;
}

describe('useScreenWakeLock', () => {
  let root: Root;
  let request: ReturnType<typeof vi.fn<(type: string) => Promise<unknown>>>;
  let release: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let sentinel: { released: boolean; release: () => Promise<void> };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    release = vi.fn<() => Promise<void>>(async () => {
      sentinel.released = true;
    });
    request = vi.fn<(type: string) => Promise<unknown>>(async () => {
      sentinel = { released: false, release };
      return sentinel;
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    delete (navigator as Partial<Navigator> & { wakeLock?: unknown }).wakeLock;
    vi.unstubAllGlobals();
  });

  it('requests the lock only while active and releases it afterwards', async () => {
    await act(async () => root.render(createElement(Probe, { active: false })));
    expect(request).not.toHaveBeenCalled();

    await act(async () => root.render(createElement(Probe, { active: true })));
    expect(request).toHaveBeenCalledWith('screen');

    await act(async () => root.render(createElement(Probe, { active: false })));
    expect(release).toHaveBeenCalled();
  });

  it('requests the lock again when the page becomes visible', async () => {
    await act(async () => root.render(createElement(Probe, { active: true })));
    sentinel.released = true; // the browser drops it when the page is hidden

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the browser has no Wake Lock API', async () => {
    delete (navigator as Partial<Navigator> & { wakeLock?: unknown }).wakeLock;

    await act(async () => root.render(createElement(Probe, { active: true })));

    expect(request).not.toHaveBeenCalled();
  });
});
