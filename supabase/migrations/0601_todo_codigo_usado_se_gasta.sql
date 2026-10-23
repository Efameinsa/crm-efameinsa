-- TODO CÓDIGO QUE SE USA SE GASTA (Santos, 23-10-2026).
--
-- POR QUÉ: Santos le dio su PIN a Brenda, ella lo usó, y la pantalla de
-- Santos seguía mostrando el mismo número. Desde la 0343 el código cambia
-- cuando hay una fila nueva en `autorizaciones_supervisor`, pero solo diez
-- funciones la escribían (derivaciones, cartera, expediente, cotización…).
-- Las demás —casi todas de postventa: despachar con saldo, cerrar sin puesta
-- en marcha, corregir la apertura emitida, ordenar facturar, corregir el
-- informe, anular un cierre, revertir un aviso…— validaban el código con
-- `validar_codigo_autorizacion` y no dejaban rastro: el código seguía vivo y
-- se podía volver a usar dentro de sus 10 minutos.
--
-- AHORA: `validar_codigo_autorizacion` gasta el código en cuanto lo acepta
-- (fila «uso_codigo» en la misma transacción). Si la acción falla después,
-- todo se deshace y el código sigue valiendo. Si la función que lo pidió
-- escribe además su propia autorización (las diez de siempre), esa fila
-- reemplaza a la «uso_codigo» de la misma transacción: un solo uso, con la
-- acción y el motivo de verdad.

create or replace function autorizacion_numera_uso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supervisor_id is not null then
    -- 0601: la autorización «de verdad» reemplaza al gasto genérico que dejó
    -- la validación en esta misma transacción (now() = inicio de la transacción).
    if new.accion <> 'uso_codigo' then
      delete from autorizaciones_supervisor
       where supervisor_id = new.supervisor_id
         and solicitante_id = new.solicitante_id
         and accion = 'uso_codigo'
         and creado_at = now();
    end if;
    new.uso := pin_usos_supervisor(new.supervisor_id);
  end if;
  return new;
end;
$$;
alter function autorizacion_numera_uso() owner to postgres;

do $$
declare
  v text;
  viejo constant text := $x$    if v_pin = codigo_pin_supervisor(v_sup.id, v_ventana)
       or v_pin = codigo_pin_supervisor(v_sup.id, v_ventana - 1) then
      return v_sup.id;
    end if;$x$;
  nuevo constant text := $x$    if v_pin = codigo_pin_supervisor(v_sup.id, v_ventana)
       or v_pin = codigo_pin_supervisor(v_sup.id, v_ventana - 1) then
      -- 0601: aceptado = gastado. La pantalla del supervisor muestra el nuevo.
      insert into autorizaciones_supervisor (supervisor_id, solicitante_id, ventana, accion, motivo)
      values (v_sup.id, v_solicitante, v_ventana, 'uso_codigo', 'Código usado (' || coalesce(p_ambito, '') || ')');
      return v_sup.id;
    end if;$x$;
begin
  select pg_get_functiondef('public.validar_codigo_autorizacion(text,text)'::regprocedure) into v;
  if position('0601:' in v) = 0 then
    if position(viejo in v) = 0 then
      raise exception 'validar_codigo_autorizacion: no se encontró dónde acepta el código';
    end if;
    execute replace(v, viejo, nuevo);
  end if;
end $$;
