/**
 * Menú "Catálogo" de la hoja de Google Sheets.
 * Copia de referencia: el código que se ejecuta vive en la hoja (Extensiones > Apps Script).
 *
 * Propiedades del script necesarias (Configuración del proyecto > Propiedades del script):
 *   GITHUB_TOKEN  token de grano fino de GitHub, solo para el repo, permiso "Actions: Read and write"
 *   GITHUB_REPO   usuario/repositorio, p. ej. smokeparral/vapes-catalogo
 */

const HOJA = 'Productos';
const WORKFLOW = 'publicar.yml';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Catálogo')
    .addItem('Publicar cambios', 'publicar')
    .addToUi();
}

function publicar() {
  const ui = SpreadsheetApp.getUi();
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA);
  if (!hoja) {
    ui.alert(`No encuentro la pestaña "${HOJA}".`);
    return;
  }

  const datos = hoja.getDataRange().getValues();
  const encabezados = datos[0].map(h => String(h).trim().toLowerCase());
  const col = nombre => encabezados.indexOf(nombre);
  const faltan = ['nombre', 'precio', 'fotos', 'id', 'alta'].filter(n => col(n) < 0);
  if (faltan.length) {
    ui.alert(`Faltan columnas en la fila 1: ${faltan.join(', ')}`);
    return;
  }

  const problemas = [];
  const usados = new Set(datos.slice(1).map(f => String(f[col('id')]).trim()).filter(Boolean));
  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    if (fila.every(v => v === '' || v === false)) continue;
    const nombre = String(fila[col('nombre')]).trim();
    if (!nombre) {
      problemas.push(`Fila ${i + 1}: falta el nombre`);
      continue;
    }
    if (String(fila[col('precio')]).trim() === '') problemas.push(`${nombre}: falta el precio`);
    if (!String(fila[col('fotos')]).trim()) problemas.push(`${nombre}: falta la foto`);

    if (!String(fila[col('id')]).trim()) {
      const id = slugUnico(nombre, usados);
      usados.add(id);
      hoja.getRange(i + 1, col('id') + 1).setNumberFormat('@').setValue(id);
      hoja.getRange(i + 1, col('alta') + 1).setNumberFormat('@').setValue(hoy);
    }
  }

  if (problemas.length) {
    const respuesta = ui.alert(
      'Hay detalles por revisar',
      `${problemas.join('\n')}\n\n¿Publicar de todos modos?`,
      ui.ButtonSet.YES_NO);
    if (respuesta !== ui.Button.YES) return;
  }

  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) {
    ui.alert('Falta configurar GITHUB_TOKEN o GITHUB_REPO en las propiedades del script.');
    return;
  }

  const res = UrlFetchApp.fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      payload: JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true,
    });

  const codigo = res.getResponseCode();
  if (codigo === 204) {
    SpreadsheetApp.getActive().toast('Los cambios estarán en línea en unos 2 minutos.', 'Publicando…', 8);
  } else if (codigo === 401) {
    ui.alert('No se pudo publicar: el token de GitHub venció o es incorrecto. Avisa a quien mantiene la web.');
  } else {
    ui.alert(`No se pudo publicar (error ${codigo}).\n\n${res.getContentText().slice(0, 300)}`);
  }
}

function slugUnico(nombre, usados) {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'producto';
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}
