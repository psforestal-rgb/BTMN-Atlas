# BTMN Atlas — Capas Geográficas BTMM

Visor web de capas geográficas, ligero y autónomo (HTML/CSS/JS puro, sin
build ni dependencias de servidor), que reproduce las **mismas capas y la
misma simbología** del visor
[BTMM-Visados](https://psforestal-rgb.github.io/BTMM-Visados/) —código:
[psforestal-rgb/BTMM-Visados](https://github.com/psforestal-rgb/BTMM-Visados)—
para el Parque Nacional Los Quetzales (PNLQ), SINAC — Área de Conservación
Central — Bloque Tapantí Macizo de la Muerte.

Este repositorio **no modifica BTMM-Visados**: los datos y colores se
extrajeron de su publicación (`data/*.gpkg` y el GeoJSON embebido de
cobertura forestal) y se reorganizaron aquí para que la app cargue rápido.
BTMN Atlas es un **visor de capas**, no repite las herramientas de análisis
de predios, generación de informes Word ni el asistente de importación de
planos del visor original — solo la cartografía y su simbología.

## Por qué es más rápida

BTMM-Visados embebe las 5 capas de cobertura forestal en el propio
`index.html` (base64 + gzip) y las descomprime **todas** al cargar la
página, aunque solo una se vaya a mostrar. Aquí cada capa vive en su propio
archivo bajo `data/` y **solo se descarga cuando el usuario la activa**
(patrón ya usado por la plantilla original de este repo para GeoJSON):

- Las 5 capas de cobertura forestal y la de cauce y drenaje se sirven
  comprimidas (`.geojson.gz`) y se inflan en el navegador con
  [pako](https://github.com/nodeca/pako) solo al activarlas.
- El resto de capas locales (ASP, PNE, terrenos, fincas, tenencia
  histórica, humedales, inundación) son GeoJSON planos livianos.
- Los rásteres (relieve, tenencia histórica 1966) son `imageOverlay`
  georreferenciados que se piden como cualquier imagen, no como parte del
  HTML.
- El documento inicial (`index.html` + `app.js` + `capas.json`) pesa unos
  pocos KB — nada de datos pesados en la carga inicial.

## Capas incluidas

| Módulo | Capas | Fuente |
|---|---|---|
| Imágenes aéreas | Ortofoto TERRA 1997, 2005–2007, 2014–2017 (WMS/WMTS) | IGN / SNIT |
| Cobertura Forestal (SINAC/FONAFIFO) | FONAFIFO 2000, FONAFIFO 2005, Tipos de Bosque 2012, Cobertura 2021, Cobertura 2023 — una activa a la vez | FONAFIFO/CENIGA, SINAC |
| Áreas Silvestres Protegidas | Los Quetzales, Cerro Las Vueltas, Tapantí-Macizo de la Muerte, Río Macho, Río Navarro-Río Sombrero | SINAC/SNIT |
| Fincas estatales y PNE | Buffer 2 km Carretera Interamericana, PNE del SNIT, Terrenos sobre 3000 m, Fincas del Estado ACC, Tenencia histórica R.F. Río Macho 1966 (ráster + vector ITCO) | SNIT, ACC |
| Terrenos forestales | Relieve (7 clases de pendiente), Potencial de inundación, Humedales | Elaboración propia / CNE / SINAC |
| Fuentes de agua y AP | Cauce y drenaje, capas WMS de la Dirección de Agua (mapas.da.go.cr) | SNIT, MINAE |

Más el selector de mapa base (OpenStreetMap / Satélite Esri World
Imagery). La simbología (colores por clase, reglas compuestas de la capa
de tenencia histórica, resaltado al pasar el cursor en cauces, etc.) es la
misma que usa BTMM-Visados.

## Cómo agregar capas o módulos propios

No es necesario tocar el código. Basta editar `config/capas.json`.
Tipos de capa soportados en `tipo`:

- `"wms"` — servicio WMS (`params.layers`).
- `"tile"` — teselas XYZ (o una plantilla WMTS con `{z}/{y}/{x}`, como la
  ortofoto TERRA 1997).
- `"imagen"` — imagen georreferenciada (`imageOverlay`); requiere
  `bounds: [[lat,lon],[lat,lon]]`.
- `"geojson"` — archivo local o remoto; admite:
  - `comprimido: true` — el archivo `.gz` se descarga e infla con pako
    solo al activar la capa (para capas pesadas).
  - `colorPorClase: {campo, colores, patrones, defecto}` — color por
    valor exacto de una propiedad, con respaldo por subcadena.
  - `reglas: [{campo, incluye, color, fillColor, dashArray, weight}, ...]`
    — primera regla que coincide gana (simbología compuesta).
  - `tooltipHover: true` + `camposTooltip` — tooltip al pasar el cursor
    en vez de popup al hacer clic.
  - `resaltarHover: {color, weight}` — resalta la geometría al pasar el
    cursor (útil en líneas).

Un `"modulo"` con `"exclusivo": true` activa como máximo una capa a la vez
dentro del grupo (así funciona el módulo de cobertura forestal).

## Estructura del repositorio

```
index.html          Página principal (Leaflet + pako vía CDN, con SRI)
css/styles.css       Estilos (paleta azul marino / dorado)
js/app.js            Lógica: lee capas.json, construye el panel y gestiona
                     las capas Leaflet (WMS, XYZ, imagen, GeoJSON con
                     simbología por atributo)
config/capas.json    Definición de mapas base, módulos y capas — editar aquí
data/                Capas locales (GeoJSON, GeoJSON comprimido, imágenes
                     georreferenciadas) extraídas de BTMM-Visados
```

## Uso

- **Local:** servir la carpeta con un servidor estático (p. ej.
  `python3 -m http.server`); algunos navegadores restringen `fetch()` a
  `file://`.
- **GitHub Pages:** activar Pages en la rama principal — no requiere
  compilación.

## Créditos y fuentes

- **Capas y simbología:** extraídas de
  [BTMM-Visados](https://github.com/psforestal-rgb/BTMM-Visados)
  (SINAC — Área de Conservación Central — Bloque Tapantí Macizo de la
  Muerte), sin modificar dicho repositorio.
- **Cartografía base:** [OpenStreetMap](https://www.openstreetmap.org/copyright)
  y [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9).
- **Ortofotos:** IGN / [SNIT — Costa Rica](https://www.snitcr.go.cr/).
- **Cobertura forestal:** FONAFIFO/CENIGA (2000, 2005) y SINAC (2012,
  2021, 2023).
- **Hidrología:** [Dirección de Agua, MINAE](https://mapas.da.go.cr/).
- **Fincas del Estado:** Área de Conservación Central (ACC).
- **Librerías:** [Leaflet](https://leafletjs.com/) y
  [pako](https://github.com/nodeca/pako) (descompresión gzip en el
  navegador).

## Licencia y alcance

Visor de referencia con fines de gestión territorial y ambiental. Las
capas provienen de fuentes públicas oficiales de Costa Rica y de
BTMM-Visados; verificar siempre vigencia y condiciones de uso ante el ente
correspondiente antes de un uso técnico o legal formal. Este visor no
calcula intersecciones de predios ni genera informes — para ese análisis,
usar BTMM-Visados.
