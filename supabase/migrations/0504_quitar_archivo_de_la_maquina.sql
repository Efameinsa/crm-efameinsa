-- QUITAR UNA FOTO O DOCUMENTO SUBIDO POR ERROR A LA MÁQUINA (Ariana, almacén
-- 15-10: en la prueba y embalaje del OPEN 060-2026, CONSORCIO EL PORTAL DEL
-- MARQUES, subió dos imágenes que no correspondían y no había cómo sacarlas).
--
-- Mismas manos que suben (0297): almacén, postventa, operaciones y gerencia.
-- El candado del protocolo guardado (0450) vale igual: si la máquina ya está
-- probada y embalada, quitar pide el código de Lesly, como agregar. El
-- archivo queda en el almacenamiento; solo sale de la máquina y del informe.

create or replace function public.quitar_archivo_del_equipo(p_item uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Los archivos de la máquina los quita el almacén o postventa';
  end if;
  update pedido_equipos
     set protocolo_fotos = coalesce((select jsonb_agg(f) from jsonb_array_elements(protocolo_fotos) f where f->>'path' is distinct from p_path), '[]'::jsonb)
   where id = p_item
     and es_prueba = coalesce(es_cuenta_prueba(), false)
     and protocolo_fotos @> jsonb_build_array(jsonb_build_object('path', p_path));
  if not found then raise exception 'Ese archivo ya no está en la máquina'; end if;
end $$;

revoke all on function public.quitar_archivo_del_equipo(uuid, text) from public, anon;
grant execute on function public.quitar_archivo_del_equipo(uuid, text) to authenticated;
