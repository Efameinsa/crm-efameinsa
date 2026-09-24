-- ============================================================
-- CRM EFAMEINSA · Migración 0298 · Urgencia de Central a Finanzas
-- ============================================================
-- Pedido de Central (24-09, con Santos): «a veces hay pedidos que son urgentes
-- porque el cliente requiere factura o quieren despachar; necesito mandar una
-- alerta o ventana emergente a Finanzas para que se apure, así tal cual con
-- Comercial». Hasta hoy Central solo tenía el aviso suave de la liberación
-- (0279: se va solo a los 8 segundos) y el WhatsApp por fuera del sistema.
--
-- QUÉ AGREGA. La misma sirena que ya existe para el comercial (0082), pero
-- sobre un PEDIDO liberado y con destino Finanzas: ventanita que no se cierra
-- sola, campanada y push que se queda en pantalla. Y el disparo queda
-- REGISTRADO, por las mismas dos razones de la 0082:
--   · «Sus pedidos» muestra cuándo se avisó, así Central no bombardea.
--   · Del SEGUNDO aviso en adelante por el mismo pedido, gerencia también se
--     entera: si la sirena no bastó, ya no es un olvido.
--
-- El pedido además lleva la marca (urgencia_finanzas_at / motivo / n) para
-- que la lista «Pagos por confirmar» lo ponga primero y con la razón a la
-- vista, sin una consulta extra por fila.
--
-- Quién puede enviarla: Central, operaciones o backoffice (gerencia/admin).
-- Vale sobre cualquier pedido ya liberado (Finanzas solo tiene en su bandeja
-- los liberados) y respeta la serie de práctica: lo de práctica no le suena a
-- Jhon.

alter table servicios_postventa
  add column if not exists urgencia_finanzas_at     timestamptz,
  add column if not exists urgencia_finanzas_motivo text,
  add column if not exists urgencia_finanzas_n      int not null default 0;

comment on column servicios_postventa.urgencia_finanzas_at is
  'Último aviso de urgencia que Central le mandó a Finanzas por este pedido (0298). null = nunca.';
comment on column servicios_postventa.urgencia_finanzas_n is
  'Cuántas urgencias lleva este pedido (0298): de la segunda en adelante gerencia también se entera.';

create table if not exists urgencias_finanzas (
  id          uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios_postventa (id) on delete cascade,
  enviado_por uuid not null references perfiles (id),
  mensaje     text,
  created_at  timestamptz not null default now()
);
create index if not exists ix_urgencias_finanzas_servicio on urgencias_finanzas (servicio_id, created_at desc);

alter table urgencias_finanzas enable row level security;

-- Lo leen quien lo envió, Finanzas y el backoffice. El insert NO tiene
-- política a propósito: solo entra por la función, que valida y cuenta.
drop policy if exists urgencias_finanzas_select on urgencias_finanzas;
create policy urgencias_finanzas_select on urgencias_finanzas for select to authenticated
  using (
    enviado_por = auth.uid()
    or rol_actual() in ('central'::rol_usuario, 'finanzas'::rol_usuario, 'operaciones'::rol_usuario, 'gerencia'::rol_usuario, 'admin'::rol_usuario)
  );

create or replace function enviar_urgencia_finanzas(p_servicio uuid, p_mensaje text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_n int;
  v_motivo text := nullif(trim(coalesce(p_mensaje, '')), '');
begin
  if not (rol_actual() in ('central'::rol_usuario, 'operaciones'::rol_usuario) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo Central, operaciones o gerencia pueden enviarle una urgencia a Finanzas';
  end if;

  select id, cliente_texto, numero_pedido_erp, pedido_ejecutado_at, es_prueba, cerrado_at, urgencia_finanzas_n
    into v_s
  from servicios_postventa
  where id = p_servicio
    and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then
    raise exception 'El pedido no existe';
  end if;
  if v_s.pedido_ejecutado_at is null then
    raise exception 'Este pedido todavía no está liberado: Finanzas no lo tiene en su bandeja. Libérelo primero desde Cierres de venta';
  end if;
  if v_s.cerrado_at is not null then
    raise exception 'Este pedido ya está cerrado: no hay nada que apurar';
  end if;

  v_n := coalesce(v_s.urgencia_finanzas_n, 0) + 1;

  insert into urgencias_finanzas (servicio_id, enviado_por, mensaje)
  values (p_servicio, auth.uid(), v_motivo);

  update servicios_postventa
     set urgencia_finanzas_at = now(),
         urgencia_finanzas_motivo = v_motivo,
         urgencia_finanzas_n = v_n
   where id = p_servicio;

  return jsonb_build_object(
    'servicio_id', v_s.id,
    'cliente', regexp_replace(coalesce(v_s.cliente_texto, 'Cliente'), '^[0-9]{8,11}[[:space:]]*-[[:space:]]*', ''),
    'numero_pedido', v_s.numero_pedido_erp,
    'es_prueba', coalesce(v_s.es_prueba, false),
    'aviso_numero', v_n
  );
end;
$$;

revoke all on function enviar_urgencia_finanzas(uuid, text) from public;
grant execute on function enviar_urgencia_finanzas(uuid, text) to authenticated;
