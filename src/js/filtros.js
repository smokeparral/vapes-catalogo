// Lógica pura de filtros y su representación en la URL.
import { plano, valorNicotina } from './comun.js';

const LISTAS = ['cat', 'marca', 'sabor', 'nic'];

export const criteriosVacios = (orden = 'recomendado') =>
  ({ q: '', cat: [], marca: [], sabor: [], nic: [], min: null, max: null, disp: false, orden });

export function leerCriterios(params) {
  const lista = k => (params.get(k) ?? '').split(',').map(plano).filter(Boolean);
  const num = k => {
    const v = params.get(k);
    const n = v === null || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    q: params.get('q') ?? '',
    ...Object.fromEntries(LISTAS.map(k => [k, lista(k)])),
    min: num('min'), max: num('max'),
    disp: params.get('disp') === '1',
    orden: params.get('orden') || 'recomendado',
  };
}

export function escribirCriterios(c) {
  const p = new URLSearchParams();
  if (c.q.trim()) p.set('q', c.q.trim());
  for (const k of LISTAS) if (c[k].length) p.set(k, c[k].join(','));
  if (c.min != null) p.set('min', c.min);
  if (c.max != null) p.set('max', c.max);
  if (c.disp) p.set('disp', '1');
  if (c.orden !== 'recomendado') p.set('orden', c.orden);
  return p;
}

export const cuentaFiltros = c =>
  LISTAS.reduce((n, k) => n + c[k].length, 0) + (c.min != null) + (c.max != null) + c.disp;

export const hayFiltros = c => Boolean(c.q.trim()) || cuentaFiltros(c) > 0;

export function filtrar(productos, c) {
  const terminos = plano(c.q).split(' ').filter(Boolean);
  return productos.filter(p => {
    if (c.disp && p.stock === 0) return false;
    if (terminos.length) {
      const texto = plano([p.nombre, p.categoria, p.marca, ...p.sabores, ...p.nicotina, p.descripcion].join(' '));
      if (!terminos.every(t => texto.includes(t))) return false;
    }
    if (c.cat.length && !c.cat.includes(plano(p.categoria))) return false;
    if (c.marca.length && !c.marca.includes(plano(p.marca))) return false;
    if (c.sabor.length && !p.sabores.some(s => c.sabor.includes(plano(s)))) return false;
    if (c.nic.length && !p.nicotina.some(n => c.nic.includes(plano(n)))) return false;
    if (c.min != null && (p.precio == null || p.precio < c.min)) return false;
    if (c.max != null && (p.precio == null || p.precio > c.max)) return false;
    return true;
  });
}

// Opciones de cada filtro, generadas de los datos, con su conteo.
export function opciones(productos) {
  const res = { cat: new Map(), marca: new Map(), sabor: new Map(), nic: new Map() };
  const sumar = (mapa, etiqueta) => {
    const clave = plano(etiqueta);
    if (!clave) return;
    const o = mapa.get(clave) ?? { clave, etiqueta, n: 0 };
    o.n++;
    mapa.set(clave, o);
  };
  for (const p of productos) {
    sumar(res.cat, p.categoria);
    sumar(res.marca, p.marca);
    new Map(p.sabores.map(s => [plano(s), s])).forEach(s => sumar(res.sabor, s));
    new Map(p.nicotina.map(n => [plano(n), n])).forEach(n => sumar(res.nic, n));
  }
  const porNombre = (a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es');
  return {
    cat: [...res.cat.values()].sort(porNombre),
    marca: [...res.marca.values()].sort(porNombre),
    sabor: [...res.sabor.values()].sort((a, b) => b.n - a.n || porNombre(a, b)),
    nic: [...res.nic.values()].sort((a, b) => valorNicotina(a.etiqueta) - valorNicotina(b.etiqueta) || porNombre(a, b)),
  };
}
