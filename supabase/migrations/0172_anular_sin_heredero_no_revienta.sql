-- ============================================================
-- CRM EFAMEINSA · Migración 0172 · Anular un cierre sin heredero no revienta
-- ============================================================
-- Reportado por Lesly el 04-09 por la tarde, intentando anular el cierre
-- 011-2026 de Sierra Travel: puso su código y el sistema respondió
--
--   record "v_heredero" is not assigned yet
--
-- QUÉ PASABA. La 0162 agregó una idea buena: si al anular un cierre duplicado
-- existe OTRO cierre del mismo cliente esperando esa venta, la venta pasa a
-- ese informe en vez de anularse. Para eso declaró `v_heredero record` y lo
-- llenó solo cuando encontraba exactamente un candidato.
--
-- Pero un `record` de PL/pgSQL sin asignar no es nulo: es nada. Preguntarle
-- `v_heredero.id is not null` cuando nunca se le asignó una fila levanta esa
-- excepción y aborta la anulación entera. Y el caso normal —anular un cierre
-- que NO tiene heredero, que es la inmensa mayoría— caía justo ahí.
--
-- Y hay una segunda trampa, más callada, que costó un segundo intento:
-- PL/pgSQL pasa las variables a la consulta como parámetros, así que EVALÚA
-- `v_heredero.codigo` aunque el CASE que lo envuelve no tome esa rama. Cambiar
-- solo la condición no alcanza: hay que dejar de tocar el registro fuera de la
-- rama que lo llenó.
--
-- Por qué no salió antes: los dos cierres que se anularon el 02-09 (001 y 003
-- de Brenda) SÍ tenían heredero, así que el camino que reventaba nunca se
-- recorrió. La primera anulación sin duplicado fue esta.
--
-- LA CORRECCIÓN. Dos variables sueltas —`v_hay_heredero` y
-- `v_heredero_codigo`— que se llenan cuando la consulta trae fila. El registro
-- se sigue usando dentro de su rama; fuera, nadie lo toca.
--
-- Se parcha sobre la definición VIVA con `replace`, no copiando el cuerpo:
-- copiar cuerpos revivió reglas revertidas tres veces en este repositorio.
-- Cada reemplazo se aplica solo si su anclaje está, de modo que la migración
-- sirve igual sobre la función original que sobre una a medio parchear; al
-- final se comprueba el resultado y, si no cuadra, se detiene en voz alta.
-- ============================================================

do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'anular_cierre' limit 1;
  if v_def is null then raise exception 'No existe la función anular_cierre'; end if;
  if v_def like '%v_heredero_codigo text;%' then
    raise notice 'anular_cierre ya está corregida; no se toca';
    return;
  end if;

  -- 1. Las dos variables sueltas, junto al registro.
  if position('v_hay_heredero' in v_def) = 0 then
    v_def := replace(v_def,
      E'  v_heredero record;\n',
      E'  v_heredero record;\n  v_hay_heredero boolean := false;\n  v_heredero_codigo text;\n');
  else
    v_def := replace(v_def,
      E'  v_hay_heredero boolean := false;\n',
      E'  v_hay_heredero boolean := false;\n  v_heredero_codigo text;\n');
  end if;

  -- 2. Se llenan cuando la consulta trajo fila, y la rama pregunta por el
  --    booleano en vez de por el registro.
  v_def := replace(v_def,
    E'    end if;\n  end if;\n\n  if v_heredero.id is not null then',
    E'      v_hay_heredero := found;\n    end if;\n  end if;\n\n  if v_hay_heredero then');
  v_def := replace(v_def,
    E'      v_hay_heredero := found;\n',
    E'      v_hay_heredero := found;\n      if found then v_heredero_codigo := v_heredero.codigo; end if;\n');

  -- 3. La nota que se escribe en el pedido de postventa.
  v_def := replace(v_def,
    E'           case when v_heredero.id is not null\n',
    E'           case when v_hay_heredero\n');
  v_def := replace(v_def,
    E'                then format(''. El pedido sigue en la fila del informe %s'', v_heredero.codigo)',
    E'                then format(''. El pedido sigue en la fila del informe %s'', v_heredero_codigo)');

  -- 4. Lo que devuelve la función.
  v_def := replace(v_def,
    E'    ''venta_anulada'', v_inf.venta_id is not null and v_heredero.id is null,',
    E'    ''venta_anulada'', v_inf.venta_id is not null and not v_hay_heredero,');
  v_def := replace(v_def,
    E'    ''venta_movida_a'', v_heredero.codigo,',
    E'    ''venta_movida_a'', v_heredero_codigo,');
  v_def := replace(v_def,
    E'    ''venta_movida_a'', case when v_hay_heredero then v_heredero.codigo end,',
    E'    ''venta_movida_a'', v_heredero_codigo,');

  -- El resultado tiene que cumplir las tres condiciones, o no se aplica nada.
  if v_def not like '%v_heredero_codigo text;%'
     or v_def not like '%if v_hay_heredero then%'
     or v_def like '%informe %s'', v_heredero.codigo%'
     or v_def like '%''venta_movida_a'', v_heredero.codigo%' then
    raise exception 'El parche de anular_cierre no encontró sus anclajes: revisar la función a mano';
  end if;

  execute v_def;
end $mig$;

comment on function public.anular_cierre(uuid, text, text) is
  'Anula un informe de cierre emitido y arrastra su venta: la pasa al informe heredero si lo hay, o la anula. Cierra los pedidos de postventa del informe anulado (0113, 0162, 0172).';
