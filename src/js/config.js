// Configuración de la tienda. Lo usan el navegador y scripts/build.mjs.

export const CONFIG = {
  TIENDA: 'Smoke Parral',
  LEMA: 'La mejor calidad a bajo precio',
  SITIO_URL: 'https://smokeparral.github.io/vapes-catalogo', // sin barra final

  // Hoja de Google Sheets. Vacío = se usan los datos de ejemplo de datos/ejemplo.json.
  SHEET_ID: '195q9PPwFk6Va4rXU1LzLDz8VKiMALRPdPmFtvHMbl88',
  SHEET_GID: '1476054134', // pestaña: el número después de "gid=" en la URL de la hoja

  MONEDA: 'CLP',
  LOCALE: 'es-CL',
  ZONA_HORARIA: 'America/Santiago',

  WHATSAPP: '56900000000', // PENDIENTE: 56 + 9 dígitos del celular, sin "+" ni espacios

  // Opcionales: vacío = no se muestran en el pie de página.
  INSTAGRAM: '', // solo el usuario, sin @
  CANAL: 'https://whatsapp.com/channel/0029VbD6bUr4tRromUrulA2z', // canal de WhatsApp
  HORARIO: '',
  ENVIOS: 'Entregas en Parral. Pedimos carnet al entregar.',

  POR_PAGINA: 24,
  DIAS_NUEVO: 30,
};

// Ley 21.642: venta solo a mayores de 18. Se muestra en el pie y en el aviso de edad.
export const ADVERTENCIA =
  'Los cigarrillos electrónicos con nicotina generan adicción y dañan tu salud. Venta exclusiva a mayores de 18 años.';
