/**
 * Business context: centralizes every user-facing label so the interface can
 * switch languages without scattering translation logic across map modules.
 */
import seoMetadata from './seoMetadata.json';

/** Languages supported by the application interface. */
export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;

/** One supported interface language. */
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Language used when neither the URL, storage, nor the browser selects one. */
export const DEFAULT_LANGUAGE: Language = 'es';

/** Metadata used by number formatting and the compact language controls. */
export const LANGUAGE_METADATA: Record<
  Language,
  { locale: string; shortLabel: string }
> = {
  es: { locale: 'es-ES', shortLabel: 'ES' },
  en: { locale: 'en-GB', shortLabel: 'EN' },
};

const spanishTranslations = {
  'app.title': seoMetadata.es.title,
  'app.description': seoMetadata.es.description,
  'about.open': 'Acerca de Via Augusta',
  'about.title': 'Via Augusta',
  'about.tagline':
    'Planifica rutas de senderismo en España sobre la cartografía oficial.',
  'about.description':
    'Via Augusta es una aplicación web gratuita y de código abierto. Permite crear o importar una ruta, consultar su distancia, desnivel y perfil de altitud, y exportarla en formato GPX.',
  'about.intendedUse':
    'Via Augusta está pensada sobre todo para preparar una ruta en una pantalla grande. No está destinada al seguimiento de la ruta ni a la navegación en tiempo real sobre el terreno: exporta el GPX y ábrelo en tu aplicación o GPS de confianza.',
  'about.privacy':
    'No hace falta registrarse. Las rutas no se guardan en ningún servidor de Via Augusta. Para calcular rutas, altitudes y búsquedas, el navegador envía las coordenadas necesarias a los servicios externos indicados más abajo.',
  'about.safetyTitle': 'Importante',
  'about.safety':
    'Las rutas y los datos cartográficos son orientativos y pueden contener errores. Las condiciones sobre el terreno cambian: consulta siempre la meteorología, los cierres y los avisos oficiales (espacios naturales, riesgo de incendio, caza) antes de salir. Eres responsable de elegir la ruta y adaptarla a tus capacidades y a las condiciones que encuentres.',
  'about.projectTitle': 'Proyecto',
  'about.basedOn': 'Basado en',
  'about.sourceCode': 'Código fuente',
  'about.license': 'Licencia',
  'about.currentVersion': 'Versión actual',
  'about.releaseHistory': 'Historial de versiones',
  'about.releaseHistoryAction': 'Consultar',
  'about.creditsTitle': 'Mapas y datos',
  'about.maps': 'Mapas y ortofotos',
  'about.hikingRoutes': 'Rutas de senderismo',
  'about.routing': 'Cálculo de rutas',
  'about.search': 'Búsqueda de lugares',
  'about.elevation': 'Altitudes',
  'about.hikingTime': 'Tiempo de marcha',
  'about.hikingTimeMethod':
    'Estimación según el método MIDE (4 km/h en llano, 400 m/h de subida, 600 m/h de bajada)',
  'about.close': 'Cerrar',
  'language.select': 'Elegir idioma',
  'language.es': 'Español',
  'language.en': 'Inglés',

  'search.placeholder': 'Lugar o coordenadas…',
  'search.label': 'Buscar un lugar o unas coordenadas',
  'search.close': 'Cerrar la búsqueda',
  'search.clearLabel': 'Borrar la búsqueda',
  'search.clearTitle': 'Borrar',
  'search.loading': 'Buscando…',
  'search.unavailable': 'La búsqueda no está disponible en este momento.',
  'search.noResults': 'No se ha encontrado ningún lugar.',
  'search.coordinatesOutside':
    'Estas coordenadas están fuera de la zona cubierta por el mapa.',
  'search.results': 'Resultados de la búsqueda',
  'search.category.locality': 'Localidad',
  'search.category.peak': 'Cima o collado',
  'search.category.nature': 'Paraje natural',
  'search.category.hut': 'Refugio o camping',
  'search.category.area': 'Espacio protegido',
  'search.category.wgs84': 'Coordenadas WGS 84',
  'search.category.utm': 'Coordenadas UTM ETRS89',

  'route.toolbar': 'Ruta',
  'route.create': 'Crear una ruta',
  'route.exitCreation': 'Salir del modo de creación de ruta',
  'route.addFirstPoint':
    'Añade un primer punto para elegir el modo de trazado',
  'route.followPaths': 'Seguir caminos y senderos',
  'route.straightSegments': 'Añadir tramos rectos',
  'route.undoChange': 'Deshacer el último cambio',
  'route.undo': 'Deshacer',
  'route.redoChange': 'Rehacer el último cambio',
  'route.redo': 'Rehacer',
  'route.reverse': 'Invertir el sentido de la ruta',
  'route.closeLoop': 'Cerrar el circuito',
  'route.openLoop': 'Abrir el circuito',
  'route.delete': 'Borrar la ruta',
  'route.waypointHint': 'Arrastra para mover; haz clic para borrar.',
  'route.segmentHint': 'Haz clic para continuar o arrastra para insertar un punto.',
  'route.export': 'Exportar la ruta',
  'route.import': 'Cargar una ruta GPX',
  'route.editImported': 'Editar la ruta',
  'route.editImportedSingleSegmentOnly':
    'Solo se pueden editar archivos GPX con un único tramo continuo.',
  'route.editImportedOutsideMap':
    'Esta ruta sale de la zona cubierta por Via Augusta y no se puede editar.',
  'route.editImportedTooManyPoints':
    'Este GPX contiene más de {maximum} puntos. Se puede mostrar, pero es demasiado detallado para editarlo en esta versión.',
  'route.editImportedSparseGeometry':
    'Este GPX no tiene suficientes puntos intermedios para editarlo siguiendo caminos (máximo {maximum} km entre dos puntos). Sigue disponible en modo de solo lectura.',
  'route.editImportedError':
    'No se ha podido preparar esta ruta GPX para editarla.',
  'route.importError':
    'Este archivo GPX no contiene una ruta válida.',
  'route.importTooLarge': 'Este archivo GPX es demasiado grande.',
  'route.exportError':
    'La ruta debe tener al menos dos puntos para poder exportarla.',
  'route.noNearbyPath':
    'No se ha encontrado ningún camino cerca de este punto.',
  'route.noConnectedPath':
    'No se ha encontrado un camino que conecte estos dos puntos.',
  'route.sectionTooLong':
    'Este tramo mediría {distance} km en línea recta. Añade un punto intermedio: el seguimiento de caminos está limitado a {maximum} km entre dos puntos.',
  'route.networkLoadError':
    'El servicio de cálculo de rutas no responde. Inténtalo de nuevo o desactiva el seguimiento de caminos.',

  'geolocation.show': 'Mostrar mi ubicación',
  'geolocation.recenter': 'Centrar en mi ubicación',
  'geolocation.unavailable':
    'La geolocalización no está disponible en este navegador.',
  'geolocation.searching': 'Buscando tu ubicación…',
  'geolocation.outside':
    'Tu ubicación está fuera de la zona cubierta.',
  'geolocation.permissionDenied':
    'Se ha denegado el acceso a tu ubicación.',
  'geolocation.positionUnavailable':
    'No se ha podido determinar tu ubicación.',
  'geolocation.timeout': 'La búsqueda de tu ubicación ha tardado demasiado.',
  'geolocation.error': 'Se ha producido un error al localizarte.',

  'map.aria': 'Mapa topográfico interactivo de España',
  'map.controls': 'Controles del mapa',
  'map.layers.select': 'Elegir las capas del mapa',
  'map.layers.mobileTitle': 'Mapa y opciones',
  'map.layers.close': 'Cerrar el panel Mapa y opciones',
  'map.layers.baseMaps': 'Mapa de fondo',
  'map.layers.information': 'Capas de información',
  'map.layers.language': 'Idioma',
  'map.layers.opacity': 'Opacidad',
  'map.layers.adjustOpacity': 'Ajustar la opacidad de la capa «{layer}»',
  'mapPosition.title': 'Posición en el mapa',
  'mapPosition.wgs84': 'WGS 84',
  'mapPosition.utm': 'UTM ETRS89',
  'mapPosition.altitude': 'Altitud',
  'mapPosition.altitudeLoading': 'Cargando…',
  'mapPosition.altitudeUnavailable': 'Altitud no disponible',
  'mapPosition.copyWgs84': 'Copiar las coordenadas WGS 84',
  'mapPosition.copyUtm': 'Copiar las coordenadas UTM',
  'mapPosition.close': 'Cerrar',
  'map.baseMap.color': 'Mapa topográfico (MTN)',
  'map.baseMap.gray': 'Mapa base en gris',
  'map.baseMap.aerial': 'Ortofoto PNOA',
  'hikingTrails.layer': 'Senderos GR, PR y SL',
  'map.zoomIn': 'Acercar',
  'map.zoomOut': 'Alejar',
  'map.fullscreenEnter': 'Pantalla completa',
  'map.fullscreenExit': 'Salir de pantalla completa',
  'map.loading': 'Cargando el mapa del IGN…',
  'map.loadFailed': 'No se ha podido cargar el mapa.',
  'map.tileError':
    'El navegador no ha podido descargar las teselas del mapa del IGN.',
  'map.retry': 'Comprueba la conexión a Internet y vuelve a cargar la página.',

  'statistics.aria': 'Estadísticas de la ruta',
  'statistics.distance': 'Distancia',
  'statistics.ascent': 'Subida',
  'statistics.descent': 'Bajada',
  'statistics.duration': 'Tiempo',
  'statistics.durationTitle':
    'Tiempo de marcha estimado (método MIDE), sin paradas',
  'profile.show': 'Mostrar el perfil de altitud',
  'profile.hide': 'Ocultar el perfil de altitud',
  'profile.loading': 'Cargando el perfil de altitud',
  'profile.unavailable': 'Perfil de altitud no disponible',
  'profile.aria': 'Perfil de altitud de la ruta',
  'profile.title': 'Perfil de altitud',
  'profile.rangeAria': 'Perfil de altitud de {minimum} a {maximum}',

  'units.hourShort': 'h',
  'units.minuteShort': 'min',
  'gpx.routeName': 'Ruta Via Augusta',
  'gpx.nameLabel': 'Nombre de la ruta',
  'gpx.nameHint':
    'Este nombre se usará en el archivo GPX y en las aplicaciones que lo importen.',
  'gpx.close': 'Cerrar',
  'gpx.download': 'Exportar el archivo GPX',
};

/** Every translation key, derived from the Spanish reference dictionary. */
export type TranslationKey = keyof typeof spanishTranslations;

const englishTranslations: Record<TranslationKey, string> = {
  'app.title': seoMetadata.en.title,
  'app.description': seoMetadata.en.description,
  'about.open': 'About Via Augusta',
  'about.title': 'Via Augusta',
  'about.tagline': 'Plan hiking routes in Spain on official maps.',
  'about.description':
    'Via Augusta is a free, open-source web application. It lets you create or import a route, review its distance, elevation gain and profile, and export it as GPX.',
  'about.intendedUse':
    'Via Augusta is designed primarily for planning a route on a large screen. It is not intended for following a route or for real-time navigation in the field: export the GPX and open it in the app or GPS device you trust.',
  'about.privacy':
    'No account is required. Routes are not stored on any Via Augusta server. To calculate routes, elevations, and search results, your browser sends the necessary coordinates to the external services listed below.',
  'about.safetyTitle': 'Important',
  'about.safety':
    'Routes and map data are provided for guidance only and may contain errors. Conditions on the ground change: always check the weather, closures, and official notices (protected areas, wildfire risk, hunting) before setting out. You remain responsible for choosing your route and adapting it to your abilities and the conditions encountered.',
  'about.projectTitle': 'Project',
  'about.basedOn': 'Based on',
  'about.sourceCode': 'Source code',
  'about.license': 'License',
  'about.currentVersion': 'Current version',
  'about.releaseHistory': 'Release history',
  'about.releaseHistoryAction': 'View',
  'about.creditsTitle': 'Maps and data',
  'about.maps': 'Maps and orthophotos',
  'about.hikingRoutes': 'Hiking routes',
  'about.routing': 'Routing',
  'about.search': 'Place search',
  'about.elevation': 'Elevations',
  'about.hikingTime': 'Walking time',
  'about.hikingTimeMethod':
    'Estimated with the MIDE method (4 km/h on the flat, 400 m/h ascent, 600 m/h descent)',
  'about.close': 'Close',
  'language.select': 'Choose language',
  'language.es': 'Spanish',
  'language.en': 'English',

  'search.placeholder': 'Place or coordinates…',
  'search.label': 'Search for a place or coordinates',
  'search.close': 'Close search',
  'search.clearLabel': 'Clear search',
  'search.clearTitle': 'Clear',
  'search.loading': 'Searching…',
  'search.unavailable': 'Search is temporarily unavailable.',
  'search.noResults': 'No place found.',
  'search.coordinatesOutside':
    'These coordinates are outside the area covered by the map.',
  'search.results': 'Search results',
  'search.category.locality': 'Place',
  'search.category.peak': 'Summit or pass',
  'search.category.nature': 'Natural feature',
  'search.category.hut': 'Hut or campsite',
  'search.category.area': 'Protected area',
  'search.category.wgs84': 'WGS 84 coordinates',
  'search.category.utm': 'ETRS89 UTM coordinates',

  'route.toolbar': 'Route',
  'route.create': 'Create a route',
  'route.exitCreation': 'Exit route creation mode',
  'route.addFirstPoint':
    'Add a first point to choose the drawing mode',
  'route.followPaths': 'Follow paths and trails',
  'route.straightSegments': 'Add straight segments',
  'route.undoChange': 'Undo the latest change',
  'route.undo': 'Undo',
  'route.redoChange': 'Redo the latest change',
  'route.redo': 'Redo',
  'route.reverse': 'Reverse the route',
  'route.closeLoop': 'Close the loop',
  'route.openLoop': 'Open the loop',
  'route.delete': 'Delete the route',
  'route.waypointHint': 'Drag to move; click to delete.',
  'route.segmentHint': 'Click to continue, drag to insert a waypoint.',
  'route.export': 'Export the route',
  'route.import': 'Load a GPX route',
  'route.editImported': 'Edit the route',
  'route.editImportedSingleSegmentOnly':
    'Editing is available only for GPX files containing one continuous segment.',
  'route.editImportedOutsideMap':
    'This route extends outside the area covered by Via Augusta and cannot be edited.',
  'route.editImportedTooManyPoints':
    'This GPX contains more than {maximum} points. It can still be displayed, but it is too detailed to edit in this version.',
  'route.editImportedSparseGeometry':
    'This GPX does not contain enough intermediate points to remain editable with path-following (maximum {maximum} km between two points). It remains available read-only.',
  'route.editImportedError':
    'This GPX route could not be prepared for editing.',
  'route.importError':
    'This GPX file does not contain a valid route.',
  'route.importTooLarge': 'This GPX file is too large.',
  'route.exportError':
    'The route must contain at least two points before it can be exported.',
  'route.noNearbyPath':
    'No path was found near this point.',
  'route.noConnectedPath':
    'No connected path was found between these two points.',
  'route.sectionTooLong':
    'This section would be {distance} km as the crow flies. Add an intermediate waypoint: path-following is limited to {maximum} km between two points.',
  'route.networkLoadError':
    'The routing service is not responding. Try again or switch off path-following.',

  'geolocation.show': 'Show my location',
  'geolocation.recenter': 'Recenter on my location',
  'geolocation.unavailable':
    'Geolocation is not available in this browser.',
  'geolocation.searching': 'Finding your location…',
  'geolocation.outside':
    'Your location is outside the covered area.',
  'geolocation.permissionDenied':
    'Access to your location was denied.',
  'geolocation.positionUnavailable':
    'Your location could not be determined.',
  'geolocation.timeout': 'Finding your location took too long.',
  'geolocation.error': 'An error occurred while locating you.',

  'map.aria': 'Interactive topographic map of Spain',
  'map.controls': 'Map controls',
  'map.layers.select': 'Choose map layers',
  'map.layers.mobileTitle': 'Map and options',
  'map.layers.close': 'Close Map and options panel',
  'map.layers.baseMaps': 'Base map',
  'map.layers.information': 'Information layers',
  'map.layers.language': 'Language',
  'map.layers.opacity': 'Opacity',
  'map.layers.adjustOpacity': 'Adjust opacity for the “{layer}” layer',
  'mapPosition.title': 'Map position',
  'mapPosition.wgs84': 'WGS 84',
  'mapPosition.utm': 'ETRS89 UTM',
  'mapPosition.altitude': 'Elevation',
  'mapPosition.altitudeLoading': 'Loading…',
  'mapPosition.altitudeUnavailable': 'Elevation unavailable',
  'mapPosition.copyWgs84': 'Copy WGS 84 coordinates',
  'mapPosition.copyUtm': 'Copy UTM coordinates',
  'mapPosition.close': 'Close',
  'map.baseMap.color': 'Topographic map (MTN)',
  'map.baseMap.gray': 'Grey base map',
  'map.baseMap.aerial': 'PNOA orthophoto',
  'hikingTrails.layer': 'GR, PR and SL trails',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.fullscreenEnter': 'Enter fullscreen',
  'map.fullscreenExit': 'Exit fullscreen',
  'map.loading': 'Loading the IGN map…',
  'map.loadFailed': 'Unable to load the map.',
  'map.tileError':
    'The browser could not download the IGN map tiles.',
  'map.retry': 'Check the Internet connection, then reload the page.',

  'statistics.aria': 'Route statistics',
  'statistics.distance': 'Distance',
  'statistics.ascent': 'Ascent',
  'statistics.descent': 'Descent',
  'statistics.duration': 'Duration',
  'statistics.durationTitle':
    'Estimated walking time (MIDE method), excluding breaks',
  'profile.show': 'Show elevation profile',
  'profile.hide': 'Hide elevation profile',
  'profile.loading': 'Loading elevation profile',
  'profile.unavailable': 'Elevation profile unavailable',
  'profile.aria': 'Route elevation profile',
  'profile.title': 'Elevation profile',
  'profile.rangeAria': 'Elevation profile from {minimum} to {maximum}',

  'units.hourShort': 'h',
  'units.minuteShort': 'min',
  'gpx.routeName': 'Via Augusta route',
  'gpx.nameLabel': 'Route name',
  'gpx.nameHint':
    'This name will be used in the GPX file and by applications that import it.',
  'gpx.close': 'Close',
  'gpx.download': 'Export the GPX file',
};

/** Complete translation dictionaries keyed by supported language. */
export const TRANSLATIONS: Record<
  Language,
  Record<TranslationKey, string>
> = {
  es: spanishTranslations,
  en: englishTranslations,
};
