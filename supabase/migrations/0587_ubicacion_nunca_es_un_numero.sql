-- ============================================================
-- CRM EFAMEINSA · Migración 0587 · Una ubicación nunca es un número
-- ============================================================
-- Santos, 22-10-2026, mirando el PDF del resumen: en dos filas (I22818 RX350 e
-- I22900 UCT040) la columna DISPONIBLE decía «5505.4478944273» y
-- «7701.65551957416». Eran COSTOS: en el Excel de Importaciones esas dos filas
-- traían el costo corrido a la celda UBICACIÓN, y la carga se había leído antes
-- de la corrección del lector. El costo no entra al CRM por ninguna puerta.
--
-- 1. Lo guardado: en las cargas y en el almacén, una ubicación numérica se borra.
update stock_cargas c
   set filas = (
     select jsonb_agg(case when (f->>'ubicacion') ~ '^[0-9.,[:space:]-]+$' then f - 'ubicacion' || '{"ubicacion": null}'::jsonb else f end order by o)
       from jsonb_array_elements(c.filas) with ordinality as t(f, o))
 where exists (select 1 from jsonb_array_elements(c.filas) f where (f->>'ubicacion') ~ '^[0-9.,[:space:]-]+$');

update inventario_equipos set ubicacion = null where ubicacion ~ '^[0-9.,[:space:]-]+$';

-- 2. Y la base no vuelve a aceptar una: se limpia antes de guardar.
create or replace function inventario_ubicacion_limpia()
returns trigger language plpgsql as $fn$
begin
  if new.ubicacion is not null and (btrim(new.ubicacion) = '' or new.ubicacion ~ '^[0-9.,[:space:]-]+$' or new.ubicacion like '=%') then
    new.ubicacion := null;
  end if;
  return new;
end $fn$;

drop trigger if exists ab_ubicacion_limpia on inventario_equipos;
create trigger ab_ubicacion_limpia before insert or update of ubicacion on inventario_equipos
  for each row execute function inventario_ubicacion_limpia();
