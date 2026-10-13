-- ============================================================
-- CRM EFAMEINSA · Migración 0458 · Gerencia devuelve ÍTEMS para corregir sin borrar la cotización
-- ============================================================
-- Reunión de postventa del 13-10 (Carlos, Rubí, Ariana, Lesly, Santos):
-- cuando gerencia rechaza un renglón, la cotización entera queda como
-- histórico (0237) y no sale «ni un borrador»: quien la armó vuelve a cargar
-- seis ítems para corregir uno. Lo acordado: «el ítem 1 está rechazado bien
-- grande porque hay un error o porque tienes que corregir el precio, con el
-- comentario; en el ítem 2, aprobado… que solamente aparezca en el borrador».
--
-- Diseño: se reaprovecha la observación de la 0415. La cotización NO cambia
-- de estado (sigue `pendiente_gerencia`, editable porque no salió al
-- cliente) y queda `observacion_estado = 'observada'`:
--   · los renglones aprobados quedan `aprobado = true` → editar_cotizacion
--     los conserva aprobados mientras no cambien (clave p+u+d+k);
--   · los renglones a corregir quedan `aprobado = false`, y su comentario va
--     en el histórico `cotizacion_decisiones.rechazados[].nota`;
--   · la comercial corrige y responde (responder_observacion_cotizacion) y
--     vuelve a gerencia. Rechazar la cotización entera (histórico) sigue
--     existiendo en resolver_aprobacion_cotizacion.
-- ============================================================

create or replace function public.devolver_cotizacion_por_items(
  p_cotizacion_id uuid,
  p_aprobados uuid[],
  p_corregir jsonb,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cot         cotizaciones%rowtype;
  v_ids         uuid[];
  v_sin_decidir integer;
  v_sin_nota    integer;
  v_nota        text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then raise exception 'La cotización no existe'; end if;
  if not es_backoffice() then
    raise exception 'Los renglones de una cotización los revisa gerencia. Entre con la cuenta de gerencia: la cotización sigue esperando.';
  end if;
  if v_cot.estado_aprobacion <> 'pendiente_gerencia' then
    raise exception 'Esta cotización ya fue resuelta';
  end if;
  if jsonb_typeof(p_corregir) <> 'array' or jsonb_array_length(p_corregir) = 0 then
    raise exception 'Marque al menos un renglón para corregir';
  end if;

  select array_agg((e->>'id')::uuid), count(*) filter (where length(btrim(coalesce(e->>'nota', ''))) < 3)
    into v_ids, v_sin_nota
    from jsonb_array_elements(p_corregir) e;
  if v_sin_nota > 0 then
    raise exception 'Escriba qué hay que corregir en cada renglón marcado (% sin comentario)', v_sin_nota;
  end if;
  if exists (select 1 from cotizacion_items ci
              where ci.id = any(v_ids) and ci.cotizacion_id <> p_cotizacion_id)
     or (select count(*) from cotizacion_items ci where ci.id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'Un renglón marcado no es de esta cotización. Recargue la página.';
  end if;

  select count(*) into v_sin_decidir
    from cotizacion_items ci
   where ci.cotizacion_id = p_cotizacion_id
     and ci.requiere_aprobacion
     and not (ci.id = any(coalesce(p_aprobados, '{}'::uuid[])))
     and not (ci.id = any(v_ids));
  if v_sin_decidir > 0 then
    raise exception 'Faltan % renglón(es) por aprobar o devolver', v_sin_decidir;
  end if;

  update cotizacion_items set aprobado = true
   where cotizacion_id = p_cotizacion_id and id = any(coalesce(p_aprobados, '{}'::uuid[]));
  update cotizacion_items set aprobado = false
   where cotizacion_id = p_cotizacion_id and id = any(v_ids);

  update cotizaciones set observacion_estado = 'observada', updated_at = now() where id = p_cotizacion_id;

  insert into cotizacion_decisiones (cotizacion_id, oportunidad_id, decidido_por, resultado, nota, rechazados, aprobados)
  select p_cotizacion_id, v_cot.oportunidad_id, auth.uid(), 'observada',
         coalesce(v_nota, 'Corregir ' || cardinality(v_ids) || ' renglón(es) marcados'),
         coalesce((select jsonb_agg(jsonb_build_object(
                             'descripcion', coalesce(pr.marca || ' ' || pr.modelo, ci.descripcion),
                             'precio', ci.precio_unitario, 'lista', ci.precio_lista,
                             'nota', btrim(e->>'nota'), 'item_id', ci.id) order by ci.id)
                     from jsonb_array_elements(p_corregir) e
                     join cotizacion_items ci on ci.id = (e->>'id')::uuid
                     left join productos pr on pr.id = ci.producto_id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('descripcion', coalesce(pr.marca || ' ' || pr.modelo, ci.descripcion), 'precio', ci.precio_unitario, 'lista', ci.precio_lista))
                     from cotizacion_items ci left join productos pr on pr.id = ci.producto_id
                    where ci.cotizacion_id = p_cotizacion_id and ci.id = any(coalesce(p_aprobados, '{}'::uuid[]))), '[]'::jsonb);
end;
$function$;

revoke all on function public.devolver_cotizacion_por_items(uuid, uuid[], jsonb, text) from public;
grant execute on function public.devolver_cotizacion_por_items(uuid, uuid[], jsonb, text) to authenticated;
