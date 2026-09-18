/* Herramientas de campo + carga del modulo de alertas GFW. */
let marcadorCampo = null;
let puntoCampo = null;

function iniciarHerramientasCampo() {
  const chk = document.getElementById('chk-marcar-punto');
  if (!chk || !map) return;
  if (chk.dataset.bound === '1') return;
  chk.dataset.bound = '1';

  chk.addEventListener('change', () => {
    document.getElementById('map').classList.toggle('modo-marcar', chk.checked);
  });

  map.on('click', ev => {
    if (!chk.checked) return;
    fijarPuntoCampo(ev.latlng.lat, ev.latlng.lng);
  });

  document.getElementById('btn-copiar-coords').addEventListener('click', copiarCoordenadas);
  document.getElementById('btn-gpx').addEventListener('click', descargarGpx);
  document.getElementById('btn-abrir-maps').addEventListener('click', () => {
    if (!puntoCampo) return;
    window.open('https://www.google.com/maps?q=' + puntoCampo.lat + ',' + puntoCampo.lng, '_blank', 'noopener');
  });
  document.getElementById('btn-borrar-punto').addEventListener('click', borrarPuntoCampo);
}

async function cargarModuloAlertas() {
  if (typeof construirModulos !== 'function') return;
  if (document.querySelector('[data-modulo-id="alertas-gfw"]')) return;
  try {
    const extra = await fetch('config/alertas.json', { cache: 'no-store' }).then(r => r.json());
    if (!extra || !extra.modulos || !extra.modulos.length) return;
    construirModulos(extra.modulos);
    const alertasEl = document.querySelector('[data-modulo-id="alertas-gfw"]');
    const cobEl = document.querySelector('[data-modulo-id="cobertura"]');
    if (alertasEl && cobEl) cobEl.after(alertasEl);
  } catch (err) {
    console.error('No se pudo cargar config/alertas.json', err);
  }
}

function formatoCoords(lat, lng) {
  return {
    dec: lat.toFixed(6) + ', ' + lng.toFixed(6),
    dms: aDms(lat, 'lat') + '  ' + aDms(lng, 'lng')
  };
}

function aDms(valor, eje) {
  const hemi = eje === 'lat' ? (valor >= 0 ? 'N' : 'S') : (valor >= 0 ? 'E' : 'O');
  const abs = Math.abs(valor);
  const g = Math.floor(abs);
  const minFloat = (abs - g) * 60;
  const m = Math.floor(minFloat);
  const s = (minFloat - m) * 60;
  return g + '° ' + String(m).padStart(2, '0') + "' " + s.toFixed(2).padStart(5, '0') + '" ' + hemi;
}

function fijarPuntoCampo(lat, lng) {
  puntoCampo = { lat: lat, lng: lng };
  if (marcadorCampo) map.removeLayer(marcadorCampo);
  marcadorCampo = L.marker([lat, lng]).addTo(map);
  const f = formatoCoords(lat, lng);
  marcadorCampo.bindPopup('<b>Punto de campo</b><br>' + f.dec + '<br><small>' + f.dms + '</small>', {
    className: 'marcador-campo-popup'
  }).openPopup();
  const caja = document.getElementById('punto-info');
  caja.hidden = false;
  document.getElementById('punto-coords').innerHTML =
    '<div>' + escHtml(f.dec) + '</div><div>' + escHtml(f.dms) + '</div>';
}

function borrarPuntoCampo() {
  if (marcadorCampo) {
    map.removeLayer(marcadorCampo);
    marcadorCampo = null;
  }
  puntoCampo = null;
  document.getElementById('punto-info').hidden = true;
}

async function copiarCoordenadas() {
  if (!puntoCampo) return;
  const texto = formatoCoords(puntoCampo.lat, puntoCampo.lng).dec;
  try {
    await navigator.clipboard.writeText(texto);
    flashBoton('btn-copiar-coords', 'Copiado');
  } catch (err) {
    window.prompt('Copiar coordenadas:', texto);
  }
}

function descargarGpx() {
  if (!puntoCampo) return;
  const lat = puntoCampo.lat;
  const lng = puntoCampo.lng;
  const ahora = new Date().toISOString();
  const nombre = 'BTMN_' + lat.toFixed(5) + '_' + lng.toFixed(5);
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="BTMN Atlas" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <wpt lat="' + lat.toFixed(6) + '" lon="' + lng.toFixed(6) + '">\n' +
    '    <name>' + nombre + '</name>\n' +
    '    <time>' + ahora + '</time>\n' +
    '    <desc>Punto marcado en BTMN Atlas para verificacion de alerta o inspeccion de campo</desc>\n' +
    '  </wpt>\n' +
    '</gpx>\n';
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre + '.gpx';
  a.click();
  URL.revokeObjectURL(a.href);
}

function flashBoton(id, texto) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = texto;
  setTimeout(function () { btn.textContent = original; }, 1400);
}

function esperarMapaCampo() {
  if (typeof map !== 'undefined' && map && typeof map.on === 'function' && typeof construirModulos === 'function') {
    iniciarHerramientasCampo();
    cargarModuloAlertas();
    return;
  }
  setTimeout(esperarMapaCampo, 80);
}

esperarMapaCampo();
