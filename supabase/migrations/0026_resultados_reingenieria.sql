-- ============================================================
-- CRM EFAMEINSA · Migración 0026 · Reingeniería de resultados de gestión
-- ============================================================
-- Decisión de Darwin + gerencia (19-08): la taxonomía anterior venía del
-- Excel viejo (Esperar/Por confirmar/Cotizado…) y para un comercial nuevo
-- "¿en qué quedó?" y "próxima acción" se sentían como dos trámites
-- redundantes. Reingeniería: cada resultado se expresa en lenguaje del
-- comercial y ARRASTRA la próxima acción (texto + días sugeridos,
-- siempre editables) o dispara un flujo (cotizar / venta / rechazo).
-- Los códigos viejos se desactivan, no se borran: 1 actividad histórica
-- referencia POR_CONFIRMAR y el historial no se toca.

alter table catalogo_resultados_gestion add column if not exists accion_sugerida text;
alter table catalogo_resultados_gestion add column if not exists dias_sugeridos integer;
alter table catalogo_resultados_gestion add column if not exists efecto text
  check (efecto in ('cotizar', 'venta', 'rechazo'));

update catalogo_resultados_gestion set activo = false
  where codigo in ('ESPERAR', 'POR_CONFIRMAR', 'COTIZADO', 'FUTURO', 'VENTA');

-- SIN_INTERES ya existía (codigo unique): se reescribe en sitio.
update catalogo_resultados_gestion
  set nombre = 'Sin interés / no procede', efecto = 'rechazo', accion_sugerida = null, dias_sugeridos = null, activo = true
  where codigo = 'SIN_INTERES';

insert into catalogo_resultados_gestion (codigo, nombre, accion_sugerida, dias_sugeridos, efecto) values
  ('NO_CONTESTO',      'No contestó',              'Volver a intentar contacto',        1,  null),
  ('QUEDO_RESPONDER',  'Quedó en responder',       'Confirmar su respuesta',            2,  null),
  ('PIDIO_COTIZACION', 'Pidió cotización',         'Enviar la cotización',              1,  'cotizar'),
  ('EVALUANDO_COTIZ',  'Evaluando la cotización',  'Hacer seguimiento a la cotización', 3,  null),
  ('QUIERE_COMPRAR',   'Quiere comprar',           'Coordinar el cierre y el pago',     1,  'venta'),
  ('COMPRA_FUTURO',    'Compra a futuro',          'Retomar el contacto',               30, null)
on conflict (codigo) do update
  set nombre = excluded.nombre, accion_sugerida = excluded.accion_sugerida,
      dias_sugeridos = excluded.dias_sugeridos, efecto = excluded.efecto, activo = true;
