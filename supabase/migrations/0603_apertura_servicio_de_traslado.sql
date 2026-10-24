-- 0603 · SERVICIO DE TRASLADO en la apertura del pedido (Santos 24-10).
--
-- «En la vista de postventa, donde dice "Datos que se coordinan — ¿Qué se va a
-- hacer?", agregar: Servicio de traslado». Un encabezado más de la fila 1: el
-- equipo se lleva de un lugar a otro (de planta al cliente, entre sedes o de
-- vuelta a planta).

alter table public.servicios_postventa
  drop constraint if exists servicios_postventa_apertura_tipo_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_apertura_tipo_check
  check (apertura_tipo is null or apertura_tipo in (
    'entrega', 'entrega_puesta_marcha', 'puesta_marcha', 'servicio_instalacion', 'traslado', 'mantenimiento',
    'entrega_garantia', 'servicio_tecnico', 'revision_garantia', 'capacitacion'));

insert into _migraciones_aplicadas (archivo) values ('0603_apertura_servicio_de_traslado.sql')
on conflict do nothing;
