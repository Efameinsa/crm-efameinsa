-- ═══════════════════════════════════════════════════════════════════════════
-- 0575 · UN CONTACTO DE LA BANDEJA, COMO CASO A FINANZAS O FACTURACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
-- Santos, 21-10: Central tenía en la bandeja a COFACO («las letras no indican
-- el número de factura… consulta cuál sería») y al darle «Derivar» la lista
-- solo traía comerciales y postventa: Finanzas no estaba. Los casos de Central
-- (0573) se abrían desde la ficha o el pedido, no desde el contacto que entra.
--
-- Ahora crear_caso_central acepta el contacto (p_lead): toma de él el cliente
-- y la ficha, y el contacto sale de la bandeja como 'derivado_area' con el
-- área de destino, igual que lo que va a otras áreas (se ve en «Derivados a
-- otras áreas» y se puede devolver a la cola).
-- ═══════════════════════════════════════════════════════════════════════════

alter type area_destino add value if not exists 'facturacion';

alter table public.casos_central
  add column if not exists lead_id uuid references public.leads (id) on delete set null;
create index if not exists casos_central_lead_idx on public.casos_central (lead_id) where lead_id is not null;

drop function if exists public.crear_caso_central(text, text, text, boolean, timestamptz, uuid, uuid, jsonb);

create or replace function public.crear_caso_central(
  p_area      text,
  p_motivo    text,
  p_mensaje   text,
  p_urgente   boolean default false,
  p_vence     timestamptz default null,
  p_cuenta    uuid default null,
  p_servicio  uuid default null,
  p_adjuntos  jsonb default '[]'::jsonb,
  p_lead      uuid default null
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
  v_lead record;
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

  if p_lead is not null then
    select id, estado, es_prueba, cuenta_id, nullif(btrim(coalesce(razon_social, '')), '') as rs, nullif(btrim(coalesce(nombre_contacto, '')), '') as nc
      into v_lead
      from leads where id = p_lead for update;
    if v_lead.id is null then raise exception 'El contacto no existe'; end if;
    if v_lead.estado <> 'pendiente_triaje' then
      raise exception 'Este contacto ya no está en la bandeja: alguien lo derivó o lo descartó. Actualice la pantalla';
    end if;
    if v_lead.es_prueba <> v_prueba then raise exception 'El contacto no existe'; end if;
    v_cuenta := coalesce(v_cuenta, v_lead.cuenta_id);
    v_cliente := regexp_replace(coalesce(v_lead.rs, v_lead.nc, ''), '^[0-9]{8,11}[[:space:]]*-[[:space:]]*', '');
  end if;

  if p_servicio is not null then
    select coalesce(v_cuenta, s.cuenta_id), coalesce(nullif(v_cliente, ''), regexp_replace(coalesce(s.cliente_texto, ''), '^[0-9]{8,11}[[:space:]]*-[[:space:]]*', ''))
      into v_cuenta, v_cliente
      from servicios_postventa s
     where s.id = p_servicio and s.es_prueba = v_prueba;
    if not found then raise exception 'El pedido no existe'; end if;
  end if;
  if v_cuenta is not null then
    select coalesce(nullif(v_cliente, ''), c.razon_social) into v_cliente from cuentas c where c.id = v_cuenta;
    if not found and p_lead is null then raise exception 'La ficha del cliente no existe'; end if;
  end if;

  v_vence := case
    when coalesce(p_urgente, false) then now() + interval '2 hours'
    when p_vence is not null and p_vence > now() then p_vence
    else null
  end;

  perform pg_advisory_xact_lock(hashtext('casos_central_numero'));
  select coalesce(max(numero), 0) + 1 into v_numero from casos_central;

  insert into casos_central (numero, area, motivo, mensaje, urgente, vence_at, cuenta_id, servicio_id, lead_id, cliente_texto, adjuntos, creado_por, es_prueba)
  values (v_numero, p_area, btrim(p_motivo), btrim(p_mensaje), coalesce(p_urgente, false), v_vence, v_cuenta, p_servicio, p_lead,
          nullif(btrim(coalesce(v_cliente, '')), ''), coalesce(p_adjuntos, '[]'::jsonb), auth.uid(), v_prueba)
  returning id into v_id;

  insert into casos_central_pasos (caso_id, autor_id, tipo, texto, adjuntos)
  values (v_id, auth.uid(), 'derivado', btrim(p_mensaje), coalesce(p_adjuntos, '[]'::jsonb));

  -- El contacto sale de la bandeja: ya tiene quién lo atienda.
  if p_lead is not null then
    update leads
       set estado = 'derivado_area',
           area_destino = p_area::area_destino,
           asignado_por = auth.uid(),
           asignado_at = now(),
           updated_at = now()
     where id = p_lead;
  end if;

  return _caso_central_resumen(v_id);
end $$;

revoke all on function public.crear_caso_central(text, text, text, boolean, timestamptz, uuid, uuid, jsonb, uuid) from public;
grant execute on function public.crear_caso_central(text, text, text, boolean, timestamptz, uuid, uuid, jsonb, uuid) to authenticated;
