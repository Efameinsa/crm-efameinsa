-- 0469 — LA VENTA A CRÉDITO NO SALE SIN EL VISTO BUENO DE FINANZAS (letras, comisiones)
--
-- Caso COFACO INDUSTRIES (14-10): «50 % ADELANTO + 50 % SALDO EN 3 LETRAS».
-- El pedido venía del Excel con «confirmación de abono: SI» (el adelanto) y el
-- CRM lo leyó como pagado completo: el freno del saldo (0232/0297) no traba las
-- filas del Excel porque no tienen montos. Nadie miró las letras, Finanzas no
-- pasó por el pedido, la guía salió «sin comprobante» y el equipo salió. Jhon
-- (Finanzas) tuvo que mandar las letras con el montacargas detrás del equipo.
--
-- Santos, 14-10: «para que Finanzas proceda debe seguir sus pasos si hay letras
-- o no hay letras o comisiones interplaza… si no estuviera todo completo
-- debería salir una alerta para que no salga el equipo».
--
-- La regla: toda venta con saldo a crédito (condición < 100 % antes del
-- despacho, o la forma de pago habla de letras, crédito o financiamiento)
-- necesita el VISTO BUENO DE FINANZAS para la salida. Finanzas lo da desde el
-- pedido diciendo qué pasa con las letras (no lleva / van con el equipo /
-- entregadas / ya firmadas) y, si la hubo, la comisión interplaza o bancaria.
-- Sin él no se emite la apertura, Contabilidad no autoriza la guía y el
-- almacén no registra la salida ni la entrega. La salida de emergencia es la
-- de siempre: gerencia u operaciones con su código (autorizar_salida_con_saldo).
--
-- El freno vive en un trigger y no en cada función: así cubre la apertura
-- (que se escribe desde el servidor de la app), la guía, la salida del almacén,
-- la entrega en agencia/planta y el despacho que registra postventa. Solo
-- actúa con una sesión de persona (auth.uid()): el sincronizador local→nube y
-- los arreglos de sistema no pasan por acá.

alter table public.servicios_postventa
  add column if not exists finanzas_vb_at timestamptz,
  add column if not exists finanzas_vb_por uuid references public.perfiles(id),
  add column if not exists finanzas_vb_nota text,
  add column if not exists finanzas_vb_comision numeric(12, 2),
  add column if not exists letras_cantidad integer,
  add column if not exists letras_estado text,
  add column if not exists letras_firmadas_at timestamptz,
  add column if not exists letras_firmadas_por uuid references public.perfiles(id);

do $$ begin
  alter table public.servicios_postventa
    add constraint servicios_postventa_letras_estado_check
    check (letras_estado is null or letras_estado in ('no_lleva', 'van_con_el_equipo', 'entregadas', 'firmadas'));
exception when duplicate_object then null; end $$;

comment on column public.servicios_postventa.finanzas_vb_at is
  '0469: Finanzas revisó adelanto, letras y comisiones y dio el visto bueno para que el equipo salga (ventas a crédito).';
comment on column public.servicios_postventa.letras_estado is
  '0469: no_lleva · van_con_el_equipo (las lleva el transporte y vuelven firmadas) · entregadas (el cliente las tiene, falta firma) · firmadas.';

-- ¿Esta venta necesita el visto bueno de Finanzas para salir?
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
       or coalesce(s.forma_pago, '') ~* '(letra|cr[eé]dito|financ)'
       or coalesce(s.letras_cantidad, 0) > 0
     )
$$;
grant execute on function public.pide_visto_bueno_finanzas(public.servicios_postventa) to authenticated;

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
  if new.finanzas_vb_at is not null or new.salida_autorizada_at is not null then return new; end if;
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
  before update of apertura_despacho_at, guia_confirmada_at, despachado_at on public.servicios_postventa
  for each row execute function public.frenar_salida_sin_visto_bueno();

-- El visto bueno de Finanzas.
create or replace function public.finanzas_visto_bueno_salida(
  p_servicio uuid,
  p_letras text,
  p_letras_cantidad integer default null,
  p_comision numeric default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_dice_letras boolean;
begin
  if rol_actual()::text not in ('finanzas', 'gerencia', 'admin') then
    raise exception 'El visto bueno para la salida lo da Finanzas';
  end if;
  if p_letras is null or p_letras not in ('no_lleva', 'van_con_el_equipo', 'entregadas', 'firmadas') then
    raise exception 'Diga qué pasa con las letras: no lleva, van con el equipo, ya las tiene el cliente o ya están firmadas';
  end if;
  if p_letras <> 'no_lleva' and coalesce(p_letras_cantidad, 0) <= 0 then
    raise exception 'Diga cuántas letras son';
  end if;
  if p_comision is not null and p_comision < 0 then
    raise exception 'La comisión no puede ser negativa';
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  v_dice_letras := coalesce(v_s.forma_pago, '') ~* 'letra';
  if v_dice_letras and p_letras = 'no_lleva' and length(coalesce(v_nota, '')) < 5 then
    raise exception 'La forma de pago dice letras: si no lleva, escriba por qué en la nota';
  end if;
  update servicios_postventa
     set finanzas_vb_at = now(),
         finanzas_vb_por = auth.uid(),
         finanzas_vb_nota = v_nota,
         finanzas_vb_comision = p_comision,
         letras_estado = p_letras,
         letras_cantidad = case when p_letras = 'no_lleva' then null else p_letras_cantidad end,
         letras_firmadas_at = case when p_letras = 'firmadas' then coalesce(letras_firmadas_at, now()) else null end,
         letras_firmadas_por = case when p_letras = 'firmadas' then coalesce(letras_firmadas_por, auth.uid()) else null end,
         updated_at = now()
   where id = p_servicio;
end $$;

-- Las letras volvieron firmadas (o el cliente las firmó): cierra lo pendiente.
create or replace function public.finanzas_letras_firmadas(p_servicio uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if rol_actual()::text not in ('finanzas', 'gerencia', 'admin') then
    raise exception 'Las letras las marca Finanzas';
  end if;
  update servicios_postventa
     set letras_estado = 'firmadas',
         letras_firmadas_at = now(),
         letras_firmadas_por = auth.uid(),
         finanzas_vb_nota = case when v_nota is null then finanzas_vb_nota
                                 else concat_ws(' · ', finanzas_vb_nota, 'Letras firmadas: ' || v_nota) end,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
     and letras_estado in ('van_con_el_equipo', 'entregadas');
  if not found then raise exception 'Este pedido no tiene letras pendientes de firma'; end if;
end $$;

-- La guía salió «sin comprobante todavía»: el comprobante se le da igual al
-- cliente (Jhon, 14-10). Contabilidad o Finanzas anota cuál fue después.
create or replace function public.anotar_comprobante_de_la_guia(p_servicio uuid, p_tipo text, p_numero text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero text := nullif(btrim(coalesce(p_numero, '')), '');
begin
  if rol_actual()::text not in ('facturacion', 'finanzas', 'gerencia', 'admin') and not coalesce(es_operaciones(), false) then
    raise exception 'El comprobante lo anota Contabilidad o Finanzas';
  end if;
  if p_tipo not in ('factura', 'boleta') then raise exception 'Comprobante no válido: factura o boleta'; end if;
  if v_numero is null then raise exception 'Escriba el número de la %', p_tipo; end if;
  update servicios_postventa
     set guia_comprobante_tipo = p_tipo,
         guia_comprobante_numero = v_numero,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
     and guia_confirmada_at is not null
     and coalesce(guia_comprobante_tipo, 'sin_comprobante') = 'sin_comprobante';
  if not found then raise exception 'Este pedido no tiene una guía autorizada sin comprobante'; end if;
end $$;

revoke all on function public.frenar_salida_sin_visto_bueno() from public, anon;
revoke all on function public.finanzas_visto_bueno_salida(uuid, text, integer, numeric, text) from public, anon;
revoke all on function public.finanzas_letras_firmadas(uuid, text) from public, anon;
revoke all on function public.anotar_comprobante_de_la_guia(uuid, text, text) from public, anon;
grant execute on function public.finanzas_visto_bueno_salida(uuid, text, integer, numeric, text) to authenticated;
grant execute on function public.finanzas_letras_firmadas(uuid, text) to authenticated;
grant execute on function public.anotar_comprobante_de_la_guia(uuid, text, text) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0469_visto_bueno_de_finanzas_para_la_salida.sql')
on conflict do nothing;
