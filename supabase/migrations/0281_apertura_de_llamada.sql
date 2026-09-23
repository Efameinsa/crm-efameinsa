-- 0281 · LA APERTURA DE LLAMADA (reunión de gerencia con postventa, 23-09).
--
-- Lo que se dijo, en orden:
--   · «Lo único que no va es el registrar. El registrar más bien se tendría que
--     llamar envío de apertura… es la apertura de llamada que nosotros lo
--     catalogamos, y eso lo envías por correo, con todos los detalles.»
--   · «Jalas el equipo… y simplemente ejecutas tu formato, donde le dices
--     ejecutar la videollamada de los equipos A, B y C, y con el calendario,
--     mañana a las 4 de la tarde. Y esa es la orden que le damos al almacén.»
--   · «Y ella sepa, porque cada rato preguntan ¿ya llamaron al cliente?, y
--     tienen la opción de ver que almacén ya le dio check, porque ya lo está
--     gestionando.»
--   · «El almacén tiene que ingresar el informe de videollamada… ahí es donde
--     detalla los repuestos que posiblemente hay para vender (no hay gas, no hay
--     manguera, no hay válvula)… tú lo ves aquí en el informe y ¿qué vas a
--     hacer? Cotizar.»
--   · «Cuando nosotros enviamos, no se le envía directamente al cliente. Pasa
--     por una revisión… habría dos versiones: la versión 1, que es del almacén,
--     y la versión 2, que es la que envía postventa al cliente.»
--   · Rubí: la apertura de visita del técnico (Dani Solís) la tuvo que mandar
--     por correo «porque no me permite»: las aperturas solo existían dentro de
--     un pedido. Un cliente de hace años, sin pedido, también se atiende.
--
-- Por eso la apertura cuelga del CLIENTE y, si lo hay, del pedido o del caso.
-- Hasta hoy todo esto viajaba por correo; ahora cada paso deja quién y cuándo.
--
-- Estados (se derivan de las marcas, no se guardan): enviada → en gestión
-- (almacén dio el check) → informe del almacén → revisada (versión para el
-- cliente) → enviada al cliente. O anulada.

create table if not exists public.aperturas_llamada (
  id                   uuid primary key default gen_random_uuid(),
  cuenta_id            uuid not null references public.cuentas (id) on delete cascade,
  servicio_id          uuid references public.servicios_postventa (id) on delete set null,
  atencion_id          uuid references public.atenciones (id) on delete set null,
  tipo                 text not null check (tipo in (
                         'videollamada_preinstalacion',
                         'videollamada_puesta_marcha',
                         'soporte_videollamada',
                         'atencion_in_situ',
                         'revision')),
  programada_para      timestamptz not null,
  equipos              text not null,
  indicaciones         text,
  contacto             text,
  solicitada_por       uuid not null references public.perfiles (id),
  solicitada_at        timestamptz not null default now(),
  -- El check del almacén: «ya lo está gestionando».
  tomada_at            timestamptz,
  tomada_por           uuid references public.perfiles (id),
  tecnico              text,
  -- Versión 1: la escribe el almacén, que es quien hizo la llamada.
  informe_almacen      text,
  faltantes            text,
  informe_fotos        jsonb not null default '[]'::jsonb,
  informe_at           timestamptz,
  informe_por          uuid references public.perfiles (id),
  -- Versión 2: la revisa postventa; es la que se le manda al cliente.
  informe_cliente      text,
  revisada_at          timestamptz,
  revisada_por         uuid references public.perfiles (id),
  enviada_cliente_at   timestamptz,
  anulada_at           timestamptz,
  anulada_motivo       text,
  es_prueba            boolean not null default false
);
create index if not exists ix_aperturas_llamada_cuenta on public.aperturas_llamada (cuenta_id);
create index if not exists ix_aperturas_llamada_servicio on public.aperturas_llamada (servicio_id);
create index if not exists ix_aperturas_llamada_programada on public.aperturas_llamada (programada_para);
comment on table public.aperturas_llamada is
  'La orden de postventa al almacén para una videollamada o una atención (0281, reunión 23-09): la envía postventa, el almacén la toma y sube su informe (v1), postventa lo revisa (v2) y lo manda al cliente.';

alter table public.aperturas_llamada enable row level security;
drop policy if exists aperturas_llamada_select on public.aperturas_llamada;
create policy aperturas_llamada_select on public.aperturas_llamada for select
  using (
    es_prueba = coalesce((select es_cuenta_prueba()), false)
    and (
      (select puede_postventa())
      or (select es_almacen())
      or (select es_backoffice())
      or (select es_operaciones())
    )
  );
grant select on public.aperturas_llamada to authenticated;

-- ── Postventa envía la apertura ───────────────────────────────────────────
create or replace function public.enviar_apertura_llamada(
  p_cuenta uuid,
  p_tipo text,
  p_programada timestamptz,
  p_equipos text,
  p_indicaciones text default null,
  p_contacto text default null,
  p_servicio uuid default null,
  p_atencion uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La apertura de llamada la envía postventa';
  end if;
  if p_programada is null then raise exception 'Falta el día y la hora'; end if;
  if nullif(btrim(coalesce(p_equipos, '')), '') is null then raise exception 'Diga qué equipos se revisan'; end if;
  if p_servicio is not null and not exists (select 1 from servicios_postventa where id = p_servicio and cuenta_id = p_cuenta) then
    raise exception 'Ese pedido no es de este cliente';
  end if;
  insert into aperturas_llamada (cuenta_id, servicio_id, atencion_id, tipo, programada_para, equipos, indicaciones, contacto, solicitada_por, es_prueba)
  values (p_cuenta, p_servicio, p_atencion, p_tipo, p_programada, btrim(p_equipos),
          nullif(btrim(coalesce(p_indicaciones, '')), ''), nullif(btrim(coalesce(p_contacto, '')), ''),
          auth.uid(), coalesce(es_cuenta_prueba(), false))
  returning id into v_id;
  return v_id;
end $$;

-- ── El almacén da el check ────────────────────────────────────────────────
create or replace function public.almacen_tomar_apertura(p_id uuid, p_tecnico text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La toma el almacén';
  end if;
  update aperturas_llamada
     set tomada_at = coalesce(tomada_at, now()),
         tomada_por = coalesce(tomada_por, auth.uid()),
         tecnico = coalesce(nullif(btrim(coalesce(p_tecnico, '')), ''), tecnico)
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa apertura no existe o está anulada'; end if;
end $$;

-- ── El almacén sube su informe (versión 1) ────────────────────────────────
create or replace function public.almacen_informe_apertura(p_id uuid, p_informe text, p_faltantes text default null, p_fotos jsonb default '[]'::jsonb, p_tecnico text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El informe de la llamada lo sube el almacén';
  end if;
  if nullif(btrim(coalesce(p_informe, '')), '') is null then raise exception 'Escriba qué se vio en la llamada'; end if;
  update aperturas_llamada
     set informe_almacen = btrim(p_informe),
         faltantes = nullif(btrim(coalesce(p_faltantes, '')), ''),
         informe_fotos = coalesce(informe_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         tecnico = coalesce(nullif(btrim(coalesce(p_tecnico, '')), ''), tecnico),
         tomada_at = coalesce(tomada_at, now()),
         tomada_por = coalesce(tomada_por, auth.uid()),
         informe_at = now(),
         informe_por = auth.uid()
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa apertura no existe o está anulada'; end if;
end $$;

-- ── Postventa revisa (versión 2) y, si quiere, la da por enviada ───────────
-- Cuando la apertura es la videollamada de preinstalación de un pedido, la
-- revisión cumple el paso «Videollamada de preinstalación hecha» del pedido:
-- ya no se marca a mano aparte.
create or replace function public.revisar_apertura_llamada(p_id uuid, p_informe_cliente text, p_enviada boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a aperturas_llamada%rowtype;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La revisión es de postventa';
  end if;
  select * into a from aperturas_llamada where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found or a.anulada_at is not null then raise exception 'Esa apertura no existe o está anulada'; end if;
  if a.informe_at is null then raise exception 'El almacén todavía no subió su informe'; end if;
  if nullif(btrim(coalesce(p_informe_cliente, '')), '') is null then raise exception 'Falta el texto para el cliente'; end if;
  update aperturas_llamada
     set informe_cliente = btrim(p_informe_cliente),
         revisada_at = coalesce(revisada_at, now()),
         revisada_por = coalesce(revisada_por, auth.uid()),
         enviada_cliente_at = case when p_enviada then coalesce(enviada_cliente_at, now()) else enviada_cliente_at end
   where id = p_id;
  if a.servicio_id is not null and a.tipo = 'videollamada_preinstalacion' then
    update servicios_postventa
       set preinstalacion_ok_at = coalesce(preinstalacion_ok_at, now()),
           preinstalacion_nota = coalesce(preinstalacion_nota, left(btrim(p_informe_cliente), 500)),
           updated_at = now()
     where id = a.servicio_id;
  end if;
end $$;

create or replace function public.anular_apertura_llamada(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La anula postventa';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Diga por qué se anula'; end if;
  update aperturas_llamada
     set anulada_at = now(), anulada_motivo = btrim(p_motivo)
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa apertura no existe o ya estaba anulada'; end if;
end $$;

revoke all on function public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid) from public;
revoke all on function public.almacen_tomar_apertura(uuid, text) from public;
revoke all on function public.almacen_informe_apertura(uuid, text, text, jsonb, text) from public;
revoke all on function public.revisar_apertura_llamada(uuid, text, boolean) from public;
revoke all on function public.anular_apertura_llamada(uuid, text) from public;
grant execute on function public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.almacen_tomar_apertura(uuid, text) to authenticated;
grant execute on function public.almacen_informe_apertura(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.revisar_apertura_llamada(uuid, text, boolean) to authenticated;
grant execute on function public.anular_apertura_llamada(uuid, text) to authenticated;
