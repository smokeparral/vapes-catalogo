// Funciones puras compartidas por el navegador y por scripts/build.mjs.
import { CONFIG } from './config.js';

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ENTIDADES[c]);

// Minúsculas, sin acentos, espacios simples. Sirve para comparar y para claves.
export const plano = v =>
  String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const slug = v => plano(v).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'producto';

const enteros = new Intl.NumberFormat(CONFIG.LOCALE, {
  style: 'currency', currency: CONFIG.MONEDA, maximumFractionDigits: 0,
});
const decimales = new Intl.NumberFormat(CONFIG.LOCALE, {
  style: 'currency', currency: CONFIG.MONEDA, minimumFractionDigits: 2,
});
export const formatoPrecio = n => (Number.isInteger(n) ? enteros : decimales).format(n);
export const textoPrecio = n => (n == null ? 'Precio a consultar' : formatoPrecio(n));

const miles = new Intl.NumberFormat(CONFIG.LOCALE);
export const textoHits = n => (n ? `${miles.format(n)} hits` : '');

export const textoPromo = promo =>
  !promo ? '' : promo.cantidad ? `${promo.cantidad} x ${formatoPrecio(promo.total)}` : promo.texto;

// Sello de promo: como la etiqueta que se pega en el mostrador.
export function selloHTML(promo, clase = 'sello') {
  if (!promo) return '';
  const lectura = `<span class="sr">Promo: ${escapeHTML(textoPromo(promo))}</span>`;
  return promo.cantidad
    ? `<span class="${clase}" aria-hidden="true"><b>${promo.cantidad}x</b><span>${formatoPrecio(promo.total)}</span></span>${lectura}`
    : `<span class="${clase} ${clase}--texto" aria-hidden="true"><b>Promo</b></span>${lectura}`;
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function linkWhatsApp(p, { sabor, nicotina } = {}) {
  const url = `${CONFIG.SITIO_URL}/productos/${p.id}/`;
  const detalle = [sabor, nicotina].filter(Boolean).join(', ');
  const msg = p.stock === 0
    ? `Hola, ¿va a volver el ${p.nombre}? ${url}`
    : `Hola, me interesa el ${p.nombre}${detalle ? ` (${detalle})` : ''}${p.promo ? ` con la promo ${textoPromo(p.promo)}` : ''}. ${url}`;
  return `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(msg)}`;
}

const ORDENES = {
  recomendado: (a, b) =>
    (b.stock > 0) - (a.stock > 0) ||
    (b.alta ?? '').localeCompare(a.alta ?? '') ||
    a.nombre.localeCompare(b.nombre, 'es'),
  'precio-asc': (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity),
  'precio-desc': (a, b) => (b.precio ?? -Infinity) - (a.precio ?? -Infinity),
  recientes: (a, b) => (b.alta ?? '').localeCompare(a.alta ?? ''),
};
export const ordenar = (productos, orden) =>
  [...productos].sort((a, b) => (ORDENES[orden] ?? ORDENES.recomendado)(a, b) || ORDENES.recomendado(a, b));

// "Sin nicotina" primero, luego por miligramos: "3 mg" < "20 mg" < "50 mg".
export function valorNicotina(t) {
  const k = plano(t);
  if (k.startsWith('sin') || /^0\b/.test(k)) return 0;
  const m = /(\d+(?:[.,]\d+)?)/.exec(k);
  return m ? Number(m[1].replace(',', '.')) : 1000;
}

export function tarjetaHTML(p, base, { prioridad = false } = {}) {
  const agotado = p.stock === 0;
  const f = p.fotos[0];
  const placeholder = `${base}img/placeholder.svg`;
  const img = f
    ? `<img src="${base}${f.s}" srcset="${base}${f.s} 600w, ${base}${f.l} 1200w"
        sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"`
    : `<img src="${placeholder}"`;
  const badge = agotado
    ? '<span class="badge">Agotado</span>'
    : p.nuevo && !p.promo ? '<span class="badge badge--nueva">Nuevo</span>' : '';
  const sello = agotado ? '' : selloHTML(p.promo);
  const aviso = !agotado && p.stock <= 2 ? '<span class="tarjeta__aviso">Últimas unidades</span>' : '';
  const sabores = p.sabores.length > 1 ? plural(p.sabores.length, 'sabor', 'sabores') : p.sabores[0];
  const extra = [textoHits(p.hits), sabores].filter(Boolean).join(', ');

  return `<a class="tarjeta${agotado ? ' tarjeta--agotada' : ''}" href="${base}productos/${p.id}/">
  <span class="tarjeta__media">${img} alt="" width="600" height="600" ${prioridad ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${placeholder}'">${badge}${sello}</span>
  ${p.marca ? `<span class="tarjeta__marca">${escapeHTML(p.marca)}</span>` : ''}
  <span class="tarjeta__nombre">${escapeHTML(p.nombre)}</span>
  <span class="tarjeta__precio">${textoPrecio(p.precio)}${aviso}</span>
  ${extra ? `<span class="tarjeta__extra">${escapeHTML(extra)}</span>` : ''}
</a>`;
}
