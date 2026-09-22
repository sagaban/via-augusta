/**
 * Business context: protects version acknowledgement and the shared localized
 * release data used by both the map dialog and generated static history pages.
 */
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import {
  CURRENT_RELEASE_VERSION,
  getCurrentRelease,
  getCurrentReleaseDialogItems,
  markCurrentReleaseSeen,
  releaseHistoryPath,
  shouldShowCurrentRelease,
} from './releaseHistory';

/** Minimal in-memory storage double for release acknowledgement. */
function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe('release history', () => {
  it('provides the same current release structure in every language', () => {
    const expectedItemIds = [
      'ignMaps',
      'trailRouting',
      'mideTime',
      'utmCoordinates',
    ];
    const expectedDialogItemIds = expectedItemIds;

    for (const language of SUPPORTED_LANGUAGES) {
      const release = getCurrentRelease(language);

      expect(release.version).toBe(CURRENT_RELEASE_VERSION);
      expect(release.items.map((item) => item.id)).toEqual(expectedItemIds);
      expect(getCurrentReleaseDialogItems(language).map((item) => item.id))
        .toEqual(expectedDialogItemIds);
      expect(release.items.every((item) => item.title.endsWith(':'))).toBe(true);
      expect(releaseHistoryPath(language)).toBe(`/${language}/releases/`);
    }
  });


  it('announces every first-release highlight in the one-time dialog', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(getCurrentReleaseDialogItems(language)).toHaveLength(4);
    }
  });

  it('records the current release silently for a first-time visitor', () => {
    const storage = createStorage();

    expect(shouldShowCurrentRelease(storage)).toBe(false);
    expect(storage.getItem('via-augusta-last-seen-release'))
      .toBe(CURRENT_RELEASE_VERSION);
  });

  it('shows the current release once to a returning visitor without an acknowledgement', () => {
    const storage = createStorage();
    storage.setItem('via-augusta-language', 'es');

    expect(shouldShowCurrentRelease(storage)).toBe(true);

    markCurrentReleaseSeen(storage);

    expect(shouldShowCurrentRelease(storage)).toBe(false);
  });

  it('shows the dialog again when the stored version is older', () => {
    const storage = createStorage();
    storage.setItem('via-augusta-last-seen-release', '0.0.9');

    expect(shouldShowCurrentRelease(storage)).toBe(true);
  });

  it('fails silently when release acknowledgement cannot be persisted', () => {
    const storage = createStorage();
    storage.setItem('via-augusta-last-seen-release', '0.0.1');
    const unavailableStorage = {
      getItem: storage.getItem,
      removeItem: storage.removeItem,
      setItem() {
        throw new DOMException('Storage is blocked.', 'SecurityError');
      },
    };

    expect(shouldShowCurrentRelease(unavailableStorage)).toBe(false);
    expect(shouldShowCurrentRelease(unavailableStorage)).toBe(false);
  });

  it('fails silently when release acknowledgement cannot be read', () => {
    const unavailableStorage = {
      getItem() {
        throw new DOMException('Storage is blocked.', 'SecurityError');
      },
      setItem() {},
      removeItem() {},
    };

    expect(shouldShowCurrentRelease(unavailableStorage)).toBe(false);
  });
});
