-- 0530 · UNA CARPETA DE POSTVENTA POR CLIENTE (Santos, 17-10).
--
-- Medido el 17-10: 385 expedientes de postventa abiertos para 277 clientes;
-- 55 clientes con dos o más (ECOLAV 10, DUO LAVANDERÍA 8, NEWREST 6). En 30
-- días nacieron 248 y 73 lo hicieron cuando el cliente ya tenía otro abierto:
-- 49 por ser «de otro tipo» (la 0267 solo juntaba el mismo tipo) y 24 del
-- mismo tipo que se escaparon. Con eso Ariana no encontraba la cotización de
-- ECOLAV (16-10) ni el kit de Choquehuanca (17-10): estaban en otro expediente.
--
-- La regla, como la historia clínica del ing. Carlos:
--   · CARPETA = el expediente de postventa del cliente. Uno solo, abierto, sin
--     importar el tipo. Ahí cuelgan cotizaciones, casos, pedidos e historia.
--   · CASO = cada asunto (la atención técnica, o la derivación de Central),
--     con su tipo y su responsable. Varios casos abiertos, una carpeta.
--   · La carpeta la lleva quien recibió lo último (derivación), quien cotiza o
--     confirma, o quien se la queda con el botón. Una gestión suelta de una
--     compañera que ayuda NO le quita la carpeta a nadie: queda con su nombre.
--   · Nunca se junta con un expediente comercial (regla del 01-09).
-- Además: unir expedientes con un botón (antes era SQL a mano), «Del área» en
-- el tablero y «Hoy cubro a…» para cuando falta una compañera.

-- ───────────────────────── 1. El caso sabe de qué derivación nació ──────────
alter table public.atenciones add column if not exists lead_id uuid references public.leads(id) on delete set null;
create index if not exists atenciones_lead_id_idx on public.atenciones (lead_id) where lead_id is not null;

-- ───────────────────────── 2. La carpeta del cliente ───────────────────────
-- La abierta; si hubiera más de una (hasta que se unan), la que tiene trabajo
-- vivo (caso abierto o cotización) y después la más movida.
create or replace function public.carpeta_postventa(p_cuenta uuid, p_prueba boolean default false)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id
    from oportunidades o
    left join perfiles p on p.id = o.comercial_id
   where o.cuenta_id = p_cuenta
     and o.tipo_postventa is not null
     and o.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
     and coalesce(p.es_prueba, false) = coalesce(p_prueba, false)
   order by (exists (select 1 from atenciones a where a.oportunidad_id = o.id and a.cerrado_at is null)
             or exists (select 1 from cotizaciones c where c.oportunidad_id = o.id and c.anulada_at is null)) desc,
            o.updated_at desc
   limit 1
$$;
grant execute on function public.carpeta_postventa(uuid, boolean) to authenticated;

-- ───────────────────────── 3. Un caso técnico por derivación ────────────────
-- Lo que hacía el disparador al nacer el expediente, ahora también cuando la
-- derivación entra a una carpeta que ya existía.
create or replace function public.crear_atencion_de_lead(p_op uuid, p_lead uuid, p_tipo_postventa tipo_postventa, p_asignado uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tipo tipo_atencion;
  v_mensaje text;
  v_equipo uuid;
  v_garantia jsonb;
  v_atencion uuid;
  v_cuenta uuid;
begin
  if p_op is null or p_lead is null or p_tipo_postventa is null then return null; end if;
  if exists (select 1 from atenciones a where a.lead_id = p_lead) then return null; end if;
  select cuenta_id, equipo_id into v_cuenta, v_equipo from oportunidades where id = p_op;

  select l.sugerido_atencion, l.mensaje into v_tipo, v_mensaje from leads l where l.id = p_lead;
  if v_tipo is null then
    v_tipo := case p_tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'despacho' then null
      when 'soporte_tecnico' then 'soporte_tecnico'::tipo_atencion
      when 'seguimiento' then null
      else 'solicitud_mantenimiento'::tipo_atencion
    end;
  end if;
  if p_tipo_postventa::text = 'soporte_tecnico' then
    if v_tipo is distinct from 'capacitacion'::tipo_atencion then v_tipo := 'soporte_tecnico'::tipo_atencion; end if;
  elsif v_tipo in ('soporte_tecnico', 'capacitacion')
     or (v_tipo in ('revision_garantia', 'otro') and p_tipo_postventa::text <> 'garantia') then
    v_tipo := case p_tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'mantenimiento' then 'solicitud_mantenimiento'::tipo_atencion
      when 'mantenimiento_correctivo' then 'solicitud_mantenimiento'::tipo_atencion
      else null
    end;
  end if;
  if v_tipo is null or v_tipo not in ('puesta_en_marcha', 'problema_tecnico', 'soporte_tecnico', 'revision_garantia', 'capacitacion', 'otro') then
    return null;
  end if;

  if v_equipo is null then
    select m.equipo_id into v_equipo from maquinas_mencionadas(v_cuenta, v_mensaje) m order by m.orden limit 1;
  end if;
  if v_equipo is not null then v_garantia := garantia_del_equipo(v_equipo); end if;

  insert into atenciones (
    cuenta_id, equipo_id, tipo, etapa, oportunidad_id, lead_id,
    asignado_a, recibido_por, registrado_at, detalle, es_prueba,
    en_garantia, hizo_preventivo, garantia_verificada_at, garantia_verificada_por, tipo_detalle
  )
  select v_cuenta, v_equipo, v_tipo, 'registro', p_op, p_lead,
         p_asignado, l.recibido_por, now(), l.mensaje, coalesce(l.es_prueba, false),
         (v_garantia->>'en_garantia')::boolean, (v_garantia->>'hizo_preventivo')::boolean,
         case when v_equipo is not null then now() end,
         case when v_equipo is not null then auth.uid() end,
         case when v_tipo = 'otro' then nullif(btrim(substring(split_part(l.mensaje, E'\n', 1) from '^[Oo]tro:(.*)$')), '') end
    from leads l where l.id = p_lead
  returning id into v_atencion;

  if v_atencion is not null and v_equipo is not null then
    insert into atencion_equipos (atencion_id, equipo_id, agregado_por)
    select v_atencion, m.equipo_id, auth.uid()
      from maquinas_mencionadas(v_cuenta, v_mensaje) m
     where m.equipo_id <> v_equipo
    on conflict do nothing;
  end if;
  return v_atencion;
end $$;
revoke all on function public.crear_atencion_de_lead(uuid, uuid, tipo_postventa, uuid) from public, anon, authenticated;
grant execute on function public.crear_atencion_de_lead(uuid, uuid, tipo_postventa, uuid) to postgres, supabase_admin;

create or replace function public.crear_atencion_al_derivar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.lead_id is null or new.tipo_postventa is null then return new; end if;
  if exists (select 1 from atenciones a where a.oportunidad_id = new.id) then return new; end if;
  perform crear_atencion_de_lead(new.id, new.lead_id, new.tipo_postventa, new.comercial_id);
  return new;
end $$;

-- ───────────────────────── 4. Lo que trae una derivación a la carpeta ───────
create or replace function public.sumar_a_carpeta_postventa(p_op uuid, p_lead uuid, p_asignado uuid, p_tipo tipo_postventa)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_codigo text;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  select codigo into v_codigo from leads where id = p_lead;
  -- El tipo de la carpeta dice en qué se está trabajando ahora; cada caso
  -- conserva el suyo. Un «seguimiento» no pisa a uno real.
  update oportunidades
     set tipo_postventa      = case when p_tipo = 'seguimiento' then tipo_postventa else p_tipo end,
         proxima_accion      = 'Atender lo que derivó Central' || coalesce(' (' || v_codigo || ')', ''),
         proxima_accion_at   = v_hoy,
         proxima_accion_hora = null,
         updated_at          = now()
   where id = p_op;
  perform crear_atencion_de_lead(p_op, p_lead, p_tipo, p_asignado);
  perform caso_postventa_pasa_a(p_op, p_asignado);
end $$;
revoke all on function public.sumar_a_carpeta_postventa(uuid, uuid, uuid, tipo_postventa) from public, anon, authenticated;
grant execute on function public.sumar_a_carpeta_postventa(uuid, uuid, uuid, tipo_postventa) to postgres, supabase_admin;

-- ───────────────────────── 5. Ayudar no quita la carpeta ────────────────────
-- 0525 la pasaba con cualquier gestión. Ahora: una gestión solo toma un caso
-- del ÁREA (como la 0333); entre personas la pasan la cotización, la
-- confirmación (0525), la derivación (arriba) y el botón «Me quedo».
create or replace function public.caso_del_area_pasa_a_quien_lo_gestiona()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien uuid := coalesce(to_jsonb(new) ->> 'realizada_por', to_jsonb(new) ->> 'creada_por')::uuid;
begin
  if TG_TABLE_NAME = 'actividades'
     and not exists (select 1 from oportunidades o where o.id = new.oportunidad_id and es_cuenta_area_postventa(o.comercial_id)) then
    return new;
  end if;
  perform caso_postventa_pasa_a(new.oportunidad_id, v_quien);
  return new;
end $$;

-- ───────────────────────── 6. Unir expedientes (botón) ──────────────────────
-- Las cotizaciones no cambian de expediente (0029): salvo al unir dos del
-- MISMO cliente, que no cambia nada de lo impreso.
create or replace function public.bloquear_edicion_cotizacion()
returns trigger
language plpgsql
as $function$
declare
  v_editable   boolean := old.estado = 'borrador' and old.enviada_at is null;
  v_corrigiendo boolean := coalesce(current_setting('app.corrigiendo_cotizacion', true), '') = 'si';
  v_de_ficha   boolean := coalesce(current_setting('app.cliente_de_ficha', true), '') = 'si';
  v_uniendo    boolean := coalesce(current_setting('app.uniendo_expedientes', true), '') = 'si'
                          and new.oportunidad_id is distinct from old.oportunidad_id
                          and (select cuenta_id from public.oportunidades where id = new.oportunidad_id)
                              = (select cuenta_id from public.oportunidades where id = old.oportunidad_id);
begin
  if new.serie is distinct from old.serie
     or (new.oportunidad_id is distinct from old.oportunidad_id and not v_uniendo)
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at
     or (old.correlativo is not null and new.correlativo is distinct from old.correlativo)
     or (old.codigo is not null and new.codigo is distinct from old.codigo)
  then
    raise exception 'La serie, el número y el cliente de una cotización no se cambian.';
  end if;

  if v_uniendo then
    return new;
  end if;

  if v_de_ficha and new.cliente_snapshot is distinct from old.cliente_snapshot then
    if new.cliente_snapshot is distinct from
         coalesce(old.cliente_snapshot, '{}'::jsonb) || snapshot_cliente_actual(new.oportunidad_id, new.facturar_a_cuenta_id)
       or new.subtotal is distinct from old.subtotal
       or new.total is distinct from old.total
       or new.moneda is distinct from old.moneda
       or new.condiciones is distinct from old.condiciones
       or new.vigencia_dias is distinct from old.vigencia_dias
       or new.entrega_lugar is distinct from old.entrega_lugar
       or new.facturar_a_cuenta_id is distinct from old.facturar_a_cuenta_id
    then
      raise exception 'Los datos del cliente de la cotización solo se ponen al día con lo que dice su ficha.';
    end if;
    return new;
  end if;

  if v_corrigiendo then
    if new.cliente_snapshot is distinct from old.cliente_snapshot then
      raise exception 'El cliente de una cotización no se cambia, tampoco corrigiéndola.';
    end if;
    return new;
  end if;

  if v_editable then
    return new;
  end if;

  if new.cliente_snapshot is distinct from old.cliente_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.moneda is distinct from old.moneda
     or new.condiciones is distinct from old.condiciones
     or new.vigencia_dias is distinct from old.vigencia_dias
     or new.entrega_lugar is distinct from old.entrega_lugar
  then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Pida una corrección autorizada si el número no se puede cambiar.';
  end if;

  return new;
end;
$function$;

create or replace function public.unir_expedientes(p_desde uuid, p_hacia uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo     uuid := auth.uid();
  d        oportunidades%rowtype;
  h        oportunidades%rowtype;
  v_masiva boolean := coalesce(current_setting('app.union_masiva', true), '') = 'si';
  v_rango  text[] := array['asignada', 'filtrada', 'seguimiento', 'cotizada', 'potencial'];
  v_etapa  text;
  n_act int; n_cot int; n_lead int; n_at int; n_ped int; n_otros int := 0; tmp int;
  v_nombre text;
  v_tomadas jsonb;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se unen (una frase): lo van a leer las demás.';
  end if;
  if p_desde = p_hacia then raise exception 'Elija otro expediente: es el mismo.'; end if;
  select * into d from oportunidades where id = p_desde for update;
  select * into h from oportunidades where id = p_hacia for update;
  if d.id is null or h.id is null then raise exception 'Uno de los dos expedientes no existe.'; end if;
  if d.cuenta_id is distinct from h.cuenta_id then
    raise exception 'Son de fichas distintas. Si es el mismo cliente, primero se unen las fichas («Unir fichas»).';
  end if;
  if (d.tipo_postventa is null) <> (h.tipo_postventa is null) then
    raise exception 'Un expediente comercial no se une con uno de postventa (regla del ing. Carlos, 01-09).';
  end if;
  if not (coalesce(rol_actual()::text, '') in ('central', 'admin', 'gerencia', 'operaciones')
          or (d.tipo_postventa is not null and coalesce(puede_postventa(), false))) then
    raise exception 'Unir expedientes lo hacen postventa (en los suyos), Central, operaciones o gerencia.';
  end if;
  if d.etapa::text <> all (v_rango) or h.etapa::text <> all (v_rango) then
    raise exception 'Solo se unen expedientes abiertos (uno de los dos ya está cerrado o archivado).';
  end if;

  -- El caso que ya estaba tomado sigue tomado por quien lo tomó (la nota de
  -- abajo no se lo adjudica a quien une: trampa del 15-10, Choquehuanca).
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'por', tomada_por, 'at', tomada_at)), '[]'::jsonb)
    into v_tomadas
    from atenciones where oportunidad_id in (p_desde, p_hacia);

  perform set_config('app.uniendo_expedientes', 'si', true);
  update actividades set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_act = row_count;
  update cotizaciones set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_cot = row_count;
  update leads set oportunidad_id = p_hacia, updated_at = now() where oportunidad_id = p_desde; get diagnostics n_lead = row_count;
  update atenciones set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_at = row_count;
  update atenciones set oportunidad_origen = p_hacia where oportunidad_origen = p_desde;
  update servicios_postventa set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_ped = row_count;
  update cotizacion_decisiones set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update informes_cierre set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update ventas set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update visitas_planta set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update solicitudes_infocorp set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  perform set_config('app.uniendo_expedientes', '', true);

  -- La etapa más avanzada de las dos; la próxima acción más cercana.
  v_etapa := v_rango[greatest(array_position(v_rango, d.etapa::text), array_position(v_rango, h.etapa::text))];
  update oportunidades set
    etapa = v_etapa::etapa_oportunidad,
    proxima_accion = case
      when h.proxima_accion_at is null or (d.proxima_accion_at is not null and d.proxima_accion_at < h.proxima_accion_at)
        then coalesce(d.proxima_accion, h.proxima_accion) else h.proxima_accion end,
    proxima_accion_at = case
      when h.proxima_accion_at is null or (d.proxima_accion_at is not null and d.proxima_accion_at < h.proxima_accion_at)
        then coalesce(d.proxima_accion_at, h.proxima_accion_at) else h.proxima_accion_at end,
    cierre_proyectado = coalesce(h.cierre_proyectado, d.cierre_proyectado),
    cotizacion_proyectada = coalesce(h.cotizacion_proyectada, d.cotizacion_proyectada),
    serie_texto = coalesce(h.serie_texto, d.serie_texto),
    equipo_id = coalesce(h.equipo_id, d.equipo_id),
    updated_at = now()
  where id = p_hacia;

  update oportunidades
     set etapa = 'historico', proxima_accion = null, proxima_accion_at = null, proxima_accion_hora = null,
         cierre_proyectado = null, cotizacion_proyectada = null,
         cerrada_at = coalesce(cerrada_at, now()), updated_at = now()
   where id = p_desde;

  select nombre into v_nombre from perfiles where id = v_yo;
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
  values (p_hacia, 'nota',
          format('%s unió aquí el expediente del %s (%s): %s gestión(es), %s cotización(es), %s contacto(s) de Central, %s caso(s)%s. Motivo: %s',
                 coalesce(v_nombre, 'Administración'),
                 to_char(d.created_at at time zone 'America/Lima', 'DD-MM-YYYY'),
                 coalesce(d.tipo_postventa::text, 'comercial'),
                 n_act, n_cot, n_lead, n_at,
                 case when n_ped > 0 then format(', %s pedido(s)', n_ped) else '' end,
                 btrim(p_motivo)),
          v_yo, now()),
         (p_desde, 'nota',
          format('Expediente unido al del %s por %s: todo lo de aquí está allá. Motivo: %s',
                 to_char(h.created_at at time zone 'America/Lima', 'DD-MM-YYYY'), coalesce(v_nombre, 'Administración'), btrim(p_motivo)),
          v_yo, now());

  update atenciones a
     set tomada_por = (x->>'por')::uuid, tomada_at = (x->>'at')::timestamptz
    from jsonb_array_elements(v_tomadas) x
   where a.id = (x->>'id')::uuid
     and (a.tomada_por is distinct from (x->>'por')::uuid or a.tomada_at is distinct from (x->>'at')::timestamptz);

  if not v_masiva then
    if h.comercial_id is not null and h.comercial_id <> v_yo then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      values (h.comercial_id, 'gestiones_movidas', 'Se unió otro expediente a uno suyo',
              format('%s: %s', coalesce(v_nombre, 'Administración'), btrim(p_motivo)), format('/comercial/oportunidades/%s', p_hacia));
    end if;
    if d.comercial_id is not null and d.comercial_id <> v_yo and d.comercial_id is distinct from h.comercial_id then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      values (d.comercial_id, 'gestiones_movidas', 'Un expediente suyo se unió a otro del mismo cliente',
              format('%s: %s', coalesce(v_nombre, 'Administración'), btrim(p_motivo)), format('/comercial/oportunidades/%s', p_hacia));
    end if;
  end if;

  return format('Listo: %s gestión(es), %s cotización(es), %s contacto(s) y %s caso(s) pasaron al expediente que queda.',
                n_act, n_cot, n_lead, n_at);
end $$;
revoke all on function public.unir_expedientes(uuid, uuid, text) from public, anon;
grant execute on function public.unir_expedientes(uuid, uuid, text) to authenticated;

-- ───────────────────────── 7. «Hoy cubro a…» ───────────────────────────────
create table if not exists public.coberturas_postventa (
  id          uuid primary key default gen_random_uuid(),
  ausente     uuid not null references public.perfiles(id),
  cubre       uuid not null references public.perfiles(id),
  desde       date not null default ((now() at time zone 'America/Lima')::date),
  hasta       date not null default ((now() at time zone 'America/Lima')::date),
  creada_por  uuid references public.perfiles(id),
  created_at  timestamptz not null default now(),
  terminada_at timestamptz,
  constraint coberturas_postventa_fechas check (hasta >= desde),
  constraint coberturas_postventa_distintas check (ausente <> cubre)
);
alter table public.coberturas_postventa enable row level security;
drop policy if exists coberturas_lectura on public.coberturas_postventa;
create policy coberturas_lectura on public.coberturas_postventa for select to authenticated
  using (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false));
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.coberturas_postventa';
    execute 'create trigger zz_sync after insert or update or delete on public.coberturas_postventa for each row execute function sync.capturar(''id'')';
  end if;
end $$;

create or replace function public.cubrir_a(p_ausente uuid, p_hasta date default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo uuid := auth.uid();
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_id uuid;
  v_a perfiles%rowtype;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;
  if not coalesce(puede_postventa(), false) then raise exception 'Cubrir a una compañera es del área de postventa'; end if;
  select * into v_a from perfiles where id = p_ausente;
  if v_a.id is null or not coalesce(v_a.es_postventa, false) or es_cuenta_area_postventa(v_a.id) then
    raise exception 'Solo se cubre a una persona de postventa';
  end if;
  if v_a.id = v_yo then raise exception 'No puede cubrirse a usted misma'; end if;
  if coalesce(v_a.es_prueba, false) <> coalesce(es_cuenta_prueba(), false) then
    raise exception 'Solo se cubre a una persona de postventa';
  end if;
  if coalesce(p_hasta, v_hoy) < v_hoy then raise exception 'La fecha final ya pasó'; end if;
  update coberturas_postventa set terminada_at = now()
   where ausente = p_ausente and terminada_at is null and hasta >= v_hoy;
  insert into coberturas_postventa (ausente, cubre, desde, hasta, creada_por)
  values (p_ausente, v_yo, v_hoy, coalesce(p_hasta, v_hoy), v_yo)
  returning id into v_id;
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  values (p_ausente, 'cobertura',
          format('%s la cubre hasta el %s', (select nombre from perfiles where id = v_yo), to_char(coalesce(p_hasta, v_hoy), 'DD-MM')),
          'Sus casos siguen a su nombre: ella recibe una copia de sus avisos y los ve en su inicio. A su vuelta no hay nada que mover.',
          '/postventa');
  return v_id;
end $$;
grant execute on function public.cubrir_a(uuid, date) to authenticated;

create or replace function public.terminar_cobertura(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Esto lo hace el área de postventa';
  end if;
  update coberturas_postventa set terminada_at = now() where id = p_id and terminada_at is null;
end $$;
grant execute on function public.terminar_cobertura(uuid) to authenticated;

-- Quien cubre recibe una copia de cada aviso de la ausente.
create or replace function public.tg_aviso_a_quien_cubre()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  c record;
begin
  if new.titulo like 'Cubriendo a %' or new.tipo = 'cobertura' then return null; end if;
  for c in
    select cp.cubre, p.nombre
      from coberturas_postventa cp join perfiles p on p.id = cp.ausente
     where cp.ausente = new.user_id and cp.terminada_at is null and v_hoy between cp.desde and cp.hasta
  loop
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (c.cubre, new.tipo, left('Cubriendo a ' || split_part(c.nombre, ' ', 1) || ' · ' || coalesce(new.titulo, ''), 300), new.cuerpo, new.url);
  end loop;
  return null;
end $$;
drop trigger if exists zy_aviso_a_quien_cubre on public.notificaciones;
create trigger zy_aviso_a_quien_cubre after insert on public.notificaciones
  for each row execute function public.tg_aviso_a_quien_cubre();

-- Las funciones internas las llaman otras con distinto dueño (postgres o
-- supabase_admin, según dónde se aplique la migración).
grant execute on function public.caso_postventa_pasa_a(uuid, uuid) to postgres, supabase_admin;

-- ───────────────────────── 8. Las derivaciones entran a la carpeta ─────────
CREATE OR REPLACE FUNCTION public.asignar_lead(p_lead_id uuid, p_comercial_id uuid, p_motivo motivo_asignacion DEFAULT NULL::motivo_asignacion, p_tipo_postventa tipo_postventa DEFAULT NULL::tipo_postventa)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reabre_id uuid;
  v_reabre_cerrada timestamptz;
  v_lead          leads%rowtype;
  v_cuenta_id     uuid;
  v_dueño_actual  uuid;
  v_motivo        motivo_asignacion;
  v_oportunidad_id uuid;
  v_postventa     boolean;
  v_sede          uuid;
  v_celulares     text[];
  v_cascaron      boolean;
  v_doc           text;
  v_en_carpeta    boolean := false;
begin
  -- AUTODERIVADO (0327): postventa se asigna a sí misma el caso que acaba de
  -- registrar, solo cuando la llamada viene de registrar_caso_autoderivado.
  if rol_actual() not in ('central', 'gerencia', 'admin')
     and not (coalesce(current_setting('app.autoderivar', true), '') = 'si'
              and coalesce(puede_postventa(), false)
              and p_comercial_id = auth.uid()) then
    raise exception 'No autorizado para asignar leads';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead is null then
    raise exception 'Lead % no encontrado', p_lead_id;
  end if;
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'El lead % ya fue procesado (estado actual: %)', v_lead.codigo, v_lead.estado;
  end if;
  -- La 0132 manda a esta misma cola las atenciones que registra postventa
  -- (area_destino = 'servicio_tecnico'): estar en `pendiente_triaje` ES la
  -- definición de «esto lo reparte Central». Lo que no le toca repartir sale
  -- de la cola por otro estado y lo frena la comprobación de arriba (0143).
  if v_lead.area_destino not in ('comercial', 'servicio_tecnico') then
    raise exception 'El lead % no es comercial (área: %); no se asigna, se deriva', v_lead.codigo, v_lead.area_destino;
  end if;

  select coalesce(es_postventa, false) into v_postventa from perfiles where id = p_comercial_id;
  if v_postventa and p_tipo_postventa is null then
    raise exception 'Indique de qué clase es el caso: garantía, repuesto o mantenimiento';
  end if;

  -- Una atención de postventa nace sobre una ficha concreta (0132): esa es
  -- la ficha, no una que se parezca. Buscarla otra vez por documento o
  -- teléfono es lo que abre la ficha gemela cuando el cliente no tiene RUC
  -- cargado o el contacto no tiene teléfono (0143).
  if v_lead.cuenta_id is not null then
    select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
      from cuentas c where c.id = v_lead.cuenta_id;
  end if;

  if v_cuenta_id is null then
    -- POR DOCUMENTO PRIMERO. Es el dato que no se comparte, y va por índice.
    if coalesce(nullif(v_lead.num_doc, ''), '') <> '' then
      select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
        from cuentas c
       where c.num_doc = v_lead.num_doc
         and c.tipo_doc <> 'SIN_DOC'
       limit 1;
    end if;

    -- POR TELÉFONO EXACTO, EN DOS TIEMPOS (0214). Primero se juntan los pocos
    -- candidatos que de verdad empataron por número —eso sale del índice de
    -- `contactos`— y RECIÉN sobre esos se pregunta si el empate se respeta
    -- (0144 / 0212). Preguntarlo dentro del `where` sobre `cuentas` obligaba a
    -- correr esa comprobación una vez por cada una de las ~16.000 fichas, y la
    -- derivación se pasaba del tiempo permitido: Central veía «cancelada por
    -- tiempo» al derivar. Medido en el banco de pruebas antes de subirlo.
    --
    -- La ficha con RUC manda sobre la que no lo tiene: es la de verdad, la
    -- otra es el duplicado que dejó un contacto sin documento.
    if v_cuenta_id is null and length(coalesce(v_lead.telefono_normalizado, '')) >= 6 then
      select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
        from (
          select distinct ct.cuenta_id
            from contactos ct
           where ct.telefono_normalizado = v_lead.telefono_normalizado
        ) cand
        join cuentas c on c.id = cand.cuenta_id
       where el_telefono_puede_unir(v_lead.razon_social, v_lead.email, c.id, c.razon_social)
       order by (c.tipo_doc <> 'SIN_DOC') desc, c.created_at
       limit 1;
    end if;

    -- EL MISMO CELULAR ESCRITO DE OTRA FORMA (0201). Solo si arriba no se
    -- encontró nada: acá la alternativa no es «otra ficha», es «ficha nueva».
    -- Un dedazo adelante del número o dos veces el mismo número pegados hacían
    -- que GRUPO SANTA ELENA y NEWREST abrieran ficha por cada consulta, y el
    -- área veía la misma solicitud derivada tres veces (09-09).
    -- Se entra por `contactos` y no por `cuentas`: así el celular de cada
    -- contacto se lee UNA vez (14.122 filas, 200 ms medidos) en vez de una vez
    -- por cada ficha. Y solo se llega acá cuando lo de arriba no encontró nada.
    if v_cuenta_id is null and v_lead.telefono is not null then
      v_celulares := celulares_de(v_lead.telefono);
      if cardinality(v_celulares) > 0 then
        select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
          from (
            select distinct ct.cuenta_id
              from contactos ct
             where celulares_de(ct.telefono) && v_celulares
          ) cand
          join cuentas c on c.id = cand.cuenta_id
         where el_telefono_puede_unir(v_lead.razon_social, v_lead.email, c.id, c.razon_social)
         -- La ficha con RUC manda sobre la que no lo tiene: es la de verdad,
         -- la otra es el duplicado que dejó un contacto sin documento.
         order by (c.tipo_doc <> 'SIN_DOC') desc, c.created_at
         limit 1;
      end if;
    end if;

    -- Una institución con sedes bajo un mismo RUC (ESSALUD, Marina, MINSA)
    -- no es una ficha: es una familia. La sede sale del nombre que dio
    -- Central y, si no existe, se crea con ese nombre (0158).
    if v_cuenta_id is not null then
      v_sede := sede_para_lead(v_cuenta_id, v_lead.razon_social, true);
      if v_sede is not null and v_sede <> v_cuenta_id then
        select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual from cuentas c where c.id = v_sede;
      end if;
    end if;

    -- LA FICHA SE QUEDA CON LA IDENTIDAD BUENA (0212). Encontrarla no bastaba:
    -- si la ficha era el cascarón que abrió un lead de Ads —sin RUC y con un
    -- nombre de pila— el contacto se sumaba ahí y el RUC que SÍ traía este
    -- contacto se perdía. El cliente se quedaba llamándose «Obed» y sin
    -- documento, o sea invisible para cualquier búsqueda por RUC.
    --
    -- Solo se completa lo que falta: una ficha que ya tiene documento no se
    -- toca, y el nombre se reemplaza únicamente si el que había era el
    -- cascarón. Y no se pisa un documento que ya es de otra ficha (uq_cuentas_doc).
    if v_cuenta_id is not null then
      v_doc := regexp_replace(coalesce(v_lead.num_doc, ''), '[^0-9]', '', 'g');
      if length(v_doc) in (8, 11) then
        v_cascaron := ficha_sin_identidad(v_cuenta_id);
        update cuentas c
           set tipo_doc     = (case when length(v_doc) = 11 then 'RUC' else 'DNI' end)::tipo_documento,
               num_doc      = v_doc,
               razon_social = case
                                when v_cascaron and coalesce(nullif(btrim(v_lead.razon_social), ''), '') <> ''
                                  then btrim(v_lead.razon_social)
                                else c.razon_social
                              end,
               updated_at   = now()
         where c.id = v_cuenta_id
           and c.tipo_doc = 'SIN_DOC'
           and c.cuenta_padre_id is null
           and not exists (
             select 1 from cuentas otra
              where otra.num_doc = v_doc
                and otra.tipo_doc <> 'SIN_DOC'
                and otra.cuenta_padre_id is null
           );
      end if;
    end if;
  end if;

  if v_cuenta_id is null then
    -- Cliente nuevo. Si el caso es de postventa la ficha nace SIN dueño
    -- comercial: nadie le vendió todavía y postventa no toma carteras. Queda
    -- para que gerencia o Central la asignen el día que haya venta.
    insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, cartera_desde)
    values (
      (case
        when v_lead.num_doc is null or v_lead.num_doc = '' then 'SIN_DOC'
        when length(v_lead.num_doc) = 11 then 'RUC'
        when length(v_lead.num_doc) = 8 then 'DNI'
        else 'SIN_DOC'
      end)::tipo_documento,
      nullif(v_lead.num_doc, ''),
      coalesce(nullif(v_lead.razon_social, ''), v_lead.nombre_contacto, 'Sin nombre'),
      case when v_postventa then null else p_comercial_id end,
      case when v_postventa then null else now() end
    )
    returning id into v_cuenta_id;
    v_motivo := case when v_postventa then null else coalesce(p_motivo, 'nuevo_lead') end;
  elsif v_postventa then
    -- El cliente ya existe: la cartera se queda como está, sea de quien sea o
    -- de nadie. Esto es lo que arregla la migración.
    v_motivo := null;
  elsif v_dueño_actual is null then
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'nuevo_lead');
  elsif v_dueño_actual = p_comercial_id then
    v_motivo := coalesce(p_motivo, 'cartera_existente');
  else
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'decision_gerencia');
  end if;

  -- 0236: el correo del lead siempre llega a la ficha. Con teléfono, se crea el
  -- contacto o se le completa el correo al que ya existía; sin teléfono, se crea
  -- el contacto solo con el correo. La comercial gestiona con todo lo que llegó.
  if length(coalesce(v_lead.telefono_normalizado, '')) >= 6 then
    if not exists (
      select 1 from contactos ct
      where ct.cuenta_id = v_cuenta_id and ct.telefono_normalizado = v_lead.telefono_normalizado
    ) then
      insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
      values (v_cuenta_id, coalesce(v_lead.nombre_contacto, 'Contacto'), v_lead.telefono, v_lead.email, true);
    elsif nullif(trim(v_lead.email), '') is not null then
      update contactos ct
         set email = trim(v_lead.email)
       where ct.cuenta_id = v_cuenta_id
         and ct.telefono_normalizado = v_lead.telefono_normalizado
         and nullif(trim(ct.email), '') is null;
    end if;
  elsif nullif(trim(v_lead.email), '') is not null and not exists (
    select 1 from contactos ct
    where ct.cuenta_id = v_cuenta_id and lower(trim(ct.email)) = lower(trim(v_lead.email))
  ) then
    insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
    values (
      v_cuenta_id,
      coalesce(nullif(trim(v_lead.nombre_contacto), ''), 'Contacto'),
      null,
      trim(v_lead.email),
      not exists (select 1 from contactos ct where ct.cuenta_id = v_cuenta_id and ct.es_principal)
    );
  end if;

  -- CONSOLIDAR (Carlos, reunión 01-09): si el cliente ya tiene un expediente
  -- ABIERTO con este MISMO comercial, el contacto se suma ahí en vez de
  -- abrir un gemelo. Solo casos comerciales (postventa siempre abre el
  -- suyo: «ese es otro expediente totalmente independiente»), solo
  -- expedientes del CRM (no cascarones del Excel histórico) y solo con
  -- movimiento reciente: un expediente quieto hace un mes es otra consulta.
  -- POSTVENTA TAMBIÉN CONSOLIDA LO SUYO (Carlos, 22-09). Inversiones Huamán
  -- Ruiz pidió el mismo kit de interruptor de puerta el 19 y otra vez el 21:
  -- dos expedientes, media gestión cada uno y el cliente dos días esperando.
  -- «Ese es un error, vamos a consolidarlo». Un caso de postventa se suma al
  -- de postventa del MISMO cliente y del MISMO tipo (repuesto con repuesto)
  -- si sigue abierto y se movió este mes. Con otro tipo, o pasado el mes,
  -- sigue abriendo el suyo; y nunca se funde con un expediente comercial,
  -- que es la parte de la regla del 01-09 que no se toca.
  -- 0530: UNA CARPETA DE POSTVENTA POR CLIENTE (Santos, 17-10). La 0267 solo
  -- juntaba el mismo tipo y del último mes: 73 de 248 expedientes del mes
  -- nacieron teniendo el cliente otro abierto. Ahora toda derivación de
  -- postventa entra a la carpeta abierta del cliente, del tipo que sea; el
  -- asunto nuevo es un caso dentro de ella (sumar_a_carpeta_postventa).
  if p_tipo_postventa is not null then
    v_oportunidad_id := carpeta_postventa(v_cuenta_id, (select coalesce(es_prueba, false) from perfiles where id = p_comercial_id));
    v_en_carpeta := v_oportunidad_id is not null;
  end if;

  if v_oportunidad_id is null and not v_postventa and p_tipo_postventa is null then
    select o.id into v_oportunidad_id
      from oportunidades o
     where o.cuenta_id = v_cuenta_id
       and o.comercial_id = p_comercial_id
       -- Del CRM, o del Excel pero YA trabajado acá (Dance Sologuren, 21-09:
       -- 20 llamadas y 3 cotizaciones en el CRM sobre un expediente del
       -- Excel, y la derivación abrió un gemelo sin cotizaciones). Un
       -- cascarón quieto del Excel sigue sin contar.
       and (o.origen = 'crm'
            or exists (select 1 from actividades a where a.oportunidad_id = o.id and a.tipo <> 'nota' and a.realizada_at >= now() - interval '90 days')
            or exists (select 1 from cotizaciones c where c.oportunidad_id = o.id))
       and o.tipo_postventa is null
       and o.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
       and o.updated_at >= now() - interval '30 days'
     order by o.updated_at desc
     limit 1;
  end if;

  -- VOLVIÓ TRAS EL RECHAZO (Moisés, 16-10, SUITE GENERIS): el cliente rechazado
  -- ayer escribió «Hola» hoy y Central lo derivó a su mismo comercial; como el
  -- expediente estaba cerrado, se abrió un gemelo y la cotización quedó en el
  -- rechazado. Igual que wa_abrir_seguimiento (0408), si este comercial le
  -- cerró como rechazado un expediente en los últimos 30 días, se reabre en
  -- seguimiento en vez de abrir otro. Solo casos comerciales.
  if v_oportunidad_id is null and not v_postventa and p_tipo_postventa is null then
    select o.id, o.cerrada_at into v_reabre_id, v_reabre_cerrada
      from oportunidades o
     where o.cuenta_id = v_cuenta_id
       and o.comercial_id = p_comercial_id
       and o.tipo_postventa is null
       and o.etapa = 'rechazada'
       and (o.origen = 'crm'
            or exists (select 1 from cotizaciones c where c.oportunidad_id = o.id))
       and coalesce(o.cerrada_at, o.updated_at) >= now() - interval '30 days'
     order by coalesce(o.cerrada_at, o.updated_at) desc
     limit 1;
    if v_reabre_id is not null then
      update oportunidades
         set etapa = 'seguimiento',
             cerrada_at = null,
             motivo_rechazo_id = null,
             updated_at = now()
       where id = v_reabre_id;
      insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
      values (
        v_reabre_id,
        'nota',
        format(
          'El cliente volvió a escribir (%s) el %s, después de que el expediente se cerrara como rechazado el %s: se reabre el seguimiento aquí en vez de abrir otro expediente.',
          coalesce(v_lead.codigo, 'contacto nuevo'),
          to_char(coalesce(v_lead.recibido_at, now()) at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
          coalesce(to_char(v_reabre_cerrada at time zone 'America/Lima', 'DD-MM-YYYY'), 'antes')
        ),
        coalesce(auth.uid(), p_comercial_id),
        now()
      );
      v_oportunidad_id := v_reabre_id;
    end if;
  end if;

  if v_oportunidad_id is null then
    insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa, tipo_postventa)
    values (v_cuenta_id, v_lead.id, p_comercial_id, 'asignada', p_tipo_postventa)
    returning id into v_oportunidad_id;
  else
    -- Sumarse cuenta como movimiento: el expediente acaba de recibir un
    -- contacto nuevo del cliente.
    update oportunidades set updated_at = now() where id = v_oportunidad_id;
  end if;

  update leads set
    estado = 'asignado',
    oportunidad_id = v_oportunidad_id,
    cuenta_id = v_cuenta_id,
    asignado_a = p_comercial_id,
    asignado_at = now(),
    asignado_por = auth.uid()
  where id = p_lead_id;

  -- 0530: la derivación que entra a una carpeta abre su caso, le pone la
  -- próxima acción de hoy y la carpeta pasa a quien la recibe.
  if v_en_carpeta then
    perform sumar_a_carpeta_postventa(v_oportunidad_id, p_lead_id, p_comercial_id, p_tipo_postventa);
  end if;

  -- `asignaciones` es el registro de quién se quedó con la cartera. Un caso de
  -- postventa sobre un cliente que ya existía no la mueve, así que no deja
  -- fila: la derivación queda registrada en `leads` y en la oportunidad, que
  -- es donde de verdad ocurrió.
  if v_motivo is not null then
    insert into asignaciones (lead_id, cuenta_id, de_comercial, a_comercial, motivo, decidida_por)
    values (p_lead_id, v_cuenta_id, v_dueño_actual, p_comercial_id, v_motivo, auth.uid());
  end if;

  return v_oportunidad_id;
end;
$function$;

-- ───────────────────────── 9. Tablero «Del área» ───────────────────────────
drop function if exists public.listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer, text, text);
drop function if exists public.contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean, text, text);
CREATE OR REPLACE FUNCTION public.listar_oportunidades(p_q text DEFAULT NULL::text, p_comercial uuid DEFAULT NULL::uuid, p_etapa text DEFAULT NULL::text, p_tipo_cliente text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_solo_crm boolean DEFAULT false, p_orden text DEFAULT 'reciente'::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0, p_rubro text DEFAULT NULL::text, p_origen text DEFAULT NULL::text, p_area boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total bigint;
  v_filas jsonb;
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  -- 0430: «934 020 288», «+51 934020288» o «934-020-288» buscan lo mismo.
  v_tel text := case when nullif(trim(coalesce(p_q, '')), '') !~ '[[:alpha:]]'
                     then nullif(normalizar_telefono(p_q), '') end;
begin
  -- Misma regla que el resto del CRM: backoffice y central ven todo; un
  -- comercial solo su cartera.
  -- 0530: «Del área»: postventa ve los expedientes de postventa de todas.
  if not es_backoffice() and rol_actual() <> 'central' then
    if coalesce(p_area, false) and coalesce(puede_postventa(), false) then
      p_comercial := null;
    else
      p_comercial := auth.uid();
    end if;
  end if;

  with cotiz_ultima as (
    select distinct on (c.oportunidad_id)
           c.oportunidad_id, c.estado_aprobacion
    from cotizaciones c
    order by c.oportunidad_id, c.created_at desc
  ),
  -- Por dónde llegó (0362, Desiré 01-10): el lead que la abrió y los que se
  -- le sumaron después; si alguno lo registró Central, ese manda.
  via_lead as (
    select distinct on (x.oportunidad_id)
           x.oportunidad_id,
           (l.recibido_por is not null) as de_central,
           l.canal::text as canal,
           l.fuente
    from (
      select o2.id as oportunidad_id, o2.lead_id, true as la_abrio
      from oportunidades o2
      where o2.lead_id is not null
      union all
      select l2.oportunidad_id, l2.id, false
      from leads l2
      where l2.oportunidad_id is not null and l2.anulado_at is null
    ) x
    join leads l on l.id = x.lead_id
    order by x.oportunidad_id, (l.recibido_por is not null) desc, x.la_abrio desc, l.created_at desc
  ),
  -- 0430 (Brenda, buzón 10-10): lo buscado también se busca en los
  -- contactos del cliente (teléfono, correo, nombre de la persona) y en los
  -- leads de la oportunidad (lo que Central o la campaña anotó al derivar).
  -- Se arma una sola vez, y solo si hay algo escrito.
  coincide_cuenta as (
    select ct.cuenta_id from contactos ct
    where v_q is not null
      and ((v_tel is not null and length(v_tel) >= 6 and ct.telefono_normalizado like '%' || v_tel || '%')
           or ct.email ilike '%' || v_q || '%'
           or ct.nombre ilike '%' || v_q || '%')
  ),
  coincide_lead as (
    select l.id, l.oportunidad_id, l.cuenta_id from leads l
    where v_q is not null and l.anulado_at is null
      and ((v_tel is not null and length(v_tel) >= 6 and l.telefono_normalizado like '%' || v_tel || '%')
           or l.email ilike '%' || v_q || '%'
           or l.nombre_contacto ilike '%' || v_q || '%')
  ),
  base as (
    select o.id, o.etapa, o.intencion, o.monto_estimado, o.moneda,
           o.proxima_accion, o.proxima_accion_at, o.updated_at, o.origen,
           c.id as cuenta_id, c.razon_social, c.tipo_doc,
           case
             when c.tipo_doc = 'RUC' then true
             when c.tipo_doc in ('DNI', 'CE') then false
             else es_razon_social_empresa(c.razon_social)
           end as es_empresa,
           cu.estado_aprobacion as cotizacion_estado,
           case
             when v.oportunidad_id is null then 'propia'
             when v.de_central then 'central'
             else 'campana'
           end as origen_lead,
           -- «whatsapp · meta_ads», «formulario_web · google_ads», «llamada»…
           -- para el title de la pastilla: el detalle sin tener que entrar.
           nullif(concat_ws(' · ', v.canal, v.fuente), '') as via
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join cotiz_ultima cu on cu.oportunidad_id = o.id
    left join via_lead v on v.oportunidad_id = o.id
    where (p_comercial is null or o.comercial_id = p_comercial)
      and (not coalesce(p_area, false) or o.tipo_postventa is not null)
      and (p_etapa is null or o.etapa = p_etapa::etapa_oportunidad)
      and (coalesce(p_etapa, '') = 'historico' or o.etapa <> 'historico')
      and (not p_solo_crm or o.origen = 'crm')
      and (p_desde is null or o.proxima_accion_at >= p_desde)
      and (p_hasta is null or o.proxima_accion_at <= p_hasta)
      and (
        p_tipo_cliente is null
        or (p_tipo_cliente = 'empresa' and (
              c.tipo_doc = 'RUC' or (c.tipo_doc = 'SIN_DOC' and es_razon_social_empresa(c.razon_social))
            ))
        or (p_tipo_cliente = 'persona' and (
              c.tipo_doc in ('DNI', 'CE')
              or (c.tipo_doc = 'SIN_DOC' and not es_razon_social_empresa(c.razon_social))
            ))
      )
      -- El rubro de la cuenta: un id del catálogo, o «sin» para las que no tienen.
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      -- Origen (0362): derivada por Central, campaña/web, o propia.
      and (
        p_origen is null
        or (p_origen = 'central' and v.de_central)
        or (p_origen = 'campana' and v.oportunidad_id is not null and not v.de_central)
        or (p_origen = 'propia' and v.oportunidad_id is null)
      )
      and (
        v_q is null
        or c.razon_social ilike '%' || v_q || '%'
        or c.nombre_comercial ilike '%' || v_q || '%'
        or c.num_doc ilike '%' || v_q || '%'
        or c.id in (select cuenta_id from coincide_cuenta)
        or c.id in (select cuenta_id from coincide_lead where cuenta_id is not null)
        or o.id in (select oportunidad_id from coincide_lead where oportunidad_id is not null)
        or o.lead_id in (select id from coincide_lead)
      )
  ),
  pagina as (
    select * from base
    order by
      case when p_orden = 'monto' then coalesce(monto_estimado, 0) end desc,
      case when p_orden = 'proxima_accion' then proxima_accion_at end asc nulls last,
      case when p_orden = 'cuenta' then razon_social end asc,
      updated_at desc
    limit p_limite offset p_offset
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(to_jsonb(pagina)) from pagina), '[]'::jsonb)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end $function$;
CREATE OR REPLACE FUNCTION public.contar_oportunidades_por_etapa(p_q text DEFAULT NULL::text, p_comercial uuid DEFAULT NULL::uuid, p_tipo_cliente text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_solo_crm boolean DEFAULT false, p_rubro text DEFAULT NULL::text, p_origen text DEFAULT NULL::text, p_area boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  -- 0430: «934 020 288», «+51 934020288» o «934-020-288» buscan lo mismo.
  v_tel text := case when nullif(trim(coalesce(p_q, '')), '') !~ '[[:alpha:]]'
                     then nullif(normalizar_telefono(p_q), '') end;
  v_resultado jsonb;
begin
  -- 0530: «Del área»: postventa ve los expedientes de postventa de todas.
  if not es_backoffice() and rol_actual() <> 'central' then
    if coalesce(p_area, false) and coalesce(puede_postventa(), false) then
      p_comercial := null;
    else
      p_comercial := auth.uid();
    end if;
  end if;

  -- Mismo `via_lead` que listar_oportunidades (0362): si no, el número de la
  -- pestaña «Asignada» no coincide con las filas al filtrar por origen.
  with via_lead as (
    select distinct on (x.oportunidad_id)
           x.oportunidad_id,
           (l.recibido_por is not null) as de_central
    from (
      select o2.id as oportunidad_id, o2.lead_id, true as la_abrio
      from oportunidades o2
      where o2.lead_id is not null
      union all
      select l2.oportunidad_id, l2.id, false
      from leads l2
      where l2.oportunidad_id is not null and l2.anulado_at is null
    ) x
    join leads l on l.id = x.lead_id
    order by x.oportunidad_id, (l.recibido_por is not null) desc, x.la_abrio desc, l.created_at desc
  ),
  -- 0430 (Brenda, buzón 10-10): lo buscado también se busca en los
  -- contactos del cliente (teléfono, correo, nombre de la persona) y en los
  -- leads de la oportunidad (lo que Central o la campaña anotó al derivar).
  -- Se arma una sola vez, y solo si hay algo escrito.
  coincide_cuenta as (
    select ct.cuenta_id from contactos ct
    where v_q is not null
      and ((v_tel is not null and length(v_tel) >= 6 and ct.telefono_normalizado like '%' || v_tel || '%')
           or ct.email ilike '%' || v_q || '%'
           or ct.nombre ilike '%' || v_q || '%')
  ),
  coincide_lead as (
    select l.id, l.oportunidad_id, l.cuenta_id from leads l
    where v_q is not null and l.anulado_at is null
      and ((v_tel is not null and length(v_tel) >= 6 and l.telefono_normalizado like '%' || v_tel || '%')
           or l.email ilike '%' || v_q || '%'
           or l.nombre_contacto ilike '%' || v_q || '%')
  )
  select coalesce(jsonb_object_agg(etapa::text, n), '{}'::jsonb) into v_resultado
  from (
    select o.etapa, count(*) as n
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join via_lead v on v.oportunidad_id = o.id
    where (p_comercial is null or o.comercial_id = p_comercial)
      and (not coalesce(p_area, false) or o.tipo_postventa is not null)
      and (not p_solo_crm or o.origen = 'crm')
      and (p_desde is null or o.proxima_accion_at >= p_desde)
      and (p_hasta is null or o.proxima_accion_at <= p_hasta)
      and (
        p_tipo_cliente is null
        or (p_tipo_cliente = 'empresa' and (
              c.tipo_doc = 'RUC' or (c.tipo_doc = 'SIN_DOC' and es_razon_social_empresa(c.razon_social))
            ))
        or (p_tipo_cliente = 'persona' and (
              c.tipo_doc in ('DNI', 'CE')
              or (c.tipo_doc = 'SIN_DOC' and not es_razon_social_empresa(c.razon_social))
            ))
      )
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      and (
        p_origen is null
        or (p_origen = 'central' and v.de_central)
        or (p_origen = 'campana' and v.oportunidad_id is not null and not v.de_central)
        or (p_origen = 'propia' and v.oportunidad_id is null)
      )
      and (
        v_q is null
        or c.razon_social ilike '%' || v_q || '%'
        or c.nombre_comercial ilike '%' || v_q || '%'
        or c.num_doc ilike '%' || v_q || '%'
        or c.id in (select cuenta_id from coincide_cuenta)
        or c.id in (select cuenta_id from coincide_lead where cuenta_id is not null)
        or o.id in (select oportunidad_id from coincide_lead where oportunidad_id is not null)
        or o.lead_id in (select id from coincide_lead)
      )
    group by o.etapa
  ) t;

  return v_resultado;
end $function$;
revoke all on function public.listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer, text, text, boolean) from public, anon;
revoke all on function public.contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean, text, text, boolean) from public, anon;
grant execute on function public.listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer, text, text, boolean) to authenticated, service_role;
grant execute on function public.contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean, text, text, boolean) to authenticated, service_role;
