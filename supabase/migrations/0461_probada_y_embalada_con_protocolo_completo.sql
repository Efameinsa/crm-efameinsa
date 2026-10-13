-- SIN PROTOCOLO COMPLETO NO HAY «PROBADA Y EMBALADA», POR CUALQUIER PUERTA
-- (Santos, 13-10, COFACO INDUSTRIES en Almacén 2: «la señorita no tiene
-- ninguna foto ni documento ahí y se puede poner probar y embalar… tiene que
-- estar todo, tanto la ficha como el informe de protocolo»).
--
-- La primera vuelta (0a6c503b) frenaba en la pantalla y en la acción del
-- servidor de la oficina, pero Ariana marcó desde crm-efameinsa.vercel.app,
-- que corre el código de las 5:00 contra la misma base: pasó sin nada. La
-- regla vive ahora aquí, en la base, como las demás del almacén.
--
-- Por cada máquina de la unidad (la del renglón, la secadora de una torre sin
-- renglón propio y cada parte, 0359): N.º de protocolo, al menos una foto, el
-- protocolo o informe en PDF/Word, la ficha (modelo de la placa, serie,
-- técnico) y, si es lavadora, las 37 casillas de «PROTOCOLO DE LAVADORA»
-- (src/lib/protocolo-checklist.ts; si la plantilla cambia, cambiar el número).
-- El repuesto (0441) solo pide protocolo, foto y técnico. El pedido sin lista
-- de máquinas (almacen_marcar_probado) pide protocolo y archivo; y marcar el
-- pedido directo con máquinas sin probar tampoco se puede.

create or replace function public.protocolo_falta_en_maquina(
  p_nombre text, p_datos jsonb, p_chequeo jsonb, p_archivos jsonb, p_serie text, p_lavadora boolean, p_repuesto boolean)
returns text[]
language plpgsql
immutable
as $$
declare
  v text[] := '{}';
  v_img int;
  v_doc int;
  v_marcas int;
begin
  select count(*) filter (where coalesce(a->>'tipo', '') like 'image/%' or coalesce(a->>'path', '') ~* '\.(jpe?g|png|webp|gif|heic)$'),
         count(*) filter (where not (coalesce(a->>'tipo', '') like 'image/%' or coalesce(a->>'path', '') ~* '\.(jpe?g|png|webp|gif|heic)$'))
    into v_img, v_doc
    from jsonb_array_elements(case when jsonb_typeof(p_archivos) = 'array' then p_archivos else '[]'::jsonb end) a
   where jsonb_typeof(a) = 'object' and coalesce(a->>'path', '') <> '';
  if v_img = 0 then v := v || (p_nombre || ': fotos'); end if;
  if not p_repuesto and v_doc = 0 then v := v || (p_nombre || ': protocolo o informe (PDF o Word)'); end if;
  if not p_repuesto and btrim(coalesce(p_datos->>'modelo', '')) = '' then v := v || (p_nombre || ': modelo de la placa (en la ficha del informe)'); end if;
  if not p_repuesto and btrim(coalesce(nullif(btrim(coalesce(p_datos->>'serie', '')), ''), p_serie, '')) = '' then v := v || (p_nombre || ': serie'); end if;
  if btrim(coalesce(p_datos->>'tecnico', '')) = '' then v := v || (p_nombre || ': técnico que hizo la prueba'); end if;
  if p_lavadora and not p_repuesto then
    select count(*) into v_marcas
      from jsonb_each_text(case when jsonb_typeof(p_chequeo->'marcas') = 'object' then p_chequeo->'marcas' else '{}'::jsonb end)
     where value in ('ok', 'falla');
    if v_marcas < 37 then
      v := v || format('%s: hoja «PROTOCOLO DE LAVADORA», %s casilla%s sin marcar', p_nombre, 37 - v_marcas, case when 37 - v_marcas = 1 then '' else 's' end);
    end if;
  end if;
  return v;
end $$;

-- El tipo de máquina como lo lee la hoja (src/lib/protocolo-hoja.ts, tipoDe):
-- el primero que aparece en la descripción.
create or replace function public.protocolo_es_lavadora(p_descripcion text, p_datos jsonb, p_parte_nombre text)
returns boolean
language sql
immutable
as $$
  select case
    when btrim(coalesce(p_datos->>'equipo', '')) <> '' then upper(p_datos->>'equipo') like 'LAVADORA%'
    when p_parte_nombre is not null then upper(p_parte_nombre) like 'LAVADORA%'
    else coalesce((
      select t from unnest(array['LAVADORA','SECADORA','CENTRIFUGA','CENTRÍFUGA','PLANCHADORA','PLANCHADOR','CALANDRA','CALDERA','ABLANDADOR','COCHE']) t
       where strpos(upper(coalesce(p_descripcion, '')), t) > 0
       order by strpos(upper(coalesce(p_descripcion, '')), t) limit 1) = 'LAVADORA', false)
  end;
$$;

create or replace function public.protocolo_falta_para_probar(p_item uuid, p_protocolo_ref text, p_fotos jsonb, p_partes jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_it record;
  v_p record;
  v text[] := '{}';
  v_repuesto boolean;
  v_nombre text;
  v_todos jsonb;
  v_desc text;
begin
  select pe.*, s.tipo_pedido into v_it from pedido_equipos pe join servicios_postventa s on s.id = pe.servicio_id where pe.id = p_item;
  if v_it.id is null then return array['Ese equipo no está en el pedido']; end if;
  v_repuesto := coalesce(v_it.tipo_pedido, '') = 'repuesto';
  v_nombre := 'Máquina ' || v_it.orden;
  v_desc := upper(coalesce(v_it.descripcion, ''));
  if coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), nullif(btrim(coalesce(v_it.protocolo_ref, '')), '')) is null then
    v := v || (v_nombre || ': N.º de protocolo');
  end if;
  v_todos := (case when jsonb_typeof(v_it.protocolo_fotos) = 'array' then v_it.protocolo_fotos else '[]'::jsonb end)
          || (case when jsonb_typeof(p_fotos) = 'array' then p_fotos else '[]'::jsonb end);
  v := v || protocolo_falta_en_maquina(
    v_nombre, coalesce(v_it.protocolo_datos->'principal', '{}'), coalesce(v_it.protocolo_chequeo->'principal', '{}'),
    (select coalesce(jsonb_agg(a), '[]') from jsonb_array_elements(v_todos) a where coalesce(a->>'path', '') !~ '-secadora-'),
    coalesce(nullif(btrim(split_part(coalesce(v_it.serie, ''), '/', 1)), ''), case when v_desc ~ 'SERIE' then 'en la descripción' end),
    protocolo_es_lavadora(v_it.descripcion, v_it.protocolo_datos->'principal', v_it.parte_nombre), v_repuesto);
  -- La secadora de una torre sin renglón propio (sus archivos suben con «-secadora-»).
  if not v_repuesto and not exists (select 1 from pedido_equipos where parte_de = p_item)
     and (v_desc ~ '\mTORRE\M' or (v_desc like '%LAVADORA%' and v_desc like '%SECADORA%')) then
    v := v || protocolo_falta_en_maquina(
      'Secadora de la torre', coalesce(v_it.protocolo_datos->'secadora', '{}'), '{}'::jsonb,
      (select coalesce(jsonb_agg(a), '[]') from jsonb_array_elements(v_todos) a where coalesce(a->>'path', '') ~ '-secadora-'),
      coalesce(nullif(btrim(split_part(coalesce(v_it.serie, ''), '/', 2)), ''), case when v_desc ~ 'SERIE.*SERIE' then 'en la descripción' end),
      false, false);
  end if;
  for v_p in select * from pedido_equipos where parte_de = p_item order by orden loop
    v := v || protocolo_falta_en_maquina(
      coalesce(v_p.parte_nombre, 'Otra máquina'), coalesce(v_p.protocolo_datos->'principal', '{}'), coalesce(v_p.protocolo_chequeo->'principal', '{}'),
      (case when jsonb_typeof(v_p.protocolo_fotos) = 'array' then v_p.protocolo_fotos else '[]'::jsonb end)
        || coalesce((select x->'fotos' from jsonb_array_elements(case when jsonb_typeof(p_partes) = 'array' then p_partes else '[]'::jsonb end) x
                      where x->>'id' = v_p.id::text and jsonb_typeof(x->'fotos') = 'array' limit 1), '[]'::jsonb),
      v_p.serie,
      protocolo_es_lavadora(v_p.descripcion, v_p.protocolo_datos->'principal', v_p.parte_nombre), v_repuesto);
  end loop;
  return v;
end $$;

revoke all on function public.protocolo_falta_para_probar(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.protocolo_falta_para_probar(uuid, text, jsonb, jsonb) to authenticated;

-- La de la 0389, con el freno antes de marcar nada.
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
  v_falta text[];
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  if v_it.parte_de is not null then raise exception 'La torre se prueba desde su unidad principal'; end if;

  -- Sin protocolo completo no se marca (0461).
  v_falta := protocolo_falta_para_probar(p_item, p_protocolo_ref, p_fotos, p_partes);
  if coalesce(array_length(v_falta, 1), 0) > 0 then
    raise exception 'Todavía no se puede marcar probada y embalada. Falta: %. La ficha y la hoja de chequeo se llenan en «Ver el informe de prueba y embalaje».', array_to_string(v_falta, ' · ');
  end if;

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

-- El pedido sin lista de máquinas: protocolo (salvo repuesto) y al menos un archivo.
create or replace function public.almacen_marcar_probado(p_servicio uuid, p_protocolo_ref text, p_fotos jsonb default '[]'::jsonb, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_repuesto boolean;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  v_repuesto := coalesce(v_s.tipo_pedido, '') in ('repuesto', 'accesorio', 'embalaje');
  if not v_repuesto and coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), nullif(btrim(coalesce(v_s.protocolo_prueba_ref, '')), '')) is null then
    raise exception 'Todavía no se puede marcar probado y embalado. Falta: N.º de protocolo.';
  end if;
  if jsonb_array_length(coalesce(v_s.protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb)) = 0 then
    raise exception 'Todavía no se puede marcar % y embalado. Falta: %.',
      case when v_repuesto then 'preparado' else 'probado' end,
      case when v_repuesto then 'la foto' else 'el protocolo o las fotos de la prueba' end;
  end if;
  update servicios_postventa
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         prueba_embalaje = 'SI',
         protocolo_prueba_ref = coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), protocolo_prueba_ref),
         protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         observaciones = case when nullif(btrim(coalesce(p_nota, '')), '') is null then observaciones
                              else concat_ws(E'\n', observaciones, format('Almacén, %s: %s', to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI'), btrim(p_nota))) end,
         updated_at = now()
   where id = p_servicio;
end $$;

-- Ninguna otra puerta (marcar el pedido directo en la tabla, desde cualquier
-- versión de la pantalla) deja el pedido probado con máquinas sin probar.
create or replace function public.pedido_probado_con_maquinas_probadas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if old.prueba_lista_at is null and new.prueba_lista_at is not null
     and exists (select 1 from pedido_equipos where servicio_id = new.id and en_este_despacho and parte_de is null and prueba_lista_at is null) then
    raise exception 'Probado y embalado se marca máquina por máquina, con su protocolo completo, en «Equipos de este pedido» (almacén).';
  end if;
  return new;
end $$;

drop trigger if exists ac_pedido_probado_con_maquinas on public.servicios_postventa;
create trigger ac_pedido_probado_con_maquinas
  before update of prueba_lista_at on public.servicios_postventa
  for each row execute function public.pedido_probado_con_maquinas_probadas();
