-- B11: la intención de compra pasa de 3 niveles genéricos a los 5 niveles
-- con criterio de comportamiento que usa el manual EF-CRMAGE-COM-2020 de
-- Efameinsa (docs/08-taxonomia-oficial-efameinsa.md). Colapsar "está
-- buscando financiamiento" y "está buscando ubicación" en un mismo "media"
-- perdía información comercial real que el vendedor sí distingue.
--
-- Postgres no permite reordenar/quitar valores de un enum in-place: se crea
-- el tipo nuevo, se convierte la columna con un CASE, y se renombra.
--
-- Mapeo conservador de lo ya cargado: 'alta' -> 'medio_alto', NO
-- 'alto_potencial' -- ese nivel significa "ya espera la OC o el depósito",
-- un hecho concreto que no se puede afirmar de datos viejos sin esa
-- confirmación explícita.

create type intencion_compra_v2 as enum
  ('alto_potencial', 'medio_alto', 'medio', 'medio_bajo', 'bajo', 'sin_definir');

-- v_oportunidades_inactivas hace "select o.*" -> depende de TODAS las
-- columnas de oportunidades, hay que soltarla antes del ALTER y recrearla
-- igual (sin cambios funcionales; la extensión de esta vista es B11 pieza 3,
-- migración aparte).
drop view v_oportunidades_inactivas;

alter table oportunidades alter column intencion drop default;

alter table oportunidades alter column intencion type intencion_compra_v2
  using (case intencion::text
    when 'alta'  then 'medio_alto'
    when 'media' then 'medio'
    when 'baja'  then 'bajo'
    else 'sin_definir'
  end)::intencion_compra_v2;  -- el cast va acá, no adentro del case

alter table oportunidades alter column intencion set default 'sin_definir';

drop type intencion_compra;
alter type intencion_compra_v2 rename to intencion_compra;

-- Recreación idéntica a la de 0001_esquema_inicial.sql.
create view v_oportunidades_inactivas with (security_invoker = on) as
select o.*,
       ult.ultima_actividad_at,
       case when o.etapa in ('asignada','filtrada') then interval '2 months'
            else interval '3 months' end as umbral
from oportunidades o
left join lateral (
  select max(a.realizada_at) as ultima_actividad_at
  from actividades a where a.oportunidad_id = o.id
) ult on true
where o.etapa not in ('venta','rechazada','derivada')
  and coalesce(ult.ultima_actividad_at, o.created_at)
      < now() - case when o.etapa in ('asignada','filtrada')
                     then interval '2 months' else interval '3 months' end;
