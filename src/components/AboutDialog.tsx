/**
 * Business context: presents project identity, planning limitations, contact
 * details, and complete data credits without occupying permanent map space.
 * The visible About control keeps those credits directly accessible from the
 * map in one localized information surface.
 */
import { useLayoutEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { REPOSITORY_URL, UPSTREAM_PROJECT } from '../site';
import {
  CURRENT_RELEASE_VERSION,
  releaseHistoryPath,
} from '../releases/releaseHistory';

/** Controlled visibility and close callback for the application information dialog. */
interface AboutDialogProps {
  /** Whether the modal information dialog should be displayed. */
  isOpen: boolean;
  /** Closes the dialog and returns focus to the information button. */
  onClose: () => void;
}

/** External credit links kept together so visible labels remain fully localized. */
const CREDIT_LINKS = {
  ign: 'https://www.ign.es/',
  osm: 'https://www.openstreetmap.org/copyright',
  waymarkedTrails: 'https://hiking.waymarkedtrails.org/',
  brouter: 'https://brouter.de/',
  photon: 'https://photon.komoot.io/',
  openMeteo: 'https://open-meteo.com/',
  copernicus: 'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model',
  mide: 'https://www.montanasegura.com/mide/',
} as const;

/** One external credit rendered as a link. */
function CreditLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Renders the localized About dialog above the otherwise map-centred interface. */
export default function AboutDialog({
  isOpen,
  onClose,
}: AboutDialogProps) {
  const { language, t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }

      // The native dialog otherwise focuses the first link in the content.
      // Starting on the heading announces the dialog context and avoids making
      // an unrelated project link look preselected when the panel opens.
      titleRef.current?.focus({ preventScroll: true });
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="about-dialog"
      aria-labelledby="about-dialog-title"
      aria-describedby="about-dialog-description"
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
            <h2
              ref={titleRef}
              id="about-dialog-title"
              tabIndex={-1}
            >
              {t('about.title')}
            </h2>
            <button
              type="button"
              className="about-dialog-icon-close"
              aria-label={t('about.close')}
              title={t('about.close')}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p className="about-dialog-tagline">{t('about.tagline')}</p>
        </header>

        <div className="about-dialog-content">
          <section className="about-dialog-section">
            <p id="about-dialog-description">{t('about.description')}</p>
            <p>{t('about.intendedUse')}</p>
            <p>{t('about.privacy')}</p>
          </section>

          <section className="about-dialog-notice">
            <h3>{t('about.safetyTitle')}</h3>
            <p>{t('about.safety')}</p>
          </section>

          <section className="about-dialog-section">
            <h3>{t('about.projectTitle')}</h3>
            <dl className="about-dialog-details">
              <div>
                <dt>{t('about.basedOn')}</dt>
                <dd>
                  <CreditLink href={UPSTREAM_PROJECT.url}>
                    {`${UPSTREAM_PROJECT.name} (${UPSTREAM_PROJECT.author})`}
                  </CreditLink>
                </dd>
              </div>
              {REPOSITORY_URL && (
                <div>
                  <dt>{t('about.sourceCode')}</dt>
                  <dd>
                    <CreditLink href={REPOSITORY_URL}>GitHub</CreditLink>
                  </dd>
                </div>
              )}
              <div>
                <dt>{t('about.license')}</dt>
                <dd>
                  <CreditLink href="https://opensource.org/license/mit/">
                    MIT
                  </CreditLink>
                </dd>
              </div>
              <div>
                <dt>{t('about.currentVersion')}</dt>
                <dd>{CURRENT_RELEASE_VERSION}</dd>
              </div>
              <div>
                <dt>{t('about.releaseHistory')}</dt>
                <dd>
                  <a href={releaseHistoryPath(language)}>
                    {t('about.releaseHistoryAction')}
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <section className="about-dialog-section">
            <h3>{t('about.creditsTitle')}</h3>
            <dl className="about-dialog-credits">
              <div>
                <dt>{t('about.maps')}</dt>
                <dd>
                  <CreditLink href={CREDIT_LINKS.ign}>
                    CC BY 4.0 scne.es · IGN
                  </CreditLink>
                </dd>
              </div>
              <div>
                <dt>{t('about.hikingRoutes')}</dt>
                <dd>
                  <CreditLink href={CREDIT_LINKS.waymarkedTrails}>
                    © Waymarked Trails
                  </CreditLink>
                  {', '}
                  <CreditLink href={CREDIT_LINKS.osm}>
                    © OpenStreetMap
                  </CreditLink>
                </dd>
              </div>
              <div>
                <dt>{t('about.routing')}</dt>
                <dd>
                  <CreditLink href={CREDIT_LINKS.brouter}>BRouter</CreditLink>
                  {', '}
                  <CreditLink href={CREDIT_LINKS.osm}>
                    © OpenStreetMap
                  </CreditLink>
                </dd>
              </div>
              <div>
                <dt>{t('about.search')}</dt>
                <dd>
                  <CreditLink href={CREDIT_LINKS.photon}>Photon</CreditLink>
                  {', '}
                  <CreditLink href={CREDIT_LINKS.osm}>
                    © OpenStreetMap
                  </CreditLink>
                </dd>
              </div>
              <div>
                <dt>{t('about.elevation')}</dt>
                <dd>
                  <CreditLink href={CREDIT_LINKS.openMeteo}>
                    Open-Meteo
                  </CreditLink>
                  {', '}
                  <CreditLink href={CREDIT_LINKS.copernicus}>
                    Copernicus DEM GLO-90
                  </CreditLink>
                </dd>
              </div>
              <div>
                <dt>{t('about.hikingTime')}</dt>
                <dd>
                  <CreditLink href={CREDIT_LINKS.mide}>
                    {t('about.hikingTimeMethod')}
                  </CreditLink>
                </dd>
              </div>
            </dl>
          </section>
        </div>

      </article>
    </dialog>
  );
}
