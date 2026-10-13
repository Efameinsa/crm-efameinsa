-- 0456 · Tipos de caso nuevos (reunión de postventa 13-10 11:20, tarea 4 del acta).
-- Ing. Carlos: «tenemos que tener un desplegable del tipo de caso… primero es
-- el título y después es el texto… problema técnico, servicio técnico, puesta
-- en marcha, refuerzo de capacitación… ¿y si hay un problema que no hemos
-- mapeado? Otro, para que ponga libre».
--
-- Los cinco tipos que ya había (0231, 0324) se quedan; se suman:
--   · revision_garantia  — Revisión por garantía
--   · capacitacion       — Refuerzo de capacitación
--   · otro               — Otro (con su texto en atenciones.tipo_detalle)
-- Y la apertura de servicio gana tres encabezados: SERVICIO TÉCNICO,
-- REVISIÓN POR GARANTÍA y REFUERZO DE CAPACITACIÓN.
--
-- Solo agrega valores y columnas: los valores nuevos del enum no se pueden usar
-- en la misma transacción, así que las funciones van en la 0457.

alter type public.tipo_atencion add value if not exists 'revision_garantia';
alter type public.tipo_atencion add value if not exists 'capacitacion';
alter type public.tipo_atencion add value if not exists 'otro';

alter table public.atenciones add column if not exists tipo_detalle text;
comment on column public.atenciones.tipo_detalle is
  'El texto del tipo «Otro» (0456, reunión 13-10): lo que el cliente pide cuando no es ninguno de los tipos de la lista. Sale como título del caso.';

alter table public.servicios_postventa
  drop constraint if exists servicios_postventa_apertura_tipo_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_apertura_tipo_check
  check (apertura_tipo is null or apertura_tipo in (
    'entrega', 'entrega_puesta_marcha', 'puesta_marcha', 'mantenimiento', 'entrega_garantia',
    'servicio_tecnico', 'revision_garantia', 'capacitacion'));

insert into _migraciones_aplicadas (archivo) values ('0456_tipos_de_caso_nuevos.sql')
on conflict do nothing;
