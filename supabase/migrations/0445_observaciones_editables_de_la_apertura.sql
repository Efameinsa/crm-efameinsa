-- OBSERVACIONES EDITABLES EN LAS FILAS DE LA APERTURA (Rubí, 12-10): «añadir
-- opción para editar en "observación de cliente"» (captura: fila 6 PERSONA QUE
-- RECIBE con la columna de observaciones vacía). Las filas CLIENTE, PRIMER
-- DESTINO, PROGRAMACIÓN, PERSONA QUE RECIBE, PERSONAL ASIGNADO y MEDIO DE
-- TRANSPORTE salían siempre con observaciones vacías.
--   {"2": "texto", "6": "texto"} — clave = número de fila; null = ninguna.
alter table public.servicios_postventa
  add column if not exists apertura_obs_filas jsonb;

comment on column public.servicios_postventa.apertura_obs_filas is
  'Observaciones escritas por postventa en las filas de la apertura, por número de fila ({"6": "…"}); van en la columna OBSERVACIONES de la hoja, el PDF y el correo (0445).';
