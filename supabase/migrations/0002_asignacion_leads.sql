-- ============================================================
-- CRM EFAMEINSA · Migración 0002 · Asignación de leads (B2)
-- ============================================================

-- Ejecuta en una sola transacción todo lo que implica asignar un lead
-- comercial (R2 dedup + R3 cartera + R4 asignación): vincula o crea la
-- cuenta, abre la oportunidad, actualiza el lead y deja la auditoría en
-- `asignaciones`. Se llama desde la app vía supabase.rpc('asignar_lead', ...)
-- en vez de encadenar varios inserts/updates desde el cliente, para que no
-- pueda quedar a medias si algo falla.
create or replace function asignar_lead(
  p_lead_id uuid,
  p_comercial_id uuid,
  p_motivo motivo_asignacion default null  -- si es null, se infiere (ver abajo)
)
returns uuid  -- id de la oportunidad creada
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

  -- R2: dedup por documento o teléfono contra cuentas ya existentes.
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
    -- Cliente nuevo: se crea la cuenta con el comercial elegido.
    insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, cartera_desde)
    values (
      case
        when v_lead.num_doc is null or v_lead.num_doc = '' then 'SIN_DOC'
        when length(v_lead.num_doc) = 11 then 'RUC'
        when length(v_lead.num_doc) = 8 then 'DNI'
        else 'SIN_DOC'
      end,
      nullif(v_lead.num_doc, ''),
      coalesce(nullif(v_lead.razon_social, ''), v_lead.nombre_contacto, 'Sin nombre'),
      p_comercial_id,
      now()
    )
    returning id into v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'nuevo_lead');
  elsif v_dueño_actual is null then
    -- Cuenta existente pero sin dueño (ej. cartera liberada): se le asigna.
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'nuevo_lead');
  elsif v_dueño_actual = p_comercial_id then
    -- R3: le corresponde a quien ya lo atendía.
    v_motivo := coalesce(p_motivo, 'cartera_existente');
  else
    -- Se reasigna a un comercial distinto del dueño actual: decisión explícita
    -- de gerencia/central (p.ej. tras liberar la cartera a los 6 meses).
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'decision_gerencia');
  end if;

  -- Registrar el contacto del lead en la cuenta si no existía ya (por teléfono).
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

revoke all on function asignar_lead(uuid, uuid, motivo_asignacion) from public;
grant execute on function asignar_lead(uuid, uuid, motivo_asignacion) to authenticated;
