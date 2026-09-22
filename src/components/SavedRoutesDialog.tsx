/**
 * Business context: lists the routes stored on this device for offline use,
 * so a hiker can reopen one without coverage or free its storage. Deletion
 * uses an inline second tap instead of a browser confirm dialog, which would
 * block the map and is awkward on phones.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { SavedRouteSummary } from '../offline/offlineStore';

/** Controlled visibility and actions of the saved-routes dialog. */
interface SavedRoutesDialogProps {
  /** Whether the modal dialog should be displayed. */
  isOpen: boolean;
  /** Closes the dialog. */
  onClose: () => void;
  /** Loads saved routes, newest first. */
  loadRoutes: () => Promise<SavedRouteSummary[]>;
  /** Opens one saved route as the current itinerary. */
  onOpenRoute: (id: string) => void;
  /** Deletes one saved route and its no longer referenced tiles. */
  onDeleteRoute: (id: string) => Promise<void>;
}

/** Formats a byte count with one decimal in the interface locale. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toLocaleString(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  })} ${units[unitIndex]}`;
}

/** Renders the offline route list inside a native modal dialog. */
export default function SavedRoutesDialog({
  isOpen,
  onClose,
  loadRoutes,
  onOpenRoute,
  onDeleteRoute,
}: SavedRoutesDialogProps) {
  const { locale, t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [routes, setRoutes] = useState<SavedRouteSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRoutes(await loadRoutes());
      setError(false);
    } catch (loadError) {
      console.error('Unable to list saved routes.', loadError);
      setError(true);
      setRoutes([]);
    }

    try {
      const estimate = await navigator.storage?.estimate?.();
      setUsedBytes(estimate?.usage ?? null);
    } catch {
      setUsedBytes(null);
    }
  }, [loadRoutes]);

  useEffect(() => {
    if (isOpen) {
      setPendingDeleteId(null);
      void refresh();
    }
  }, [isOpen, refresh]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }

      titleRef.current?.focus({ preventScroll: true });
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  });

  return (
    <dialog
      ref={dialogRef}
      className="about-dialog saved-routes-dialog"
      aria-labelledby="saved-routes-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <article className="about-dialog-panel">
        <header className="about-dialog-header">
          <div className="about-dialog-heading-row">
            <h2 ref={titleRef} id="saved-routes-dialog-title" tabIndex={-1}>
              {t('offline.listTitle')}
            </h2>
            <button
              type="button"
              className="about-dialog-icon-close"
              aria-label={t('offline.close')}
              title={t('offline.close')}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>

        <div className="about-dialog-content">
          {error && (
            <p className="saved-routes-error" role="alert">
              {t('offline.loadError')}
            </p>
          )}

          {routes && routes.length === 0 && !error && (
            <p className="saved-routes-empty">{t('offline.empty')}</p>
          )}

          {routes && routes.length > 0 && (
            <ul className="saved-routes-list">
              {routes.map((route) => (
                <li key={route.id} className="saved-routes-item">
                  <div className="saved-routes-item-text">
                    <strong>{route.name}</strong>
                    <span>
                      {t('offline.details', {
                        distance: (route.distanceMeters / 1_000).toLocaleString(
                          locale,
                          { maximumFractionDigits: 1 },
                        ),
                        size: formatBytes(route.tileBytes, locale),
                        date: dateFormatter.format(route.savedAt),
                      })}
                    </span>
                  </div>
                  <div className="saved-routes-item-actions">
                    <button
                      type="button"
                      className="route-export-dialog-button saved-routes-open"
                      onClick={() => onOpenRoute(route.id)}
                    >
                      {t('offline.open')}
                    </button>
                    <button
                      type="button"
                      className={[
                        'saved-routes-delete',
                        pendingDeleteId === route.id
                          ? 'saved-routes-delete--confirm'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        if (pendingDeleteId !== route.id) {
                          setPendingDeleteId(route.id);
                          return;
                        }

                        setPendingDeleteId(null);
                        void onDeleteRoute(route.id).then(refresh);
                      }}
                    >
                      {pendingDeleteId === route.id
                        ? t('offline.confirmDelete')
                        : t('offline.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {usedBytes !== null && (
            <p className="saved-routes-storage">
              {t('offline.storage', { used: formatBytes(usedBytes, locale) })}
            </p>
          )}
          <p className="saved-routes-hint">{t('offline.installHint')}</p>
        </div>
      </article>
    </dialog>
  );
}
