-- ============================================================
-- CRM EFAMEINSA · Migración 0300 · Probar sin fotos no rompe el pedido
-- ============================================================
-- Rubí (24-09, ~12:20): «cuando quiero ingresar a verificar el circuito sale
-- "Esta pantalla no se pudo abrir… referencia 3361334031"; me pasa con
-- Bungarena y Rivera». Reproducido con su sesión: los dos pedidos con
-- cierre fallaban y el que no tenía cierre abría.
--
-- LA CAUSA. Esa mañana el almacén marcó las máquinas de cuatro pedidos como
-- probadas SIN subir fotos. `almacen_probar_equipo` (0260) junta las fotos de
-- todas las máquinas con `left join lateral jsonb_array_elements(...)`: la
-- máquina sin fotos aporta una fila con `f = null`, `jsonb_agg` la incluye,
-- y el pedido queda con `protocolo_fotos = [null, null]`. La pantalla del
-- pedido (postventa y almacén) firma cada foto por su `path`, y `null.path`
-- tumba la página entera —con «no se perdió nada», que era cierto.
--
-- QUÉ CAMBIA. La agregación deja fuera los nulos (`filter (where f is not
-- null)`): sin fotos, la lista queda vacía y el pedido conserva lo que
-- tuviera. Y se limpian los cuatro pedidos que ya quedaron con huecos
-- (Ecolav Sorela, Bungarena, Herrera, Rivera). Las pantallas, además, desde
-- hoy ignoran cualquier entrada sin `path`, por si algo parecido vuelve a
-- colarse por otra puerta.

create or replace function public.almacen_probar_equipo(p_item uuid, p_protocolo_ref text, p_fotos jsonb default '[]'::jsonb, p_nota text default null)
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
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;

  update pedido_equipos
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         protocolo_ref = coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), protocolo_ref),
         protocolo_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), protocolo_nota),
         protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb)
   where id = p_item;

  select count(*) into v_pend from pedido_equipos where servicio_id = v_it.servicio_id and en_este_despacho and prueba_lista_at is null;
  if v_pend > 0 then return false; end if;

  -- Todas las que van están probadas: el pedido queda probado y embalado,
  -- con los protocolos de todas (uno por máquina) y sus fotos. La máquina
  -- que se probó sin fotos no aporta un hueco (0300).
  select string_agg(protocolo_ref, ' · ' order by orden),
         coalesce(jsonb_agg(f order by orden) filter (where f is not null and jsonb_typeof(f) <> 'null'), '[]'::jsonb)
    into v_refs, v_fotos
    from pedido_equipos pe
    left join lateral jsonb_array_elements(pe.protocolo_fotos) f on true
   where pe.servicio_id = v_it.servicio_id and pe.en_este_despacho;
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

-- Los pedidos que ya quedaron con huecos: se quitan los nulos y se conserva
-- toda foto real que hubiera. Vale para las tres listas por si acaso.
update servicios_postventa s
   set protocolo_fotos = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(s.protocolo_fotos) e where jsonb_typeof(e) <> 'null')
 where jsonb_typeof(s.protocolo_fotos) = 'array'
   and exists (select 1 from jsonb_array_elements(s.protocolo_fotos) e where jsonb_typeof(e) = 'null');
update servicios_postventa s
   set salida_fotos = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(s.salida_fotos) e where jsonb_typeof(e) <> 'null')
 where jsonb_typeof(s.salida_fotos) = 'array'
   and exists (select 1 from jsonb_array_elements(s.salida_fotos) e where jsonb_typeof(e) = 'null');
update servicios_postventa s
   set agencia_fotos = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(s.agencia_fotos) e where jsonb_typeof(e) <> 'null')
 where jsonb_typeof(s.agencia_fotos) = 'array'
   and exists (select 1 from jsonb_array_elements(s.agencia_fotos) e where jsonb_typeof(e) = 'null');
