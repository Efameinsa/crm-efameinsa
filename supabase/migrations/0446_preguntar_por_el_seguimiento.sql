-- ============================================================
-- CRM EFAMEINSA · Migración 0446 · Preguntar por el seguimiento
-- ============================================================
-- Buzón, Central 12-10: «en este listado de preguntar a tal comercial por el
-- seguimiento, ¿qué paso haría?». Su «Hoy» tenía 136 filas «Preguntar a C9 por
-- el seguimiento» (derivados en gestión o cotizados, más de 7 días sin
-- movimiento) y ningún botón que hiciera la pregunta: solo «Ver el derivado».
-- La sirena (0082) no sirve para esto — es para el cliente que está esperando
-- y desde el segundo aviso le llega a gerencia.
--
-- QUÉ AGREGA. La pregunta queda registrada por contacto. Central la hace de una
-- vez por comercial (un solo aviso en la campana con la lista); esos contactos
-- salen de su «Hoy» y vuelven si siguen quietos 7 días después de preguntar.

create table consultas_seguimiento (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads (id) on delete cascade,
  enviado_por uuid not null references perfiles (id),
  para        uuid not null references perfiles (id),
  created_at  timestamptz not null default now()
);
create index ix_consulta_seguimiento_lead on consultas_seguimiento (lead_id, created_at desc);

alter table consultas_seguimiento enable row level security;
grant select on consultas_seguimiento to authenticated;

-- Como recordatorios_urgencia: lo leen quien preguntó, a quien le preguntaron
-- y el backoffice. Solo entra por la función.
create policy consulta_seguimiento_select on consultas_seguimiento for select to authenticated
  using (
    enviado_por = auth.uid()
    or para = auth.uid()
    or rol_actual() in ('central'::rol_usuario, 'gerencia'::rol_usuario, 'admin'::rol_usuario)
  );

-- Registra la pregunta para cada contacto derivado y devuelve, por comercial,
-- a quién avisarle y por cuáles (el aviso lo manda la acción del servidor).
create or replace function preguntar_seguimiento(p_lead_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salida jsonb;
begin
  if not (rol_actual() = 'central'::rol_usuario or es_backoffice()) then
    raise exception 'Solo Central o gerencia pueden preguntar por el seguimiento';
  end if;

  with nuevas as (
    insert into consultas_seguimiento (lead_id, enviado_por, para)
    select l.id, auth.uid(), l.asignado_a
    from leads l
    where l.id = any(p_lead_ids) and l.asignado_a is not null
    returning lead_id, para
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'comercial_id', p.id,
           'comercial_codigo', p.codigo_comercial,
           'comercial_nombre', p.nombre,
           'contactos', x.contactos)), '[]'::jsonb)
  into v_salida
  from (
    select n.para,
           jsonb_agg(jsonb_build_object(
             'lead_id', l.id,
             'nombre', coalesce(nullif(trim(l.razon_social), ''), nullif(trim(l.nombre_contacto), ''), l.codigo, 'Contacto sin nombre'),
             'oportunidad_id', (select o.id from oportunidades o where o.lead_id = l.id order by o.created_at limit 1)
           ) order by l.recibido_at) as contactos
    from nuevas n join leads l on l.id = n.lead_id
    group by n.para
  ) x
  join perfiles p on p.id = x.para;

  return v_salida;
end;
$$;

revoke all on function preguntar_seguimiento(uuid[]) from public;
grant execute on function preguntar_seguimiento(uuid[]) to authenticated;
