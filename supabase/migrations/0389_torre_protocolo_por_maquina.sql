-- LA TORRE SE PRUEBA MÁQUINA POR MÁQUINA (Lesly, 03-10): «ya se puede dar
-- serie independiente, pero en protocolos no da la opción para agregar las
-- fotos y el informe de la otra máquina». Cada parte de la unidad (0359: la
-- secadora) recibe su propio N.º de protocolo, sus fotos y sus documentos; si
-- no se escribe protocolo propio, hereda el de la unidad como antes. El pedido
-- junta los protocolos y las fotos de todas, partes incluidas.
-- p_partes: [{ "id": uuid, "protocolo_ref": text, "fotos": [...] }]

drop function if exists public.almacen_probar_equipo(uuid, text, jsonb, text);

create or replace function public.almacen_probar_equipo(p_item uuid, p_protocolo_ref text, p_fotos jsonb default '[]'::jsonb, p_nota text default null, p_partes jsonb default '[]'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_it   record;
  v_pend int;
  v_refs text;
  v_fotos jsonb;
  v_parte jsonb;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  if v_it.parte_de is not null then raise exception 'La torre se prueba desde su unidad principal'; end if;

  update pedido_equipos
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         protocolo_ref = coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), protocolo_ref),
         protocolo_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), protocolo_nota),
         protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb)
   where id = p_item;

  -- Sus partes (0359) quedan probadas con ella; el protocolo propio si lo trae.
  update pedido_equipos pe
     set prueba_lista_at = p.prueba_lista_at, prueba_lista_por = p.prueba_lista_por, protocolo_ref = coalesce(pe.protocolo_ref, p.protocolo_ref)
    from pedido_equipos p
   where p.id = p_item and pe.parte_de = p_item;
  for v_parte in select * from jsonb_array_elements(coalesce(p_partes, '[]'::jsonb)) loop
    update pedido_equipos
       set protocolo_ref = coalesce(nullif(btrim(coalesce(v_parte->>'protocolo_ref', '')), ''), protocolo_ref),
           protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(v_parte->'fotos', '[]'::jsonb)
     where id = (v_parte->>'id')::uuid and parte_de = p_item;
    if not found then raise exception 'Esa máquina no es parte de esta unidad'; end if;
  end loop;

  select count(*) into v_pend from pedido_equipos
   where servicio_id = v_it.servicio_id and en_este_despacho and prueba_lista_at is null and parte_de is null;
  if v_pend > 0 then return false; end if;

  -- Todas las que van están probadas: el pedido queda probado y embalado,
  -- con los protocolos de todas (uno por máquina, partes incluidas) y sus fotos.
  -- Sin repetir: la parte sin protocolo propio hereda el de su unidad.
  select string_agg(ref, ' · ' order by primero)
    into v_refs
    from (select pe.protocolo_ref as ref, min(pe.orden) as primero
            from pedido_equipos pe
           where pe.servicio_id = v_it.servicio_id and pe.protocolo_ref is not null
             and (pe.en_este_despacho and pe.parte_de is null
                  or pe.parte_de in (select id from pedido_equipos where servicio_id = v_it.servicio_id and en_este_despacho and parte_de is null))
           group by pe.protocolo_ref) x;
  select coalesce(jsonb_agg(f order by pe.orden) filter (where f is not null and jsonb_typeof(f) <> 'null'), '[]'::jsonb)
    into v_fotos
    from pedido_equipos pe
    left join lateral jsonb_array_elements(pe.protocolo_fotos) f on true
   where pe.servicio_id = v_it.servicio_id
     and (pe.en_este_despacho and pe.parte_de is null
          or pe.parte_de in (select id from pedido_equipos where servicio_id = v_it.servicio_id and en_este_despacho and parte_de is null));
  update servicios_postventa
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         prueba_embalaje = 'SI',
         protocolo_prueba_ref = coalesce(v_refs, protocolo_prueba_ref),
         protocolo_fotos = case when jsonb_typeof(v_fotos) = 'array' and jsonb_array_length(v_fotos) > 0 then v_fotos else protocolo_fotos end,
         updated_at = now()
   where id = v_it.servicio_id;
  return true;
end;
$$;

revoke all on function public.almacen_probar_equipo(uuid, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.almacen_probar_equipo(uuid, text, jsonb, text, jsonb) to authenticated;
