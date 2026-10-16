-- ════════════════════════════════════════════════════════════════════════
-- 0513 · Registro de acciones, «Deshacer este clic» y fichas sueltas
--
-- Santos, 16-10, después del caso de Ariana (un clic que verificó la garantía
-- con la máquina equivocada y hubo que deshacerlo a mano en la base): «los
-- usuarios cometen errores… esas acciones deberían estar registradas en la
-- vista de administrador, para que el administrador pueda deshacerlo… el CRM
-- tiene que funcionar solo, sin necesitar de la IA».
--
-- Tres piezas:
--
-- 1. REGISTRO DE ACCIONES. Cada cambio que hace una PERSONA (con sesión) en
--    las tablas donde se trabaja queda anotado: qué tabla, qué fila, qué
--    campos, cómo estaban y cómo quedaron. Lo que hacen los procesos
--    automáticos (sincronía, webhooks, tareas programadas) no se anota: no son
--    errores de nadie y llenarían la lista.
--    Todo lo que pasa en una misma transacción comparte «lote»: un clic = un
--    lote, aunque toque varias tablas (unir dos fichas mueve expedientes,
--    contactos y casos de una vez).
--
-- 2. DESHACER UN CLIC (admin, gerencia y operaciones). Revierte el lote entero,
--    de lo más nuevo a lo más viejo, solo si nadie volvió a tocar esos mismos
--    campos después; si los tocó, no se pisa: se explica qué cambió y quién.
--    Lo creado se borra solo si nada depende de él; lo borrado se vuelve a
--    crear. La persona que hizo el clic recibe un aviso de que se deshizo.
--
-- 3. FICHAS SUELTAS. Fichas sin expedientes, casos, máquinas, prospectos,
--    cierres, pedidos ni cotizaciones (pueden tener contactos o notas). Se
--    archivan: salen de las listas de clientes, no se borran, y vuelven solas
--    si les entra un expediente, un caso o un prospecto.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. El registro ──────────────────────────────────────────────────────
create table if not exists public.registro_acciones (
  id              bigserial primary key,
  lote            bigint not null,
  tabla           text not null,
  fila_id         uuid not null,
  operacion       text not null check (operacion in ('crear', 'cambiar', 'borrar')),
  campos          text[] not null default '{}',
  antes           jsonb,
  despues         jsonb,
  cuenta_id       uuid,
  quien           uuid not null,
  cuando          timestamptz not null default now(),
  revierte_lote   bigint,
  deshecha_at     timestamptz,
  deshecha_por    uuid,
  deshecha_motivo text
);
create index if not exists registro_acciones_cuando on public.registro_acciones (cuando desc);
create index if not exists registro_acciones_lote on public.registro_acciones (lote);
create index if not exists registro_acciones_fila on public.registro_acciones (tabla, fila_id, id);
create index if not exists registro_acciones_quien on public.registro_acciones (quien, cuando desc);

alter table public.registro_acciones enable row level security;
drop policy if exists registro_acciones_ver on public.registro_acciones;
create policy registro_acciones_ver on public.registro_acciones for select to authenticated
  using ((select rol_actual())::text in ('admin', 'gerencia', 'operaciones'));
revoke insert, update, delete on public.registro_acciones from anon, authenticated;
grant select on public.registro_acciones to authenticated;

create or replace function public.registrar_accion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien  uuid := auth.uid();
  v_viejo  jsonb;
  v_nuevo  jsonb;
  v_campos text[];
  v_antes  jsonb;
  v_desp   jsonb;
  v_fila   jsonb;
  v_cuenta uuid;
  v_op     text;
begin
  -- Solo personas. Los procesos automáticos no se anotan.
  if v_quien is null then return null; end if;
  begin
    if tg_op = 'UPDATE' then
      v_viejo := to_jsonb(old);
      v_nuevo := to_jsonb(new);
      select coalesce(array_agg(n.key order by n.key), '{}') into v_campos
        from jsonb_each(v_nuevo) n
       where n.key not in ('updated_at')
         and n.value is distinct from v_viejo -> n.key;
      if cardinality(v_campos) = 0 then return null; end if;
      select jsonb_object_agg(k, v_viejo -> k), jsonb_object_agg(k, v_nuevo -> k)
        into v_antes, v_desp
        from unnest(v_campos) k;
      v_fila := v_nuevo;
      v_op := 'cambiar';
    elsif tg_op = 'INSERT' then
      v_fila := to_jsonb(new);
      v_desp := v_fila;
      v_op := 'crear';
    else
      v_fila := to_jsonb(old);
      v_antes := v_fila;
      v_op := 'borrar';
    end if;

    v_cuenta := case when tg_table_name = 'cuentas' then (v_fila ->> 'id')::uuid
                     else nullif(v_fila ->> 'cuenta_id', '')::uuid end;
    if v_cuenta is null and v_fila ? 'oportunidad_id' then
      select cuenta_id into v_cuenta from oportunidades where id = nullif(v_fila ->> 'oportunidad_id', '')::uuid;
    end if;

    insert into registro_acciones (lote, tabla, fila_id, operacion, campos, antes, despues, cuenta_id, quien, revierte_lote)
    values (txid_current(), tg_table_name, (v_fila ->> 'id')::uuid, v_op, coalesce(v_campos, '{}'), v_antes, v_desp, v_cuenta, v_quien,
            nullif(current_setting('app.deshaciendo_lote', true), '')::bigint);
  exception when others then
    -- El registro nunca puede frenar el trabajo de nadie.
    raise warning 'registrar_accion (%): %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['atenciones', 'oportunidades', 'leads', 'asignaciones', 'contactos', 'cuentas',
                           'equipos_instalados', 'servicios_postventa', 'visitas_planta', 'actividades',
                           'informes_cierre', 'aperturas_llamada'] loop
    execute format('drop trigger if exists zy_registro_acciones on public.%I', t);
    execute format('create trigger zy_registro_acciones after insert or update or delete on public.%I for each row execute function public.registrar_accion()', t);
  end loop;
end $$;

-- ── 2. Deshacer un clic (el lote entero) ─────────────────────────────────
create or replace function public.deshacer_lote(p_lote bigint, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo      uuid := auth.uid();
  v_nombre  text;
  a         registro_acciones%rowtype;
  v_actual  jsonb;
  v_cols    text[];
  v_choque  text[];
  v_otro    record;
  v_dep     record;
  v_n       integer;
  v_hechas  integer := 0;
  v_autores uuid[] := '{}';
  v_sql     text;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;
  if coalesce(rol_actual()::text, '') not in ('admin', 'gerencia', 'operaciones') then
    raise exception 'Deshacer lo pueden hacer administración, gerencia u operaciones. Pídaselo a ellos.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se deshace (mínimo una frase): queda en el registro y se le avisa a quien lo hizo.';
  end if;
  if not exists (select 1 from registro_acciones where lote = p_lote) then
    raise exception 'Ese clic no está en el registro.';
  end if;
  if not exists (select 1 from registro_acciones where lote = p_lote and deshecha_at is null) then
    raise exception 'Ese clic ya se deshizo.';
  end if;

  perform set_config('app.deshaciendo_lote', p_lote::text, true);

  for a in select * from registro_acciones where lote = p_lote and deshecha_at is null order by id desc loop
    execute format('select to_jsonb(t) from public.%I t where id = $1', a.tabla) into v_actual using a.fila_id;

    if a.operacion = 'cambiar' then
      if v_actual is null then
        raise exception 'No se puede deshacer: lo que se cambió ya no existe (se borró después).';
      end if;
      -- Solo los campos que se pueden escribir (las columnas calculadas no).
      select coalesce(array_agg(k), '{}') into v_cols
        from unnest(a.campos) k
        join information_schema.columns c
          on c.table_schema = 'public' and c.table_name = a.tabla and c.column_name = k
       where c.is_generated = 'NEVER' and c.is_updatable = 'YES';
      select coalesce(array_agg(k), '{}') into v_choque
        from unnest(v_cols) k where (v_actual -> k) is distinct from (a.despues -> k);
      if cardinality(v_choque) > 0 then
        select p.nombre, r.cuando into v_otro
          from registro_acciones r left join perfiles p on p.id = r.quien
         where r.tabla = a.tabla and r.fila_id = a.fila_id and r.id > a.id and r.campos && v_choque
         order by r.id desc limit 1;
        raise exception 'No se puede deshacer: después de este clic % volvió a cambiar lo mismo (%). Deshaga primero ese clic, que es más nuevo, o corríjalo a mano.',
          coalesce(v_otro.nombre || ' (' || to_char(v_otro.cuando at time zone 'America/Lima', 'DD/MM HH24:MI') || ')', 'otra persona o un proceso automático'),
          array_to_string(array(select replace(x, '_', ' ') from unnest(v_choque) x), ', ');
      end if;
      if cardinality(v_cols) > 0 then
        select string_agg(format('%I = r.%I', k, k), ', ') into v_sql from unnest(v_cols) k;
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2', a.tabla, v_sql, a.tabla)
          using a.antes, a.fila_id;
      end if;

    elsif a.operacion = 'crear' then
      if v_actual is not null then
        -- ¿Algo depende de lo que se creó? Entonces no se borra a ciegas.
        for v_dep in
          select cl.relname as tabla_hija, att.attname as col
            from pg_constraint k
            join pg_class cl on cl.oid = k.conrelid
            join pg_attribute att on att.attrelid = k.conrelid and att.attnum = k.conkey[1]
           where k.contype = 'f' and k.confrelid = format('public.%I', a.tabla)::regclass and cardinality(k.conkey) = 1
        loop
          -- Lo creado en el MISMO clic ya se deshizo (se recorre de lo más nuevo a lo más viejo).
          execute format('select count(*) from public.%I where %I = $1', v_dep.tabla_hija, v_dep.col) into v_n using a.fila_id;
          if v_n > 0 then
            raise exception 'No se puede deshacer: lo que se creó ya tiene % registro(s) que dependen de él (%). Deshaga primero esos clics o resuélvalo a mano.', v_n, v_dep.tabla_hija;
          end if;
        end loop;
        execute format('delete from public.%I where id = $1', a.tabla) using a.fila_id;
      end if;

    else -- borrar: se vuelve a crear tal cual estaba
      if v_actual is null then
        select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_sql
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = a.tabla and c.is_generated = 'NEVER' and a.antes ? c.column_name;
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', a.tabla, v_sql, v_sql, a.tabla)
          using a.antes;
      end if;
    end if;

    v_hechas := v_hechas + 1;
    if a.quien <> v_yo and not (a.quien = any(v_autores)) then v_autores := v_autores || a.quien; end if;
  end loop;

  update registro_acciones
     set deshecha_at = now(), deshecha_por = v_yo, deshecha_motivo = btrim(p_motivo)
   where lote = p_lote and deshecha_at is null;

  select nombre into v_nombre from perfiles where id = v_yo;
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select u, 'accion_deshecha', 'Se deshizo un cambio que usted hizo',
         format('%s lo deshizo: %s', coalesce(v_nombre, 'Administración'), btrim(p_motivo)), null
    from unnest(v_autores) u;

  return format('Listo: se deshizo el clic (%s cambio(s)).%s', v_hechas,
                case when cardinality(v_autores) > 0 then ' Se le avisó a quien lo hizo.' else '' end);
end;
$$;
revoke all on function public.deshacer_lote(bigint, text) from public, anon;
grant execute on function public.deshacer_lote(bigint, text) to authenticated;

-- ── 3. Fichas sueltas ────────────────────────────────────────────────────
alter table public.cuentas add column if not exists archivada_at timestamptz;
alter table public.cuentas add column if not exists archivada_por uuid;
alter table public.cuentas add column if not exists archivada_motivo text;

create or replace function public.es_ficha_suelta(p_cuenta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from oportunidades where cuenta_id = p_cuenta)
     and not exists (select 1 from atenciones where cuenta_id = p_cuenta)
     and not exists (select 1 from equipos_instalados where cuenta_id = p_cuenta)
     and not exists (select 1 from leads where cuenta_id = p_cuenta)
     and not exists (select 1 from informes_cierre where cuenta_id = p_cuenta)
     and not exists (select 1 from servicios_postventa where cuenta_id = p_cuenta)
     and not exists (select 1 from cotizaciones_historicas where cuenta_id = p_cuenta)
     and not exists (select 1 from cuentas h where h.cuenta_padre_id = p_cuenta);
$$;

create or replace function public.fichas_sueltas(p_archivadas boolean default false)
returns table (
  id uuid, razon_social text, tipo_doc text, num_doc text, comercial text, creada date,
  contactos integer, notas text, archivada_at timestamptz, archivada_por text, archivada_motivo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(rol_actual()::text, '') not in ('admin', 'gerencia', 'operaciones') then
    raise exception 'Esta lista es de administración, gerencia y operaciones.';
  end if;
  return query
  select c.id, c.razon_social, c.tipo_doc::text, c.num_doc, p.nombre, (c.created_at at time zone 'America/Lima')::date,
         (select count(*)::integer from contactos k where k.cuenta_id = c.id),
         left(c.notas, 240), c.archivada_at, pa.nombre, c.archivada_motivo
    from cuentas c
    left join perfiles p on p.id = c.comercial_id
    left join perfiles pa on pa.id = c.archivada_por
   where c.fusionada_en is null
     and (case when p_archivadas then c.archivada_at is not null else c.archivada_at is null end)
     and es_ficha_suelta(c.id)
   order by c.razon_social;
end;
$$;
grant execute on function public.fichas_sueltas(boolean) to authenticated;

create or replace function public.archivar_ficha(p_cuenta uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_c cuentas%rowtype;
begin
  if coalesce(rol_actual()::text, '') not in ('admin', 'gerencia', 'operaciones') then
    raise exception 'Archivar fichas lo hacen administración, gerencia u operaciones.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escriba por qué se archiva (por ejemplo: «duplicada sin datos», «proveedor, no es cliente»).';
  end if;
  select * into v_c from cuentas where id = p_cuenta for update;
  if v_c.id is null then raise exception 'Esa ficha no existe.'; end if;
  if v_c.fusionada_en is not null then raise exception 'Esa ficha ya está unida a otra: no hace falta archivarla.'; end if;
  if not es_ficha_suelta(p_cuenta) then
    raise exception 'No se archiva: % tiene expedientes, casos, máquinas, prospectos, cierres o cotizaciones. Si es un duplicado, únala a la ficha correcta.', v_c.razon_social;
  end if;
  update cuentas set archivada_at = now(), archivada_por = auth.uid(), archivada_motivo = btrim(p_motivo) where id = p_cuenta;
  return format('%s quedó archivada. Ya no sale en las listas de clientes; se restaura desde «Fichas sueltas → Archivadas».', v_c.razon_social);
end;
$$;
grant execute on function public.archivar_ficha(uuid, text) to authenticated;

create or replace function public.restaurar_ficha(p_cuenta uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_nombre text;
begin
  if coalesce(rol_actual()::text, '') not in ('admin', 'gerencia', 'operaciones') then
    raise exception 'Restaurar fichas lo hacen administración, gerencia u operaciones.';
  end if;
  update cuentas set archivada_at = null, archivada_por = null, archivada_motivo = null
   where id = p_cuenta and archivada_at is not null
  returning razon_social into v_nombre;
  if v_nombre is null then raise exception 'Esa ficha no está archivada.'; end if;
  return format('%s volvió a las listas de clientes.', v_nombre);
end;
$$;
grant execute on function public.restaurar_ficha(uuid) to authenticated;

-- Si a una ficha archivada le entra trabajo, vuelve sola: archivar es sacarla
-- de la vista, no cerrarle la puerta a un cliente que vuelve a escribir.
create or replace function public.desarchivar_ficha_con_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cuenta_id is not null then
    update cuentas set archivada_at = null, archivada_por = null,
           archivada_motivo = null
     where id = new.cuenta_id and archivada_at is not null;
  end if;
  return null;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['oportunidades', 'atenciones', 'leads', 'equipos_instalados', 'informes_cierre', 'servicios_postventa'] loop
    execute format('drop trigger if exists zw_desarchivar_ficha on public.%I', t);
    execute format('create trigger zw_desarchivar_ficha after insert or update of cuenta_id on public.%I for each row execute function public.desarchivar_ficha_con_movimiento()', t);
  end loop;
end $$;

-- Las listas de clientes no muestran las archivadas (parche sobre la definición
-- viva de listar_clientes: un solo fragmento, se comprueba que esté).
do $$
declare v_def text := pg_get_functiondef('public.listar_clientes'::regproc);
begin
  if position('c.archivada_at is null' in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, 'and c.fusionada_en is null', ''))) / length('and c.fusionada_en is null') <> 1 then
      raise exception 'listar_clientes cambió: revisar el parche de archivadas a mano';
    end if;
    execute replace(v_def, 'and c.fusionada_en is null', 'and c.fusionada_en is null and c.archivada_at is null');
  end if;
end $$;
