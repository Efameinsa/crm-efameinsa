-- 0437 · El reporte de postventa, solo con lo propio, también para Gabriela (buzón 12-10).
--
-- Gabriela (PV2) y gerencia: «sus actividades complementarias se cruzan con
-- los de Rubí… exclusivamente de ella, sus pendientes de ella, no de Rubí».
-- La marca de la 0431 (sin lo del área) le sirve tal cual, pero esa marca
-- también cambiaba la tabla de seguimientos por los dos cuadros por ruta, que
-- son del trabajo de Ariana. Se separan: `reporte_por_rutas` queda solo para
-- Ariana y Gabriela recibe solo lo suyo con su tabla de seguimientos.

alter table public.perfiles
  add column if not exists reporte_por_rutas boolean not null default false;

comment on column public.perfiles.reporte_por_rutas is
  'Con reporte_solo_lo_propio: las gestiones del día en dos cuadros por ruta (pedidos / mantenimiento y repuestos) en lugar de la tabla de seguimientos. 0437.';

update public.perfiles set reporte_por_rutas = true where reporte_solo_lo_propio; -- Ariana (PV3)

update public.perfiles set reporte_solo_lo_propio = true
 where id = 'c8fa62c2-edd6-42c5-8190-1976c8995918'; -- Gabriela Palacios, PV2
