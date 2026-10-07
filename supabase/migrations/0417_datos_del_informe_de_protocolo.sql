-- EL INFORME DE PROTOCOLO COMO EL MODELO DE SIEMPRE (Ariana, almacén, 07-10:
-- «el contenido del informe debería generarse tomando como referencia el
-- modelo que se ha dejado… que mantenga el formato, la estructura y la
-- información»). El Word de Lesly («formato de protocolo Lavadora …») es una
-- hoja por máquina: «INFORME DE PROTOCOLO DE PRUEBA DE LAVADORA 13 KG»,
-- «MODELO: CWG27MDCRS /405KWATM5344», cliente, asunto, fecha de ejecución,
-- fecha de informe, técnico a cargo y quién elaboró el informe, y las fotos.
--
-- El modelo de placa (CWG27MDCRS) y el técnico no están en el pedido: el
-- almacén los completa desde el informe. Uno por máquina: «principal» es la
-- del renglón y «secadora» la de una torre que no tiene renglón propio.

alter table public.pedido_equipos add column if not exists protocolo_datos jsonb not null default '{}'::jsonb;

create or replace function public.datos_del_protocolo(p_item uuid, p_maquina text, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limpio jsonb := '{}'::jsonb;
  v_clave text;
  v_valor text;
  v_fecha date;
begin
  if not (coalesce(es_almacen(), false) or coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Los datos del informe los pone el almacén o postventa';
  end if;
  if p_maquina not in ('principal', 'secadora') then
    raise exception 'Máquina desconocida';
  end if;
  foreach v_clave in array array['equipo', 'modelo', 'serie', 'tecnico', 'elaborado', 'fecha_ejecucion', 'fecha_informe'] loop
    v_valor := nullif(btrim(coalesce(p_datos ->> v_clave, '')), '');
    if v_valor is null then continue; end if;
    if v_clave like 'fecha_%' then
      begin
        v_fecha := v_valor::date;
      exception when others then
        raise exception 'Revise la fecha (%)', v_valor;
      end;
      if v_fecha > (now() at time zone 'America/Lima')::date then
        raise exception 'La fecha no puede ser futura';
      end if;
      if v_fecha < date '2015-01-01' then
        raise exception 'Revise el año de la fecha';
      end if;
      v_valor := v_fecha::text;
    end if;
    v_limpio := v_limpio || jsonb_build_object(v_clave, left(v_valor, 200));
  end loop;

  update pedido_equipos
     set protocolo_datos = jsonb_set(coalesce(protocolo_datos, '{}'::jsonb), array[p_maquina], v_limpio),
         -- La fecha de ejecución de la máquina del renglón es la misma de la 0416.
         protocolo_fecha = case when p_maquina = 'principal' and v_limpio ? 'fecha_ejecucion'
                                then (v_limpio ->> 'fecha_ejecucion')::date else protocolo_fecha end
   where id = p_item and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa máquina no está en el pedido'; end if;
end $$;

revoke all on function public.datos_del_protocolo(uuid, text, jsonb) from public, anon;
grant execute on function public.datos_del_protocolo(uuid, text, jsonb) to authenticated;
