-- ============================================================
-- CRM EFAMEINSA · Migración 0205 · El logo y el panel también se suben
-- ============================================================
-- «Al subir este producto con el Word no carga completo la imagen»
-- (operaciones, 09-09, con la SECU75E3 de UNIMAC).
--
-- La hoja impresa de una cotización tiene TRES imágenes por equipo: el logo
-- del fabricante (27 × 14 mm), la foto del equipo (54 × 96) y la vista del
-- panel de control (35 × 32). Las tres vienen en el mismo Word de Lesly.
--
-- Las 122 fichas que cargó el pipeline las tienen: quedaron en el repositorio
-- como `public/productos/<sku>.png`, `<sku>-logo.png` y `<sku>-panel.png`, y
-- el PDF las lee de ahí por código. Pero un equipo cargado desde la pantalla
-- —arrastrando el Word— solo podía guardar UNA, la del equipo: `foto_path` era
-- la única columna, y el logo y el panel se leían nada más que del disco, que
-- en producción es de solo lectura. Resultado: el mismo equipo salía completo
-- si lo había cargado el pipeline y sin logo ni panel si lo cargó ella.
--
-- Se agregan las dos columnas que faltaban, con las mismas reglas que
-- `foto_path` (migración 0121): sin prefijo es un archivo del repositorio, con
-- «storage:» es una imagen subida. Vacías no rompen nada — el PDF sigue
-- buscando por código en el repositorio, que es de donde salen las 122.

alter table productos add column if not exists logo_path text;
alter table productos add column if not exists panel_path text;

comment on column productos.logo_path is
  'Logo del fabricante para la hoja impresa (caja 27 × 14 mm). Sin prefijo: archivo de public/productos/. Con «storage:»: subido desde la pantalla. Vacío: el PDF lo busca como <sku>-logo.png en el repositorio.';

comment on column productos.panel_path is
  'Vista del panel de control para la hoja impresa (caja 35 × 32 mm). Mismas reglas que logo_path.';
