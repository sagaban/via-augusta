/**
 * Business context: names the current itinerary once, then offers a local GPX
 * download or saving the route with its map tiles on this device for offline
 * use. The dialog remains transient so export details do not consume
 * permanent map space.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { TileDownloadProgress } from '../offline/tileDownload';
import { formatBytes } from './SavedRoutesDialog';

/** Result of saving the current route for offline use. */
export interface OfflineSaveResult {
  /** Bytes of tiles newly stored. */
  bytes: number;
  /** Tiles that could not be downloaded. */
  failed: number;
}

/** Offline-save capability offered by the owner of the current itinerary. */
export interface OfflineSaveOption {
  /** Translated reason why saving is temporarily unavailable, if any. */
  blockedReason: string | null;
  /** Saves the named route and its tiles; rejects on failure or abort. */
  save: (
    routeName: string,
    signal: AbortSignal,
    onProgress: (progress: TileDownloadProgress) => void,
  ) => Promise<OfflineSaveResult>;
}

/** Offline-save state shown below the actions. */
type OfflineSaveState =
  | { kind: 'idle' }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'done'; message: string; isError: boolean };

/** Controlled visibility and callbacks for the route-export dialog. */
interface RouteExportDialogProps {
  /** Whether the modal export dialog should be displayed. */
  isOpen: boolean;
  /** Localized name proposed when the dialog opens. */
  defaultName: string;
  /** Closes the dialog. */
  onCancel: () => void;
  /** Downloads the route with the trimmed name entered by the user. */
  onExportGpx: (routeName: string) => void;
  /** Offline storage option, absent when the browser cannot support it. */
  offlineSave?: OfflineSaveOption | null;
}

/** Maximum route-name length accepted by the export form. */
const ROUTE_NAME_MAX_LENGTH = 120;
/** Renders an accessible modal for local GPX export. */
export default function RouteExportDialog({
  isOpen,
  defaultName,
  onCancel,
  onExportGpx,
  offlineSave = null,
}: RouteExportDialogProps) {
  const { locale, t } = useI18n();
  const [offlineState, setOfflineState] = useState<OfflineSaveState>({
    kind: 'idle',
  });
  const offlineAbortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const openingNameRef = useRef(defaultName);
  const selectionPendingRef = useRef(false);
  const [routeName, setRouteName] = useState(defaultName);
  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      openingNameRef.current = defaultName;
      selectionPendingRef.current = true;
      setRouteName(defaultName);
      setOfflineState({ kind: 'idle' });
    }
  }, [defaultName, isOpen]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (!isOpen) {
      selectionPendingRef.current = false;

      if (dialog.open) {
        dialog.close();
      }

      return;
    }

    // Wait for the controlled input to contain the new proposal. Selecting it
    // before React commits that value would move the caret back to the end.
    if (routeName !== openingNameRef.current) {
      return;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    if (!selectionPendingRef.current) {
      return;
    }

    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus({ preventScroll: true });
    input.setSelectionRange(0, input.value.length);
    selectionPendingRef.current = false;
  }, [isOpen, routeName]);

  const trimmedRouteName = routeName.trim();
  const isSavingOffline = offlineState.kind === 'saving';

  // Closing the dialog or unmounting cancels a download still in progress.
  useEffect(() => {
    if (!isOpen) {
      offlineAbortRef.current?.abort();
    }
  }, [isOpen]);
  useEffect(() => () => offlineAbortRef.current?.abort(), []);

  /** Stores the route and its tiles, reporting progress in the dialog. */
  const saveOffline = async () => {
    if (!offlineSave || !trimmedRouteName || isSavingOffline) {
      return;
    }

    const controller = new AbortController();
    offlineAbortRef.current = controller;
    setOfflineState({ kind: 'saving', done: 0, total: 0 });

    try {
      const result = await offlineSave.save(
        trimmedRouteName,
        controller.signal,
        ({ done, total }) => setOfflineState({ kind: 'saving', done, total }),
      );
      const size = formatBytes(result.bytes, locale);

      setOfflineState({
        kind: 'done',
        isError: false,
        message:
          result.failed > 0
            ? t('offline.savedPartial', { size, failed: result.failed })
            : t('offline.saved', { size }),
      });
    } catch (error) {
      if (controller.signal.aborted) {
        setOfflineState({ kind: 'idle' });
        return;
      }

      console.error('Unable to save the route for offline use.', error);
      setOfflineState({
        kind: 'done',
        isError: true,
        message: t('offline.error'),
      });
    } finally {
      if (offlineAbortRef.current === controller) {
        offlineAbortRef.current = null;
      }
    }
  };
  /** Keeps Enter equivalent to the GPX download action. */
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (trimmedRouteName) {
      onExportGpx(trimmedRouteName);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="route-export-dialog"
      aria-labelledby="route-export-dialog-title"
      aria-describedby="route-export-dialog-hint"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <form className="route-export-dialog-form" onSubmit={submit}>
        <div className="route-export-dialog-header">
          <h2 id="route-export-dialog-title">{t('route.export')}</h2>
          <button
            type="button"
            className="route-export-dialog-close"
            aria-label={t('gpx.close')}
            title={t('gpx.close')}
            onClick={onCancel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <label htmlFor="route-export-name">{t('gpx.nameLabel')}</label>
        <input
          ref={inputRef}
          id="route-export-name"
          type="text"
          value={routeName}
          maxLength={ROUTE_NAME_MAX_LENGTH}
          autoComplete="off"
          required
          onChange={(event) => setRouteName(event.target.value)}
        />
        <p id="route-export-dialog-hint">{t('gpx.nameHint')}</p>

        <div className="route-export-dialog-options">
          <button
            type="submit"
            className="route-export-dialog-button"
            disabled={!trimmedRouteName || isSavingOffline}
          >
            {t('gpx.download')}
          </button>

          {offlineSave && (
            <div className="route-export-dialog-offline-option">
              {isSavingOffline ? (
                <button
                  type="button"
                  className="route-export-dialog-button route-export-dialog-button--secondary"
                  onClick={() => offlineAbortRef.current?.abort()}
                >
                  {t('offline.cancel')}
                </button>
              ) : (
                <button
                  type="button"
                  className="route-export-dialog-button route-export-dialog-button--secondary"
                  disabled={
                    !trimmedRouteName || offlineSave.blockedReason !== null
                  }
                  onClick={() => void saveOffline()}
                >
                  {t('offline.save')}
                </button>
              )}
              <p className="route-export-dialog-storage-note">
                {offlineSave.blockedReason ?? t('offline.saveHint')}
              </p>
            </div>
          )}
        </div>

        {offlineState.kind === 'saving' && (
          <div className="route-export-dialog-progress" role="status">
            <progress
              max={offlineState.total || 1}
              value={offlineState.done}
            />
            <span>
              {t('offline.downloading', {
                done: offlineState.done,
                total: offlineState.total || '…',
              })}
            </span>
          </div>
        )}

        {offlineState.kind === 'done' && (
          <p
            className={
              offlineState.isError
                ? 'route-export-dialog-error'
                : 'route-export-dialog-success'
            }
            role={offlineState.isError ? 'alert' : 'status'}
          >
            {offlineState.message}
          </p>
        )}
      </form>
    </dialog>
  );
}
