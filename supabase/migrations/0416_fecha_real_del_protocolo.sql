-- LA FECHA EN QUE REALMENTE SE HIZO EL PROTOCOLO (Ariana, almacén, 07-10:
-- «en el informe debería existir una opción para editar la fecha de
-- realización del protocolo… especialmente cuando el protocolo fue realizado
-- anteriormente al registro en el CRM»). `prueba_lista_at` es cuándo se marcó
-- en el CRM y lo usa el circuito; esta es la fecha que sale en el informe.

alter table public.pedido_equipos add column if not exists protocolo_fecha date;

create or replace function public.fecha_del_protocolo(p_item uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La fecha del protocolo la pone el almacén o postventa';
  end if;
  if p_fecha is not null and p_fecha > (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha del protocolo no puede ser futura';
  end if;
  if p_fecha is not null and p_fecha < date '2015-01-01' then
    raise exception 'Revise el año de la fecha del protocolo';
  end if;
  update pedido_equipos
     set protocolo_fecha = p_fecha
   where id = p_item and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa máquina no está en el pedido'; end if;
end $$;

revoke all on function public.fecha_del_protocolo(uuid, date) from public, anon;
grant execute on function public.fecha_del_protocolo(uuid, date) to authenticated;
