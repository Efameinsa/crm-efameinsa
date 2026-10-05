-- GUÍA PARA LLEVAR REPUESTOS (Santos, 05-10): en un mantenimiento el técnico
-- lleva un manómetro para posible venta y solo había guía de traslado del
-- equipo o de materiales. Cuarta opción de la guía de la 0371.

alter table public.servicios_postventa
  drop constraint if exists servicios_postventa_apertura_guia_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_apertura_guia_check
  check (apertura_guia is null or apertura_guia in ('traslado', 'materiales', 'repuestos', 'ambas'));
