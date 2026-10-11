import { CONFIG } from './config.js';
import { escapeHTML, formatoPrecio, ordenar, plural, tarjetaHTML } from './comun.js';
import {
  criteriosVacios, cuentaFiltros, escribirCriterios, filtrar, hayFiltros, leerCriterios, opciones,
} from './filtros.js';

const base = document.documentElement.dataset.base;
const $ = s => document.querySelector(s);
const el = {
  busqueda: $('#busqueda'),
  btnFiltros: $('#btn-filtros'),
  nFiltros: $('#btn-filtros .btn-filtros__n'),
  panel: $('#panel-filtros'),
  cabeceraPanel: $('#panel-filtros .panel__cabecera'),
  form: $('#form-filtros'),
  cerrar: $('#cerrar-filtros'),
  limpiar: $('#limpiar'),
  verResultados: $('#ver-resultados'),
  contador: $('#contador'),
  orden: $('#orden'),
  chips: $('#chips'),
  grilla: $('#grilla'),
  vacio: $('#vacio'),
  limpiarVacio: $('#limpiar-vacio'),
  verMas: $('#ver-mas'),
  destacados: $('#destacados'),
};
const escritorio = matchMedia('(min-width: 1024px)');
const CLAVE_SCROLL = 'catalogo-scroll';

let productos = [];
let etiquetas = {};
let resultado = [];
let criterios = leerCriterios(new URLSearchParams(location.search));
let visibles = CONFIG.POR_PAGINA;

iniciar();

async function iniciar() {
  try {
    const res = await fetch(`${base}data/catalogo.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ({ productos } = await res.json());
  } catch (err) {
    // La grilla pre-renderizada sigue visible; solo se desactivan búsqueda y filtros.
    console.error('No se pudo cargar el catálogo', err);
    el.btnFiltros.hidden = true;
    el.busqueda.disabled = true;
    el.busqueda.placeholder = 'Búsqueda no disponible';
    return;
  }

  construirFiltros();
  sincronizarControles();
  const guardado = leerScroll();
  if (guardado) visibles = guardado.visibles;
  actualizar({ url: false });
  if (guardado) requestAnimationFrame(() => scrollTo(0, guardado.y));
  conectarEventos();
  modoPanel();
}

// ---------------------------------------------------------------- filtros

function construirFiltros() {
  const ops = opciones(productos);
  etiquetas = Object.fromEntries(
    Object.entries(ops).map(([k, lista]) => [k, new Map(lista.map(o => [o.clave, o.etiqueta]))]));

  const casilla = (nombre, o) => `
    <label class="check">
      <input type="checkbox" name="${nombre}" value="${escapeHTML(o.clave)}">
      <span class="check__caja">${escapeHTML(o.etiqueta)}<span class="check__n">${o.n}</span></span>
    </label>`;
  const grupo = (titulo, nombre, lista) => lista.length < 2 ? '' : `
    <fieldset class="grupo">
      <legend class="grupo__titulo">${titulo}</legend>
      <div class="grupo__opciones">${lista.map(o => casilla(nombre, o)).join('')}</div>
    </fieldset>`;

  const precios = productos.map(p => p.precio).filter(p => p != null);
  const min = Math.min(...precios);
  const max = Math.max(...precios);

  el.form.innerHTML = `
    <label class="interruptor">
      <input type="checkbox" name="disp" role="switch">
      <span class="interruptor__texto">Solo disponibles</span>
      <span class="interruptor__pista" aria-hidden="true"></span>
    </label>
    ${grupo('Tipo', 'cat', ops.cat)}
    ${grupo('Marca', 'marca', ops.marca)}
    ${grupo('Sabor', 'sabor', ops.sabor)}
    ${grupo('Nicotina', 'nic', ops.nic)}
    ${precios.length > 1 && min !== max ? `
    <fieldset class="grupo">
      <legend class="grupo__titulo">Precio</legend>
      <div class="precio">
        <label><span class="sr">Precio mínimo</span>
          <input type="number" name="min" inputmode="numeric" min="0" step="1" placeholder="${formatoPrecio(min)}"></label>
        <span aria-hidden="true">–</span>
        <label><span class="sr">Precio máximo</span>
          <input type="number" name="max" inputmode="numeric" min="0" step="1" placeholder="${formatoPrecio(max)}"></label>
      </div>
    </fieldset>` : ''}`;
}

function leerFormulario() {
  const fd = new FormData(el.form);
  const num = k => {
    const v = fd.get(k);
    return v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  };
  return {
    ...criterios,
    cat: fd.getAll('cat'), marca: fd.getAll('marca'), sabor: fd.getAll('sabor'), nic: fd.getAll('nic'),
    min: num('min'), max: num('max'), disp: fd.has('disp'),
  };
}

function sincronizarControles() {
  el.busqueda.value = criterios.q;
  el.orden.value = criterios.orden;
  for (const input of el.form.elements) {
    if (input.type === 'checkbox') {
      input.checked = input.name === 'disp' ? criterios.disp : criterios[input.name]?.includes(input.value);
    } else if (input.type === 'number') {
      input.value = criterios[input.name] ?? '';
    }
  }
}

// ---------------------------------------------------------------- render

function actualizar({ url = true } = {}) {
  resultado = ordenar(filtrar(productos, criterios), criterios.orden);
  if (url) {
    const p = escribirCriterios(criterios).toString();
    history.replaceState(null, '', p ? `?${p}` : location.pathname);
  }
  pintar();
}

function pintar() {
  el.grilla.innerHTML = resultado.slice(0, visibles)
    .map((g, i) => tarjetaHTML(g, base, { prioridad: i < 4 })).join('');
  const n = resultado.length;
  el.vacio.hidden = n > 0;
  el.verMas.hidden = n <= visibles;
  el.contador.textContent = plural(n, 'producto', 'productos');
  el.verResultados.textContent = n ? `Ver ${plural(n, 'producto', 'productos')}` : 'Sin resultados';
  if (el.destacados) el.destacados.hidden = hayFiltros(criterios);
  const activos = cuentaFiltros(criterios);
  el.nFiltros.textContent = activos;
  el.nFiltros.hidden = activos === 0;
  pintarChips();
}

function pintarChips() {
  const chips = [];
  if (criterios.q.trim()) chips.push(['q', '', `“${criterios.q.trim()}”`]);
  if (criterios.disp) chips.push(['disp', '', 'Solo disponibles']);
  for (const k of ['cat', 'marca', 'sabor', 'nic']) {
    for (const v of criterios[k]) chips.push([k, v, etiquetas[k]?.get(v) ?? v]);
  }
  if (criterios.min != null) chips.push(['min', '', `Desde ${formatoPrecio(criterios.min)}`]);
  if (criterios.max != null) chips.push(['max', '', `Hasta ${formatoPrecio(criterios.max)}`]);

  el.chips.innerHTML = chips.map(([k, v, texto]) => `
    <button type="button" class="chip" data-k="${k}" data-v="${escapeHTML(v)}" aria-label="Quitar filtro ${escapeHTML(texto)}">
      ${escapeHTML(texto)}
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>
    </button>`).join('') +
    (chips.length > 1 ? '<button type="button" class="chip chip--limpiar" data-k="todo">Limpiar todo</button>' : '');
  el.chips.hidden = chips.length === 0;
}

function verMas() {
  const desde = visibles;
  visibles += CONFIG.POR_PAGINA;
  el.grilla.insertAdjacentHTML('beforeend',
    resultado.slice(desde, visibles).map(g => tarjetaHTML(g, base)).join(''));
  el.verMas.hidden = resultado.length <= visibles;
  el.grilla.children[desde]?.focus({ preventScroll: true });
}

function cambiar(nuevos) {
  criterios = nuevos;
  visibles = CONFIG.POR_PAGINA;
  actualizar();
}

function limpiarTodo() {
  cambiar(criteriosVacios(criterios.orden));
  sincronizarControles();
}

// ---------------------------------------------------------------- panel

function modoPanel() {
  if (escritorio.matches) {
    if (el.panel.open && el.panel.matches(':modal')) el.panel.close();
    if (!el.panel.open) el.panel.show();
  } else if (el.panel.open && !el.panel.matches(':modal')) {
    el.panel.close();
  }
}

function arrastrePanel() {
  const zona = el.cabeceraPanel;
  let y0 = null, dy = 0, t0 = 0;
  zona.addEventListener('pointerdown', e => {
    if (!el.panel.matches(':modal') || e.target.closest('button')) return;
    y0 = e.clientY; dy = 0; t0 = performance.now();
    zona.setPointerCapture(e.pointerId);
    el.panel.style.transition = 'none';
  });
  zona.addEventListener('pointermove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    el.panel.style.transform = `translateY(${dy}px)`;
  });
  const soltar = () => {
    if (y0 === null) return;
    const velocidad = dy / Math.max(1, performance.now() - t0);
    y0 = null;
    el.panel.style.transition = '';
    el.panel.style.transform = '';
    if (dy > 120 || velocidad > 0.5) el.panel.close();
  };
  zona.addEventListener('pointerup', soltar);
  zona.addEventListener('pointercancel', soltar);
}

// ---------------------------------------------------------------- scroll

function leerScroll() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_SCROLL));
    sessionStorage.removeItem(CLAVE_SCROLL);
    return guardado?.busqueda === location.search ? guardado : null;
  } catch {
    return null;
  }
}

function guardarScroll() {
  try {
    sessionStorage.setItem(CLAVE_SCROLL, JSON.stringify({ busqueda: location.search, y: scrollY, visibles }));
  } catch { /* modo privado o almacenamiento bloqueado */ }
}

// ---------------------------------------------------------------- eventos

function conectarEventos() {
  let espera;
  const conEspera = fn => { clearTimeout(espera); espera = setTimeout(fn, 200); };

  el.busqueda.addEventListener('input', () =>
    conEspera(() => cambiar({ ...criterios, q: el.busqueda.value })));
  el.busqueda.form?.addEventListener('submit', e => { e.preventDefault(); el.busqueda.blur(); });

  el.form.addEventListener('input', e => {
    if (e.target.type === 'number') conEspera(() => cambiar(leerFormulario()));
    else cambiar(leerFormulario());
  });
  el.form.addEventListener('submit', e => e.preventDefault());

  el.orden.addEventListener('change', () => cambiar({ ...criterios, orden: el.orden.value }));
  el.verMas.addEventListener('click', verMas);
  el.limpiar.addEventListener('click', limpiarTodo);
  el.limpiarVacio.addEventListener('click', limpiarTodo);

  el.chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const indice = [...el.chips.children].indexOf(chip);
    const { k, v } = chip.dataset;
    if (k === 'todo') {
      limpiarTodo();
      el.busqueda.focus();
      return;
    }
    const c = { ...criterios };
    if (k === 'q') c.q = '';
    else if (k === 'disp') c.disp = false;
    else if (k === 'min' || k === 'max') c[k] = null;
    else c[k] = c[k].filter(x => x !== v);
    cambiar(c);
    sincronizarControles();
    (el.chips.children[indice] ?? el.chips.lastElementChild ?? el.busqueda).focus();
  });

  el.btnFiltros.addEventListener('click', () => el.panel.showModal());
  el.cerrar.addEventListener('click', () => el.panel.close());
  el.verResultados.addEventListener('click', () => el.panel.close());
  el.panel.addEventListener('click', e => { if (e.target === el.panel) el.panel.close(); });
  el.panel.addEventListener('cancel', e => { if (!el.panel.matches(':modal')) e.preventDefault(); });
  escritorio.addEventListener('change', modoPanel);
  arrastrePanel();

  document.addEventListener('click', e => { if (e.target.closest('a.tarjeta')) guardarScroll(); });
}
