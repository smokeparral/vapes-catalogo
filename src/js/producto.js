import { linkWhatsApp } from './comun.js';

const producto = JSON.parse(document.getElementById('datos-producto').textContent);
const botones = document.querySelectorAll('[data-whatsapp]');
const seleccion = { sabor: null, nicotina: null };

// Selectores de sabor y nicotina: actualizan el mensaje de WhatsApp.
for (const grupo of document.querySelectorAll('.opciones')) {
  const nombre = grupo.dataset.opcion;
  const valor = grupo.querySelector('[data-valor]');
  seleccion[nombre] = grupo.querySelector('input:checked')?.value ?? null;
  grupo.addEventListener('change', e => {
    seleccion[nombre] = e.target.value;
    valor.textContent = e.target.value;
    actualizarWhatsApp();
  });
}

function actualizarWhatsApp() {
  const href = linkWhatsApp(producto, seleccion);
  for (const b of botones) b.href = href;
}

// Galería: las miniaturas desplazan la pista y reflejan la foto visible.
const pista = document.querySelector('.galeria__pista');
const minis = [...document.querySelectorAll('.galeria__mini')];
if (pista && minis.length) {
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  minis.forEach((mini, i) => mini.addEventListener('click', () =>
    pista.scrollTo({ left: i * pista.clientWidth, behavior: reducido.matches ? 'auto' : 'smooth' })));

  let cuadro;
  pista.addEventListener('scroll', () => {
    cancelAnimationFrame(cuadro);
    cuadro = requestAnimationFrame(() => {
      const actual = Math.round(pista.scrollLeft / pista.clientWidth);
      minis.forEach((mini, i) => mini.setAttribute('aria-current', String(i === actual)));
    });
  }, { passive: true });
}
