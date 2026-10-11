// Sirve _site/ en local bajo la misma ruta que en GitHub Pages.
// Uso: npm run serve  ->  http://localhost:8080/vapes-catalogo/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/js/config.js';

const SALIDA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '_site');
const BASE = new URL(`${CONFIG.SITIO_URL.replace(/\/$/, '')}/`).pathname;
const PUERTO = Number(process.env.PORT) || 8080;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain',
};

async function archivo(ruta) {
  try {
    const s = await stat(ruta);
    return s.isDirectory() ? archivo(path.join(ruta, 'index.html')) : ruta;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (!pathname.startsWith(BASE)) {
    res.writeHead(302, { Location: BASE }).end();
    return;
  }
  if (pathname === BASE.slice(0, -1)) {
    res.writeHead(301, { Location: BASE }).end();
    return;
  }
  const relativa = decodeURIComponent(pathname.slice(BASE.length));
  const destino = path.join(SALIDA, path.normalize(relativa));
  const encontrado = destino.startsWith(SALIDA) && await archivo(destino);
  const ruta = encontrado || path.join(SALIDA, '404.html');
  res.writeHead(encontrado ? 200 : 404, { 'Content-Type': TIPOS[path.extname(ruta)] ?? 'application/octet-stream' });
  res.end(await readFile(ruta));
}).listen(PUERTO, () => console.log(`Sirviendo en http://localhost:${PUERTO}${BASE}`));
