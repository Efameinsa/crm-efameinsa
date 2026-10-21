-- QUITAR LA SERIE DE LA SECADORA DE LA TORRE TAMBIÉN PIDE CÓDIGO (buzón Lesly
-- 21-10, «GENERACIÓN CÓDIGO»: «en caso de alguna modificación por error en la
-- serie debe pedir PIN; yo he modificado hace un momento y no solicitó PIN; así
-- mismo, una vez modificado debe notificar de la modificación»).
--
-- La serie principal ya se corregía solo con el código (corregir_serie_del_equipo,
-- 0290), pero la segunda máquina de la torre (0359) tenía un «Quitar» sin código:
-- se quitaba y se volvía a poner otra serie sin rastro. Desde ahora quitarla pide
-- el código de operaciones o gerencia y el motivo, y queda escrito en el pedido.
-- Corregirla usa corregir_serie_del_equipo, como la principal. El aviso (Central,
-- postventa y almacén) lo manda la acción del servidor.

drop function if exists public.quitar_parte_del_equipo(uuid);

create or replace function public.quitar_parte_del_equipo(p_item uuid, p_pin text, p_motivo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it record;
  v_autorizo uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa, el almacén o Central corrigen las series';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escriba por qué se quita la serie'; end if;
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null or v_it.parte_de is null then raise exception 'Solo se quita una segunda máquina agregada'; end if;
  if exists (select 1 from servicios_postventa where id = v_it.servicio_id and despachado_at is not null) then
    raise exception 'El pedido ya salió del almacén: corrija la serie con el código de operaciones';
  end if;
  delete from pedido_equipos where id = p_item;
  -- La máquina que se registró solo por esta fila se va con ella. Si ya tiene
  -- historia (un caso, un mantenimiento), se queda y se avisa.
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
           format('Serie quitada: %s %s (%s). Autorizó con código: %s.', coalesce(v_it.parte_nombre, 'otra máquina'), v_it.serie, btrim(p_motivo),
                  coalesce((select nombre from perfiles where id = v_autorizo), '—')))
   where id = v_it.servicio_id;
  return coalesce((select nombre from perfiles where id = v_autorizo), '—');
end $$;

revoke all on function public.quitar_parte_del_equipo(uuid, text, text) from public, anon;
grant execute on function public.quitar_parte_del_equipo(uuid, text, text) to authenticated, service_role;
