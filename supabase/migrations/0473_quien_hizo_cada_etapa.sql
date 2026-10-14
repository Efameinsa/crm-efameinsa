-- 0473 — CADA ETAPA DEL PEDIDO DICE A QUÉ HORA SE HIZO Y QUIÉN (y dos huecos más del caso COFACO)
--
-- Santos, 14-10: «en cada etapa tiene que verse a qué hora se hace, quién lo
-- aprueba, etc., para que visualmente podamos hacer seguimiento».
--
-- 1. Ocho etapas guardaban la hora y no la persona: la prueba pedida, el plano
--    enviado, la dirección verificada (se guardaba con quién del cliente, no
--    quién de la casa), la preinstalación, la apertura enviada al almacén y al
--    cliente, la salida y el cierre. Se agregan las columnas `_por` y un
--    trigger las sella con la sesión al marcarse, sin tocar cada función. No
--    hay bitácora de antes: lo ya hecho queda sin nombre, lo nuevo lo tiene.
--
-- 2. La regla del visto bueno de Finanzas (0469) no veía dos casos reales:
--    - el crédito escrito como plazo («FACTURA A 30 DIAS», «Pago a 60 días»)
--      o anotado en la columna del abono («credito», FIL EXPORT);
--    - los pedidos del Excel cuyo abono dice «Pendiente», está vacío o «SI
--      PENDIENTE UNA COMISION»: el CRM dejaba emitir la apertura porque no
--      sabía si se había pagado (35 abiertos el 14-10, 5 ya embalados).
--    Ahora los dos piden el visto bueno de Finanzas antes de salir.

alter table public.servicios_postventa
  add column if not exists prueba_solicitada_por uuid references public.perfiles(id),
  add column if not exists plano_enviado_por uuid references public.perfiles(id),
  add column if not exists direccion_verificada_por uuid references public.perfiles(id),
  add column if not exists preinstalacion_ok_por uuid references public.perfiles(id),
  add column if not exists apertura_enviada_almacen_por uuid references public.perfiles(id),
  add column if not exists apertura_enviada_cliente_por uuid references public.perfiles(id),
  add column if not exists despachado_por uuid references public.perfiles(id),
  add column if not exists cerrado_por uuid references public.perfiles(id);

create or replace function public.sellar_quien_hizo_la_etapa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return new; end if;
  if new.prueba_solicitada_at is not null and old.prueba_solicitada_at is distinct from new.prueba_solicitada_at then new.prueba_solicitada_por := v_uid; end if;
  if new.plano_enviado_at is not null and old.plano_enviado_at is distinct from new.plano_enviado_at then new.plano_enviado_por := v_uid; end if;
  if new.direccion_verificada_at is not null and old.direccion_verificada_at is distinct from new.direccion_verificada_at then new.direccion_verificada_por := v_uid; end if;
  if new.preinstalacion_ok_at is not null and old.preinstalacion_ok_at is distinct from new.preinstalacion_ok_at then new.preinstalacion_ok_por := v_uid; end if;
  if new.apertura_enviada_almacen_at is not null and old.apertura_enviada_almacen_at is distinct from new.apertura_enviada_almacen_at then new.apertura_enviada_almacen_por := v_uid; end if;
  if new.apertura_enviada_cliente_at is not null and old.apertura_enviada_cliente_at is distinct from new.apertura_enviada_cliente_at then new.apertura_enviada_cliente_por := v_uid; end if;
  if new.despachado_at is not null and old.despachado_at is null then new.despachado_por := v_uid; end if;
  if new.cerrado_at is not null and old.cerrado_at is null then new.cerrado_por := v_uid; end if;
  -- Las que ya tenían su `_por` pero alguna función no lo llenaba.
  if new.apertura_despacho_at is not null and old.apertura_despacho_at is null and new.apertura_despacho_por is null then new.apertura_despacho_por := v_uid; end if;
  if new.prueba_lista_at is not null and old.prueba_lista_at is null and new.prueba_lista_por is null then new.prueba_lista_por := v_uid; end if;
  if new.aprobado_at is not null and old.aprobado_at is null and new.aprobado_por is null then new.aprobado_por := v_uid; end if;
  if new.pago_confirmado_at is not null and old.pago_confirmado_at is null and new.pago_confirmado_por is null then new.pago_confirmado_por := v_uid; end if;
  if new.guia_confirmada_at is not null and old.guia_confirmada_at is null and new.guia_confirmada_por is null then new.guia_confirmada_por := v_uid; end if;
  if new.despacho_verificado_at is not null and old.despacho_verificado_at is null and new.despacho_verificado_por is null then new.despacho_verificado_por := v_uid; end if;
  return new;
end $$;

drop trigger if exists sellar_quien_hizo_la_etapa on public.servicios_postventa;
create trigger sellar_quien_hizo_la_etapa
  before update on public.servicios_postventa
  for each row execute function public.sellar_quien_hizo_la_etapa();

-- La regla del visto bueno, con los dos casos que faltaban.
-- Misma regla que `pideVistoBuenoFinanzas` en src/lib/postventa.ts.
create or replace function public.pide_visto_bueno_finanzas(s public.servicios_postventa)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(s.tipo_pedido, 'equipo') not in ('revision', 'mantenimiento')
     and coalesce(s.origen, '') <> 'caso'
     and (
       coalesce(s.pct_antes_despacho, 100) < 100
       or coalesce(s.forma_pago, '') ~* '(letra|cr[eé]dito|financ|a\s*[0-9]+\s*d[ií]as)'
       or coalesce(s.confirmacion_abono, '') ~* 'cr[eé]dito'
       or coalesce(s.letras_cantidad, 0) > 0
       -- Del Excel sin un «SI» limpio y sin confirmación en el CRM: no se sabe si se pagó.
       or (s.informe_cierre_id is null and s.pago_confirmado_at is null
           and upper(btrim(coalesce(s.confirmacion_abono, ''))) not in ('SI', 'SÍ', 'OK', 'X', 'LISTO'))
     )
$$;

-- El mensaje ya no dice «venta a crédito» a secas: también frena el pago sin confirmar.
create or replace function public.frenar_salida_sin_visto_bueno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_que text;
begin
  if auth.uid() is null then return new; end if;
  if new.cerrado_at is not null and old.cerrado_at is null then return new; end if;

  if old.despacho_verificado_at is null and new.despacho_verificado_at is not null
     and new.letras_estado = 'van_con_el_equipo' then
    raise exception 'Las % letras de crédito iban con el equipo y nadie confirmó que se entregaron al cliente. Confírmelo en el pedido («Letras entregadas al cliente») y después dé el doble check.',
      coalesce(new.letras_cantidad::text, '');
  end if;

  if new.salida_autorizada_at is not null then return new; end if;

  if old.despachado_at is null and new.despachado_at is not null
     and new.letras_estado = 'van_con_el_equipo' and new.letras_recibidas_almacen_at is null then
    raise exception 'Las % letras de crédito van con este equipo y el almacén todavía no confirmó que las tiene. Recójalas en Finanzas y marque «Recibí las letras» antes de registrar la salida.',
      coalesce(new.letras_cantidad::text, '');
  end if;

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

  raise exception 'Falta el visto bueno de Finanzas para la salida (forma de pago: %; abono: %). Finanzas revisa el pago, las letras y las comisiones. No se puede % todavía. Si hay apuro, gerencia u operaciones autoriza con su código.',
    coalesce(nullif(btrim(new.forma_pago), ''), 'sin dato'), coalesce(nullif(btrim(new.confirmacion_abono), ''), 'sin confirmar'), v_que;
end $$;

insert into _migraciones_aplicadas (archivo) values ('0473_quien_hizo_cada_etapa.sql')
on conflict do nothing;
