-- ============================================================
-- CRM EFAMEINSA · Migración 0145 · Las cuentas de práctica numeran en su propia serie
-- ============================================================
-- Reclamo de Katherine (C5) el 01-09, con captura: sus cotizaciones saltan
-- de Presu_2201-26 a Presu_2210-26. Investigado ese día con Santos:
--
--   · Los números 2202 a 2208 los consumieron PRUEBAS INTERNAS del 28-08
--     hechas con la cuenta «Comercial de pruebas» (C0). La función de envío
--     no distinguía cuentas de práctica: pedía un número a la serie real
--     igual que una comercial de verdad. Esa noche la limpieza de práctica
--     borró esas cotizaciones y el contador —que por diseño nunca retrocede
--     (0077)— dejó el hueco.
--   · Se repitió el 29-08 (Presu_2210 y 2211 de práctica, borradas el 01-09,
--     razón por la que Katherine recibió el 2210 ese día).
--   · Los informes de cierre sufrían lo mismo: la serie EFAMEINSA tiene el
--     001 real, faltan 002 y 003 (pruebas borradas) y el 004 es una prueba
--     huérfana del 28-08 13:22 que la limpieza no cubría. Los informes de
--     servicio de postventa igual: el 007 es de práctica.
--
-- Pedido de Santos: «que las cuentas de práctica numeren una serie propia,
-- tanto cotizaciones como informes, para que se vea que son prueba».
--
-- LO QUE CAMBIA. Cuando quien emite es una cuenta de práctica (`es_prueba`
-- en perfiles, o la fila ya viene marcada `es_prueba`), el número sale de
-- un contador APARTE y el código lo dice en la cara:
--
--   cotización de práctica      PRUEBA_1-26        (correlativo 900001…)
--   informe de cierre práctica  PRUEBA-904-2026    (correlativo 901…, el
--                                                    rango 900 que ya usaba
--                                                    el banco de PV0 desde
--                                                    el 27-08)
--   informe de servicio práct.  911-2026 y en pantalla «PRUEBA 911-2026»
--
-- Los correlativos de práctica viven lejos de la serie real para que la
-- restricción (serie, correlativo) siga siendo única y el contador real
-- nunca los pise. Las funciones reales no se tocan: la rama de práctica
-- se decide ANTES de pedir número.
--
-- SANEO de lo que dejó el 28-08: se retira el informe 004-2026 huérfano
-- (es de práctica y su cliente ya no existe), el contador real de informes
-- EFAMEINSA vuelve al último emitido DE VERDAD (001, así el próximo real
-- es 002), el informe de servicio 007 de práctica pasa a la serie de
-- práctica y ese contador vuelve a cero porque no hay ninguno real.
-- El hueco 2202-2208 de cotizaciones NO se cierra: el 2209 (Brenda) y el
-- 2210 (Katherine) son reales y el contador no retrocede por encima de un
-- número que ya salió a un cliente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. El contador de práctica: uno por clave, con salto de ocupados
-- ------------------------------------------------------------
create or replace function siguiente_correlativo_de_practica(p_clave text, p_base integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor integer;
begin
  insert into correlativos (clave, ultimo) values (p_clave, 0)
    on conflict (clave) do nothing;
  update correlativos set ultimo = ultimo + 1 where clave = p_clave
    returning ultimo into v_valor;
  if v_valor is null then
    raise exception 'No se pudo asignar el correlativo de práctica %', p_clave;
  end if;
  return p_base + v_valor;
end $$;

comment on function siguiente_correlativo_de_practica(text, integer) is
  'Correlativo de las cuentas de práctica: contador propio por clave, desplazado p_base para que nunca choque con la serie real (migración 0145).';

-- ¿La cotización es de práctica? Lo es si la emite una cuenta de práctica o
-- si la oportunidad pertenece a un comercial de práctica.
create or replace function cotizacion_es_de_practica(p_cotizacion_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select es_cuenta_prueba()
      or exists (
        select 1
          from cotizaciones c
          join oportunidades o on o.id = c.oportunidad_id
          left join perfiles pc on pc.id = c.creada_por
          left join perfiles po on po.id = o.comercial_id
         where c.id = p_cotizacion_id
           and (coalesce(pc.es_prueba, false) or coalesce(po.es_prueba, false)));
$$;

-- ------------------------------------------------------------
-- 2. emitir_cotizacion: la rama de práctica va antes de pedir número
-- ------------------------------------------------------------
create or replace function emitir_cotizacion(p_cotizacion_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot         cotizaciones%rowtype;
  v_correlativo integer;
  v_codigo      text;
  v_hoy         date := (now() at time zone 'America/Lima')::date;
  v_siguiente   date;
  v_anio        integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_yy          text := to_char((now() at time zone 'America/Lima'), 'YY');
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if not exists (
    select 1 from oportunidades o
    where o.id = v_cot.oportunidad_id
      and (o.comercial_id = auth.uid() or es_backoffice())
  ) then
    raise exception 'Solo el comercial dueño de la oportunidad puede enviarla';
  end if;

  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya fue enviada al cliente';
  end if;

  if v_cot.estado_aprobacion = 'pendiente_gerencia' then
    raise exception 'Gerencia todavía no aprueba los precios de esta cotización';
  end if;
  if v_cot.estado_aprobacion = 'rechazada_gerencia' then
    raise exception 'Gerencia rechazó los precios de esta cotización; corríjala antes de enviarla';
  end if;

  if not exists (select 1 from cotizacion_items where cotizacion_id = p_cotizacion_id) then
    raise exception 'La cotización necesita al menos un equipo';
  end if;

  if cotizacion_es_de_practica(p_cotizacion_id) then
    -- Serie de práctica: contador propio, número lejos de la serie real y
    -- código que lo dice. Si el número ya estuviera ocupado (una siembra
    -- vieja), se salta igual que en la serie real.
    loop
      v_correlativo := siguiente_correlativo_de_practica(
        'PRUEBA-' || v_cot.serie::text || '-' || v_anio::text, 900000);
      exit when not exists (
        select 1 from cotizaciones where serie = v_cot.serie and correlativo = v_correlativo);
    end loop;
    v_codigo := 'PRUEBA_' || (v_correlativo - 900000)::text || '-' || v_yy;
  else
    v_correlativo := siguiente_correlativo_anual(v_cot.serie::text);
    v_codigo := 'Presu_' || v_correlativo::text || '-' || v_yy;
  end if;

  update cotizaciones
     set correlativo = v_correlativo,
         codigo      = v_codigo,
         estado      = 'enviada',
         enviada_at  = now()
   where id = p_cotizacion_id;

  -- El día hábil siguiente: acá se trabaja de lunes a sábado, así que lo único
  -- que se salta es el domingo.
  v_siguiente := v_hoy + 1;
  if extract(dow from v_siguiente) = 0 then v_siguiente := v_siguiente + 1; end if;

  update oportunidades set
    etapa = case
      when etapa in ('asignada', 'filtrada', 'seguimiento') then 'cotizada'::etapa_oportunidad
      else etapa
    end,
    proxima_accion = case
      when proxima_accion ~* 'enviar.*cotiza' then 'Hacer seguimiento a la cotización'
      else proxima_accion
    end,
    proxima_accion_at = case
      when proxima_accion ~* 'enviar.*cotiza' then v_siguiente
      else proxima_accion_at
    end,
    updated_at = now()
  where id = v_cot.oportunidad_id;

  return v_codigo;
end $$;

-- ------------------------------------------------------------
-- 3. Informes de cierre: el código generado dice PRUEBA cuando lo es
-- ------------------------------------------------------------
-- La columna es generada y su expresión no se puede alterar: se vuelve a
-- crear. Nada depende de ella por catálogo (ni vistas ni índices); las
-- funciones la citan por nombre y siguen valiendo.
alter table informes_cierre drop column codigo;
alter table informes_cierre add column codigo text
  generated always as (
    case when es_prueba then 'PRUEBA-' else '' end
    || lpad(correlativo::text, 3, '0') || '-' || anio::text
  ) stored;

comment on column informes_cierre.codigo is
  'Número visible del informe: 001-2026. Los de práctica llevan el prefijo PRUEBA- (migración 0145).';

create or replace function emitir_informe(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_informe informes_cierre%rowtype;
  v_correlativo integer;
  v_clave text;
begin
  select * into v_informe from informes_cierre where id = p_id;
  if v_informe is null then
    raise exception 'Informe no encontrado';
  end if;
  if not es_backoffice()
     and not exists (select 1 from cuentas c where c.id = v_informe.cuenta_id and c.comercial_id = auth.uid()) then
    raise exception 'No autorizado para emitir este informe';
  end if;
  if v_informe.emitido_at is not null then
    raise exception 'El informe % ya fue emitido', v_informe.codigo;
  end if;
  if jsonb_array_length(v_informe.items) = 0 then
    raise exception 'El informe necesita al menos un equipo';
  end if;

  if v_informe.es_prueba or es_cuenta_prueba() then
    -- Serie de práctica: rango 900 (el que ya usaba el banco de PV0), con
    -- salto de los que ya existen.
    loop
      v_correlativo := siguiente_correlativo_de_practica(
        'INFORME-PRUEBA-' || v_informe.serie::text || '-' || v_informe.anio::text, 900);
      exit when not exists (
        select 1 from informes_cierre
         where serie = v_informe.serie and anio = v_informe.anio and correlativo = v_correlativo);
    end loop;

    update informes_cierre
       set correlativo = v_correlativo, emitido_at = now()
     where id = p_id;

    return 'PRUEBA-' || lpad(v_correlativo::text, 3, '0') || '-' || v_informe.anio::text;
  end if;

  v_clave := 'INFORME-' || v_informe.serie::text || '-' || v_informe.anio::text;

  select r.numero into v_correlativo
    from correlativos_reservas r
   where r.clave = v_clave
     and r.perfil_id = v_informe.creado_por
     and not exists (
       select 1 from informes_cierre i
        where i.serie = v_informe.serie and i.anio = v_informe.anio and i.correlativo = r.numero)
   order by r.numero
   limit 1;

  if v_correlativo is not null then
    delete from correlativos_reservas where clave = v_clave and numero = v_correlativo;
  else
    v_correlativo := siguiente_correlativo_informe(v_informe.serie, v_informe.anio);
  end if;

  update informes_cierre
     set correlativo = v_correlativo, emitido_at = now()
   where id = p_id;

  return lpad(v_correlativo::text, 3, '0') || '-' || v_informe.anio::text;
end $$;

-- ------------------------------------------------------------
-- 4. Informes de servicio (postventa): el número lo pide la pantalla
-- ------------------------------------------------------------
create or replace function siguiente_correlativo_informe_servicio(p_anio integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text := 'INFORME-SERVICIO-' || p_anio::text;
  v_valor integer;
begin
  if es_cuenta_prueba() then
    loop
      v_valor := siguiente_correlativo_de_practica('INFORME-SERVICIO-PRUEBA-' || p_anio::text, 900);
      exit when not exists (
        select 1 from informes_servicio where anio = p_anio and correlativo = v_valor);
    end loop;
    return v_valor;
  end if;

  insert into correlativos (clave, ultimo) values (v_clave, 0) on conflict (clave) do nothing;
  update correlativos set ultimo = ultimo + 1 where clave = v_clave returning ultimo into v_valor;
  return v_valor;
end $$;

-- ------------------------------------------------------------
-- 5. Saneo de lo que dejaron las pruebas del 28-08
-- ------------------------------------------------------------
do $$
declare
  v_informe uuid;
begin
  -- El informe de cierre 004-2026 EFAMEINSA: prueba huérfana del 28-08 13:22
  -- (su cliente ya no existe). Al emitirse encadenó un servicio de postventa,
  -- un equipo instalado «PRB-TEST-…» y el informe de servicio 007, todos
  -- marcados de práctica y sin cliente: se van los cuatro, en orden de FK.
  select id into v_informe from informes_cierre
   where serie = 'EFAMEINSA' and anio = 2026 and correlativo = 4 and es_prueba
     and not exists (select 1 from cuentas c where c.id = informes_cierre.cuenta_id);
  if v_informe is not null then
    delete from informes_servicio s
     where s.es_prueba and (
       s.servicio_id in (select id from servicios_postventa where informe_cierre_id = v_informe and es_prueba)
       or s.equipo_id in (select id from equipos_instalados where informe_cierre_id = v_informe and es_prueba));
    delete from equipos_instalados where informe_cierre_id = v_informe and es_prueba;
    delete from servicios_postventa where informe_cierre_id = v_informe and es_prueba;
    delete from informes_cierre where id = v_informe;
  end if;

  -- Los contadores reales de informes vuelven al último emitido DE VERDAD
  -- (los de práctica ya no cuentan ahí).
  update correlativos c
     set ultimo = coalesce((select max(i.correlativo) from informes_cierre i
                             where i.serie = 'EFAMEINSA' and i.anio = 2026
                               and not i.es_prueba and i.correlativo < 900), 0)
   where c.clave = 'INFORME-EFAMEINSA-2026';
  update correlativos c
     set ultimo = coalesce((select max(i.correlativo) from informes_cierre i
                             where i.serie = 'OPEN' and i.anio = 2026
                               and not i.es_prueba and i.correlativo < 900), 0)
   where c.clave = 'INFORME-OPEN-2026';

  -- El contador real de informes de servicio queda en el último emitido de
  -- verdad (hoy, ninguno: el 007 era de esa misma prueba y ya se fue).
  update correlativos c
     set ultimo = coalesce((select max(i.correlativo) from informes_servicio i
                             where i.anio = 2026 and not i.es_prueba and i.correlativo < 900), 0)
   where c.clave = 'INFORME-SERVICIO-2026';
end $$;
