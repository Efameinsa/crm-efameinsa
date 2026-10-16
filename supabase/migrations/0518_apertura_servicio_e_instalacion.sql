-- 0518 · SERVICIO E INSTALACIÓN en la apertura del pedido (buzón Rubí 16-10).
--
-- Rubí: «Quiero que tenga una opción adicional a marcar de SERVICIO E
-- INSTALACIÓN» en «¿Qué se va a hacer?». Es un encabezado más de la fila 1:
-- el técnico va a hacer el servicio y la instalación que se vendió.

alter table public.servicios_postventa
  drop constraint if exists servicios_postventa_apertura_tipo_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_apertura_tipo_check
  check (apertura_tipo is null or apertura_tipo in (
    'entrega', 'entrega_puesta_marcha', 'puesta_marcha', 'servicio_instalacion', 'mantenimiento',
    'entrega_garantia', 'servicio_tecnico', 'revision_garantia', 'capacitacion'));

insert into _migraciones_aplicadas (archivo) values ('0518_apertura_servicio_e_instalacion.sql')
on conflict do nothing;
