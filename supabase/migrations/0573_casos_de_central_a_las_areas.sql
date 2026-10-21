-- ═══════════════════════════════════════════════════════════════════════════
-- 0573 · CASOS DE CENTRAL A FINANZAS Y FACTURACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
-- Santos, 21-10: «Central debería poder derivar casos a Finanzas, Facturación
-- y RR. HH.». Vistas aprobadas el mismo día («lo urgente sí es a los otros,
-- proceder»). RR. HH. es Yasmin (recursoshumanos@efameinsa.com) pero todavía
-- no tiene cuenta en el CRM: el área queda prevista y la base no deja derivar
-- a RR. HH. hasta que haya alguien que lo reciba.
--
-- Hasta hoy Central tenía dos timbres sueltos: la «Urgencia a Finanzas» de
-- Sus pedidos (0298, solo sobre un pedido liberado) y «Avisos de Central»
-- (0171, solo informa). Ninguno deja contestar. El caso es una conversación
-- con dueño: Central lo abre, el área lo toma, contesta o pide un dato, y
-- Central lo da por cerrado. Cada paso queda con nombre y hora.
--
-- Estados: nuevo → tomado → respondido → cerrado, más «esperando_central»
-- cuando el área pide un dato. El urgente vence a las 2 horas; si nadie lo
-- tomó, el temporizador de la VM vuelve a sonar en el área y avisa a Central
-- y a gerencia (casos_central_vencidos). Un respondido que Central no cierra
-- se cierra solo a los 2 días.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.casos_central (
  id                 uuid primary key default gen_random_uuid(),
  -- CC-0001: correlativo calculado al crear (no secuencia: la base local
  -- corre sus secuencias +1 000 000 y el código se vería distinto).
  numero             int not null,
  area               text not null check (area in ('finanzas', 'facturacion', 'rrhh')),
  motivo             text not null check (length(btrim(motivo)) between 3 and 80),
  mensaje            text not null check (length(btrim(mensaje)) between 5 and 4000),
  urgente            boolean not null default false,
  vence_at           timestamptz,
  cuenta_id          uuid references public.cuentas (id) on delete set null,
  servicio_id        uuid references public.servicios_postventa (id) on delete set null,
  -- Cómo se llamaba el cliente al derivar: la ficha puede unirse o renombrarse.
  cliente_texto      text,
  adjuntos           jsonb not null default '[]'::jsonb,
  estado             text not null default 'nuevo'
                       check (estado in ('nuevo', 'tomado', 'esperando_central', 'respondido', 'cerrado')),
  creado_por         uuid not null references public.perfiles (id),
  tomado_por         uuid references public.perfiles (id),
  tomado_at          timestamptz,
  respuesta          text,
  respondido_por     uuid references public.perfiles (id),
  respondido_at      timestamptz,
  cerrado_por        uuid references public.perfiles (id),
  cerrado_at         timestamptz,
  escalado_at        timestamptz,
  avisos_n           int not null default 1,
  ultimo_aviso_at    timestamptz not null default now(),
  es_prueba          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists casos_central_numero_uq on public.casos_central (numero);
create index if not exists casos_central_abiertos_idx on public.casos_central (area, created_at desc) where estado <> 'cerrado';
create index if not exists casos_central_servicio_idx on public.casos_central (servicio_id) where servicio_id is not null;
create index if not exists casos_central_cuenta_idx on public.casos_central (cuenta_id) where cuenta_id is not null;

comment on table public.casos_central is
  'Casos que Central deriva a Finanzas, Facturación (y RR. HH. cuando tenga cuenta), con dueño, plazo y respuesta (0573, Santos 21-10).';

create table if not exists public.casos_central_pasos (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos_central (id) on delete cascade,
  -- null = lo hizo el sistema (venció, se cerró solo).
  autor_id    uuid references public.perfiles (id),
  tipo        text not null check (tipo in ('derivado', 'tomado', 'pide_dato', 'contesta', 'respondido', 'cerrado', 'insiste', 'vencido')),
  texto       text,
  adjuntos    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists casos_central_pasos_caso_idx on public.casos_central_pasos (caso_id, created_at);

-- ── Quién es quién ──────────────────────────────────────────────────────
-- El lado de Central: Central, operaciones y el backoffice (gerencia/admin).
create or replace function public.deriva_casos_central()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select rol_actual() in ('central'::rol_usuario, 'operaciones'::rol_usuario) or coalesce(es_backoffice(), false);
$$;

-- El lado del área: la cuenta de Finanzas para 'finanzas', la de Facturación
-- (Contabilidad) para 'facturacion'. Gerencia y admin pueden atender ambos.
create or replace function public.atiende_casos_central(p_area text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(es_backoffice(), false)
      or (p_area = 'finanzas' and rol_actual() = 'finanzas'::rol_usuario)
      or (p_area = 'facturacion' and rol_actual() = 'facturacion'::rol_usuario);
$$;

revoke all on function public.deriva_casos_central() from public;
revoke all on function public.atiende_casos_central(text) from public;
grant execute on function public.deriva_casos_central() to authenticated;
grant execute on function public.atiende_casos_central(text) to authenticated;

alter table public.casos_central enable row level security;
alter table public.casos_central_pasos enable row level security;

-- Se lee: todo el lado de Central, y cada área lo suyo. Lo de práctica solo
-- entre cuentas de práctica. Sin políticas de escritura: todo entra por las
-- funciones, que validan el paso.
drop policy if exists casos_central_lectura on public.casos_central;
create policy casos_central_lectura on public.casos_central for select to authenticated
  using (
    es_prueba = coalesce(es_cuenta_prueba(), false)
    and (deriva_casos_central() or atiende_casos_central(area))
  );

drop policy if exists casos_central_pasos_lectura on public.casos_central_pasos;
create policy casos_central_pasos_lectura on public.casos_central_pasos for select to authenticated
  using (exists (select 1 from public.casos_central c where c.id = caso_id));

revoke all on public.casos_central from anon;
revoke all on public.casos_central_pasos from anon;
grant select on public.casos_central to authenticated;
grant select on public.casos_central_pasos to authenticated;
grant all on public.casos_central to service_role;
grant all on public.casos_central_pasos to service_role;

-- La réplica nube ↔ local (piloto 24-09): las tablas nuevas no la heredan.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.casos_central';
    execute 'create trigger zz_sync after insert or update or delete on public.casos_central for each row execute function sync.capturar(''id'')';
    execute 'drop trigger if exists zz_sync on public.casos_central_pasos';
    execute 'create trigger zz_sync after insert or update or delete on public.casos_central_pasos for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- Lo que las acciones necesitan para armar los avisos.
create or replace function public._caso_central_resumen(p_caso uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'codigo', 'CC-' || lpad(c.numero::text, 4, '0'),
    'area', c.area,
    'motivo', c.motivo,
    'urgente', c.urgente,
    'vence_at', c.vence_at,
    'cliente', coalesce(c.cliente_texto, 'Sin cliente'),
    'estado', c.estado,
    'creado_por', c.creado_por,
    'tomado_por', c.tomado_por,
    'es_prueba', c.es_prueba,
    'avisos_n', c.avisos_n
  )
  from casos_central c where c.id = p_caso;
$$;
revoke all on function public._caso_central_resumen(uuid) from public;

-- ── Central abre el caso ────────────────────────────────────────────────
create or replace function public.crear_caso_central(
  p_area      text,
  p_motivo    text,
  p_mensaje   text,
  p_urgente   boolean default false,
  p_vence     timestamptz default null,
  p_cuenta    uuid default null,
  p_servicio  uuid default null,
  p_adjuntos  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_numero int;
  v_cuenta uuid := p_cuenta;
  v_cliente text;
  v_vence timestamptz;
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not deriva_casos_central() then
    raise exception 'Los casos a otras áreas los abre Central';
  end if;
  if p_area = 'rrhh' then
    raise exception 'RR. HH. todavía no tiene cuenta en el CRM: el caso no le llegaría a nadie';
  end if;
  if p_area not in ('finanzas', 'facturacion') then raise exception 'Elija el área'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Elija el motivo'; end if;
  if length(btrim(coalesce(p_mensaje, ''))) < 5 then
    raise exception 'Escriba qué necesita que hagan: es lo que va a leer el área';
  end if;
  if jsonb_typeof(coalesce(p_adjuntos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_adjuntos, '[]'::jsonb)) > 10 then
    raise exception 'Máximo 10 archivos por caso';
  end if;

  if p_servicio is not null then
    select coalesce(v_cuenta, s.cuenta_id), regexp_replace(coalesce(s.cliente_texto, ''), '^[0-9]{8,11}[[:space:]]*-[[:space:]]*', '')
      into v_cuenta, v_cliente
      from servicios_postventa s
     where s.id = p_servicio and s.es_prueba = v_prueba;
    if not found then raise exception 'El pedido no existe'; end if;
  end if;
  if v_cuenta is not null then
    select coalesce(nullif(v_cliente, ''), c.razon_social) into v_cliente from cuentas c where c.id = v_cuenta;
    if not found then raise exception 'La ficha del cliente no existe'; end if;
  end if;

  v_vence := case
    when coalesce(p_urgente, false) then now() + interval '2 hours'
    when p_vence is not null and p_vence > now() then p_vence
    else null
  end;

  perform pg_advisory_xact_lock(hashtext('casos_central_numero'));
  select coalesce(max(numero), 0) + 1 into v_numero from casos_central;

  insert into casos_central (numero, area, motivo, mensaje, urgente, vence_at, cuenta_id, servicio_id, cliente_texto, adjuntos, creado_por, es_prueba)
  values (v_numero, p_area, btrim(p_motivo), btrim(p_mensaje), coalesce(p_urgente, false), v_vence, v_cuenta, p_servicio,
          nullif(btrim(coalesce(v_cliente, '')), ''), coalesce(p_adjuntos, '[]'::jsonb), auth.uid(), v_prueba)
  returning id into v_id;

  insert into casos_central_pasos (caso_id, autor_id, tipo, texto, adjuntos)
  values (v_id, auth.uid(), 'derivado', btrim(p_mensaje), coalesce(p_adjuntos, '[]'::jsonb));

  return _caso_central_resumen(v_id);
end $$;

-- ── El área lo toma ─────────────────────────────────────────────────────
create or replace function public.tomar_caso_central(p_caso uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  select * into v from casos_central where id = p_caso and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v.id is null then raise exception 'Ese caso no existe'; end if;
  if not atiende_casos_central(v.area) then raise exception 'Este caso es de otra área'; end if;
  if v.estado = 'cerrado' then raise exception 'Este caso ya está cerrado'; end if;
  if v.tomado_por = auth.uid() then return _caso_central_resumen(p_caso); end if;

  update casos_central
     set tomado_por = auth.uid(), tomado_at = now(),
         estado = case when estado = 'nuevo' then 'tomado' else estado end,
         updated_at = now()
   where id = p_caso;
  insert into casos_central_pasos (caso_id, autor_id, tipo) values (p_caso, auth.uid(), 'tomado');
  return _caso_central_resumen(p_caso);
end $$;

-- ── El área pide un dato a Central ──────────────────────────────────────
create or replace function public.pedir_dato_caso_central(p_caso uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_texto, ''))) < 5 then raise exception 'Escriba qué dato le falta: le llega a Central'; end if;
  select * into v from casos_central where id = p_caso and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v.id is null then raise exception 'Ese caso no existe'; end if;
  if not atiende_casos_central(v.area) then raise exception 'Este caso es de otra área'; end if;
  if v.estado in ('cerrado', 'respondido') then raise exception 'Este caso ya fue respondido'; end if;

  update casos_central
     set estado = 'esperando_central',
         tomado_por = coalesce(tomado_por, auth.uid()), tomado_at = coalesce(tomado_at, now()),
         updated_at = now()
   where id = p_caso;
  insert into casos_central_pasos (caso_id, autor_id, tipo, texto) values (p_caso, auth.uid(), 'pide_dato', btrim(p_texto));
  return _caso_central_resumen(p_caso);
end $$;

-- ── Central contesta el dato, o dice que no quedó resuelto ──────────────
create or replace function public.contestar_caso_central(p_caso uuid, p_texto text, p_adjuntos jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not deriva_casos_central() then raise exception 'Esto lo contesta Central'; end if;
  if length(btrim(coalesce(p_texto, ''))) < 3 then raise exception 'Escriba la respuesta'; end if;
  select * into v from casos_central where id = p_caso and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v.id is null then raise exception 'Ese caso no existe'; end if;
  if v.estado not in ('esperando_central', 'respondido') then
    raise exception 'El área no le pidió nada en este caso';
  end if;

  update casos_central
     set estado = case when tomado_por is null then 'nuevo' else 'tomado' end,
         respondido_at = case when v.estado = 'respondido' then null else respondido_at end,
         updated_at = now()
   where id = p_caso;
  insert into casos_central_pasos (caso_id, autor_id, tipo, texto, adjuntos)
  values (p_caso, auth.uid(), 'contesta', btrim(p_texto), coalesce(p_adjuntos, '[]'::jsonb));
  return _caso_central_resumen(p_caso) || jsonb_build_object('reabierto', v.estado = 'respondido');
end $$;

-- ── El área responde ────────────────────────────────────────────────────
create or replace function public.responder_caso_central(p_caso uuid, p_texto text, p_adjuntos jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_texto, ''))) < 3 then raise exception 'Escriba la respuesta: le llega a Central'; end if;
  select * into v from casos_central where id = p_caso and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v.id is null then raise exception 'Ese caso no existe'; end if;
  if not atiende_casos_central(v.area) then raise exception 'Este caso es de otra área'; end if;
  if v.estado = 'cerrado' then raise exception 'Este caso ya está cerrado'; end if;

  update casos_central
     set estado = 'respondido',
         respuesta = btrim(p_texto),
         respondido_por = auth.uid(), respondido_at = now(),
         tomado_por = coalesce(tomado_por, auth.uid()), tomado_at = coalesce(tomado_at, now()),
         updated_at = now()
   where id = p_caso;
  insert into casos_central_pasos (caso_id, autor_id, tipo, texto, adjuntos)
  values (p_caso, auth.uid(), 'respondido', btrim(p_texto), coalesce(p_adjuntos, '[]'::jsonb));
  return _caso_central_resumen(p_caso);
end $$;

-- ── Central lo cierra ───────────────────────────────────────────────────
create or replace function public.cerrar_caso_central(p_caso uuid, p_texto text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not deriva_casos_central() then raise exception 'El caso lo cierra Central'; end if;
  select * into v from casos_central where id = p_caso and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v.id is null then raise exception 'Ese caso no existe'; end if;
  if v.estado = 'cerrado' then return _caso_central_resumen(p_caso); end if;
  if v.estado <> 'respondido' and length(btrim(coalesce(p_texto, ''))) < 5 then
    raise exception 'El área todavía no respondió: escriba por qué lo cierra (lo lee el área)';
  end if;

  update casos_central set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_at = now(), updated_at = now() where id = p_caso;
  insert into casos_central_pasos (caso_id, autor_id, tipo, texto) values (p_caso, auth.uid(), 'cerrado', nullif(btrim(coalesce(p_texto, '')), ''));
  return _caso_central_resumen(p_caso) || jsonb_build_object('sin_respuesta', v.estado <> 'respondido');
end $$;

-- ── Central insiste («Volver a avisar») ─────────────────────────────────
create or replace function public.insistir_caso_central(p_caso uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not deriva_casos_central() then raise exception 'Esto lo hace Central'; end if;
  select * into v from casos_central where id = p_caso and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v.id is null then raise exception 'Ese caso no existe'; end if;
  if v.estado not in ('nuevo', 'tomado') then raise exception 'El caso no está esperando al área'; end if;
  if v.ultimo_aviso_at > now() - interval '10 minutes' then
    raise exception 'Ya se le avisó hace menos de 10 minutos: espere un poco antes de volver a avisar';
  end if;

  update casos_central set avisos_n = avisos_n + 1, ultimo_aviso_at = now(), updated_at = now() where id = p_caso;
  insert into casos_central_pasos (caso_id, autor_id, tipo) values (p_caso, auth.uid(), 'insiste');
  return _caso_central_resumen(p_caso);
end $$;

-- ── El temporizador de la VM (cada 15 min) ─────────────────────────────
-- Devuelve los urgentes que vencieron sin que nadie los tome (y los marca
-- para no repetir), y cierra solos los respondidos de hace más de 2 días.
create or replace function public.casos_central_vencidos()
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    update casos_central
       set estado = 'cerrado', cerrado_at = now(), updated_at = now()
     where estado = 'respondido' and respondido_at < now() - interval '2 days'
    returning id
  loop
    insert into casos_central_pasos (caso_id, autor_id, tipo, texto) values (v_id, null, 'cerrado', 'Se cerró solo: Central no lo cerró en 2 días');
  end loop;

  for v_id in
    update casos_central
       set escalado_at = now(), updated_at = now()
     where estado = 'nuevo' and vence_at is not null and vence_at < now() and escalado_at is null
    returning id
  loop
    insert into casos_central_pasos (caso_id, autor_id, tipo, texto) values (v_id, null, 'vencido', 'Venció el plazo y nadie lo tomó');
    return next _caso_central_resumen(v_id);
  end loop;
end $$;

revoke all on function public.crear_caso_central(text, text, text, boolean, timestamptz, uuid, uuid, jsonb) from public;
revoke all on function public.tomar_caso_central(uuid) from public;
revoke all on function public.pedir_dato_caso_central(uuid, text) from public;
revoke all on function public.contestar_caso_central(uuid, text, jsonb) from public;
revoke all on function public.responder_caso_central(uuid, text, jsonb) from public;
revoke all on function public.cerrar_caso_central(uuid, text) from public;
revoke all on function public.insistir_caso_central(uuid) from public;
revoke all on function public.casos_central_vencidos() from public;
grant execute on function public.crear_caso_central(text, text, text, boolean, timestamptz, uuid, uuid, jsonb) to authenticated;
grant execute on function public.tomar_caso_central(uuid) to authenticated;
grant execute on function public.pedir_dato_caso_central(uuid, text) to authenticated;
grant execute on function public.contestar_caso_central(uuid, text, jsonb) to authenticated;
grant execute on function public.responder_caso_central(uuid, text, jsonb) to authenticated;
grant execute on function public.cerrar_caso_central(uuid, text) to authenticated;
grant execute on function public.insistir_caso_central(uuid) to authenticated;
grant execute on function public.casos_central_vencidos() to service_role;
grant execute on function public._caso_central_resumen(uuid) to service_role;
