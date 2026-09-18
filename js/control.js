/* Modo Control de deforestación: 3 interruptores, ficha corta y cola de casos. */

const CTRL_KEY = 'btmn-casos-v1';
const BOSQUE_RE = /bosque|forestal|maduro|secundari/i;

let ctrlPunto = null;
let ctrlFicha = null;

function casosLeer() {
  try { return JSON.parse(localStorage.getItem(CTRL_KEY) || '[]'); }
  catch (e) { return []; }
}
function casosGuardar(lista) {
  localStorage.setItem(CTRL_KEY, JSON.stringify(lista));
}

function capaOn(id, on) {
  const chk = document.getElementById('chk-' + id);
  if (!chk) return;
  if (chk.checked === !!on) return;
  chk.checked = !!on;
  chk.dispatchEvent(new Event('change'));
}

function iniciarControl() {
  const modo = document.getElementById('chk-modo-control');
  if (!modo || modo.dataset.bound === '1') return;
  modo.dataset.bound = '1';

  modo.addEventListener('change', () => {
    document.body.classList.toggle('modo-control', modo.checked);
    if (modo.checked) activarModoControl();
  });

  ['chk-ctrl-alertas', 'chk-ctrl-bosque', 'chk-ctrl-limites'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', aplicarInterruptores);
  });

  document.getElementById('btn-caso-add').addEventListener('click', agregarCaso);
  document.getElementById('btn-casos-gpx').addEventListener('click', exportarColaGpx);
  document.getElementById('btn-casos-limpiar').addEventListener('click', () => {
    if (!confirm('¿Quitar de la cola los casos ya cerrados?')) return;
    casosGuardar(casosLeer().filter(c => !String(c.estado).startsWith('Cerrado')));
    pintarCola();
  });

  window.addEventListener('btmn-identificado', ev => armarFicha(ev.detail));
  pintarCola();
}

function activarModoControl() {
  const sat = document.querySelector('input[name="basemap"][value="esri-sat"]');
  if (sat && !sat.checked) {
    sat.checked = true;
    sat.dispatchEvent(new Event('change'));
  }
  capaOn('orto1417', false);
  document.getElementById('chk-ctrl-alertas').checked = true;
  document.getElementById('chk-ctrl-bosque').checked = true;
  document.getElementById('chk-ctrl-limites').checked = true;
  aplicarInterruptores();
  const card = document.getElementById('control-card');
  if (card) card.scrollIntoView({ block: 'nearest' });
}

function aplicarInterruptores() {
  const a = document.getElementById('chk-ctrl-alertas').checked;
  const b = document.getElementById('chk-ctrl-bosque').checked;
  const l = document.getElementById('chk-ctrl-limites').checked;
  capaOn('gfw-integradas', a);
  capaOn('cf2023', b);
  capaOn('jrc-transicion', b);
  capaOn('asp', l);
  capaOn('pnesnit', l);
  capaOn('fincasacc', l);
}

function hitPorId(hits, id) {
  return (hits || []).find(h => h.id === id);
}

function hitPorGrupo(hits, grupo) {
  return (hits || []).filter(h => h.grupo === grupo);
}

function valorAttr(hit, claves) {
  if (!hit || !hit.attrs) return '';
  const keys = Object.keys(hit.attrs);
  for (let i = 0; i < claves.length; i++) {
    const k = keys.find(x => x.toLowerCase() === claves[i].toLowerCase());
    if (k) return hit.attrs[k];
  }
  for (let i = 0; i < claves.length; i++) {
    const k = keys.find(x => x.toLowerCase().indexOf(claves[i].toLowerCase()) >= 0);
    if (k) return hit.attrs[k];
  }
  return '';
}

function parseFechaISO(s) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

function diasAtras(fecha) {
  if (!fecha) return null;
  return Math.round((Date.now() - fecha.getTime()) / 86400000);
}

function armarFicha(detail) {
  ctrlPunto = { lat: detail.lat, lng: detail.lng };
  const hits = detail.hits || [];
  const gfw = hitPorGrupo(hits, 'Alertas GFW');
  const integradas = hitPorId(hits, 'gfw-integradas') || gfw[0];
  const cob = hitPorId(hits, 'cf2023') || hits.find(h => /2023/.test(h.id || '') || /2023/.test(h.nombre || ''));
  const asp = hitPorId(hits, 'asp');
  const pne = hitPorId(hits, 'pnesnit') || hitPorId(hits, 'fincasacc');

  const fechaTxt = integradas ? valorAttr(integradas, ['Fecha de alerta']) : '';
  const confTxt = integradas ? valorAttr(integradas, ['Confianza']) : '';
  const fecha = parseFechaISO(fechaTxt);
  const dias = diasAtras(fecha);
  const reciente = dias != null && dias <= 90;
  const muyReciente = dias != null && dias <= 30;

  const clase2023 = cob ? valorAttr(cob, ['clase', 'Clase']) : '';
  const eraBosque = !!(clase2023 && BOSQUE_RE.test(clase2023));
  const aspNom = asp ? (valorAttr(asp, ['nombre_asp', 'Nombre']) || 'Sí') : '';
  const pneNom = pne ? (valorAttr(pne, ['categoria', 'Categoría', 'N.° de finca', 'n_finca']) || 'Sí') : '';

  let sugerencia = 'Sin alerta GFW en este píxel. No abrir caso salvo hallazgo de campo.';
  let clave = 'sin-alerta';
  if (integradas && !eraBosque && !cob) {
    sugerencia = 'Hay alerta, pero Cobertura 2023 no está cargada o no cubre el punto. Active “¿Era bosque?” y vuelva a clicar.';
    clave = 'revisar';
  } else if (integradas && !eraBosque) {
    sugerencia = 'Alerta sobre un sitio que en 2023 no era bosque mapeado. Cerrar como “ya era claro”, salvo que el técnico vea dosel en campo.';
    clave = 'descartar';
  } else if (integradas && eraBosque && (asp || pne) && muyReciente) {
    sugerencia = 'Prioridad de patrulla: alerta reciente, era bosque en 2023 y cae en ASP o PNE.';
    clave = 'campo';
  } else if (integradas && eraBosque && (asp || pne) && reciente) {
    sugerencia = 'Verificar en campo en esta ronda (alerta de los últimos 90 días, bosque 2023, ASP/PNE).';
    clave = 'campo';
  } else if (integradas && eraBosque && !asp && !pne) {
    sugerencia = 'Era bosque, pero no cruza ASP/PNE cargados. Revisar en oficina (amortiguamiento o finca privada).';
    clave = 'revisar';
  } else if (integradas && !reciente) {
    sugerencia = 'Alerta antigua (>90 días). Contrastar con JRC/cobertura; no tratarla como aviso de esta semana.';
    clave = 'revisar';
  }

  ctrlFicha = {
    lat: detail.lat,
    lng: detail.lng,
    alerta: integradas ? 'sí' : 'no',
    fecha: fechaTxt || '—',
    dias: dias,
    confianza: confTxt || '—',
    sistemas: gfw.map(h => h.nombre.replace(/ \(.*/, '')).join(' · ') || '—',
    clase2023: clase2023 || (cob ? 'sin clase' : 'no detectado'),
    eraBosque: eraBosque,
    asp: aspNom || 'no',
    pne: pneNom || 'no',
    sugerencia: sugerencia,
    clave: clave
  };

  const box = document.getElementById('ctrl-ficha');
  box.hidden = false;
  box.className = 'ctrl-ficha clave-' + clave;
  box.innerHTML =
    '<div class="ctrl-line"><b>Alerta GFW:</b> ' + escHtml(ctrlFicha.alerta) +
      (fechaTxt ? ' · ' + escHtml(fechaTxt) : '') +
      (dias != null ? ' · hace ' + dias + ' días' : '') + '</div>' +
    '<div class="ctrl-line"><b>Confianza:</b> ' + escHtml(ctrlFicha.confianza) + '</div>' +
    '<div class="ctrl-line"><b>Fuentes:</b> ' + escHtml(ctrlFicha.sistemas) + '</div>' +
    '<div class="ctrl-line"><b>¿Era bosque en 2023?</b> ' +
      (eraBosque ? 'Sí — ' + escHtml(clase2023) : (clase2023 ? 'No — ' + escHtml(clase2023) : 'Sin dato de cobertura 2023')) + '</div>' +
    '<div class="ctrl-line"><b>ASP:</b> ' + escHtml(ctrlFicha.asp) +
      ' · <b>PNE/finca Estado:</b> ' + escHtml(ctrlFicha.pne) + '</div>' +
    '<div class="ctrl-sug">' + escHtml(sugerencia) + '</div>';

  document.getElementById('btn-caso-add').disabled = !integradas;
}

function agregarCaso() {
  if (!ctrlFicha || ctrlFicha.alerta !== 'sí') return;
  const lista = casosLeer();
  const id = 'c_' + ctrlFicha.lat.toFixed(5) + '_' + ctrlFicha.lng.toFixed(5);
  if (lista.some(c => c.id === id)) {
    flashBotonCtrl('btn-caso-add', 'Ya está');
    return;
  }
  lista.unshift({
    id: id,
    lat: ctrlFicha.lat,
    lng: ctrlFicha.lng,
    fecha: ctrlFicha.fecha,
    confianza: ctrlFicha.confianza,
    clase2023: ctrlFicha.clase2023,
    asp: ctrlFicha.asp,
    pne: ctrlFicha.pne,
    sugerencia: ctrlFicha.sugerencia,
    estado: ctrlFicha.clave === 'campo' ? 'Pendiente de campo' : 'Nuevo',
    creado: new Date().toISOString()
  });
  casosGuardar(lista);
  pintarCola();
  flashBotonCtrl('btn-caso-add', 'Agregado');
}

function pintarCola() {
  const el = document.getElementById('ctrl-cola');
  if (!el) return;
  const lista = casosLeer();
  if (!lista.length) {
    el.innerHTML = '<div class="ident-vacio">No hay casos. Clic en una mancha de alerta y luego “Agregar a la cola”.</div>';
    return;
  }
  el.innerHTML = lista.map(c => {
    const tit = c.lat.toFixed(5) + ', ' + c.lng.toFixed(5);
    return '<div class="caso-row" data-id="' + escHtml(c.id) + '">' +
      '<div class="caso-tit">' + escHtml(tit) + '</div>' +
      '<div class="caso-meta">' + escHtml(c.fecha || '—') + ' · ' + escHtml(c.asp || 'fuera ASP') + '</div>' +
      '<select class="caso-estado">' + opcionesEstado(c.estado) + '</select>' +
      '<div class="caso-acc">' +
        '<button type="button" class="caso-ir">Ir</button>' +
        '<button type="button" class="caso-del">Quitar</button>' +
      '</div></div>';
  }).join('');

  el.querySelectorAll('.caso-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.caso-estado').addEventListener('change', ev => {
      const lista2 = casosLeer();
      const c = lista2.find(x => x.id === id);
      if (c) { c.estado = ev.target.value; casosGuardar(lista2); }
    });
    row.querySelector('.caso-ir').addEventListener('click', () => {
      const c = casosLeer().find(x => x.id === id);
      if (!c || !map) return;
      map.setView([c.lat, c.lng], Math.max(map.getZoom(), 15));
      if (typeof identificarEn === 'function') identificarEn(c.lat, c.lng);
    });
    row.querySelector('.caso-del').addEventListener('click', () => {
      casosGuardar(casosLeer().filter(x => x.id !== id));
      pintarCola();
    });
  });
}

function opcionesEstado(actual) {
  const opts = [
    'Nuevo',
    'Revisado en oficina',
    'Pendiente de campo',
    'Cerrado — tala',
    'Cerrado — natural',
    'Cerrado — ya era claro',
    'Cerrado — no se llegó'
  ];
  return opts.map(o => '<option' + (o === actual ? ' selected' : '') + '>' + o + '</option>').join('');
}

function exportarColaGpx() {
  const lista = casosLeer().filter(c => !String(c.estado).startsWith('Cerrado'));
  if (!lista.length) {
    alert('No hay casos abiertos para exportar.');
    return;
  }
  const pts = lista.map(c => {
    const nom = 'BTMN_' + c.lat.toFixed(5) + '_' + c.lng.toFixed(5);
    const desc = [c.estado, c.fecha, c.confianza, c.asp, c.clase2023].filter(Boolean).join(' | ');
    return '  <wpt lat="' + c.lat.toFixed(6) + '" lon="' + c.lng.toFixed(6) + '">\n' +
      '    <name>' + nom + '</name>\n' +
      '    <desc>' + desc.replace(/&/g, 'y') + '</desc>\n' +
      '  </wpt>';
  }).join('\n');
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="BTMN Atlas" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    pts + '\n</gpx>\n';
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'BTMN_casos_abiertos.gpx';
  a.click();
  URL.revokeObjectURL(a.href);
}

function flashBotonCtrl(id, texto) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = texto;
  setTimeout(() => { btn.textContent = original; }, 1400);
}

async function cargarModuloControl() {
  if (typeof construirModulos !== 'function') return;
  if (document.querySelector('[data-modulo-id="jrc-tmf"]')) return;
  try {
    const extra = await fetch('config/control.json', { cache: 'no-store' }).then(r => r.json());
    if (extra && extra.modulos) construirModulos(extra.modulos);
    const jrc = document.querySelector('[data-modulo-id="jrc-tmf"]');
    const alertas = document.querySelector('[data-modulo-id="alertas-gfw"]');
    if (jrc && alertas) alertas.after(jrc);
    if (document.getElementById('chk-modo-control').checked) aplicarInterruptores();
  } catch (err) {
    console.error('config/control.json', err);
  }
}

function esperarControl() {
  if (typeof map !== 'undefined' && map && typeof construirModulos === 'function' && document.getElementById('chk-modo-control')) {
    iniciarControl();
    cargarModuloControl();
    return;
  }
  setTimeout(esperarControl, 80);
}

esperarControl();
