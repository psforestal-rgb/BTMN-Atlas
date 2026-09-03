/*
 * Visor Modular de Capas
 * ------------------------------------------------------------
 * Lee config/capas.json y construye dinámicamente:
 *   - el selector de mapa base
 *   - un panel por "módulo" (grupo), con checkbox maestro
 *   - un renglón por capa dentro de cada módulo, con checkbox
 *     individual y control de opacidad
 *
 * Tipos de capa soportados: "wms", "tile" (XYZ), "imagen"
 * (imageOverlay georreferenciado) y "geojson".
 *
 * La capa "geojson" admite, además de "estilo" fijo:
 *   - comprimido: true        → el archivo .gz se descarga e infla con
 *                                pako solo cuando la capa se activa
 *                                (evita cargar datos pesados al inicio).
 *   - colorPorClase: { campo, colores:{valor:color}, patrones:[[texto,color],...], defecto }
 *                              → colorea cada feature según el valor de
 *                                una propiedad (coincidencia exacta o,
 *                                si no hay, subcadena insensible a mayúsculas).
 *   - reglas: [{campo, incluye, color, fillColor, dashArray, weight}, ...]
 *                              → primera regla cuyo campo contiene el
 *                                texto indicado (insensible a mayúsculas)
 *                                gana; el resto de propiedades de estilo
 *                                se completa con "estilo".
 *   - tooltipHover: true + camposTooltip:[["Etiqueta","campo"],...]
 *                              → tooltip flotante al pasar el cursor en
 *                                vez de popup al hacer clic.
 *   - resaltarHover: {color, weight} → resalta la geometría (líneas) al
 *                                pasar el cursor.
 *
 * Un "modulo" con "exclusivo": true activa como máximo una capa a la
 * vez dentro del grupo (p. ej. cobertura forestal por año).
 *
 * Para agregar capas o módulos nuevos basta editar
 * config/capas.json — no es necesario tocar este archivo, salvo para
 * simbologías nuevas que no encajen en los mecanismos anteriores.
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
    if (modulo.exclusivo) wrap.dataset.exclusivo = '1';

    const activas = modulo.capas.filter(c => c.activaPorDefecto).length;
    const chkModuloHtml = modulo.exclusivo
      ? '<span class="mi-radio" title="Solo una capa activa a la vez">◎</span>'
      : `<input type="checkbox" class="chk-modulo" ${activas === modulo.capas.length ? 'checked' : ''}>`;
    const accionesHtml = modulo.exclusivo
      ? '<div class="acciones-modulo"><button type="button" data-accion="desactivar">Desactivar capa activa</button></div>'
      : `<div class="acciones-modulo">
          <button type="button" data-accion="activar">Activar todas</button>
          <button type="button" data-accion="desactivar">Desactivar todas</button>
        </div>`;
    wrap.innerHTML = `
      <div class="modulo-head">
        ${chkModuloHtml}
        <span class="mi">${modulo.icono || '🗂️'}</span>
        <span class="mn">${modulo.nombre}</span>
        <span class="mc">${activas}/${modulo.capas.length}</span>
        <span class="chev">▾</span>
      </div>
      <div class="modulo-body">
        ${accionesHtml}
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

    if (chkModulo) {
      chkModulo.addEventListener('change', () => {
        setCapasDeModulo(modulo.capas.map(c => c.id), chkModulo.checked);
        actualizarBadgeModulo(wrap);
      });
    }

    const btnActivar = wrap.querySelector('[data-accion="activar"]');
    if (btnActivar) {
      btnActivar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setCapasDeModulo(modulo.capas.map(c => c.id), true);
        actualizarBadgeModulo(wrap);
      });
    }
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
    if (chk.checked && moduloEl.dataset.exclusivo) {
      moduloEl.querySelectorAll('.capa-row').forEach(otraFila => {
        if (otraFila === row) return;
        const otroChk = otraFila.querySelector('input[type=checkbox]');
        if (otroChk && otroChk.checked) {
          otroChk.checked = false;
          toggleCapa(otraFila.dataset.capaId, false);
        }
      });
    }
    toggleCapa(capa.id, chk.checked);
    actualizarBadgeModulo(moduloEl);
  });
  op.addEventListener('input', () => {
    opVal.textContent = Math.round(op.value * 100) + '%';
    const lyr = capaInstancias.get(capa.id);
    if (lyr && lyr.setOpacity) lyr.setOpacity(parseFloat(op.value));
    // Para capas vectoriales, el control ajusta solo el relleno: el trazo
    // (color/grosor) de cada feature mantiene la simbología definida.
    if (lyr && lyr.setStyle) lyr.setStyle({ fillOpacity: parseFloat(op.value) });
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
  if (chkModulo) {
    chkModulo.checked = activas === total;
    chkModulo.indeterminate = activas > 0 && activas < total;
  }
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

  if (def.tipo === 'imagen') {
    return L.imageOverlay(def.url, def.bounds, {
      opacity: opacidad,
      interactive: false,
      attribution: def.atribucion || '',
    });
  }

  if (def.tipo === 'geojson') {
    const grupo = L.layerGroup();
    const origen = def.comprimido ? cargarGeoJSONComprimido(def.url) : fetch(def.url).then(r => r.json());
    origen.then(geojson => {
      const capaLeaflet = L.geoJSON(geojson, {
        style: feature => estiloFeature(def, feature),
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, color: estiloFeature(def, feature).color }),
        onEachFeature: (feature, layer) => vincularInteraccion(def, feature, layer),
      });
      grupo.addLayer(capaLeaflet);
      grupo._geo = capaLeaflet;
    }).catch(err => console.error('Error al cargar', def.url, err));
    return grupo;
  }

  console.warn('Tipo de capa no soportado:', def.tipo);
  return null;
}

/* ───────────────────────── Descarga comprimida (gzip + pako) ───────────────────────── */

function cargarGeoJSONComprimido(url) {
  return fetch(url)
    .then(r => r.arrayBuffer())
    .then(buf => JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' })));
}

/* ───────────────────────── Simbología por atributo ───────────────────────── */

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function estiloFeature(def, feature) {
  const props = feature.properties || {};
  const base = Object.assign({ color: '#4a7cc4', weight: 2, fillOpacity: 0.15, opacity: 1 }, def.estilo || {});
  let estilo = base;

  if (def.colorPorClase) {
    const cfg = def.colorPorClase;
    const valor = props[cfg.campo];
    let color = cfg.colores && valor != null ? cfg.colores[valor] : undefined;
    if (!color && cfg.patrones) {
      const norm = String(valor || '').toLowerCase();
      const hit = cfg.patrones.find(([texto]) => norm.includes(texto));
      if (hit) color = hit[1];
    }
    if (!color) color = cfg.defecto || base.color;
    estilo = Object.assign({}, base, { color, fillColor: color });
  } else if (def.reglas) {
    const regla = def.reglas.find(r => String(props[r.campo] || '').toLowerCase().includes(r.incluye.toLowerCase()));
    if (regla) estilo = Object.assign({}, base, regla);
  }

  if (def.reglasLinea) {
    const reglaLinea = def.reglasLinea.find(r => String(props[r.campo] || '').toLowerCase().includes(r.incluye.toLowerCase()));
    if (reglaLinea) estilo = Object.assign({}, estilo, { dashArray: reglaLinea.dashArray });
  }

  return estilo;
}

function vincularInteraccion(def, feature, layer) {
  const props = feature.properties || {};

  if (def.tooltipHover) {
    let html = '';
    if (def.tooltipFijo) {
      html = def.tooltipFijo;
    } else if (def.camposTooltip && def.camposTooltip.length) {
      html = def.camposTooltip
        .map(([etiqueta, campo]) => {
          const v = props[campo];
          return v != null && v !== '' ? `<b>${escHtml(etiqueta)}:</b> ${escHtml(v)}` : null;
        })
        .filter(Boolean).join('<br>');
    } else if (def.campoEtiqueta) {
      html = escHtml(props[def.campoEtiqueta] || def.etiquetaVacia || '');
    }
    if (html) layer.bindTooltip(html, { sticky: true, className: 'itt' });
  } else {
    const campo = def.campoEtiqueta;
    if (campo && props[campo]) layer.bindPopup(String(props[campo]));
    else if (Object.keys(props).length) {
      layer.bindPopup(Object.entries(props).map(([k, v]) => `<b>${escHtml(k)}:</b> ${escHtml(v)}`).join('<br>'));
    }
  }

  if (def.resaltarHover && layer.setStyle) {
    const estiloBase = estiloFeature(def, feature);
    layer.on('mouseover', () => layer.setStyle(Object.assign({}, estiloBase, def.resaltarHover)));
    layer.on('mouseout', () => layer.setStyle(estiloBase));
  }
}

/* ───────────────────────── Utilidades ───────────────────────── */

function restablecerVista() {
  const vista = config.vista || {};
  map.setView(vista.centro || [9.9, -84.1], vista.zoom || 8);
}
