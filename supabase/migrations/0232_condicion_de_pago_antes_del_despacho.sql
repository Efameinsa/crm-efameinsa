-- ============================================================
-- CRM EFAMEINSA · Migración 0232 · La condición de pago manda en el despacho
-- ============================================================
-- Reunión 14-09 (Carlos, Lesly, postventa). Rubí quería registrar la salida
-- del pedido 495-26 (V Y P ICE, Miriam Machacuay) y el CRM le pidió «quién lo
-- autorizó y por qué» por un saldo de USD 4.472,20: el total del pedido.
-- Carlos: «no sé si hemos pensado muy bien quién lo va a autorizar y por qué;
-- la señorita tiene un crédito, 30 % al contado y lo que falta a crédito, o a
-- todo crédito. Eso ya está pensado, siempre ha sido así».
--
-- QUÉ PASABA. La regla del despacho (0087) compara lo pagado con el TOTAL.
-- La condición negociada («50 % adelanto + 50 % crédito a 30 días») vive como
-- texto libre en `modalidad_pago`, así que el sistema no la puede leer, y
-- toda venta a crédito —que es la normal de la casa— pedía autorización en
-- cada despacho. Encima, la confirmación de Finanzas con captura no exige
-- cifra: el pedido quedó «confirmado» con monto pagado 0.
--
-- QUÉ CAMBIA.
--   1. El informe de cierre lleva la condición como DATO, no solo como texto:
--      `pct_antes_despacho` (qué porcentaje del total debe estar pagado para
--      despachar) y `credito_dias` (a cuántos días va el saldo). Gerencia ya
--      aprueba el informe: la condición queda autorizada de una vez.
--   2. El pedido de postventa la copia al liberarse (parche a
--      liberar_pedido_postventa) y la regla del despacho compara lo pagado
--      contra lo ACORDADO, no contra el total. La autorización con nombre y
--      motivo se pide solo cuando se despacha con menos de lo acordado.
--   3. Para los pedidos que ya existen, gerencia u operaciones la definen
--      desde el pedido con `definir_condicion_pago_pedido`, y de paso queda
--      escrita en el informe.
--   4. Relleno inicial desde las modalidades ya marcadas (CONTADO, 50 %
--      ADELANTO, CRÉDITO…). Lo que no se pueda leer queda en NULL y el
--      despacho sigue con la regla de hoy (todo pagado), sin inventar nada.
--
-- Las funciones vivas se parchan con replace y verificación (0174), nunca
-- copiando el cuerpo (crm-no-copiar-funciones-cotizacion).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas
-- ------------------------------------------------------------
alter table informes_cierre
  add column if not exists pct_antes_despacho numeric(5,2)
    check (pct_antes_despacho is null or (pct_antes_despacho >= 0 and pct_antes_despacho <= 100)),
  add column if not exists credito_dias integer
    check (credito_dias is null or (credito_dias >= 0 and credito_dias <= 365));

comment on column informes_cierre.pct_antes_despacho is
  'Porcentaje del total que debe estar pagado ANTES de despachar (100 = contado, 50 = 50 % adelanto, 0 = todo a crédito). Aprobado con el informe; el pedido lo copia (0232).';
comment on column informes_cierre.credito_dias is
  'A cuántos días va el saldo que queda después del despacho. NULL cuando no hay saldo (0232).';

alter table servicios_postventa
  add column if not exists pct_antes_despacho numeric(5,2)
    check (pct_antes_despacho is null or (pct_antes_despacho >= 0 and pct_antes_despacho <= 100)),
  add column if not exists credito_dias integer
    check (credito_dias is null or (credito_dias >= 0 and credito_dias <= 365)),
  add column if not exists condicion_definida_por uuid references perfiles (id),
  add column if not exists condicion_definida_at  timestamptz,
  add column if not exists condicion_nota         text;

comment on column servicios_postventa.pct_antes_despacho is
  'Copia de la condición del informe: qué % del total debe estar pagado para despachar sin autorización. NULL = se exige todo, como antes de la 0232.';
comment on column servicios_postventa.credito_dias is
  'Días de crédito del saldo; con la fecha de despacho da el vencimiento de la cuenta por cobrar (0232).';
comment on column servicios_postventa.condicion_definida_por is
  'Quién fijó la condición a mano desde el pedido (gerencia u operaciones). NULL cuando vino del informe o del relleno de la 0232.';

-- ------------------------------------------------------------
-- 2. Ayuda: parchar una función viva, con verificación (patrón 0174)
-- ------------------------------------------------------------
create or replace function public._parche_0232(
  p_funcion text,
  p_buscar  text,
  p_poner   text
) returns void
language plpgsql
as $function$
declare
  v_def   text;
  v_veces integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_funcion;

  if v_def is null then
    raise exception '0232: no existe la función %', p_funcion;
  end if;

  if position(p_poner in v_def) > 0 then
    raise notice '0232: % ya estaba parchada, se deja como está', p_funcion;
    return;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, p_buscar, ''))) / length(p_buscar);
  if v_veces <> 1 then
    raise exception '0232: en % el fragmento aparece % veces, se esperaba 1. El cuerpo cambió: revisar a mano.',
      p_funcion, v_veces;
  end if;

  execute replace(v_def, p_buscar, p_poner);
  raise notice '0232: % parchada', p_funcion;
end $function$;

-- ------------------------------------------------------------
-- 3. El pedido copia la condición del informe al liberarse
-- ------------------------------------------------------------
select public._parche_0232(
  'liberar_pedido_postventa',
  $q$      monto, moneda, forma_pago, modalidad,
      direccion_entrega, despacho_nota, numero_pedido_erp, origen$q$,
  $q$      monto, moneda, forma_pago, modalidad,
      pct_antes_despacho, credito_dias,
      direccion_entrega, despacho_nota, numero_pedido_erp, origen$q$
);

select public._parche_0232(
  'liberar_pedido_postventa',
  $q$      array_to_string(v_informe.modalidad_pago, ' + '), v_modalidad,
      coalesce(v_informe.entrega_direccion, v_informe.entrega_lugar),$q$,
  $q$      array_to_string(v_informe.modalidad_pago, ' + '), v_modalidad,
      v_informe.pct_antes_despacho, v_informe.credito_dias,
      coalesce(v_informe.entrega_direccion, v_informe.entrega_lugar),$q$
);

drop function public._parche_0232(text, text, text);

-- ------------------------------------------------------------
-- 4. Leer la condición de las modalidades ya escritas
-- ------------------------------------------------------------
-- Solo lo que se puede leer sin dudar. Los regex de la base no entienden \s
-- (crm-regexp-backslash-s-no-funciona): se usa [[:space:]].
create or replace function public.condicion_desde_modalidad(p_modalidad text[])
returns table (pct numeric, dias integer)
language plpgsql
immutable
as $function$
declare
  v_txt      text := lower(coalesce(array_to_string(p_modalidad, ' '), ''));
  v_adelanto numeric;
  v_antes    numeric;
  v_credito  numeric;
  v_m        text[];
begin
  pct := null; dias := null;
  if v_txt = '' then return next; return; end if;

  v_m := regexp_match(v_txt, '([0-9]{1,3})[[:space:]]*%[[:space:]]*(de[[:space:]]+)?adelanto');
  if v_m is not null then v_adelanto := v_m[1]::numeric; end if;

  v_m := regexp_match(v_txt, '([0-9]{1,3})[[:space:]]*%[^%]{0,40}antes[[:space:]]+del[[:space:]]+despacho');
  if v_m is not null then v_antes := v_m[1]::numeric; end if;

  v_m := regexp_match(v_txt, '([0-9]{1,3})[[:space:]]*%[[:space:]]*(de[[:space:]]+|a[[:space:]]+)?cr[eé]dito');
  if v_m is not null then v_credito := v_m[1]::numeric; end if;

  v_m := regexp_match(v_txt, 'cr[eé]dito[^0-9]{0,15}([0-9]{1,3})[[:space:]]*d[ií]as?');
  if v_m is not null then dias := v_m[1]::integer; end if;

  if v_txt ~ '(^|[^a-z])contado([^a-z]|$)' and v_adelanto is null and v_antes is null and v_credito is null then
    pct := 100;
  elsif v_adelanto is not null or v_antes is not null then
    pct := least(100, coalesce(v_adelanto, 0) + coalesce(v_antes, 0));
  elsif v_credito is not null then
    pct := greatest(0, 100 - v_credito);
  elsif v_txt ~ 'cr[eé]dito' then
    pct := 0;
  end if;

  if pct is not null and pct < 100 and dias is null and v_txt ~ 'cr[eé]dito' then
    dias := 30;   -- el plazo de la casa cuando no se escribió otro
  end if;
  if pct = 100 then dias := null; end if;
  return next;
end $function$;

comment on function public.condicion_desde_modalidad(text[]) is
  'Lee «50 % adelanto», «crédito a 30 días», «contado»… de las modalidades del informe y devuelve (pct antes del despacho, días de crédito). NULL cuando no se puede leer (0232).';

-- Informes emitidos sin condición: se rellena lo legible. El informe emitido
-- es inmutable (bloquear_edicion_informe); el relleno pasa por la misma
-- puerta que la corrección con código, y solo dentro de esta transacción.
select set_config('app.corrigiendo_cierre', 'si', true);
update informes_cierre i
   set pct_antes_despacho = c.pct,
       credito_dias       = c.dias
  from (
    select x.id, l.pct, l.dias
      from informes_cierre x
     cross join lateral public.condicion_desde_modalidad(x.modalidad_pago) l
  ) c
 where c.id = i.id
   and i.pct_antes_despacho is null
   and c.pct is not null;

-- Pedidos que vienen de un informe: copian lo del informe.
update servicios_postventa s
   set pct_antes_despacho = i.pct_antes_despacho,
       credito_dias       = i.credito_dias
  from informes_cierre i
 where i.id = s.informe_cierre_id
   and s.pct_antes_despacho is null
   and i.pct_antes_despacho is not null;

-- ------------------------------------------------------------
-- 5. Definir la condición desde el pedido (gerencia u operaciones)
-- ------------------------------------------------------------
create or replace function public.definir_condicion_pago_pedido(
  p_servicio uuid,
  p_pct      numeric,
  p_dias     integer,
  p_nota     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_informe uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if rol_actual() not in ('gerencia', 'admin', 'operaciones') then
    raise exception 'La condición de pago la define gerencia u operaciones, no el área que despacha';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'El porcentaje antes del despacho va de 0 a 100';
  end if;
  if p_pct < 100 and (p_dias is null or p_dias < 0 or p_dias > 365) then
    raise exception 'Si queda saldo a crédito, diga a cuántos días (0 a 365)';
  end if;

  update servicios_postventa
     set pct_antes_despacho     = p_pct,
         credito_dias           = case when p_pct = 100 then null else p_dias end,
         condicion_definida_por = auth.uid(),
         condicion_definida_at  = now(),
         condicion_nota         = nullif(trim(coalesce(p_nota, '')), '')
   where id = p_servicio
   returning informe_cierre_id into v_informe;
  if not found then raise exception 'Ese pedido no existe'; end if;

  if v_informe is not null then
    -- El informe emitido es inmutable salvo por la puerta de la corrección;
    -- acá ya se verificó el rol, y el ajuste es solo de la transacción.
    perform set_config('app.corrigiendo_cierre', 'si', true);
    update informes_cierre
       set pct_antes_despacho = p_pct,
           credito_dias       = case when p_pct = 100 then null else p_dias end
     where id = v_informe;
  end if;
end $function$;

revoke all on function public.definir_condicion_pago_pedido(uuid, numeric, integer, text) from public;
grant execute on function public.definir_condicion_pago_pedido(uuid, numeric, integer, text) to authenticated;

comment on function public.definir_condicion_pago_pedido(uuid, numeric, integer, text) is
  'Gerencia u operaciones fijan, desde el pedido, qué % debe estar pagado antes de despachar y a cuántos días va el saldo. Se escribe en el pedido y en su informe (0232).';
