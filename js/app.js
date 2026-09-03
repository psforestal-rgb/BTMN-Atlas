/*
 * Visor Modular de Capas
 * ------------------------------------------------------------
 * Lee config/capas.json y construye dinámicamente:
 *   - el selector de mapa base
 *   - un panel por "módulo" (grupo), con checkbox maestro
 *   - un renglón por capa dentro de cada módulo, con checkbox
 *     individual y control de opacidad
 *
 * Tipos de capa soportados: "wms", "tile" (XYZ), "geojson".
 * Para agregar capas o módulos nuevos basta editar
 * config/capas.json — no es necesario tocar este archivo.
 */

let map;
let config;
const capaInstancias = new Map();   // id de capa -> instancia Leaflet
const capaDefiniciones = new Map(); // id de capa -> definición del JSON
let baseLayers = {};

init();

async function init() {
  config = await fetch('config/capas.json', { cache: 'no-store' }).then(r => r.json());

  document.getElementById('titulo-app').textContent = config.titulo || 'Visor Modular de Capas';
  document.getElementById('subtitulo-app').textContent = config.subtitulo || '';

  const vista = config.vista || {};
  map = L.map('map', {
    center: vista.centro || [9.9, -84.1],
    zoom: vista.zoom || 8,
    minZoom: vista.minZoom || 5,
    maxZoom: vista.maxZoom || 20,
  });
  L.control.scale({ imperial: false }).addTo(map);

  construirBasemaps(config.basemaps || []);
  construirModulos(config.modulos || []);

  document.getElementById('btn-todo-off').addEventListener('click', () => setTodasLasCapas(false));
  document.getElementById('btn-restablecer').addEventListener('click', restablecerVista);
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

/* ───────────────────────── Mapas base ───────────────────────── */

function construirBasemaps(basemaps) {
  const cont = document.getElementById('basemaps-list');
  basemaps.forEach((b, i) => {
    const layer = crearTileBase(b);
    baseLayers[b.id] = layer;
    if (b.porDefecto || i === 0) layer.addTo(map);

    const row = document.createElement('label');
    row.className = 'basemap-row';
    row.innerHTML = `<input type="radio" name="basemap" value="${b.id}" ${layer._map ? 'checked' : ''}> ${b.nombre}`;
    row.querySelector('input').addEventListener('change', () => cambiarBasemap(b.id));
    cont.appendChild(row);
  });
}

function crearTileBase(b) {
  return L.tileLayer(b.url, {
    subdomains: b.subdominios || 'abc',
    attribution: b.atribucion || '',
    maxNativeZoom: b.maxNativeZoom,
    maxZoom: b.maxZoom || 19,
  });
}

function cambiarBasemap(id) {
  Object.entries(baseLayers).forEach(([bid, layer]) => {
    if (bid === id) { if (!map.hasLayer(layer)) layer.addTo(map); }
    else if (map.hasLayer(layer)) map.removeLayer(layer);
  });
}

/* ───────────────────────── Módulos y capas ───────────────────────── */

function construirModulos(modulos) {
  const cont = document.getElementById('modulos-list');

  modulos.forEach(modulo => {
    modulo.capas.forEach(capa => capaDefiniciones.set(capa.id, capa));

    const wrap = document.createElement('div');
    wrap.className = 'modulo' + (modulo.abierto ? ' open' : '');
    wrap.dataset.moduloId = modulo.id;

    const activas = modulo.capas.filter(c => c.activaPorDefecto).length;
    wrap.innerHTML = `
      <div class="modulo-head">
        <input type="checkbox" class="chk-modulo" ${activas === modulo.capas.length ? 'checked' : ''}>
        <span class="mi">${modulo.icono || '🗂️'}</span>
        <span class="mn">${modulo.nombre}</span>
        <span class="mc">${activas}/${modulo.capas.length}</span>
        <span class="chev">▾</span>
      </div>
      <div class="modulo-body">
        <div class="acciones-modulo">
          <button type="button" data-accion="activar">Activar todas</button>
          <button type="button" data-accion="desactivar">Desactivar todas</button>
        </div>
      </div>`;

    const head = wrap.querySelector('.modulo-head');
    const body = wrap.querySelector('.modulo-body');
    const chkModulo = wrap.querySelector('.chk-modulo');
    const badge = wrap.querySelector('.mc');

    modulo.capas.forEach(capa => body.appendChild(crearFilaCapa(capa, wrap)));

    // expandir/contraer al hacer clic en el título (no en el checkbox)
    head.addEventListener('click', (ev) => {
      if (ev.target === chkModulo) return;
      wrap.classList.toggle('open');
    });

    chkModulo.addEventListener('change', () => {
      setCapasDeModulo(modulo.capas.map(c => c.id), chkModulo.checked);
      actualizarBadgeModulo(wrap);
    });

    wrap.querySelector('[data-accion="activar"]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      setCapasDeModulo(modulo.capas.map(c => c.id), true);
      actualizarBadgeModulo(wrap);
    });
    wrap.querySelector('[data-accion="desactivar"]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      setCapasDeModulo(modulo.capas.map(c => c.id), false);
      actualizarBadgeModulo(wrap);
    });

    cont.appendChild(wrap);

    // activar por defecto
    modulo.capas.forEach(capa => {
      if (capa.activaPorDefecto) toggleCapa(capa.id, true);
    });
    actualizarBadgeModulo(wrap);
  });
}

function crearFilaCapa(capa, moduloEl) {
  const row = document.createElement('div');
  row.className = 'capa-row';
  row.dataset.capaId = capa.id;
  row.innerHTML = `
    <input type="checkbox" id="chk-${capa.id}" ${capa.activaPorDefecto ? 'checked' : ''}>
    <label for="chk-${capa.id}">${capa.nombre}</label>
    <input type="range" class="op" min="0" max="1" step="0.05" value="${capa.opacidad ?? 1}" title="Opacidad">
    <span class="op-val">${Math.round((capa.opacidad ?? 1) * 100)}%</span>
  `;

  const chk = row.querySelector('input[type=checkbox]');
  const op = row.querySelector('.op');
  const opVal = row.querySelector('.op-val');

  chk.addEventListener('change', () => {
    toggleCapa(capa.id, chk.checked);
    actualizarBadgeModulo(moduloEl);
  });
  op.addEventListener('input', () => {
    opVal.textContent = Math.round(op.value * 100) + '%';
    const lyr = capaInstancias.get(capa.id);
    if (lyr && lyr.setOpacity) lyr.setOpacity(parseFloat(op.value));
    if (lyr && lyr.setStyle) lyr.setStyle({ fillOpacity: parseFloat(op.value) * 0.5, opacity: parseFloat(op.value) });
  });

  if (capa.atribucion) {
    const fuente = document.createElement('div');
    fuente.className = 'capa-fuente';
    fuente.textContent = 'Fuente: ' + capa.atribucion;
    row.appendChild(fuente);
  }

  return row;
}

function setCapasDeModulo(ids, activar) {
  ids.forEach(id => {
    toggleCapa(id, activar);
    const chk = document.getElementById('chk-' + id);
    if (chk) chk.checked = activar;
  });
}

function actualizarBadgeModulo(moduloEl) {
  const total = moduloEl.querySelectorAll('.capa-row').length;
  const activas = moduloEl.querySelectorAll('.capa-row input[type=checkbox]:checked').length;
  moduloEl.querySelector('.mc').textContent = `${activas}/${total}`;
  const chkModulo = moduloEl.querySelector('.chk-modulo');
  chkModulo.checked = activas === total;
  chkModulo.indeterminate = activas > 0 && activas < total;
}

function setTodasLasCapas(activar) {
  document.querySelectorAll('#modulos-list .capa-row').forEach(row => {
    const id = row.dataset.capaId;
    const chk = row.querySelector('input[type=checkbox]');
    chk.checked = activar;
    toggleCapa(id, activar);
  });
  document.querySelectorAll('.modulo').forEach(actualizarBadgeModulo);
}

/* ───────────────────────── Instanciación de capas ───────────────────────── */

function toggleCapa(id, activar) {
  if (activar) {
    let lyr = capaInstancias.get(id);
    if (!lyr) {
      lyr = crearCapa(capaDefiniciones.get(id));
      capaInstancias.set(id, lyr);
    }
    if (lyr && !map.hasLayer(lyr)) lyr.addTo(map);
  } else {
    const lyr = capaInstancias.get(id);
    if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr);
  }
}

function crearCapa(def) {
  if (!def) return null;
  const opacidad = def.opacidad ?? 1;

  if (def.tipo === 'wms') {
    return L.tileLayer.wms(def.url, Object.assign(
      { opacity: opacidad, maxZoom: def.maxZoom || 21, attribution: def.atribucion || '' },
      def.params || {}
    ));
  }

  if (def.tipo === 'tile') {
    return L.tileLayer(def.url, {
      opacity: opacidad,
      maxNativeZoom: def.maxNativeZoom,
      maxZoom: def.maxZoom || 21,
      attribution: def.atribucion || '',
    });
  }

  if (def.tipo === 'geojson') {
    const grupo = L.layerGroup();
    fetch(def.url).then(r => r.json()).then(geojson => {
      const capaLeaflet = L.geoJSON(geojson, {
        style: () => (def.estilo || { color: '#4a7cc4', weight: 2, fillOpacity: 0.15 }),
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, color: def.estilo?.color || '#4a7cc4' }),
        onEachFeature: (feature, layer) => {
          const campo = def.campoEtiqueta;
          const props = feature.properties || {};
          if (campo && props[campo]) layer.bindPopup(String(props[campo]));
          else if (Object.keys(props).length) {
            layer.bindPopup(Object.entries(props).map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br>'));
          }
        },
      });
      grupo.addLayer(capaLeaflet);
      grupo._geo = capaLeaflet;
    }).catch(err => console.error('Error al cargar', def.url, err));
    return grupo;
  }

  console.warn('Tipo de capa no soportado:', def.tipo);
  return null;
}

/* ───────────────────────── Utilidades ───────────────────────── */

function restablecerVista() {
  const vista = config.vista || {};
  map.setView(vista.centro || [9.9, -84.1], vista.zoom || 8);
}
