-- 0431 · El reporte del día de postventa, solo con lo propio y por rutas (buzón, Ariana 10-10).
--
-- Ariana (PV3) hace la regularización de los pedidos de equipos y los
-- seguimientos de mantenimiento y repuestos. Su reporte del día salía con lo
-- del área (despachos, visitas a planta) y los 312 pendientes del área, como si
-- fueran suyos, y sin lo que sí hizo en los pedidos. Rubí y Gabriela siguen con
-- el reporte que pidió el ing. Carlos (22-09 y 23-09, con lo del área aparte);
-- quien tenga esta marca recibe solo lo suyo, en dos cuadros: regularización de
-- equipos (ruta de pedidos) y mantenimiento y repuestos.

alter table public.perfiles
  add column if not exists reporte_solo_lo_propio boolean not null default false;

comment on column public.perfiles.reporte_solo_lo_propio is
  'Reporte del día de postventa sin lo del área y con las gestiones propias por ruta (pedidos / mantenimiento y repuestos). 0431.';

update public.perfiles set reporte_solo_lo_propio = true
 where id = 'a49ebb63-ed99-4b81-97fc-7c36881b725e'; -- Ariana Flores (Postventa), PV3
