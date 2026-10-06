-- SOLO PUESTA EN MARCHA (Rubí, 05-10): «no hay opción de puesta en marcha
-- solo (…) el técnico irá sin equipo». El equipo ya está con el cliente
-- —llegó por agencia o lo recogió— y el técnico va únicamente a instalarlo.
-- Cuarto formato de la apertura de servicio, junto a los tres de la 0175.

alter table public.servicios_postventa
  drop constraint if exists servicios_postventa_apertura_tipo_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_apertura_tipo_check
  check (apertura_tipo is null or apertura_tipo in ('entrega', 'entrega_puesta_marcha', 'puesta_marcha', 'mantenimiento'));

comment on column public.servicios_postventa.apertura_tipo is
  'Formato de la apertura de servicio: entrega (va a la agencia), entrega_puesta_marcha (el técnico lo lleva e instala), puesta_marcha (el equipo ya está con el cliente; el técnico va sin equipo, Rubí 05-10) o mantenimiento.';
