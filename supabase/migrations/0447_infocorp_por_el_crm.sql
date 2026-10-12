-- ============================================================
-- CRM EFAMEINSA · Migración 0447 · El Infocorp se pide por el CRM
-- ============================================================
-- Buzón, Brenda 12-10: «implementar el solicitar el Infocorp por este medio;
-- actualmente enviamos correo a Central, se adjunta en el correo el RUC y el
-- nombre de la razón social» (captura: «SOLICITUD INFOCORP - CLIENTE GRANJA
-- RINCONADA DEL SUR SA», a Central con copia a gerencia). Central lo saca de
-- Experian a mano —tiene verificación en dos pasos por correo, no se puede
-- automatizar— y lo devolvía por correo.
--
-- QUÉ AGREGA. El comercial lo pide desde el expediente (RUC y razón social
-- salen de la ficha); a Central le suena la campana y le sale en «Hoy»; Central
-- sube el reporte y escribe lo que encontró; al comercial le llega a la
-- campana y lo ve en el expediente. El reporte es información de crédito: lo
-- ven quien lo pidió, Central y gerencia.

create table solicitudes_infocorp (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid references cuentas (id) on delete set null,
  oportunidad_id  uuid references oportunidades (id) on delete set null,
  ruc             text,
  razon_social    text not null,
  nota            text,
  solicitado_por  uuid not null references perfiles (id),
  created_at      timestamptz not null default now(),
  atendido_por    uuid references perfiles (id),
  atendido_at     timestamptz,
  resultado       text,
  archivo_path    text,
  archivo_nombre  text,
  es_prueba       boolean not null default false
);
create index ix_infocorp_pendientes on solicitudes_infocorp (created_at) where atendido_at is null;
create index ix_infocorp_cuenta on solicitudes_infocorp (cuenta_id, created_at desc);

alter table solicitudes_infocorp enable row level security;
grant select on solicitudes_infocorp to authenticated;

create policy infocorp_select on solicitudes_infocorp for select to authenticated
  using (
    solicitado_por = auth.uid()
    or rol_actual() = 'central'::rol_usuario
    or es_backoffice()
  );

-- Pedirlo: cualquiera con perfil activo. Si ya hay uno pendiente del mismo
-- RUC, no se duplica: se devuelve ese (y se suma la nota).
create or replace function pedir_infocorp(p_cuenta uuid, p_oportunidad uuid, p_ruc text, p_razon_social text, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruc text := nullif(regexp_replace(coalesce(p_ruc, ''), '[^0-9]', '', 'g'), '');
  v_razon text := nullif(trim(coalesce(p_razon_social, '')), '');
  v_id uuid;
  v_prueba boolean;
begin
  if not tiene_perfil_activo() then
    raise exception 'Sin perfil activo';
  end if;
  if v_razon is null then
    raise exception 'Falta la razón social';
  end if;
  if v_ruc is not null and length(v_ruc) not in (8, 11) then
    raise exception 'El RUC tiene 11 dígitos (o 8 si es DNI)';
  end if;
  select coalesce(es_prueba, false) into v_prueba from perfiles where id = auth.uid();

  select id into v_id from solicitudes_infocorp
  where atendido_at is null
    and ((v_ruc is not null and ruc = v_ruc) or (v_ruc is null and cuenta_id = p_cuenta and p_cuenta is not null))
  order by created_at
  limit 1;
  if v_id is not null then
    if nullif(trim(coalesce(p_nota, '')), '') is not null then
      update solicitudes_infocorp
      set nota = concat_ws(E'\n', nota, trim(p_nota))
      where id = v_id;
    end if;
    return jsonb_build_object('id', v_id, 'ya_pedido', true);
  end if;

  insert into solicitudes_infocorp (cuenta_id, oportunidad_id, ruc, razon_social, nota, solicitado_por, es_prueba)
  values (p_cuenta, p_oportunidad, v_ruc, v_razon, nullif(trim(coalesce(p_nota, '')), ''), auth.uid(), v_prueba)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'ya_pedido', false);
end;
$$;

-- Responder: Central o gerencia. Devuelve a quién avisarle.
create or replace function responder_infocorp(p_id uuid, p_resultado text, p_archivo_path text, p_archivo_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila solicitudes_infocorp;
begin
  if not (rol_actual() = 'central'::rol_usuario or es_backoffice()) then
    raise exception 'Solo Central o gerencia responden el Infocorp';
  end if;
  if nullif(trim(coalesce(p_resultado, '')), '') is null and nullif(trim(coalesce(p_archivo_path, '')), '') is null then
    raise exception 'Suba el reporte o escriba lo que encontró';
  end if;
  update solicitudes_infocorp
  set atendido_por = auth.uid(),
      atendido_at = now(),
      resultado = nullif(trim(coalesce(p_resultado, '')), ''),
      archivo_path = coalesce(nullif(trim(coalesce(p_archivo_path, '')), ''), archivo_path),
      archivo_nombre = coalesce(nullif(trim(coalesce(p_archivo_nombre, '')), ''), archivo_nombre)
  where id = p_id
  returning * into v_fila;
  if v_fila.id is null then
    raise exception 'No existe esa solicitud de Infocorp';
  end if;
  return jsonb_build_object('solicitado_por', v_fila.solicitado_por, 'razon_social', v_fila.razon_social,
                            'ruc', v_fila.ruc, 'oportunidad_id', v_fila.oportunidad_id, 'cuenta_id', v_fila.cuenta_id);
end;
$$;

revoke all on function pedir_infocorp(uuid, uuid, text, text, text) from public;
revoke all on function responder_infocorp(uuid, text, text, text) from public;
grant execute on function pedir_infocorp(uuid, uuid, text, text, text) to authenticated;
grant execute on function responder_infocorp(uuid, text, text, text) to authenticated;

-- El reporte en el bucket: bajo «infocorp/», solo quien lo pidió, Central y
-- gerencia. El resto de la política, igual que en la 0329.
create or replace function puede_ver_infocorp(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select rol_actual() = 'central'::rol_usuario
      or es_backoffice()
      or exists (select 1 from solicitudes_infocorp s where s.archivo_path = p_name and s.solicitado_por = auth.uid());
$$;
grant execute on function puede_ver_infocorp(text) to authenticated;

drop policy if exists adjuntos_lectura on storage.objects;
create policy adjuntos_lectura on storage.objects for select to authenticated
  using (
    bucket_id = 'adjuntos'
    and public.tiene_perfil_activo()
    and (
      name not like 'finanzas/%' or public.es_finanzas() or public.es_backoffice()
    )
    and (
      (name not like 'liquidaciones/%' and name not like 'facturas/%') or public.ve_documentos_de_finanzas()
    )
    and (
      name not like 'infocorp/%' or public.puede_ver_infocorp(name)
    )
  );
