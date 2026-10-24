-- QUITAR UNA SERIE CON LA «×» (Santos, 24-10). En /almacen/stock la tarjeta de
-- ABZUL desapareció tras el primer check y Lesly marcó la secadora 303KWFN87683 en
-- la tarjeta de AQU ANQA, que subió a su lugar. La serie principal solo se podía
-- cambiar por otra (corregir_serie_del_equipo, 0290); no había cómo dejar la línea
-- vacía para volver a elegir. Ahora la «×» al lado de cualquier serie del pedido
-- (la principal o la segunda máquina de la torre) la quita con el código de
-- operaciones o gerencia y el motivo, como pidió Lesly el 21-10 (0579).
--
-- Al quitarla: la línea vuelve a esperar serie (y reaparece en «Central pide la
-- serie»), la máquina vuelve a «disponible» en el stock (lo hace el trigger
-- inventario_sigue_la_serie, 0595) y la ficha que se creó solo por este pedido se
-- borra. Si la ficha ya tiene historia o la usa otra línea, se queda. El aviso a
-- Central, postventa y almacén lo manda la acción del servidor.

create or replace function public.quitar_serie_del_equipo(p_item uuid, p_pin text, p_motivo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it record;
  v_autorizo uuid;
  v_quien text;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa, el almacén o Central corrigen las series';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escriba por qué se quita la serie'; end if;
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null then raise exception 'Esa línea ya no está en el pedido'; end if;
  if v_it.serie is null then raise exception 'Esa línea no tiene serie'; end if;
  if exists (select 1 from servicios_postventa where id = v_it.servicio_id and despachado_at is not null) then
    raise exception 'El pedido ya salió del almacén: corrija la serie con el código de operaciones';
  end if;
  if v_it.parte_de is null and v_it.prueba_lista_at is not null then
    raise exception 'Esa máquina ya se probó con esta serie: use «Corregir» para poner la correcta';
  end if;
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  v_quien := coalesce((select nombre from perfiles where id = v_autorizo), '—');

  if v_it.parte_de is not null then
    -- La segunda máquina de la torre es una fila propia: se va entera.
    delete from pedido_equipos where id = p_item;
  else
    update pedido_equipos
       set serie = null, equipo_id = null, serie_registrada_at = null, serie_registrada_por = null
     where id = p_item;
  end if;

  -- La ficha que nació solo por esta línea se va con la serie.
  if v_it.equipo_id is not null then
    begin
      delete from equipos_instalados
       where id = v_it.equipo_id and servicio_id = v_it.servicio_id and registrado_en = 'pedido'
         and not exists (select 1 from pedido_equipos where equipo_id = v_it.equipo_id);
    exception when foreign_key_violation then
      raise exception 'Esa máquina ya tiene historia en el registro: corrija la serie con el código de operaciones';
    end;
  end if;

  update servicios_postventa
     set observaciones = concat_ws(E'\n', observaciones,
           format('Serie quitada: %s %s (%s). Autorizó con código: %s.',
                  coalesce(v_it.parte_nombre, 'máquina'), v_it.serie, btrim(p_motivo), v_quien))
   where id = v_it.servicio_id;
  return v_quien;
end $$;

revoke all on function public.quitar_serie_del_equipo(uuid, text, text) from public, anon;
grant execute on function public.quitar_serie_del_equipo(uuid, text, text) to authenticated, service_role;
