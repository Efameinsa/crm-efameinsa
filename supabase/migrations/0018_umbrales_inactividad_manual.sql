-- B11 pieza 3: alinear v_oportunidades_inactivas con los umbrales EXACTOS
-- del manual EF-CRMAGE-COM-2020 (docs/08-taxonomia-oficial-efameinsa.md):
--   - Prospecto (asignada/filtrada) sin respuesta 1 MES -> corresponde
--     rechazar (P2_No_Responde / P2_Esperar).
--   - Cotización (cotizada/seguimiento/potencial) sin respuesta 3 MESES
--     -> corresponde rechazar (C3_No_Responde / C3_Esperar).
--
-- La versión anterior (0001) usaba 2 meses para asignada/filtrada, una
-- aproximación de antes de tener el manual real.
--
-- Decisión de diseño (no técnica): el manual dice "mandar CAMBIAR su
-- estado a Rechazado" — es una instrucción para que una persona lo
-- revise, no un disparador automático. Esta vista solo señala el
-- candidato con un motivo legible; el rechazo lo sigue haciendo el
-- comercial con un clic, con motivo obligatorio (la regla no cambia).

drop view v_oportunidades_inactivas;

create view v_oportunidades_inactivas with (security_invoker = on) as
select o.*,
       ult.ultima_actividad_at,
       case when o.etapa in ('asignada', 'filtrada') then interval '1 month'
            else interval '3 months' end as umbral,
       case when o.etapa in ('asignada', 'filtrada')
              then '1 mes sin respuesta desde que se asignó'
            else '3 meses sin respuesta desde la cotización'
       end as motivo_inactividad
from oportunidades o
left join lateral (
  select max(a.realizada_at) as ultima_actividad_at
  from actividades a where a.oportunidad_id = o.id
) ult on true
where o.etapa not in ('venta', 'rechazada', 'derivada')
  and coalesce(ult.ultima_actividad_at, o.created_at)
      < now() - case when o.etapa in ('asignada', 'filtrada')
                     then interval '1 month' else interval '3 months' end;
