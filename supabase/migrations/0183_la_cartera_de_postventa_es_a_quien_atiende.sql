-- La cartera de postventa es a quién atiende, no a quién le pertenece.
--
-- QUÉ PASABA. «Mi cartera» le mostraba a Post Venta 70 clientes y el área
-- decía que eran muchos más. Tenían razón: postventa ha trabajado con 480
-- clientes distintos (418 mantenimientos, 394 repuestos y 28 garantías, más el
-- parque instalado), pero la pantalla listaba solo las cuentas cuyo DUEÑO de
-- cartera es el usuario PV. Los otros 410 viven en la cartera del comercial
-- que los vendió — C5 166, C4 142, C1 67 — y por eso no aparecían.
--
-- Y eso no fue un error de la carga de los 605 informes de `R:\`: fue una
-- decisión de Santos del 28-08 («la cuenta NO cambia de dueño; solo se crean
-- las que faltan»), y es la decisión correcta. Mover 480 clientes a postventa
-- le vaciaría la cartera a Katerine, Ariana y Brenda, y les rompería las
-- métricas.
--
-- Lo que estaba mal era la PREGUNTA que hacía la pantalla. Postventa no tiene
-- cartera propia en el sentido comercial: atiende el parque, sea de quien sea
-- el cliente. Así que para un usuario de postventa «mi cartera» pasa a ser
-- «los clientes que atiendo»: los que tienen trabajo de postventa, equipo
-- instalado o un servicio registrado.
--
-- NO SE ABRE NADA QUE NO ESTUVIERA ABIERTO. La política `cuentas_postventa_
-- select` ya le da a un usuario de postventa real lectura sobre cualquier
-- cuenta que no sea de práctica. Lo único que hacía falta era que la lista
-- dejara de esconderle lo que ya podía ver: hasta hoy la pantalla mentía por
-- omisión.
--
-- Para gerencia y Central no cambia nada: la rama nueva solo se enciende
-- cuando quien pregunta es postventa. Si gerencia filtra por PV sigue viendo
-- la cartera de PV (los 70), que es lo correcto cuando lo que se mira es la
-- propiedad de la cuenta.
--
-- Se parcha la definición VIVA con reemplazos verificados, no se copia el
-- cuerpo: copiar estas funciones ya revivió reglas revertidas tres veces.

create or replace function public._parche_0183(p_buscar text, p_poner text)
returns void language plpgsql as $function$
declare
  v_def   text;
  v_veces integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'listar_clientes';

  if v_def is null then
    raise exception 'no existe listar_clientes';
  end if;

  if position(p_poner in v_def) > 0 then
    raise notice 'listar_clientes ya estaba parchada con este trozo';
    return;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, p_buscar, ''))) / length(p_buscar);
  if v_veces <> 1 then
    raise exception 'el trozo a reemplazar aparece % veces, se esperaba 1: %', v_veces, left(p_buscar, 60);
  end if;

  execute replace(v_def, p_buscar, p_poner);
end $function$;

-- 1. La bandera. Nace en falso: si quien pregunta no es postventa, nada cambia.
select public._parche_0183(
  '  v_total bigint;',
  '  v_total bigint;' || chr(10) || '  v_postventa boolean := false;'
);

-- 2. Se enciende solo dentro de la rama del comercial, junto al filtro que ya
--    existía. Backoffice y Central ni la tocan.
select public._parche_0183(
  '    p_comercial := auth.uid();',
  '    p_comercial := auth.uid();' || chr(10) || '    v_postventa := es_postventa();'
);

-- 3. Y la cartera de postventa deja de ser «lo que me pertenece» para ser
--    «lo que atiendo». Las tres consultas van por índice (ix_oportunidades_
--    cuenta, ix_equipos_cuenta, ix_servicios_pv_cuenta).
select public._parche_0183(
  '    where (p_comercial is null or c.comercial_id = p_comercial)',
  '    where (' || chr(10) ||
  '        p_comercial is null' || chr(10) ||
  '        or c.comercial_id = p_comercial' || chr(10) ||
  '        or (v_postventa and (' || chr(10) ||
  '             exists (select 1 from oportunidades o2' || chr(10) ||
  '                      where o2.cuenta_id = c.id and o2.tipo_postventa is not null)' || chr(10) ||
  '          or exists (select 1 from equipos_instalados e2 where e2.cuenta_id = c.id)' || chr(10) ||
  '          or exists (select 1 from servicios_postventa s2 where s2.cuenta_id = c.id)' || chr(10) ||
  '        ))' || chr(10) ||
  '      )'
);

drop function public._parche_0183(text, text);
