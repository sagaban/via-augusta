# Via Augusta

Planificador de rutas de senderismo para España, gratuito y de código abierto,
sobre la cartografía oficial del IGN. Es un fork de
[Via Helvetica](https://github.com/egofree71/via-helvetica) (MIT) adaptado a España.

Todo corre en el navegador: no hay cuentas, ni base de datos, ni backend propio.

## Funciones

| Área | Qué hace |
|---|---|
| Mapa | Mapa Topográfico Nacional, IGN Base en gris y ortofoto PNOA (península, Baleares, Canarias, Ceuta y Melilla); capa de senderos GR/PR/SL; geolocalización; pantalla completa |
| Rutas | Puntos editables que siguen caminos y senderos de OpenStreetMap (BRouter, perfil `hiking-mountain`) o tramos rectos; deshacer/rehacer, invertir, cerrar circuito |
| Información | Distancia, subida, bajada, perfil de altitud sincronizado con el mapa, tiempo de marcha según el método MIDE |
| GPX | Importación (con conversión a ruta editable) y exportación con nombre |
| Coordenadas | Búsqueda y consulta (clic derecho) en WGS 84 y UTM ETRS89, p. ej. `30T 440291 4474254` |
| Idiomas | Español e inglés, con URLs `/es/` y `/en/` |

## Inicio rápido

Requiere Node.js 20.19+ o 22.12+.

```bash
npm install
npm run dev      # http://localhost:5173/
npm test
npm run build
```

No hace falta configurar nada para desarrollar. Las variables opcionales están en
[`.env.example`](.env.example): base path, URL pública, enlace al repositorio y
endpoints propios de BRouter, Photon u Open-Meteo.

## Despliegue en GitHub Pages

1. En *Settings → Pages*, elegí **GitHub Actions** como origen.
2. Hacé push a `main`. El workflow corre los tests, construye con el base path
   correcto (`/<repo>/`, o `/` con dominio propio) y publica `dist/`.

## Fuentes de datos

- **IGN / CNIG**: mapas y ortofotos (CC BY 4.0 scne.es).
- **OpenStreetMap** (ODbL), a través de **BRouter** (ruteo), **Photon** (búsqueda)
  y **Waymarked Trails** (capa de senderos).
- **Copernicus DEM GLO-90**, a través de **Open-Meteo**: altitudes.
- **MIDE**: método de cálculo de horarios (4 km/h, 400 m/h de subida, 600 m/h de bajada).

Los servicios públicos de BRouter, Photon y Open-Meteo son gratuitos y de uso
razonable. Si el tráfico crece, conviene instalar instancias propias y
configurarlas con las variables `VITE_*`.

## Limitaciones conocidas

- El ruteo y la búsqueda dependen de la calidad de OpenStreetMap en cada zona.
- El DEM de 90 m es más grueso que el MDT del IGN: el desnivel es una estimación.
- Sin capas de cierres, riesgo de incendio, caza ni transporte público (por ahora).
- Las rutas no se guardan: exportá el GPX antes de cerrar la página.

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para los detalles internos.

## Licencia

MIT. Se conserva el aviso de copyright original de Via Helvetica (Philippe De Pol).
Los datos externos se rigen por sus propias licencias y requisitos de atribución.
