// Genera el sitio en _site/ a partir de la hoja de Google Sheets (o de los datos de ejemplo).
// Uso: node scripts/build.mjs
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { CONFIG } from '../src/js/config.js';
import {
  escapeHTML, formatoPrecio, linkWhatsApp, ordenar, plano, plural, selloHTML, slug, tarjetaHTML, textoHits, textoPrecio,
  valorNicotina,
} from '../src/js/comun.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RAIZ, 'src');
const SALIDA = path.join(RAIZ, '_site');
const CACHE = path.join(RAIZ, '.cache', 'fotos');
const URL_SITIO = CONFIG.SITIO_URL.replace(/\/$/, '');
const BASE = new URL(`${URL_SITIO}/`).pathname;
// DATOS=ejemplo o DATOS=peor usan datos locales aunque haya hoja (solo para desarrollo).
const USAR_EJEMPLO = !CONFIG.SHEET_ID.trim() || Boolean(process.env.DATOS);
const AHORA = new Date();
const avisos = [];

// ---------------------------------------------------------------- lectura

function parseCSV(texto) {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c !== '"') campo += c;
      else if (texto[i + 1] === '"') { campo += '"'; i++; }
      else comillas = false;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

async function leerFilas() {
  if (USAR_EJEMPLO) {
    // Solo para desarrollo: DATOS=peor npm run dev prueba el diseño con datos extremos.
    const archivo = process.env.DATOS === 'peor' ? 'peor-caso.json' : 'ejemplo.json';
    console.log(`Usando datos locales: datos/${archivo}`);
    return JSON.parse(await readFile(path.join(RAIZ, 'datos', archivo), 'utf8'));
  }
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/export?format=csv&gid=${CONFIG.SHEET_GID}`;
  const res = await fetch(url);
  const tipo = res.headers.get('content-type') ?? '';
  if (!res.ok || !tipo.includes('text/csv')) {
    throw new Error(
      `No se pudo leer la hoja (HTTP ${res.status}, ${tipo || 'sin tipo'}). ` +
      '¿Está compartida como "Cualquier persona con el enlace: Lector"? ¿Son correctos SHEET_ID y SHEET_GID?');
  }
  const [encabezados, ...filas] = parseCSV(await res.text());
  const claves = encabezados.map(h => plano(h).replace(/ /g, '_'));
  return filas.map(f => Object.fromEntries(claves.map((k, i) => [k, f[i] ?? ''])));
}

// ---------------------------------------------------------------- normalización

const texto = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const lista = v => String(v ?? '').split(/[,\n]/).map(texto).filter(Boolean);
const unicos = valores => [...new Map(valores.map(v => [plano(v), v])).values()];

function numero(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "12.990" = doce mil novecientos noventa
  s = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function booleano(v, porDefecto) {
  const s = plano(v);
  if (!s) return porDefecto;
  return ['true', 'verdadero', 'si', '1', 'x'].includes(s);
}

function fecha(v) {
  const s = texto(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); // dd/mm/aaaa
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function fuenteFoto(v) {
  const drive = /\/d\/([\w-]{20,})/.exec(v)?.[1] ?? /[?&]id=([\w-]{20,})/.exec(v)?.[1];
  if (drive) return { tipo: 'drive', id: drive, clave: `drive-${drive}` };
  if (/^https?:\/\//i.test(v)) return { tipo: 'url', url: v, clave: `url-${hash(v)}` };
  // Fotos guardadas en la carpeta Productos/ del repositorio: basta con el nombre del archivo.
  const enCarpeta = path.join(RAIZ, 'Productos', path.basename(v));
  if (existsSync(enCarpeta)) return { tipo: 'local', ruta: enCarpeta };
  if (USAR_EJEMPLO) return { tipo: 'local', ruta: path.join(RAIZ, 'datos', v) };
  return null;
}

// "2x15000", "2 x $15.000", "3 por 20.000" -> { cantidad, total, ahorro }. Otro texto se muestra tal cual.
function leerPromo(v, precio, nombre) {
  const t = texto(v);
  if (!t) return null;
  const m = /^(\d+)\s*(?:x|×|por)\s*\$?\s*([\d.,]+)$/i.exec(t);
  const cantidad = m ? Number(m[1]) : 0;
  const total = m ? numero(m[2]) : null;
  if (cantidad < 2 || total == null) return { texto: t };
  const ahorro = precio != null ? cantidad * precio - total : null;
  if (ahorro != null && ahorro <= 0) {
    avisos.push(`"${nombre}": la promo "${t}" no es más barata que ${cantidad} al precio normal.`);
  }
  return { cantidad, total, ahorro: ahorro > 0 ? ahorro : null };
}

const hash = v => createHash('sha256').update(v).digest('hex').slice(0, 16);

function normalizar(filas) {
  const productos = [];
  const ids = new Set();
  filas.forEach((f, i) => {
    const n = i + 2; // número de fila en la hoja (la 1 son los encabezados)
    const nombre = texto(f.nombre);
    if (!nombre) {
      // Las casillas de verificación llegan como TRUE/FALSE aunque la fila esté vacía.
      const conDatos = Object.entries(f).some(([k, v]) => !['destacado', 'visible'].includes(k) && texto(v));
      if (conDatos) avisos.push(`Fila ${n}: no tiene nombre, se omitió.`);
      return;
    }
    if (!booleano(f.visible, true)) return;

    let id = slug(texto(f.id) || nombre);
    if (ids.has(id)) {
      let k = 2;
      while (ids.has(`${id}-${k}`)) k++;
      avisos.push(`"${nombre}": el id "${id}" estaba repetido, se usó "${id}-${k}".`);
      id = `${id}-${k}`;
    }
    ids.add(id);

    const precio = numero(f.precio);
    if (precio == null) avisos.push(`"${nombre}": no tiene precio, se muestra "Precio a consultar".`);

    const fotos = String(f.fotos ?? '').split(/[\s,]+/).filter(Boolean).map(v => {
      const fuente = fuenteFoto(v);
      if (!fuente) avisos.push(`"${nombre}": "${v}" no es un link de Google Drive ni una foto de la carpeta Productos.`);
      return fuente;
    }).filter(Boolean);
    if (!fotos.length) avisos.push(`"${nombre}": no tiene fotos, se usa la imagen genérica.`);

    const stock = Math.max(0, Math.floor(numero(f.stock) ?? 0));
    const alta = fecha(f.alta);
    const dias = alta ? (AHORA - Date.parse(alta)) / 86_400_000 : Infinity;

    productos.push({
      id,
      nombre,
      categoria: texto(f.categoria) || 'Otras',
      precio,
      stock,
      marca: texto(f.marca),
      hits: numero(f.hits ?? f.caladas), // la columna puede llamarse "hits" o "caladas"
      sabores: unicos(lista(f.sabores)),
      nicotina: unicos(lista(f.nicotina)).sort((a, b) => valorNicotina(a) - valorNicotina(b)),
      promo: leerPromo(f.promo, precio, nombre),
      descripcion: String(f.descripcion ?? '').trim(),
      destacado: booleano(f.destacado, false),
      alta,
      nuevo: stock > 0 && dias <= CONFIG.DIAS_NUEVO,
      fuentes: fotos,
    });
  });
  return productos;
}

// ---------------------------------------------------------------- fotos

async function existe(ruta) {
  try { await access(ruta); return true; } catch { return false; }
}

async function descargar(fuente) {
  if (fuente.tipo === 'local') return readFile(fuente.ruta);
  const url = fuente.tipo === 'drive'
    ? `https://drive.google.com/uc?export=download&id=${fuente.id}`
    : fuente.url;
  const res = await fetch(url, { redirect: 'follow' });
  const tipo = res.headers.get('content-type') ?? '';
  if (!res.ok || !tipo.startsWith('image/')) {
    throw new Error(`HTTP ${res.status} (${tipo || 'sin tipo'}). ¿La foto está compartida como "Cualquier persona con el enlace"?`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// Devuelve las rutas en caché de la foto procesada, procesándola solo si hace falta.
async function procesarFoto(fuente) {
  const clave = fuente.clave ?? `local-${hash(await readFile(fuente.ruta))}`;
  const destino = { s: `${clave}-600.webp`, l: `${clave}-1200.webp`, og: `${clave}-og.jpg` };
  if (await existe(path.join(CACHE, destino.og))) return destino;

  const original = sharp(await descargar(fuente), { failOn: 'none' }).rotate().flatten({ background: '#ffffff' });
  await Promise.all([
    original.clone().resize(600, 600, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(CACHE, destino.s)),
    original.clone().resize(1200, 1200, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(CACHE, destino.l)),
    original.clone().resize(1200, 630, { fit: 'contain', background: '#eef0ec' }).jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(CACHE, destino.og)),
  ]);
  return destino;
}

async function prepararFotos(productos) {
  await mkdir(CACHE, { recursive: true });
  await mkdir(path.join(SALIDA, 'fotos'), { recursive: true });
  const tareas = productos.flatMap(g => g.fuentes.map((fuente, i) => ({ g, fuente, i })));
  const resultados = new Map();

  const trabajador = async () => {
    for (let t = tareas.shift(); t; t = tareas.shift()) {
      try {
        resultados.set(t, await procesarFoto(t.fuente));
      } catch (err) {
        avisos.push(`"${t.g.nombre}": no se pudo usar la foto ${t.i + 1} (${err.message})`);
      }
    }
  };
  const todas = [...tareas];
  await Promise.all(Array.from({ length: 4 }, trabajador));

  for (const g of productos) {
    g.fotos = [];
    g.og = null;
    for (const t of todas.filter(t => t.g === g)) {
      const r = resultados.get(t);
      if (!r) continue;
      const n = g.fotos.length + 1;
      const s = `fotos/${g.id}-${n}-600.webp`;
      const l = `fotos/${g.id}-${n}-1200.webp`;
      await copyFile(path.join(CACHE, r.s), path.join(SALIDA, s));
      await copyFile(path.join(CACHE, r.l), path.join(SALIDA, l));
      if (n === 1) {
        g.og = `fotos/${g.id}-og.jpg`;
        await copyFile(path.join(CACHE, r.og), path.join(SALIDA, g.og));
      }
      g.fotos.push({ s, l });
    }
    delete g.fuentes;
  }
}

// ---------------------------------------------------------------- HTML

const ICONOS = {
  canal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z"/><path d="M9 10.5h6M9 13.5h4"/></svg>',
};

const plantilla = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
const jsonEnHTML = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
const absoluta = ruta => `${URL_SITIO}/${ruta}`;
const telefono = CONFIG.WHATSAPP.replace(/^(\d{2})(\d)(\d{4})(\d{4})$/, '+$1 $2 $3 $4');
const actualizado = new Intl.DateTimeFormat(CONFIG.LOCALE, {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: CONFIG.ZONA_HORARIA,
}).format(AHORA);

const marcaHTML = `<a class="marca vidrio" href="${BASE}" aria-label="${escapeHTML(CONFIG.TIENDA)}, inicio">
        <img class="marca__logo" src="${BASE}img/logo-96.webp" alt="" width="40" height="40">
        <span class="marca__nombre">${escapeHTML(CONFIG.TIENDA)}</span>
      </a>`;

const whatsappHTML = `<a class="flotante flotante--wa" href="https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent('Hola, vengo del catálogo')}" aria-label="Escríbenos por WhatsApp">${ICONOS.chat}</a>`;

// Humo dibujado con ruido fractal: una sola capa estática, sin imágenes que descargar.
const HUMO = `<svg class="hero__humo" aria-hidden="true" focusable="false" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <filter id="humo" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.016" numOctaves="4" seed="11"/>
          <feColorMatrix values="0 0 0 0 0.86  0 0 0 0 0.86  0 0 0 0 0.84  0 0 0 1.6 -0.62"/>
        </filter>
        <rect width="800" height="600" filter="url(#humo)"/>
      </svg>`;

function heroHTML(productos) {
  const hayPromos = productos.some(p => p.promo && p.stock > 0);
  const acciones = [
    hayPromos ? `<a class="btn btn--brasa" href="#promos">Ver promos</a>` : '',
    CONFIG.CANAL ? `<a class="btn btn--vidrio" href="${escapeHTML(CONFIG.CANAL)}">${ICONOS.canal}Seguir el canal</a>` : '',
  ].filter(Boolean).join('\n          ');
  return `<section class="hero" aria-labelledby="titulo-tienda">
      ${HUMO}
      <div class="hero__brasa" aria-hidden="true"></div>
      <div class="hero__contenido">
        <h1 id="titulo-tienda" class="hero__titulo"><span>Smoke</span> <span class="hero__ciudad">Parral</span></h1>
        <p class="hero__lema">${escapeHTML(CONFIG.LEMA)}</p>
        ${acciones ? `<div class="hero__acciones">
          ${acciones}
        </div>` : ''}
      </div>
    </section>`;
}

function categoriasHTML(productos) {
  const conteo = new Map();
  for (const p of productos) {
    const c = conteo.get(plano(p.categoria)) ?? { nombre: p.categoria, n: 0 };
    c.n++;
    conteo.set(plano(p.categoria), c);
  }
  if (conteo.size < 2) return '';
  const boton = (clave, nombre, n) =>
    `<button class="categoria" type="button" data-cat="${escapeHTML(clave)}" aria-pressed="${clave === ''}">${escapeHTML(nombre)}<span class="categoria__n">${n}</span></button>`;
  return `<nav id="categorias" class="categorias" aria-label="Tipos de producto">
      ${boton('', 'Todo', productos.length)}
      ${[...conteo].sort((a, b) => b[1].n - a[1].n).map(([k, c]) => boton(k, c.nombre, c.n)).join('\n      ')}
    </nav>`;
}

function promosHTML(productos) {
  const lista = ordenar(productos.filter(p => p.promo && p.stock > 0), 'recomendado');
  if (!lista.length) return '';
  return `<section id="promos" class="promos" aria-labelledby="titulo-promos">
      <h2 id="titulo-promos" class="seccion__titulo">Promos</h2>
      <div class="fila-scroll">
        ${lista.map(p => tarjetaHTML(p, BASE)).join('\n')}
      </div>
    </section>`;
}

function promoFichaHTML(g) {
  if (!g.promo || g.stock === 0) return '';
  const detalle = g.promo.cantidad
    ? `<p class="promo-ficha__titulo">Llévate ${g.promo.cantidad} por ${formatoPrecio(g.promo.total)}</p>
          ${g.promo.ahorro ? `<p class="promo-ficha__ahorro">Ahorras ${formatoPrecio(g.promo.ahorro)} frente a comprarlos por separado.</p>` : ''}`
    : `<p class="promo-ficha__titulo">${escapeHTML(g.promo.texto)}</p>`;
  return `<div class="promo-ficha">
          ${selloHTML(g.promo, 'sello')}
          <div>${detalle}</div>
        </div>`;
}

function cabezaHTML({ titulo, descripcion, url, imagen, tipo = 'website', extra = '' }) {
  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHTML(titulo)}</title>
  <meta name="description" content="${escapeHTML(descripcion)}">
  ${url ? `<link rel="canonical" href="${url}">` : ''}
  <meta property="og:site_name" content="${escapeHTML(CONFIG.TIENDA)}">
  <meta property="og:type" content="${tipo}">
  <meta property="og:title" content="${escapeHTML(titulo)}">
  <meta property="og:description" content="${escapeHTML(descripcion)}">
  ${url ? `<meta property="og:url" content="${url}">` : ''}
  <meta property="og:image" content="${imagen}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="es_CL">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#e4e3df" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1c1c1b" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="${BASE}img/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="${BASE}img/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap">
  <link rel="stylesheet" href="${BASE}css/tokens.css">
  <link rel="stylesheet" href="${BASE}css/base.css">
  <link rel="stylesheet" href="${BASE}css/components.css">
${extra}`;
}

function pieHTML() {
  const enlaces = [`<a href="https://wa.me/${CONFIG.WHATSAPP}">WhatsApp ${telefono}</a>`];
  if (CONFIG.CANAL) enlaces.push(`<a href="${escapeHTML(CONFIG.CANAL)}">Canal de WhatsApp</a>`);
  if (CONFIG.INSTAGRAM) enlaces.push(`<a href="https://instagram.com/${encodeURIComponent(CONFIG.INSTAGRAM)}">Instagram</a>`);
  const datos = [CONFIG.HORARIO, CONFIG.ENVIOS].filter(Boolean).map(t => `<p>${escapeHTML(t)}</p>`).join('');
  return `  <footer class="pie">
    <div class="pie__contenido">
      <div>
        ${marcaHTML.replace('marca vidrio', 'marca')}
        <p>${escapeHTML(CONFIG.LEMA)}</p>
        ${datos}
      </div>
      <nav class="pie__enlaces" aria-label="Contacto">${enlaces.join('')}</nav>
      <p class="pie__nota">El stock es informativo; confirmamos disponibilidad por WhatsApp.<br>Actualizado el ${actualizado}.</p>
    </div>
  </footer>`;
}

function destacadosHTML(productos) {
  // Lo que ya sale en Promos no se repite aquí.
  const lista = ordenar(productos.filter(g => g.destacado && !(g.promo && g.stock > 0)), 'recomendado');
  if (!lista.length) return '';
  return `<section id="destacados" class="destacados" aria-labelledby="titulo-destacados">
      <h2 id="titulo-destacados" class="seccion__titulo">Destacados</h2>
      <div class="fila-scroll">
        ${lista.map(g => tarjetaHTML(g, BASE)).join('\n')}
      </div>
    </section>`;
}

function opcionesHTML(nombre, titulo, valores) {
  if (!valores.length) return '';
  const unica = valores.length === 1;
  return `<fieldset class="opciones" data-opcion="${nombre}">
          <legend>${titulo}: <span data-valor>${unica ? escapeHTML(valores[0]) : 'elige una opción'}</span></legend>
          <div class="opciones__lista">
            ${valores.map(v => `<label class="check">
              <input type="radio" name="${nombre}" value="${escapeHTML(v)}"${unica ? ' checked' : ''}>
              <span class="check__caja">${escapeHTML(v)}</span>
            </label>`).join('\n            ')}
          </div>
        </fieldset>`;
}

// Datos fijos del producto como lista, no como "A · B · C".
function datosHTML(g) {
  const filas = [['Marca', g.marca], ['Duración', textoHits(g.hits)]].filter(([, v]) => v);
  if (!filas.length) return '';
  return `<dl class="ficha__datos">
          ${filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHTML(v)}</dd></div>`).join('\n          ')}
        </dl>`;
}

function fichaHTML(g, productos) {
  const agotado = g.stock === 0;
  const fotos = g.fotos.length ? g.fotos : [{ s: 'img/placeholder.svg', l: 'img/placeholder.svg' }];
  const slides = fotos.map((f, i) => `<figure class="galeria__foto">
            <img src="${BASE}${f.l}" srcset="${BASE}${f.s} 600w, ${BASE}${f.l} 1200w" sizes="(min-width: 900px) 55vw, 100vw"
                 alt="${escapeHTML(g.nombre)}${fotos.length > 1 ? `, foto ${i + 1} de ${fotos.length}` : ''}"
                 width="1200" height="1200" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
          </figure>`).join('\n          ');
  const minis = fotos.length > 1 ? `<div class="galeria__miniaturas">
          ${fotos.map((f, i) => `<button class="galeria__mini" type="button" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}">
            <img src="${BASE}${f.s}" alt="" width="64" height="64" loading="lazy">
          </button>`).join('\n          ')}
        </div>` : '';

  const estado = agotado
    ? '<p class="estado estado--agotada">Agotado por ahora</p>'
    : g.stock <= 2
      ? `<p class="estado estado--pocas">Últimas unidades (${plural(g.stock, 'disponible', 'disponibles')})</p>`
      : '<p class="estado">Disponible</p>';

  const whatsapp = escapeHTML(linkWhatsApp(g));
  const textoBoton = agotado ? 'Preguntar si vuelve' : 'Pedir por WhatsApp';
  const descripcion = g.descripcion
    ? `<div class="ficha__descripcion">${g.descripcion.split(/\n\s*\n|\n/).map(p => `<p>${escapeHTML(p)}</p>`).join('')}</div>`
    : '';

  const relacionadas = ordenar(productos.filter(o => o.id !== g.id && plano(o.categoria) === plano(g.categoria)), 'recomendado')
    .slice(0, 4);

  return `    <nav class="migas" aria-label="Ruta de navegación">
      <ol>
        <li><a href="${BASE}">Inicio</a></li>
        <li><a href="${BASE}?cat=${encodeURIComponent(plano(g.categoria))}">${escapeHTML(g.categoria)}</a></li>
        <li aria-current="page">${escapeHTML(g.nombre)}</li>
      </ol>
    </nav>

    <article class="ficha">
      <div class="galeria">
        <div class="galeria__pista" tabindex="0" aria-label="Fotos de ${escapeHTML(g.nombre)}">
          ${slides}
        </div>
        ${minis}
      </div>

      <div class="ficha__info">
        <div class="ficha__titulos">
          <p class="ficha__categoria">${escapeHTML(g.categoria)}</p>
          <h1 class="ficha__nombre">${escapeHTML(g.nombre)}</h1>
          <p class="ficha__precio">${textoPrecio(g.precio)}</p>
          ${estado}
        </div>
        ${promoFichaHTML(g)}
        ${datosHTML(g)}
        ${opcionesHTML('sabor', 'Sabor', g.sabores)}
        ${opcionesHTML('nicotina', 'Nicotina', g.nicotina)}
        <div class="pedido">
          <a class="btn" href="${whatsapp}" data-whatsapp>${ICONOS.chat}${textoBoton}</a>
          <p class="pedido__nota">Te confirmamos disponibilidad y envío por WhatsApp.</p>
        </div>
        ${descripcion}
      </div>
    </article>

    ${relacionadas.length ? `<section class="relacionadas" aria-labelledby="titulo-relacionadas">
      <h2 id="titulo-relacionadas" class="seccion__titulo">También te pueden gustar</h2>
      <div class="grilla">
        ${relacionadas.map(o => tarjetaHTML(o, BASE)).join('\n')}
      </div>
    </section>` : ''}

    <div class="barra-pedido">
      <span class="barra-pedido__precio">${textoPrecio(g.precio)}</span>
      <a class="btn" href="${whatsapp}" data-whatsapp>${ICONOS.chat}<span>${textoBoton}</span></a>
    </div>`;
}

function jsonLD(g) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: g.nombre,
    category: g.categoria,
    ...(g.marca && { brand: { '@type': 'Brand', name: g.marca } }),
    description: g.descripcion || `${g.categoria} ${g.nombre}`,
    image: g.fotos.map(f => absoluta(f.l)),
    url: absoluta(`productos/${g.id}/`),
    ...(g.precio != null && {
      offers: {
        '@type': 'Offer',
        price: g.precio,
        priceCurrency: CONFIG.MONEDA,
        availability: `https://schema.org/${g.stock > 0 ? 'InStock' : 'OutOfStock'}`,
        url: absoluta(`productos/${g.id}/`),
      },
    }),
  };
}

// ---------------------------------------------------------------- generación

async function generar(productos) {
  const tplIndex = await readFile(path.join(SRC, 'index.html'), 'utf8');
  const tplPagina = await readFile(path.join(SRC, 'pagina.html'), 'utf8');
  const ogDefecto = absoluta('img/og-default.jpg');
  const comunes = { base: BASE, marca: marcaHTML, pie: pieHTML() };
  const ordenadas = ordenar(productos, 'recomendado');

  // Catálogo
  await writeFile(path.join(SALIDA, 'index.html'), plantilla(tplIndex, {
    ...comunes,
    cabeza: cabezaHTML({
      titulo: `${CONFIG.TIENDA} · Vapes en Parral`,
      descripcion: `${CONFIG.LEMA}. Pide por WhatsApp.`,
      url: `${URL_SITIO}/`,
      imagen: ogDefecto,
    }),
    whatsapp: whatsappHTML,
    hero: heroHTML(productos),
    categorias: categoriasHTML(productos),
    promos: promosHTML(productos),
    destacados: destacadosHTML(productos),
    total: plural(productos.length, 'producto', 'productos'),
    grilla: ordenadas.map((g, i) => tarjetaHTML(g, BASE, { prioridad: i < 4 })).join('\n'),
  }));

  // Una página por producto
  for (const g of productos) {
    const dir = path.join(SALIDA, 'productos', g.id);
    await mkdir(dir, { recursive: true });
    const estado = g.stock === 0 ? ' (agotado)' : '';
    await writeFile(path.join(dir, 'index.html'), plantilla(tplPagina, {
      ...comunes,
      claseBody: 'pagina-producto',
      cabeza: cabezaHTML({
        titulo: `${g.nombre}${estado} · ${CONFIG.TIENDA}`,
        descripcion: `${textoPrecio(g.precio)} · ${g.categoria}${g.sabores.length ? ` · ${g.sabores.join(', ')}` : ''}. Pide por WhatsApp.`,
        url: absoluta(`productos/${g.id}/`),
        imagen: g.og ? absoluta(g.og) : ogDefecto,
        tipo: 'product',
        extra: `  <meta property="product:price:amount" content="${g.precio ?? ''}">
  <meta property="product:price:currency" content="${CONFIG.MONEDA}">
  <script type="application/ld+json">${jsonEnHTML(jsonLD(g))}</script>`,
      }),
      scripts: `  <script id="datos-producto" type="application/json">${jsonEnHTML({ id: g.id, nombre: g.nombre, stock: g.stock })}</script>
  <script type="module" src="${BASE}js/producto.js"></script>`,
      contenido: fichaHTML(g, productos),
    }));
  }

  // 404
  const destacadas = ordenar(productos.filter(g => g.destacado && g.stock > 0), 'recomendado').slice(0, 4);
  await writeFile(path.join(SALIDA, '404.html'), plantilla(tplPagina, {
    ...comunes,
    cabeza: cabezaHTML({
      titulo: `Página no encontrada · ${CONFIG.TIENDA}`,
      descripcion: CONFIG.LEMA,
      imagen: ogDefecto,
    }),
    contenido: `    <section class="no-encontrada">
      <h1>Este producto ya no está disponible</h1>
      <p>Puede que se haya agotado o que el enlace esté mal escrito.</p>
      <a class="btn" href="${BASE}">Ver el catálogo</a>
    </section>
    ${destacadas.length ? `<section class="relacionadas" aria-labelledby="titulo-destacadas">
      <h2 id="titulo-destacadas" class="seccion__titulo">Destacados</h2>
      <div class="grilla">${destacadas.map(g => tarjetaHTML(g, BASE)).join('\n')}</div>
    </section>` : ''}`,
  }));

  // Datos para los filtros del navegador
  await mkdir(path.join(SALIDA, 'data'), { recursive: true });
  await writeFile(path.join(SALIDA, 'data', 'catalogo.json'), JSON.stringify({
    actualizado: AHORA.toISOString(),
    productos: productos.map(({ og, ...g }) => g),
  }));

  // SEO
  const hoy = AHORA.toISOString().slice(0, 10);
  const urls = [`${URL_SITIO}/`, ...productos.map(g => absoluta(`productos/${g.id}/`))];
  await writeFile(path.join(SALIDA, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc><lastmod>${hoy}</lastmod></url>`).join('\n') + '\n</urlset>\n');
  await writeFile(path.join(SALIDA, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${URL_SITIO}/sitemap.xml\n`);
  await writeFile(path.join(SALIDA, '.nojekyll'), '');
}

async function copiarEstaticos() {
  for (const dir of ['css', 'js', 'img']) {
    await cp(path.join(SRC, dir), path.join(SALIDA, dir), { recursive: true });
  }
  const img = path.join(SRC, 'img');
  const salida = nombre => path.join(SALIDA, 'img', nombre);
  const logo = path.join(img, 'logo.jpg');
  // El logo es un círculo sobre fondo claro: se recorta en círculo para favicon y tarjeta de compartir.
  const circular = tam => sharp(logo).resize(tam, tam).composite([{
    input: Buffer.from(`<svg width="${tam}" height="${tam}"><circle cx="${tam / 2}" cy="${tam / 2}" r="${tam / 2}"/></svg>`),
    blend: 'dest-in',
  }]).png();
  await Promise.all([
    sharp(logo).resize(96, 96).webp({ quality: 82 }).toFile(salida('logo-96.webp')),
    sharp(logo).resize(320, 320).webp({ quality: 82 }).toFile(salida('logo-320.webp')),
    circular(64).toFile(salida('favicon.png')),
    sharp(logo).resize(180, 180).png().toFile(salida('apple-touch-icon.png')),
  ]);
  await sharp(path.join(img, 'og-default.svg'))
    .composite([{ input: await circular(440).toBuffer(), left: 700, top: 95 }])
    .jpeg({ quality: 85, mozjpeg: true }).toFile(salida('og-default.jpg'));
}

// ---------------------------------------------------------------- main

try {
  const filas = await leerFilas();
  const productos = normalizar(filas);
  if (!productos.length) {
    throw new Error('La hoja no tiene ningún producto visible. No se publica para no dejar el catálogo vacío.');
  }

  await rm(SALIDA, { recursive: true, force: true });
  await mkdir(SALIDA, { recursive: true });
  await copiarEstaticos();
  await prepararFotos(productos);
  await generar(productos);

  console.log(`\n✓ ${plural(productos.length, 'producto publicado', 'productos publicados')} en _site/`);
  if (avisos.length) {
    console.log(`\n⚠ ${plural(avisos.length, 'aviso', 'avisos')}:`);
    for (const a of avisos) console.log(`  - ${a}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await writeFile(process.env.GITHUB_STEP_SUMMARY,
        `## Avisos del catálogo\n\n${avisos.map(a => `- ${a}`).join('\n')}\n`, { flag: 'a' });
    }
  }
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
