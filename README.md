# Visor Modular de Capas

Visor de mapas web, ligero y autónomo (HTML/CSS/JS puro, sin build ni
dependencias de servidor), en el que las capas se activan y desactivan
**individualmente o por módulo** (grupo). Cada módulo representa un
conjunto temático de capas — por ejemplo *Ortofotos*, *Hidrología* o
*Cobertura forestal* — y puede encenderse o apagarse completo con un solo
checkbox, o capa por capa con control de opacidad.

Basado en el mismo esquema visual del visor
[BTMM-Visados](https://github.com/psforestal-rgb/BTMM-Visados), pero
reescrito como una plantilla genérica y reutilizable: toda la definición de
módulos y capas vive en un archivo de configuración JSON, no en el código.

## Demostración incluida

El repositorio trae un `config/capas.json` de ejemplo con tres módulos
reales, listos para usarse tal cual:

| Módulo | Capas | Tipo | Fuente |
|---|---|---|---|
| Ortofotos SNIT | Ortofoto 2005–2007, Ortofoto 2014–2017 | WMS | [SNIT / IGN](https://geos1.snitcr.go.cr/Ortofoto2017/wms) |
| Hidrología — Dirección de Agua (MINAE) | 3 reservas acuíferas de ejemplo | WMS | [mapas.da.go.cr](https://mapas.da.go.cr/geopc.php?service=WMS&version=1.1.1&request=GetCapabilities) |
| Datos locales de ejemplo | Polígono de demostración | GeoJSON local | `data/ejemplo.geojson` (reemplazable) |

Más un selector de mapa base (OpenStreetMap / Satélite Esri World Imagery).

## Cómo agregar capas o módulos propios

No es necesario tocar el código. Basta editar `config/capas.json` y agregar
un objeto de módulo con su lista de capas:

```json
{
  "id": "mi-modulo",
  "nombre": "Nombre del módulo",
  "icono": "🌲",
  "abierto": false,
  "capas": [
    {
      "id": "mi-capa",
      "nombre": "Nombre visible de la capa",
      "tipo": "wms",
      "url": "https://servidor/wms",
      "params": { "layers": "nombre:capa", "format": "image/png", "transparent": true, "version": "1.1.1" },
      "opacidad": 0.85,
      "activaPorDefecto": false,
      "atribucion": "Fuente de los datos"
    }
  ]
}
```

Tipos de capa soportados en `tipo`:

- `"wms"` — servicio WMS (`params.layers` con el nombre de la capa en el
  servidor).
- `"tile"` — teselas XYZ (`{z}/{x}/{y}` o `{z}/{y}/{x}` según el servidor).
- `"geojson"` — archivo GeoJSON local o remoto; admite `estilo` (color,
  grosor, opacidad de relleno) y `campoEtiqueta` para mostrar un atributo en
  el popup al hacer clic.

El módulo maestro (checkbox de la cabecera) activa/desactiva todas sus
capas a la vez y queda en estado "indeterminado" cuando solo una parte está
activa.

## Estructura del repositorio

```
index.html          Página principal (Leaflet vía CDN + CSS + JS propios)
css/styles.css       Estilos (paleta azul marino / dorado)
js/app.js            Lógica: lee capas.json, construye el panel y gestiona
                     las capas Leaflet (WMS, XYZ, GeoJSON)
config/capas.json    Definición de mapas base, módulos y capas — editar aquí
data/ejemplo.geojson Capa vectorial de demostración (reemplazable)
```

## Uso

- **Local:** abrir `index.html` en el navegador (o servir la carpeta con
  cualquier servidor estático; algunos navegadores restringen `fetch()` a
  `file://`, por lo que se recomienda un servidor local, p. ej.
  `python3 -m http.server`).
- **GitHub Pages:** activar Pages en la rama principal — no requiere
  compilación.

## Créditos y fuentes

- **Cartografía base:** [OpenStreetMap](https://www.openstreetmap.org/copyright)
  y [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9).
- **Ortofotos:** IGN / [SNIT — Costa Rica](https://www.snitcr.go.cr/).
- **Hidrología:** [Dirección de Agua, MINAE](https://mapas.da.go.cr/).
- **Librería de mapas:** [Leaflet](https://leafletjs.com/).

## Licencia y alcance

Plantilla de referencia con fines de gestión territorial y ambiental. Las
capas de ejemplo son de fuentes públicas oficiales de Costa Rica; verificar
siempre vigencia y condiciones de uso ante el ente correspondiente antes de
un uso técnico o legal formal.
