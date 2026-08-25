-- ============================================================
-- CRM EFAMEINSA · Migración 0082 · Recordatorio de urgencia
-- ============================================================
-- Pedido del 25-08: un cliente (Inmobiliaria Mi Casita Facilita) escribió por
-- formulario, volvió a escribir por WhatsApp y le dijo a Central que C5 «se
-- demora en hacerle caso». Central veía el problema en «Lo que derivé» pero su
-- única herramienta era reclamarle al comercial por WhatsApp — por fuera del
-- sistema y sin dejar rastro.
--
-- QUÉ AGREGA. Un canal formal de urgencia: Central dispara un aviso que al
-- comercial le llega en vivo (ventanita que no se va sola + sonido + push al
-- celular), y el disparo queda REGISTRADO acá. El registro no es decorativo:
--   · «Lo que derivé» muestra cuándo se avisó, así Central no bombardea.
--   · Si hace falta un SEGUNDO aviso por el mismo contacto, gerencia también
--     se entera — si el recordatorio no bastó, ya no es un olvido.
--
-- Quién puede enviarlo: Central o backoffice (gerencia/admin), el mismo
-- criterio que redirigir una derivación (migración 0079). Vale para CUALQUIER
-- comercial —C1 a C5 y postventa—, no solo el caso que lo originó.

create table recordatorios_urgencia (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads (id) on delete cascade,
  enviado_por uuid not null references perfiles (id),
  para        uuid not null references perfiles (id),
  mensaje     text,
  created_at  timestamptz not null default now()
);
create index ix_urgencia_lead on recordatorios_urgencia (lead_id, created_at desc);

alter table recordatorios_urgencia enable row level security;

-- Lo leen quien lo envió, quien lo recibió y el backoffice. El insert NO tiene
-- política a propósito: solo entra por la función, que valida y cuenta.
create policy urgencia_select on recordatorios_urgencia for select to authenticated
  using (
    enviado_por = auth.uid()
    or para = auth.uid()
    or rol_actual() in ('central'::rol_usuario, 'gerencia'::rol_usuario, 'admin'::rol_usuario)
  );

create or replace function enviar_urgencia(p_lead_id uuid, p_mensaje text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_comercial record;
  v_oportunidad_id uuid;
  v_aviso_numero int;
begin
  if not (rol_actual() = 'central'::rol_usuario or es_backoffice()) then
    raise exception 'Solo Central o gerencia pueden enviar un recordatorio de urgencia';
  end if;

  select id, codigo, nombre_contacto, asignado_a into v_lead
  from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'El contacto no existe';
  end if;
  if v_lead.asignado_a is null then
    raise exception 'Este contacto no está derivado a ningún comercial: no hay a quién avisarle';
  end if;

  select id, nombre, codigo_comercial into v_comercial
  from perfiles where id = v_lead.asignado_a;

  select count(*) + 1 into v_aviso_numero
  from recordatorios_urgencia where lead_id = p_lead_id;

  insert into recordatorios_urgencia (lead_id, enviado_por, para, mensaje)
  values (p_lead_id, auth.uid(), v_lead.asignado_a, nullif(trim(p_mensaje), ''));

  select id into v_oportunidad_id
  from oportunidades where lead_id = p_lead_id
  order by created_at limit 1;

  return jsonb_build_object(
    'comercial_id', v_comercial.id,
    'comercial_nombre', v_comercial.nombre,
    'comercial_codigo', v_comercial.codigo_comercial,
    'oportunidad_id', v_oportunidad_id,
    'aviso_numero', v_aviso_numero,
    'contacto', coalesce(v_lead.nombre_contacto, v_lead.codigo, 'El contacto')
  );
end;
$$;

revoke all on function enviar_urgencia(uuid, text) from public;
grant execute on function enviar_urgencia(uuid, text) to authenticated;
