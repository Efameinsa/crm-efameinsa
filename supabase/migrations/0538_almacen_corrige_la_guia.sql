-- ════════════════════════════════════════════════════════════════════════
-- 0538 · El almacén corrige la guía de una entrega ya registrada
--
-- Buzón del almacén, 19-10 («SALIERON, SIN GUÍA»): «No permite editar…
-- para poder corregir el adjunto y los datos de la guía». Caso ABACHI
-- (PED-0023-2026 y el embalaje del rodillo): se registró la entrega con la
-- guía EG07-928 y, una vez registrada, la tarjeta se cierra en «Despachado
-- con guía…» sin forma de cambiar el número, la agencia, quién recibió ni
-- la foto.
--
-- `almacen_corregir_agencia`: mismos permisos que registrar la entrega, solo
-- sobre una entrega ya registrada. Cambia agencia, guía y quién recibió; cada
-- foto nueva REEMPLAZA a la que tenía la misma etiqueta (y la misma serie, si
-- es por máquina) y las demás quedan. No toca la fecha de la entrega ni el
-- doble check de postventa. Si la máquina ya está en «equipos instalados» con
-- la guía anterior, se le pone la nueva. Lo anterior queda en el registro de
-- acciones (0513): el cambio de servicios_postventa se anota solo.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.almacen_corregir_agencia(
  p_servicio uuid,
  p_transportista text,
  p_guia text,
  p_fotos jsonb,
  p_recibe text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s     record;
  v_guia  text := nullif(btrim(coalesce(p_guia, '')), '');
  v_fotos jsonb := coalesce(p_fotos, '[]'::jsonb);
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La entrega la corrige el almacén';
  end if;
  if v_guia is null then
    raise exception 'Falta el número de la guía de remisión';
  end if;
  select id, guia, agencia_at into v_s
    from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.agencia_at is null then
    raise exception 'Todavía no se registró la entrega: regístrela con «Entregado con guía»';
  end if;

  update servicios_postventa
     set transportista = coalesce(nullif(btrim(coalesce(p_transportista, '')), ''), transportista),
         guia = v_guia,
         recibe_nombre = coalesce(nullif(btrim(coalesce(p_recibe, '')), ''), recibe_nombre),
         agencia_fotos = coalesce((
             select jsonb_agg(f order by n)
               from jsonb_array_elements(coalesce(agencia_fotos, '[]'::jsonb)) with ordinality as a(f, n)
              where not exists (
                select 1 from jsonb_array_elements(v_fotos) nueva
                 where nueva->>'etiqueta' = f->>'etiqueta'
                   and coalesce(nueva->>'serie', '') = coalesce(f->>'serie', ''))
           ), '[]'::jsonb) || v_fotos,
         updated_at = now()
   where id = p_servicio;

  if v_s.guia is distinct from v_guia then
    update equipos_instalados
       set guia_remision = v_guia
     where servicio_id = p_servicio
       and guia_remision is not distinct from v_s.guia;
  end if;
end $function$;

revoke all on function public.almacen_corregir_agencia(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.almacen_corregir_agencia(uuid, text, text, jsonb, text) to authenticated;
