-- 0470 — LAS LETRAS QUE VIAJAN CON EL EQUIPO: SE RECIBEN, SE ENTREGAN Y SE AVISA
--
-- Santos, 14-10 (después de la 0469): «en algunos casos sí pueden salir con
-- venta a crédito pero tienen que llevar sus letras de crédito, pero tiene que
-- avisar que ya se entregó sus letras de crédito».
--
-- Cuando Finanzas da el visto bueno con «las letras van con el equipo», el
-- circuito de las letras queda así:
--   1. Finanzas le da las letras al almacén. El almacén confirma «recibí las N
--      letras»: sin eso la salida no se registra (la máquina no sale sin ellas).
--   2. Quien entrega (almacén, chofer vía almacén, postventa o Finanzas)
--      confirma «letras entregadas al cliente», con quién las recibió y la foto
--      del cargo si la hay. Finanzas y postventa reciben el aviso.
--   3. Postventa no da el doble check del despacho mientras las letras sigan
--      «van con el equipo»: el despacho no termina con las letras perdidas.
--   4. Finanzas marca «firmadas» cuando vuelven (0469).
-- La autorización con código de gerencia/operaciones sigue destrabando la
-- salida (paso 1), pero no el doble check (paso 3): las letras se rinden igual.

alter table public.servicios_postventa
  add column if not exists letras_recibidas_almacen_at timestamptz,
  add column if not exists letras_recibidas_almacen_por uuid references public.perfiles(id),
  add column if not exists letras_entregadas_at timestamptz,
  add column if not exists letras_entregadas_por uuid references public.perfiles(id),
  add column if not exists letras_entregadas_a text,
  add column if not exists letras_entregadas_fotos jsonb not null default '[]'::jsonb,
  add column if not exists letras_entregadas_nota text;

create or replace function public.frenar_salida_sin_visto_bueno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_que text;
begin
  -- Solo las personas: el sincronizador y los arreglos de sistema no tienen uid.
  if auth.uid() is null then return new; end if;
  -- Cerrar en bloque pedidos viejos que ya se entregaron no es despachar.
  if new.cerrado_at is not null and old.cerrado_at is null then return new; end if;

  -- 3 (0470). El doble check del despacho espera a que las letras se entreguen.
  if old.despacho_verificado_at is null and new.despacho_verificado_at is not null
     and new.letras_estado = 'van_con_el_equipo' then
    raise exception 'Las % letras de crédito iban con el equipo y nadie confirmó que se entregaron al cliente. Confírmelo en el pedido («Letras entregadas al cliente») y después dé el doble check.',
      coalesce(new.letras_cantidad::text, '');
  end if;

  -- La autorización con código destraba la salida (no el doble check, arriba).
  if new.salida_autorizada_at is not null then return new; end if;

  -- 1 (0470). Si las letras van con el equipo, el almacén tiene que tenerlas.
  if old.despachado_at is null and new.despachado_at is not null
     and new.letras_estado = 'van_con_el_equipo' and new.letras_recibidas_almacen_at is null then
    raise exception 'Las % letras de crédito van con este equipo y el almacén todavía no confirmó que las tiene. Recójalas en Finanzas y marque «Recibí las letras» antes de registrar la salida.',
      coalesce(new.letras_cantidad::text, '');
  end if;

  -- 0469. Venta a crédito sin el visto bueno de Finanzas.
  if new.finanzas_vb_at is not null then return new; end if;
  if not pide_visto_bueno_finanzas(new) then return new; end if;

  if old.apertura_despacho_at is null and new.apertura_despacho_at is not null then
    v_que := 'emitir la apertura';
  elsif old.guia_confirmada_at is null and new.guia_confirmada_at is not null then
    v_que := 'autorizar la guía';
  elsif old.despachado_at is null and new.despachado_at is not null then
    v_que := 'registrar la salida';
  else
    return new;
  end if;

  raise exception 'Es una venta a crédito (%): falta el visto bueno de Finanzas para la salida — letras, adelanto y comisiones. No se puede % todavía. Finanzas lo da desde el pedido; si hay apuro, gerencia u operaciones autoriza con su código.',
    coalesce(nullif(btrim(new.forma_pago), ''), 'saldo después del despacho'), v_que;
end $$;

drop trigger if exists frenar_salida_sin_visto_bueno on public.servicios_postventa;
create trigger frenar_salida_sin_visto_bueno
  before update of apertura_despacho_at, guia_confirmada_at, despachado_at, despacho_verificado_at on public.servicios_postventa
  for each row execute function public.frenar_salida_sin_visto_bueno();

-- 1. El almacén recibió las letras de Finanzas.
create or replace function public.almacen_recibio_letras(p_servicio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_operaciones(), false) or coalesce(es_backoffice(), false)
          or rol_actual()::text in ('gerencia', 'admin')) then
    raise exception 'Que las letras están en el almacén lo confirma el almacén';
  end if;
  update servicios_postventa
     set letras_recibidas_almacen_at = now(),
         letras_recibidas_almacen_por = auth.uid(),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
     and letras_estado = 'van_con_el_equipo';
  if not found then raise exception 'Este pedido no tiene letras que viajen con el equipo'; end if;
end $$;

-- 2. Las letras se entregaron al cliente.
create or replace function public.letras_entregadas_al_cliente(p_servicio uuid, p_recibio text, p_fotos jsonb default '[]'::jsonb, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recibio text := nullif(btrim(coalesce(p_recibio, '')), '');
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_operaciones(), false) or coalesce(es_backoffice(), false)
          or coalesce(es_postventa(), false) or rol_actual()::text in ('finanzas', 'gerencia', 'admin')) then
    raise exception 'La entrega de las letras la confirma el almacén, postventa o Finanzas';
  end if;
  if v_recibio is null or length(v_recibio) < 3 then
    raise exception 'Diga quién recibió las letras (nombre, y si se puede, DNI o cargo)';
  end if;
  update servicios_postventa
     set letras_estado = 'entregadas',
         letras_entregadas_at = now(),
         letras_entregadas_por = auth.uid(),
         letras_entregadas_a = v_recibio,
         letras_entregadas_fotos = coalesce(letras_entregadas_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         letras_entregadas_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
     and letras_estado = 'van_con_el_equipo';
  if not found then raise exception 'Este pedido no tiene letras pendientes de entregar'; end if;
end $$;

revoke all on function public.almacen_recibio_letras(uuid) from public, anon;
revoke all on function public.letras_entregadas_al_cliente(uuid, text, jsonb, text) from public, anon;
grant execute on function public.almacen_recibio_letras(uuid) to authenticated;
grant execute on function public.letras_entregadas_al_cliente(uuid, text, jsonb, text) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0470_letras_viajan_con_el_equipo.sql')
on conflict do nothing;
