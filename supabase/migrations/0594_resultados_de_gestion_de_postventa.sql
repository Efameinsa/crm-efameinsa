-- 0594 · Resultados de gestión propios de postventa (Brenda, 23-10)
--
-- Brenda (PV2) mandó la captura del formulario «Registrar gestión» con la lista
-- «¿En qué quedó?» y pidió: «aquí agrega una pestaña atendido y pestaña
-- (llamada derivada) pestaña (informe enviado)». La lista era la del comercial
-- (pidió cotización, evaluando, quiere comprar, cobranza…) y a postventa le
-- faltaban los tres resultados de todos los días. Van marcados «solo
-- postventa», como los motivos de rechazo (0305): el comercial no los ve.

alter table catalogo_resultados_gestion
  add column if not exists solo_postventa boolean not null default false;

comment on column catalogo_resultados_gestion.solo_postventa is
  'Solo se ofrece en gestiones de postventa (carpeta con tipo_postventa). 0594.';

insert into catalogo_resultados_gestion (codigo, nombre, activo, accion_sugerida, dias_sugeridos, efecto, orden, solo_postventa)
values
  ('ATENDIDO',          'Atendido',                     true, 'Confirmar que quedó conforme',   2, null, 52, true),
  ('LLAMADA_DERIVADA',  'Llamada derivada al almacén',  true, 'Revisar el informe del almacén', 1, null, 54, true),
  ('INFORME_ENVIADO',   'Informe enviado al cliente',   true, 'Confirmar que lo recibió',       2, null, 56, true)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      activo = true,
      accion_sugerida = excluded.accion_sugerida,
      dias_sugeridos = excluded.dias_sugeridos,
      orden = excluded.orden,
      solo_postventa = true;
