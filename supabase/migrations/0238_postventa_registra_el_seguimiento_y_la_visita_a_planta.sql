-- ============================================================
-- CRM EFAMEINSA · Migración 0238 · Postventa registra el seguimiento y la visita a planta
-- ============================================================
-- Reunión del 15-09 con Carlos, Lesly, Rubí y Gabriela, en la ficha de
-- LAVIPRONTO: el cliente confirmó que viene a planta el sábado 19 a las 10 a
-- ver su máquina y pagar el saldo, y no había dónde anotarlo. «Registrar un
-- caso» abre uno nuevo (problema técnico, puesta en marcha, repuesto,
-- mantenimiento) y «Pasar contacto a Central» lo manda como si fuera nuevo
-- —que es lo que hicieron, y Central se dejó llevar—. Carlos: «yo registro el
-- seguimiento, lo calendarizo, y lo envío a la visita, que es la central,
-- visita presencial… esto mañana ya está corregido».
--
-- 1. EL SEGUIMIENTO. Una gestión se anota en el expediente del cliente: si
--    postventa ya tiene uno abierto con ese cliente, se usa; si no, se abre
--    uno de tipo «seguimiento» —no es un caso técnico ni una venta, es la
--    conversación con un cliente que ya está en curso—. Y cualquiera del área
--    puede anotar en los expedientes de postventa: el teléfono lo contesta
--    quien esté, no el dueño del expediente.
--
-- 2. LA VISITA A PLANTA. Un registro con empresa, RUC, quién viene (con DNI),
--    motivo, fecha y hora. Le llega a Central como aviso; Central lo imprime
--    y se lo pasa a vigilancia. Vale para postventa y para los comerciales.
--
-- 3. VARIOS EQUIPOS EN UN CASO. «Hay clientes que no solamente tienen
--    mantenimiento de una máquina, sino más, y no hay opción de poder volver
--    a agregar» (Rubí). El caso guarda las series adicionales.
--
-- 4. CAMBIAR EL TIPO DE LA ATENCIÓN TAMBIÉN DESDE MANTENIMIENTO O REPUESTO.
--    Carlos: «vamos a suponer que se entrega justo mantenimiento, pero el
--    cliente me dice no, quiero mi puesta en marcha. Lo cambio y me apertura
--    esa secuencia». Sigue siendo antes de planificar.
-- ============================================================

-- ── 1. El seguimiento ─────────────────────────────────────────────────────
alter type public.tipo_postventa add value if not exists 'seguimiento';

-- Cualquiera del área anota en un expediente de postventa.
drop policy if exists actividades_postventa_insert on public.actividades;
create policy actividades_postventa_insert on public.actividades for insert
  with check (
    (select puede_postventa())
    and exists (select 1 from oportunidades o where o.id = actividades.oportunidad_id and o.tipo_postventa is not null)
  );

-- El expediente donde va la gestión: el abierto del área con ese cliente, o
-- uno nuevo de seguimiento. Devuelve el id.
create or replace function public.expediente_para_seguimiento(p_cuenta uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid := auth.uid();
  v_id uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if not coalesce(puede_postventa(), false) and not coalesce(es_backoffice(), false) then
    raise exception 'El seguimiento de postventa lo registra el área';
  end if;
  if not exists (select 1 from cuentas where id = p_cuenta) then
    raise exception 'Ese cliente no existe';
  end if;

  -- Primero el mío abierto; después el de cualquiera del área.
  select o.id into v_id
    from oportunidades o
   where o.cuenta_id = p_cuenta
     and o.tipo_postventa is not null
     and o.cerrada_at is null
     and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
   order by (o.comercial_id = v_quien) desc, o.updated_at desc
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into oportunidades (cuenta_id, comercial_id, tipo_postventa, etapa, origen, intencion)
  values (p_cuenta, v_quien, 'seguimiento', 'seguimiento', 'crm', 'sin_definir')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.expediente_para_seguimiento(uuid) from public;
grant execute on function public.expediente_para_seguimiento(uuid) to authenticated;

-- ── 2. La visita a planta ─────────────────────────────────────────────────
create table if not exists public.visitas_planta (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid references public.cuentas (id) on delete set null,
  oportunidad_id  uuid references public.oportunidades (id) on delete set null,
  empresa         text not null,
  ruc             text,
  persona         text not null,
  dni             text,
  telefono        text,
  motivo          text not null,
  fecha           date not null,
  hora            time,
  registrado_por  uuid not null references public.perfiles (id),
  registrado_at   timestamptz not null default now(),
  -- Central lo imprime para vigilancia: queda quién y cuándo.
  impreso_at      timestamptz,
  impreso_por     uuid references public.perfiles (id),
  cancelada_at    timestamptz,
  cancelada_motivo text,
  es_prueba       boolean not null default false
);
create index if not exists ix_visitas_planta_fecha on public.visitas_planta (fecha, hora);
create index if not exists ix_visitas_planta_cuenta on public.visitas_planta (cuenta_id);
comment on table public.visitas_planta is
  'Quién viene a la planta, cuándo y para qué (0238). Lo registra comercial o postventa; Central lo imprime para vigilancia.';

alter table public.visitas_planta enable row level security;
drop policy if exists visitas_planta_select on public.visitas_planta;
create policy visitas_planta_select on public.visitas_planta for select
  using (
    registrado_por = (select auth.uid())
    or (select es_backoffice())
    or (select rol_actual()) = 'central'
    or (select puede_postventa())
  );
grant select on public.visitas_planta to authenticated;

create or replace function public.registrar_visita_planta(
  p_cuenta uuid,
  p_empresa text,
  p_ruc text,
  p_persona text,
  p_dni text,
  p_telefono text,
  p_motivo text,
  p_fecha date,
  p_hora time,
  p_oportunidad uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid := auth.uid();
  v_id uuid;
  v_nombre text;
  v_cuando text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_empresa, ''))) < 2 then raise exception 'Diga qué empresa viene'; end if;
  if length(btrim(coalesce(p_persona, ''))) < 3 then raise exception 'Diga quién viene: vigilancia lo pide por nombre'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga para qué viene'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la visita'; end if;
  if p_fecha < (now() at time zone 'America/Lima')::date then raise exception 'La visita no puede ser en una fecha ya pasada'; end if;

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, coalesce(es_cuenta_prueba(), false))
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;

  -- Central se entera al toque; la lista completa está en su pantalla de visitas.
  perform crear_notificacion(
    null, 'central', 'visita_planta',
    format('Visita a planta el %s · %s', v_cuando, btrim(p_empresa)),
    format('Viene %s%s. Motivo: %s. Lo registró %s. Imprímalo para vigilancia.',
           btrim(p_persona), case when p_dni is not null then ' (DNI ' || p_dni || ')' else '' end, btrim(p_motivo), v_nombre),
    '/central/visitas');
  return v_id;
end $$;
revoke all on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid) from public;
grant execute on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid) to authenticated;

create or replace function public.marcar_visita_impresa(p_visita uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if rol_actual() not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'La visita la imprime Central';
  end if;
  update visitas_planta set impreso_at = coalesce(impreso_at, now()), impreso_por = coalesce(impreso_por, auth.uid())
   where id = p_visita;
end $$;
revoke all on function public.marcar_visita_impresa(uuid) from public;
grant execute on function public.marcar_visita_impresa(uuid) to authenticated;

create or replace function public.cancelar_visita_planta(p_visita uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v visitas_planta%rowtype;
begin
  select * into v_v from visitas_planta where id = p_visita;
  if v_v.id is null then raise exception 'Esa visita no existe'; end if;
  if v_v.registrado_por <> auth.uid() and rol_actual() not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'La visita la cancela quien la registró, o Central';
  end if;
  update visitas_planta set cancelada_at = now(), cancelada_motivo = nullif(btrim(coalesce(p_motivo, '')), '') where id = p_visita;
end $$;
revoke all on function public.cancelar_visita_planta(uuid, text) from public;
grant execute on function public.cancelar_visita_planta(uuid, text) to authenticated;

-- ── 3. Varios equipos en un caso ──────────────────────────────────────────
alter table public.oportunidades add column if not exists series_adicionales text[];
comment on column public.oportunidades.series_adicionales is
  'Otras máquinas del mismo caso, además de serie_texto (0238): un mantenimiento de tres lavadoras es un solo caso.';

-- ── 4. Cambiar el tipo de la atención desde cualquier tipo, antes de planificar
create or replace function public.cambiar_tipo_atencion(p_atencion uuid, p_tipo tipo_atencion)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a record;
begin
  if not (coalesce(es_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Solo postventa, operaciones o gerencia cambian el tipo de una atención';
  end if;
  select id, tipo, etapa, cerrado_at into v_a from atenciones where id = p_atencion;
  if v_a.id is null then raise exception 'Esa atención no existe'; end if;
  if v_a.cerrado_at is not null then raise exception 'La atención ya está cerrada'; end if;
  -- Antes de planificar: después ya hay técnico programado y trabajo hecho
  -- sobre ese tipo (0231). Desde la 0238 también se cambia lo que Central
  -- derivó como mantenimiento o repuesto y resultó ser otra cosa.
  if v_a.etapa not in ('solicitud', 'registro', 'diagnostico') then
    raise exception 'El caso ya está en %; el tipo se cambia antes de planificarlo', v_a.etapa;
  end if;
  if v_a.tipo = p_tipo then return; end if;
  update atenciones set tipo = p_tipo, updated_at = now() where id = p_atencion;
end $$;
