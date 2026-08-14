-- ============================================================
-- CRM EFAMEINSA · Migración 0003 · Fix: asignar_lead() con cliente nuevo
-- ============================================================
-- Bug: el CASE que infiere tipo_doc para una cuenta NUEVA resolvía a `text`
-- (sus ramas son todas literales sin tipo) y Postgres no lo castea solo al
-- insertar en una columna enum `tipo_documento`. Como el flujo de "cuenta ya
-- existente" no pasa por ese INSERT, la migración 0002 se probó únicamente
-- con clientes ya conocidos y no lo detectó. Se reproduce con cualquier lead
-- de un cliente nuevo (sin cuenta previa) → fallaba con
-- "column tipo_doc is of type tipo_documento but expression is of type text".

create or replace function asignar_lead(
  p_lead_id uuid,
  p_comercial_id uuid,
  p_motivo motivo_asignacion default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead          leads%rowtype;
  v_cuenta_id     uuid;
  v_dueño_actual  uuid;
  v_motivo        motivo_asignacion;
  v_oportunidad_id uuid;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin') then
    raise exception 'No autorizado para asignar leads';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead is null then
    raise exception 'Lead % no encontrado', p_lead_id;
  end if;
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'El lead % ya fue procesado (estado actual: %)', v_lead.codigo, v_lead.estado;
  end if;
  if v_lead.area_destino <> 'comercial' then
    raise exception 'El lead % no es comercial (área: %); no se asigna, se deriva', v_lead.codigo, v_lead.area_destino;
  end if;

  select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
  from cuentas c
  where (v_lead.num_doc is not null and c.num_doc = v_lead.num_doc and c.tipo_doc <> 'SIN_DOC')
     or (
       v_lead.telefono_normalizado is not null
       and exists (
         select 1 from contactos ct
         where ct.cuenta_id = c.id and ct.telefono_normalizado = v_lead.telefono_normalizado
       )
     )
  limit 1;

  if v_cuenta_id is null then
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
      p_comercial_id,
      now()
    )
    returning id into v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'nuevo_lead');
  elsif v_dueño_actual is null then
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'nuevo_lead');
  elsif v_dueño_actual = p_comercial_id then
    v_motivo := coalesce(p_motivo, 'cartera_existente');
  else
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'decision_gerencia');
  end if;

  if v_lead.telefono is not null and not exists (
    select 1 from contactos ct
    where ct.cuenta_id = v_cuenta_id and ct.telefono_normalizado = v_lead.telefono_normalizado
  ) then
    insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
    values (v_cuenta_id, coalesce(v_lead.nombre_contacto, 'Contacto'), v_lead.telefono, v_lead.email, true);
  end if;

  insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa)
  values (v_cuenta_id, v_lead.id, p_comercial_id, 'asignada')
  returning id into v_oportunidad_id;

  update leads set
    estado = 'asignado',
    cuenta_id = v_cuenta_id,
    asignado_a = p_comercial_id,
    asignado_at = now(),
    asignado_por = auth.uid()
  where id = p_lead_id;

  insert into asignaciones (lead_id, cuenta_id, de_comercial, a_comercial, motivo, decidida_por)
  values (p_lead_id, v_cuenta_id, v_dueño_actual, p_comercial_id, v_motivo, auth.uid());

  return v_oportunidad_id;
end;
$$;
