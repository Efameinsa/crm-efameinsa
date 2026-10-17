-- Pruebas de la 0530 (carpeta de postventa por cliente). Corre dentro de una
-- transacción y la deshace: no deja nada. Uso en la VM:
--   docker exec supabase-db psql -U postgres -f /tmp/_probar-0530.sql
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on
begin;
\i /tmp/0530.sql

create temp table resultado (n serial, prueba text, ok boolean, detalle text);
create or replace function pg_temp.como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

\set CENTRAL '92b31f1a-09d4-4937-9cff-aa905694afe8'
\set PV1 '4d16b185-13d4-487c-b84c-4511e7ad3533'
\set PV2 'c8fa62c2-edd6-42c5-8190-1976c8995918'
\set PV3 'a49ebb63-ed99-4b81-97fc-7c36881b725e'
\set C1 'e03cde25-7d86-4e21-8abb-08c21a279ed4'

-- Cliente A: una sola carpeta abierta, de PV1.
select o.cuenta_id as cli_a, o.id as carpeta_a from oportunidades o join perfiles p on p.id = o.comercial_id
 where o.tipo_postventa = 'garantia' and o.comercial_id = :'PV1' and o.etapa in ('asignada','filtrada','cotizada','seguimiento','potencial')
   and (select count(*) from oportunidades x where x.cuenta_id = o.cuenta_id and x.tipo_postventa is not null and x.etapa in ('asignada','filtrada','cotizada','seguimiento','potencial')) = 1
 order by o.updated_at desc limit 1 \gset
-- Cliente B: sin nada de postventa.
select c.id as cli_b from cuentas c where not exists (select 1 from oportunidades o where o.cuenta_id = c.id and o.tipo_postventa is not null)
   and c.archivada_at is null and c.razon_social not ilike '%prueba%' order by c.created_at desc limit 1 \gset

-- T1 · Central deriva un REPUESTO a PV3 de un cliente con carpeta de PV1 (otro tipo).
select pg_temp.como(:'CENTRAL');
insert into leads (canal, cuenta_id, mensaje, nombre_contacto, area_destino) values ('llamada', :'cli_a', 'PRUEBA 0530 · quiere precio de un repuesto', 'Prueba', 'comercial') returning id as lead1 \gset
select asignar_lead(:'lead1', :'PV3', null, 'repuesto') as op1 \gset
insert into resultado (prueba, ok, detalle)
select 'T1 derivación de otro tipo entra a la carpeta (no abre otra)', :'op1' = :'carpeta_a',
       format('devolvió %s · carpeta %s', left(:'op1', 8), left(:'carpeta_a', 8));
insert into resultado (prueba, ok, detalle)
select 'T1b la carpeta pasa a quien recibe, tipo y acción de hoy', comercial_id = :'PV3' and tipo_postventa = 'repuesto' and proxima_accion_at = (now() at time zone 'America/Lima')::date,
       format('dueña %s · tipo %s · %s %s', (select codigo_comercial from perfiles where id = comercial_id), tipo_postventa, proxima_accion, proxima_accion_at)
  from oportunidades where id = :'carpeta_a';
insert into resultado (prueba, ok, detalle)
select 'T1c a la que la tenía le llega aviso', count(*) = 1, count(*) || ' aviso(s) a PV1'
  from notificaciones where user_id = :'PV1' and titulo like 'El caso de %' and created_at = now();

-- T2 · Central deriva una GARANTÍA (caso técnico) al mismo cliente: el caso nace dentro de la carpeta.
insert into leads (canal, cuenta_id, mensaje, nombre_contacto, area_destino) values ('llamada', :'cli_a', 'PRUEBA 0530 · la máquina no centrifuga', 'Prueba', 'comercial') returning id as lead2 \gset
select asignar_lead(:'lead2', :'PV2', null, 'garantia') as op2 \gset
insert into resultado (prueba, ok, detalle)
select 'T2 garantía: misma carpeta + caso técnico propio con su responsable', :'op2' = :'carpeta_a' and a.asignado_a = :'PV2' and a.oportunidad_id = :'carpeta_a',
       format('caso %s · etapa %s · responsable %s', a.tipo, a.etapa, (select codigo_comercial from perfiles where id = a.asignado_a))
  from atenciones a where a.lead_id = :'lead2';

-- T3 · Cliente sin carpeta: nace una, con su caso.
insert into leads (canal, cuenta_id, mensaje, nombre_contacto, area_destino) values ('llamada', :'cli_b', 'PRUEBA 0530 · equipo no enciende', 'Prueba', 'comercial') returning id as lead3 \gset
select asignar_lead(:'lead3', :'PV1', null, 'garantia') as op3 \gset
insert into resultado (prueba, ok, detalle)
select 'T3 cliente nuevo en postventa: nace su carpeta y su caso', o.comercial_id = :'PV1' and exists (select 1 from atenciones a where a.oportunidad_id = o.id),
       format('carpeta %s · %s caso(s)', left(o.id::text, 8), (select count(*) from atenciones a where a.oportunidad_id = o.id))
  from oportunidades o where o.id = :'op3';
-- y una segunda derivación a ese cliente ya no abre otra
insert into leads (canal, cuenta_id, mensaje, nombre_contacto, area_destino) values ('llamada', :'cli_b', 'PRUEBA 0530 · pide mantenimiento', 'Prueba', 'comercial') returning id as lead3b \gset
select asignar_lead(:'lead3b', :'PV1', null, 'mantenimiento') as op3b \gset
insert into resultado (prueba, ok, detalle)
select 'T3b segunda derivación (mantenimiento) va a la misma carpeta', :'op3b' = :'op3', format('%s = %s', left(:'op3b', 8), left(:'op3', 8));

-- T4 · Ayudar no quita la carpeta: PV1 anota una llamada en la carpeta de PV3.
select comercial_id as duena_t4 from oportunidades where id = :'carpeta_a' \gset
select pg_temp.como(:'PV1');
insert into actividades (oportunidad_id, tipo, nota, realizada_por) values (:'carpeta_a', 'llamada', 'PRUEBA 0530 · ayudo con una llamada', :'PV1');
insert into resultado (prueba, ok, detalle)
select 'T4 una gestión de una compañera NO cambia la responsable', comercial_id = :'duena_t4',
       'sigue con ' || (select codigo_comercial from perfiles where id = comercial_id)
  from oportunidades where id = :'carpeta_a';

-- T5 · Cotizar sí la pasa: PV2 arma una cotización.
select pg_temp.como(:'PV2');
insert into cotizaciones (oportunidad_id, serie, creada_por) values (:'carpeta_a', 'EFAMEINSA', :'PV2');
insert into resultado (prueba, ok, detalle)
select 'T5 quien cotiza se queda con la carpeta', comercial_id = :'PV2',
       'ahora ' || (select codigo_comercial from perfiles where id = comercial_id)
  from oportunidades where id = :'carpeta_a';

-- T6 · «Me quedo con esta carpeta» (PV3).
select pg_temp.como(:'PV3');
select pasar_expediente_a_companera(:'carpeta_a', :'PV3', 'Me quedo con esta carpeta') as x \gset
insert into resultado (prueba, ok, detalle)
select 'T6 «Me quedo con esta carpeta»', comercial_id = :'PV3', 'ahora ' || (select codigo_comercial from perfiles where id = comercial_id)
  from oportunidades where id = :'carpeta_a';

-- T7 · Unir dos expedientes repetidos de un cliente real, con cotización y caso tomado.
select o.cuenta_id as cli_d from oportunidades o
 where o.tipo_postventa is not null and o.etapa in ('asignada','filtrada','cotizada','seguimiento','potencial')
   and (select count(*) from oportunidades x where x.cuenta_id = o.cuenta_id and x.tipo_postventa is not null
          and x.etapa in ('asignada','filtrada','cotizada','seguimiento','potencial')
          and exists (select 1 from actividades a where a.oportunidad_id = x.id)) >= 2
   and exists (select 1 from cotizaciones c join oportunidades y on y.id = c.oportunidad_id where y.cuenta_id = o.cuenta_id and y.tipo_postventa is not null
               and y.etapa in ('asignada','filtrada','cotizada','seguimiento','potencial'))
 limit 1 \gset
select carpeta_postventa(:'cli_d') as hacia \gset
select o.id as desde from oportunidades o where o.cuenta_id = :'cli_d' and o.tipo_postventa is not null and o.etapa in ('asignada','filtrada','cotizada','seguimiento','potencial') and o.id <> :'hacia'
 order by (select count(*) from actividades a where a.oportunidad_id = o.id) + 10 * (select count(*) from cotizaciones c where c.oportunidad_id = o.id) desc limit 1 \gset
select (select count(*) from cotizaciones where oportunidad_id in (:'desde', :'hacia')) as cots_antes,
       (select count(*) from actividades where oportunidad_id in (:'desde', :'hacia')) as acts_antes,
       (select count(*) from atenciones where oportunidad_id in (:'desde', :'hacia') and tomada_at is null) as sin_tomar_antes \gset
select unir_expedientes(:'desde', :'hacia', 'PRUEBA 0530 · mismo cliente, una sola carpeta') as union_txt \gset
insert into resultado (prueba, ok, detalle)
select 'T7 unir: todo pasa a la carpeta, la otra queda en histórico',
       (select count(*) from cotizaciones where oportunidad_id = :'hacia') = :cots_antes
       and (select count(*) from actividades where oportunidad_id = :'hacia') = :acts_antes + 1
       and (select etapa from oportunidades where id = :'desde') = 'historico',
       :'union_txt';
insert into resultado (prueba, ok, detalle)
select 'T7b unir no marca como tomados los casos que nadie tomó', count(*) = :sin_tomar_antes, count(*) || ' sin tomar (antes ' || :sin_tomar_antes || ')'
  from atenciones where oportunidad_id = :'hacia' and tomada_at is null;

-- T8 · Lo que no se puede unir.
do $$
declare ok1 boolean := false; ok2 boolean := false; a uuid; b uuid; c uuid;
begin
  select o.id into a from oportunidades o where o.tipo_postventa is not null and o.etapa = 'asignada' limit 1;
  select o.id into b from oportunidades o join oportunidades x on x.cuenta_id <> o.cuenta_id and x.id = a where o.tipo_postventa is not null and o.etapa = 'asignada' limit 1;
  select o.id into c from oportunidades o where o.tipo_postventa is null and o.etapa = 'seguimiento'
     and o.cuenta_id = (select cuenta_id from oportunidades where id = a) limit 1;
  begin perform unir_expedientes(a, b, 'PRUEBA clientes distintos'); exception when others then ok1 := sqlerrm like 'Son de fichas distintas%'; end;
  if c is null then ok2 := true; else
    begin perform unir_expedientes(c, a, 'PRUEBA comercial con postventa'); exception when others then ok2 := sqlerrm like 'Un expediente comercial%'; end;
  end if;
  insert into resultado (prueba, ok, detalle) values ('T8 no une clientes distintos ni comercial con postventa', ok1 and ok2, format('distintos=%s comercial=%s', ok1, ok2));
end $$;

-- T9 · «Hoy cubro a…»: PV2 cubre a PV1 y recibe copia de sus avisos.
select pg_temp.como(:'PV2');
select cubrir_a(:'PV1', null) as cob \gset
insert into notificaciones (user_id, tipo, titulo, cuerpo, url) values (:'PV1', 'otro', 'PRUEBA 0530 aviso para Rubí', 'x', '/postventa');
insert into resultado (prueba, ok, detalle)
select 'T9 quien cubre recibe copia de los avisos de la ausente', count(*) = 1, coalesce(max(titulo), 'sin copia')
  from notificaciones where user_id = :'PV2' and titulo like 'Cubriendo a %PRUEBA 0530%';

-- T10 · Tablero «Del área»: PV1 ve la carpeta de PV3 solo con p_area.
select pg_temp.como(:'PV1');
insert into resultado (prueba, ok, detalle)
select 'T10 «Del área» muestra carpetas de las compañeras; «Mías» no',
       (select count(*) from jsonb_array_elements(listar_oportunidades(p_q => null, p_area => true, p_limite => 5000) -> 'filas') f where f ->> 'id' = :'carpeta_a') = 1
       and (select count(*) from jsonb_array_elements(listar_oportunidades(p_q => null, p_limite => 5000) -> 'filas') f where f ->> 'id' = :'carpeta_a') = 0,
       'ok';

-- T11 · Autoderivado de postventa al cliente con carpeta: entra a la carpeta.
select pg_temp.como(:'PV1');
select registrar_caso_autoderivado(:'cli_a', 'problema_tecnico', 'PRUEBA 0530 · llamó al área', null, null, null, '[]'::jsonb, null) as r11 \gset
insert into resultado (prueba, ok, detalle)
select 'T11 el caso que registra postventa entra a la carpeta', (:'r11'::jsonb ->> 'oportunidad') = :'carpeta_a', coalesce(left(:'r11'::jsonb ->> 'oportunidad', 8), :'r11');

-- T12 · El comercial no cambia: derivación comercial a C1 no toca la carpeta.
select pg_temp.como(:'CENTRAL');
insert into leads (canal, cuenta_id, mensaje, nombre_contacto, area_destino) values ('llamada', :'cli_a', 'PRUEBA 0530 · quiere comprar una secadora', 'Prueba', 'comercial') returning id as lead12 \gset
select asignar_lead(:'lead12', :'C1', null, null) as op12 \gset
insert into resultado (prueba, ok, detalle)
select 'T12 una venta nueva sigue yendo al comercial, aparte', :'op12' <> :'carpeta_a' and (select tipo_postventa from oportunidades where id = :'op12') is null,
       'expediente comercial ' || left(:'op12', 8);

\pset tuples_only off
\pset format aligned
select n, case when ok then 'OK' else 'FALLA' end as r, prueba, detalle from resultado order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas OK' as total from resultado;
rollback;
