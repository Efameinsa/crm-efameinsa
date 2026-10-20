-- Diagnóstico de la reunión del 20-10-2026 (prueba de usuario de postventa y finanzas). Solo lectura.
\echo '1 expedientes PV abiertos y vacíos'
select count(*) from oportunidades o
 where o.tipo_postventa is not null and o.etapa not in ('venta','rechazada','historico') and o.unida_a is null and o.cerrada_at is null
   and not exists (select 1 from actividades a where a.oportunidad_id=o.id)
   and not exists (select 1 from cotizaciones c where c.oportunidad_id=o.id)
   and not exists (select 1 from leads l where l.oportunidad_id=o.id)
   and not exists (select 1 from atenciones t where t.oportunidad_id=o.id)
   and not exists (select 1 from servicios_postventa s where s.oportunidad_id=o.id);
\echo '1b vacíos comerciales (sin tipo_postventa) abiertos tipo seguimiento sin lead'
select count(*) from oportunidades o
 where o.tipo_postventa is null and o.etapa not in ('venta','rechazada','historico') and o.unida_a is null and o.cerrada_at is null and o.lead_id is null
   and not exists (select 1 from actividades a where a.oportunidad_id=o.id)
   and not exists (select 1 from cotizaciones c where c.oportunidad_id=o.id)
   and not exists (select 1 from leads l where l.oportunidad_id=o.id);
\echo '2 expedientes PV abiertos sin gestion en 30 dias'
select count(*) from oportunidades o
 where o.tipo_postventa is not null and o.etapa not in ('venta','rechazada','historico') and o.unida_a is null and o.cerrada_at is null
   and coalesce((select max(realizada_at) from actividades a where a.oportunidad_id=o.id), o.created_at) < now()-interval '30 days';
\echo '3 pedidos sin oportunidad / cierres 2026 sin oportunidad'
select count(*) filter (where oportunidad_id is null), count(*) from servicios_postventa where not es_prueba;
select count(*) filter (where oportunidad_id is null), count(*) from informes_cierre where created_at >= '2026-01-01';
\echo '4 pedidos cerrados sin puesta en marcha (equipos)'
select count(*) from servicios_postventa s where not s.es_prueba and s.cerrado_at is not null and s.cerrado_at > '2026-09-01'
  and coalesce(s.tipo_pedido,'equipo') not in ('repuesto','accesorio','embalaje')
  and s.puesta_en_marcha is null and s.preinstalacion_ok_at is null
  and not exists (select 1 from informes_servicio i where i.servicio_id = s.id);
\echo '5 atenciones abiertas duplicadas (misma cuenta y tipo)'
select count(*) from (select cuenta_id, tipo from atenciones where cerrado_at is null and not es_prueba and cuenta_id is not null group by 1,2 having count(*)>1) x;
\echo '6 cuentas sin documento con venta, pedido o caso'
select count(*) from cuentas c where c.archivada_at is null and c.fusionada_en is null and (c.num_doc is null or c.num_doc in ('','SIN_DOC') or c.num_doc !~ '^\d{8}$|^\d{11}$')
  and (exists (select 1 from servicios_postventa s where s.cuenta_id=c.id) or exists (select 1 from atenciones t where t.cuenta_id=c.id) or exists (select 1 from informes_cierre i join oportunidades o on o.id=i.oportunidad_id where o.cuenta_id=c.id));
\echo '8 pedidos despachados sin fotos de carga / sin fotos de agencia (desde 01-09)'
select count(*) filter (where coalesce(jsonb_array_length(case when jsonb_typeof(salida_fotos)=$$array$$ then salida_fotos end),0)=0) sin_planta,
       count(*) filter (where entrega_modo ilike '%agencia%' and coalesce(jsonb_array_length(case when jsonb_typeof(agencia_fotos)=$$array$$ then agencia_fotos end),0)=0) sin_agencia, count(*) total
  from servicios_postventa where not es_prueba and despachado_at > '2026-09-01';
\echo '9 ordenes de facturar sin atender / cruzadas (factura antes de la orden)'
select count(*) filter (where orden_facturar_at is not null and orden_facturar_atendida_at is null) sin_atender,
       count(*) filter (where orden_facturar_at is not null and exists (select 1 from facturas_pedido f where f.servicio_id=s.id and f.created_at < s.orden_facturar_at)) cruzadas
  from servicios_postventa s where not es_prueba;
\echo '10 pedidos con 2+ facturas'
select count(*) from (select servicio_id from facturas_pedido where not es_prueba group by 1 having count(*)>1) x;
\echo '11 guia confirmada sin salida / salida sin guia confirmada (desde 01-09)'
select count(*) filter (where guia_confirmada_at is not null and despachado_at is null and cerrado_at is null) guia_sin_salida,
       count(*) filter (where despachado_at > '2026-09-01' and guia_confirmada_at is null and coalesce(regularizado,false)=false) salida_sin_guia
  from servicios_postventa where not es_prueba;
