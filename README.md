# Catálogo de Smoke Parral

Catálogo web alojado en GitHub Pages. Los productos se administran desde Google Sheets
y las fotos desde Google Drive; no hace falta tocar este repositorio para agregar,
cambiar o quitar productos.

**Sitio:** https://smokeparral.github.io/vapes-catalogo/

Al entrar, la web pregunta si la persona es mayor de 18 años (se recuerda en ese navegador)
y el pie de página muestra la advertencia sanitaria. Ley 21.642: venta solo a mayores de 18.

---

## Guía para administrar el catálogo

Todo se hace desde la hoja de Google Sheets (también funciona en la app del celular).

### Agregar un producto
1. Sube las fotos a la carpeta **Fotos catálogo** de Google Drive.
2. En la hoja, llena una fila nueva: `nombre`, `categoria`, `marca`, `precio`, `stock`, `sabores`, `nicotina`, `caladas`.
3. En `fotos`, pega el link de cada foto (en Drive: ⋮ > Compartir > Copiar vínculo).
   Separa varios links con coma o un salto de línea (Alt + Enter). El primero es la foto principal.
4. Menú **Catálogo > Publicar cambios**. En unos 2 minutos está en línea.

### Cambiar precio, stock o cualquier dato
Edita la celda y usa **Catálogo > Publicar cambios**.
Si se te olvida publicar, la web se actualiza sola en menos de una hora.

### Marcar como agotado
Pon `stock` en `0` y publica. Sigue visible con la etiqueta "Agotado" y los clientes pueden preguntar si vuelve.

### Poner o quitar una promo
Escribe en `promo` la cantidad y el precio total, por ejemplo `2x22000` (2 por $22.000), y publica.
La web le pone el sello de promo, lo muestra en la sección "Promos" y calcula cuánto se ahorra.
Para quitarla, borra la celda y publica. Si la promo no es más barata que comprar por separado,
aparece un aviso en la pestaña **Actions**.

### Ocultar un producto temporalmente
Desmarca `visible` y publica. Vuelve a marcarla cuando regrese.

### Eliminar un producto
Borra la fila y publica.

### Cambiar fotos
Reemplaza los links en `fotos` y publica. Para cambiar el orden, cambia el orden de los links.
Si quieres cambiar una foto, sube una nueva a Drive y pega su link (no reemplaces el archivo existente).

### Columnas

| Columna | Qué poner |
|---|---|
| `nombre` | Nombre del producto (obligatorio) |
| `categoria` | Desechable, Pod recargable, Líquido, Accesorio… |
| `marca` | Opcional. Aparece como filtro |
| `precio` | Solo el número: `12990` o `12.990` |
| `stock` | Unidades disponibles. `0` = agotado |
| `sabores` | Separados por coma: `Sandía Hielo, Mango, Uva`. Vacío si no aplica |
| `nicotina` | `20 mg` o `Sin nicotina, 3 mg, 6 mg`. Vacío si no aplica |
| `caladas` | Solo el número: `6000`. Vacío si no aplica |
| `promo` | Opcional. `2x22000` o `3 por 25.000` (cantidad x precio total de la promo), o un texto libre como `Pod de regalo`. Vacío = sin promo |
| `fotos` | Links de Google Drive |
| `descripcion` | Opcional |
| `destacado` | Casilla: aparece en "Destacados" |
| `visible` | Casilla: desmarcada = oculto |
| `id` | **No tocar.** Se llena solo al publicar y no cambia aunque cambies el nombre |
| `alta` | **No tocar.** Fecha de alta; se usa para "Nuevo" y "Más recientes" |

Si un sabor necesita su propio stock, pon una fila por sabor ("Nimbo 6000 Mango", "Nimbo 6000 Uva").

> ⚠️ Cualquiera con el link puede ver **todas las pestañas** de la hoja.
> No guardes costos, proveedores ni datos de clientes en ese archivo.

---

## Configuración inicial (una sola vez)

### 1. La hoja
1. Crea una hoja de Google Sheets e importa `datos/plantilla-hoja.csv`
   (Archivo > Importar > Subir > Reemplazar hoja actual). Renombra la pestaña a **Productos**.
2. Selecciona las columnas `destacado` y `visible` > Insertar > Casilla de verificación.
3. Formatea `nicotina`, `id` y `alta` como **Formato > Número > Texto sin formato**.
4. Compartir > Acceso general > **Cualquier persona con el enlace** > Lector.
5. Copia el ID de la URL (`docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>`) y ponlo en
   `SHEET_ID` (y `SHEET_GID` si no es `0`) en `src/js/config.js`.

Mientras `SHEET_ID` esté vacío, la web usa los datos de ejemplo de `datos/ejemplo.json`.

### 2. La carpeta de fotos
Crea la carpeta **Fotos catálogo** en Google Drive y compártela como
**Cualquier persona con el enlace** > Lector. Todo lo que subas adentro hereda ese permiso.

### 3. El botón "Publicar"
1. En la hoja: Extensiones > Apps Script. Pega el contenido de `apps-script/Codigo.gs` y guarda.
2. En GitHub: Settings > Developer settings > Fine-grained tokens > Generate new token.
   Repositorio: solo `vapes-catalogo`. Permiso: **Actions: Read and write**.
3. En Apps Script: Configuración del proyecto > Propiedades del script:
   - `GITHUB_TOKEN`: el token
   - `GITHUB_REPO`: `smokeparral/vapes-catalogo`
4. Recarga la hoja; aparece el menú **Catálogo**. La primera vez pide autorización.

El token vence (GitHub avisa por correo). Si el botón dice que el token venció, genera uno nuevo
y reemplázalo en las propiedades del script.

---

## Desarrollo

```bash
npm install
npm run dev                # genera _site/ y lo sirve en http://localhost:8080/vapes-catalogo/
DATOS=peor npm run dev     # lo mismo con datos extremos (datos/peor-caso.json) para probar el diseño
```

| Ruta | Qué es |
|---|---|
| `src/` | HTML, CSS, JS e imágenes de la web |
| `src/js/config.js` | Nombre de la tienda, WhatsApp, hoja, advertencia sanitaria |
| `src/js/edad.js` | Aviso de mayoría de edad |
| `scripts/build.mjs` | Lee la hoja, descarga y optimiza fotos, genera `_site/` |
| `apps-script/Codigo.gs` | Copia del script del menú "Catálogo" |
| `datos/` | Datos de ejemplo y plantilla de la hoja |
| `.github/workflows/publicar.yml` | Publica en GitHub Pages: al pulsar "Publicar", con cada push y cada hora |

Si el build no puede leer la hoja o la hoja no tiene productos visibles, falla y la versión anterior
sigue en línea. Los avisos (fotos que no se pudieron descargar, filas sin precio…) aparecen en el
resumen de cada ejecución en la pestaña **Actions**.

Si cambias el nombre o el logo de la tienda, actualiza `src/img/logo.jpg` y el texto de `src/img/og-default.svg`
(la imagen que aparece al compartir el link del catálogo).
