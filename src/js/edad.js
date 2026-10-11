// Aviso de mayoría de edad (Ley 21.642). Se recuerda en este navegador.
import { ADVERTENCIA, CONFIG } from './config.js';
import { escapeHTML } from './comun.js';

const CLAVE = 'mayor-de-edad';

function confirmado() {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
}

if (!confirmado()) {
  const aviso = document.createElement('dialog');
  aviso.className = 'edad';
  aviso.setAttribute('aria-labelledby', 'edad-titulo');
  aviso.innerHTML = `
    <img class="edad__logo" src="${document.documentElement.dataset.base}img/logo-320.webp" alt="${escapeHTML(CONFIG.TIENDA)}" width="112" height="112">
    <h2 id="edad-titulo" class="edad__titulo">¿Tienes 18 años o más?</h2>
    <p class="edad__texto">${escapeHTML(ADVERTENCIA)}</p>
    <div class="edad__botones">
      <button class="btn" type="button" data-si>Sí, soy mayor de edad</button>
      <button class="btn btn--secundario" type="button" data-no>No</button>
    </div>`;
  document.body.append(aviso);
  aviso.addEventListener('cancel', e => e.preventDefault()); // Esc no lo cierra
  aviso.querySelector('[data-si]').addEventListener('click', () => {
    try { localStorage.setItem(CLAVE, '1'); } catch { /* modo privado: se volverá a preguntar */ }
    aviso.close();
    aviso.remove();
  });
  aviso.querySelector('[data-no]').addEventListener('click', () => {
    aviso.querySelector('.edad__titulo').textContent = 'Este catálogo es solo para mayores de 18 años';
    aviso.querySelector('.edad__botones').remove();
  });
  aviso.showModal();
}
