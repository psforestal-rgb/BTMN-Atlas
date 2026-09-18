/* Identificar: clic en el mapa -> capas presentes + atributos.
   Omite ortofotos e imagenes. Decodifica teselas GFW (fecha / confianza). */

let identHits = [];
let identMarker = null;

const GFW_ALERTAS = [
  {
    id: 'gfw-integradas',
    nombre: 'Alertas integradas GFW (GLAD-L + S2 + RADD + DIST)',
    url: 'https://tiles.globalforestwatch.org/gfw_integrated_dist_alerts/latest/default/{z}/{x}/{y}.png',
    fallback: 'https://tiles.globalforestwatch.org/gfw_integrated_alerts/latest/default/{z}/{x}/{y}.png',
    maxZ: 14,
    decode: 'integrated'
  },
  {
    id: 'glad-l',
    nombre: 'GLAD-L (Landsat 30 m)',
    url: 'https://tiles.globalforestwatch.org/umd_glad_landsat_alerts/latest/default/{z}/{x}/{y}.png',
    maxZ: 14,
    decode: 'glad'
  },
  {
    id: 'glad-s2',
    nombre: 'GLAD-S2 (Sentinel-2 10 m)',
    url: 'https://tiles.globalforestwatch.org/umd_glad_sentinel2_alerts/latest/default/{z}/{x}/{y}.png',
    maxZ: 14,
    decode: 'glad'
  },
  {
    id: 'radd',
    nombre: 'RADD (radar Sentinel-1)',
    url: 'https://tiles.globalforestwatch.org/wur_radd_alerts/latest/default/{z}/{x}/{y}.png',
    maxZ: 14,
    decode: 'glad'
  },
  {
    id: 'hansen-loss',
    nombre: 'Pérdida anual de dosel Hansen',
    url: 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/default/{z}/{x}/{y}.png',
    maxZ: 12,
    decode: 'hansen'
  }
];

function iniciarIdentificar() {
  if (!map || map._identBound) return;
  map._identBound = true;
  map.on('click', ev => {
    identificarEn(ev.latlng.lat, ev.latlng.lng);
  });
}

function addDaysUtc(days) {
  const d = new Date(Date.UTC(2014, 11, 31));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function fmtFecha(d) {
  if (!d || isNaN(d.getTime())) return '—';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function latLngATile(lat, lng, z) {
  const n = Math.pow(2, z);
  const xFloat = (lng + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const yFloat = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  const x = Math.floor(xFloat);
  const y = Math.floor(yFloat);
  return { z: z, x: x, y: y, fx: xFloat - x, fy: yFloat - y };
}

function decodificarGfw(r, g, b, a, kind) {
  if (kind === 'hansen') {
    if (typeof a === 'number' && a < 8) return null;
    if (r + g + b < 20) return null;
    return {
      'Presencia': 'Pérdida de dosel (producto anual Hansen / UMD)',
      'Nota': 'La tesela de visualización no guarda el año exacto en el píxel. Use las coberturas FONAFIFO/SINAC para la clase local.'
    };
  }

  const day = r * 255 + g;
  if (day <= 0) return null;
  const fecha = addDaysUtc(day);
  const year = fecha.getUTCFullYear();
  if (year < 2015 || year > 2027) return null;

  const attrs = {
    'Fecha de alerta': fmtFecha(fecha),
    'Días desde 2014-12-31': String(day)
  };

  if (kind === 'integrated' || kind === 'glad') {
    const confBand = Math.floor(b / 100) - 1;
    const intensity = b % 100;
    if (b >= 200) attrs['Confianza'] = 'Alta (confirmada por más de una observación)';
    else if (confBand >= 1) attrs['Confianza'] = 'Alta';
    else attrs['Confianza'] = 'Baja / primer aviso';
    if (intensity) attrs['Intensidad (0–99)'] = String(intensity);
  }

  if (kind === 'integrated' && a > 0 && a < 255) {
    const sistemas = [];
    const gladL = (a >> 6) & 3;
    const gladS2 = (a >> 4) & 3;
    const radd = (a >> 2) & 3;
    const txt = v => (v === 2 ? 'alta' : v === 1 ? 'baja' : null);
    if (txt(gladL)) sistemas.push('GLAD-L (' + txt(gladL) + ')');
    if (txt(gladS2)) sistemas.push('GLAD-S2 (' + txt(gladS2) + ')');
    if (txt(radd)) sistemas.push('RADD (' + txt(radd) + ')');
    if (a === 4 || a === 16 || a === 64) attrs['Acuerdo'] = 'Un solo sistema, confianza baja';
    else if (a === 8 || a === 32 || a === 128) attrs['Acuerdo'] = 'Un solo sistema, confianza alta';
    else if (sistemas.length) attrs['Sistemas'] = sistemas.join(', ');
    else attrs['Código de acuerdo (alfa)'] = String(a);
  }

  attrs['Aviso'] = 'Alerta satelital de disturbio de vegetación, no prueba de infracción ni área oficial.';
  return attrs;
}

async function pixelDeTesela(urlTemplate, lat, lng, maxZ) {
  const z = Math.max(6, Math.min(maxZ || 14, map.getZoom() || 12));
  const t = latLngATile(lat, lng, z);
  const url = urlTemplate
    .replace('{z}', String(t.z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y));
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const px = Math.min(bmp.width - 1, Math.max(0, Math.floor(t.fx * bmp.width)));
  const py = Math.min(bmp.height - 1, Math.max(0, Math.floor(t.fy * bmp.height)));
  const data = ctx.getImageData(px, py, 1, 1).data;
  bmp.close();
  return { r: data[0], g: data[1], b: data[2], a: data[3], z: t.z };
}

async function consultarAlertasGfw(lat, lng) {
  const out = [];
  await Promise.all(GFW_ALERTAS.map(async cfg => {
    try {
      let pix = await pixelDeTesela(cfg.url, lat, lng, cfg.maxZ);
      let attrs = decodificarGfw(pix.r, pix.g, pix.b, pix.a, cfg.decode);
      if (!attrs && cfg.fallback) {
        pix = await pixelDeTesela(cfg.fallback, lat, lng, cfg.maxZ);
        attrs = decodificarGfw(pix.r, pix.g, pix.b, pix.a, cfg.decode);
      }
      if (!attrs) return;
      out.push({
        id: cfg.id,
        nombre: cfg.nombre,
        grupo: 'Alertas GFW',
        attrs: attrs,
        encender: cfg.id
      });
    } catch (err) {
      console.warn('GFW identify', cfg.id, err);
    }
  }));
  return out;
}

function puntoEnAnillo(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const inter = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (inter) inside = !inside;
  }
  return inside;
}

function puntoEnPoligono(lat, lng, coords, multi) {
  if (multi) return coords.some(poly => puntoEnPoligono(lat, lng, poly, false));
  if (!coords.length) return false;
  if (!puntoEnAnillo(lat, lng, coords[0])) return false;
  for (let h = 1; h < coords.length; h++) {
    if (puntoEnAnillo(lat, lng, coords[h])) return false;
  }
  return true;
}

function distPuntoSegmM(lat, lng, a, b) {
  const toRad = Math.PI / 180;
  const lat1 = a[1] * toRad, lon1 = a[0] * toRad;
  const lat2 = b[1] * toRad, lon2 = b[0] * toRad;
  const lat0 = lat * toRad, lon0 = lng * toRad;
  const x1 = (lon1 - lon0) * Math.cos(lat0);
  const y1 = lat1 - lat0;
  const x2 = (lon2 - lon0) * Math.cos(lat0);
  const y2 = lat2 - lat0;
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((-x1) * dx + (-y1) * dy) / ((dx * dx + dy * dy) || 1e-12)));
  const x = x1 + t * dx, y = y1 + t * dy;
  return Math.sqrt(x * x + y * y) * 6371000;
}

function distALinea(lat, lng, coords, multi) {
  if (multi) return Math.min.apply(null, coords.map(c => distALinea(lat, lng, c, false)));
  let min = Infinity;
  for (let i = 1; i < coords.length; i++) {
    min = Math.min(min, distPuntoSegmM(lat, lng, coords[i - 1], coords[i]));
  }
  return min;
}

function geometriaContiene(lat, lng, geom, umbralM) {
  if (!geom) return false;
  const t = geom.type;
  const c = geom.coordinates;
  if (t === 'Polygon') return puntoEnPoligono(lat, lng, c, false);
  if (t === 'MultiPolygon') return puntoEnPoligono(lat, lng, c, true);
  if (t === 'LineString') return distALinea(lat, lng, c, false) <= umbralM;
  if (t === 'MultiLineString') return distALinea(lat, lng, c, true) <= umbralM;
  if (t === 'Point') return distPuntoSegmM(lat, lng, c, c) <= umbralM;
  if (t === 'MultiPoint') return c.some(p => distPuntoSegmM(lat, lng, p, p) <= umbralM);
  return false;
}

function recolectarLayers(lyr, acc) {
  if (lyr && lyr.feature && lyr.feature.geometry) acc.push(lyr);
  if (lyr && lyr.eachLayer) lyr.eachLayer(ch => recolectarLayers(ch, acc));
}

function consultarGeojsonCargadas(lat, lng) {
  const out = [];
  if (typeof capaDefiniciones === 'undefined' || typeof capaInstancias === 'undefined') return out;
  const zoom = map.getZoom() || 12;
  const umbral = Math.max(25, 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom + 8) * 6);

  capaDefiniciones.forEach((def, id) => {
    if (!def || def.tipo !== 'geojson') return;
    const inst = capaInstancias.get(id);
    if (!inst || (typeof map.hasLayer === 'function' && !map.hasLayer(inst))) return;
    const acc = [];
    recolectarLayers(inst, acc);
    const hits = [];
    acc.forEach(l => {
      if (geometriaContiene(lat, lng, l.feature.geometry, umbral)) hits.push(l.feature);
    });
    if (!hits.length) return;
    const props = hits[0].properties || {};
    const attrs = {};
    Object.keys(props).forEach(k => {
      const v = props[k];
      if (v == null || v === '') return;
      attrs[k] = String(v);
    });
    if (hits.length > 1) attrs['Polígonos/líneas en el punto'] = String(hits.length);
    out.push({
      id: id,
      nombre: def.nombre || id,
      grupo: 'Capa vectorial',
      attrs: attrs,
      encender: id
    });
  });
  return out;
}

async function identificarEn(lat, lng) {
  const lista = document.getElementById('ident-lista');
  const attrsEl = document.getElementById('ident-attrs');
  const coordsEl = document.getElementById('ident-coords');
  if (!lista) return;

  if (identMarker) map.removeLayer(identMarker);
  identMarker = L.circleMarker([lat, lng], {
    radius: 7, color: '#d9b14a', weight: 2, fillColor: '#f3d27a', fillOpacity: 0.9
  }).addTo(map);

  const f = (typeof formatoCoords === 'function')
    ? formatoCoords(lat, lng)
    : { dec: lat.toFixed(6) + ', ' + lng.toFixed(6) };
  coordsEl.textContent = f.dec;
  lista.innerHTML = '<div class="ident-vacio">Consultando capas…</div>';
  attrsEl.hidden = true;
  attrsEl.innerHTML = '';

  const [gfw, vect] = await Promise.all([
    consultarAlertasGfw(lat, lng),
    Promise.resolve(consultarGeojsonCargadas(lat, lng))
  ]);
  identHits = gfw.concat(vect);

  if (!identHits.length) {
    lista.innerHTML = '<div class="ident-vacio">Sin capas con presencia en este punto (salvo ortofotos). Acerque el zoom sobre una mancha de alerta o active una cobertura vectorial.</div>';
    return;
  }

  lista.innerHTML = identHits.map((h, i) =>
    '<button type="button" class="ident-item" data-i="' + i + '">' +
      '<span class="ident-nom">' + escHtml(h.nombre) + '</span>' +
      '<span class="ident-grp">' + escHtml(h.grupo) + '</span>' +
    '</button>'
  ).join('');

  lista.querySelectorAll('.ident-item').forEach(btn => {
    btn.addEventListener('click', () => mostrarAtributos(parseInt(btn.dataset.i, 10), btn));
  });

  const pref = identHits.findIndex(h => h.grupo === 'Alertas GFW');
  mostrarAtributos(pref >= 0 ? pref : 0, lista.querySelector('.ident-item'));
}

function mostrarAtributos(i, btn) {
  const h = identHits[i];
  const attrsEl = document.getElementById('ident-attrs');
  if (!h || !attrsEl) return;
  document.querySelectorAll('.ident-item').forEach(el => el.classList.toggle('on', el === btn));
  const rows = Object.keys(h.attrs).map(k =>
    '<div class="ident-kv"><dt>' + escHtml(k) + '</dt><dd>' + escHtml(h.attrs[k]) + '</dd></div>'
  ).join('');
  attrsEl.hidden = false;
  attrsEl.innerHTML = '<div class="ident-attrs-tit">' + escHtml(h.nombre) + '</div>' + rows;
}

function esperarIdentificar() {
  if (typeof map !== 'undefined' && map && typeof map.on === 'function') {
    iniciarIdentificar();
    return;
  }
  setTimeout(esperarIdentificar, 80);
}

esperarIdentificar();
