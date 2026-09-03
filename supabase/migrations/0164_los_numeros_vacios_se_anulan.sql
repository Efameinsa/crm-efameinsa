-- ============================================================
-- CRM EFAMEINSA · Migración 0164 · Los números vacíos se anulan, no se rellenan
-- ============================================================
-- Reunión de Santos con el ing. Carlos del 03-09 (grabación 13:05), y manda
-- sobre lo que se había decidido el 01-09 (rellenar el 2202-2208) y el 02-09
-- (contador de cierres devuelto a 5 para rellenar el 006-009):
--
--   «Los huecos no se tapan, se anula y ya está. Cotizaciones, todo lo
--    anterior, queda desestimado. Todo lo vacío queda anulado. Puedes generar
--    algo que diga anulado: el reporte es el correlativo.»
--
-- Por qué: un número que se rellena semanas después sale con fecha de
-- setiembre entre documentos de agosto y «mancha» los indicadores por mes.
-- Un número anulado dice lo que pasó y no vuelve a salir.
--
-- QUÉ HACE.
--   1. `correlativos_anulados`: la lista de números que no llevan documento y
--      por qué. Se lee desde Central (presupuestos y cierres) para que el
--      correlativo se vea completo: emitidos, anulados y vacíos-anulados.
--   2. Los dos contadores (`siguiente_correlativo_anual` para cotizaciones,
--      `siguiente_correlativo_informe` para cierres) saltan también esos
--      números. Hoy los contadores ya están por encima (2211 y 12), así que es
--      un cinturón: si alguien los vuelve a bajar, el número anulado no sale.
--   3. Se anotan los de hoy: cierres OPEN 007-009 (vacíos por el error del
--      contador del 01-09) y cotizaciones EFAMEINSA 2186-2190 (borradores
--      borrados la tarde del 24-08, antes de que el número se diera al enviar)
--      y 2202-2208 (pruebas de práctica del 28-08, borradas).
--
-- Lo que NO hace: no toca cotizaciones ni informes existentes; el 006 que
-- Brenda emitió a las 12:08, antes de la orden, se queda.
-- ============================================================

create table if not exists correlativos_anulados (
  clave       text        not null,
  numero      integer     not null,
  motivo      text        not null,
  anulado_por uuid        references perfiles(id),
  created_at  timestamptz not null default now(),
  primary key (clave, numero)
);

comment on table correlativos_anulados is
  'Números de una serie que no llevan documento y quedan anulados por decisión de gerencia (03-09: «todo lo vacío queda anulado»). Los contadores los saltan y Central los ve en su lista de correlativos.';

alter table correlativos_anulados enable row level security;

drop policy if exists correlativos_anulados_lectura on correlativos_anulados;
create policy correlativos_anulados_lectura on correlativos_anulados
  for select to authenticated using (true);
-- Escritura solo por migraciones y funciones security definer.

-- ------------------------------------------------------------
-- 1. Cotizaciones: el contador salta los anulados.
--    (definición viva de la 0064/0077/0145 más la comprobación nueva)
create or replace function siguiente_correlativo_anual(p_serie text)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_anio   integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_clave  text    := p_serie || '-' || v_anio;
  v        integer;
  v_saltos integer := 0;
begin
  insert into correlativos (clave, ultimo) values (v_clave, 0)
    on conflict (clave) do nothing;

  loop
    update correlativos set ultimo = ultimo + 1 where clave = v_clave
      returning ultimo into v;
    if v is null then
      raise exception 'No se pudo asignar el correlativo de la serie %', p_serie;
    end if;

    exit when not exists (
        select 1 from cotizaciones
         where serie = p_serie::serie_cotizacion and correlativo = v
      ) and not exists (
        select 1 from cotizaciones_historicas
         where serie = p_serie::serie_cotizacion and anio = v_anio and correlativo = v
      ) and not exists (
        select 1 from correlativos_reservas r
         where r.clave = v_clave and r.numero = v and reserva_vigente(r)
      ) and not exists (
        select 1 from correlativos_anulados a
         where a.clave = v_clave and a.numero = v
      );

    v_saltos := v_saltos + 1;
    raise notice 'Correlativo %-% ya estaba usado, reservado o anulado; se salta.', v, v_anio;
    if v_saltos > 500 then
      raise exception 'La serie % tiene 500 números seguidos ocupados: revisar el archivo antes de seguir emitiendo', p_serie;
    end if;
  end loop;

  return v;
end $function$;

-- ------------------------------------------------------------
-- 2. Cierres: el contador salta los anulados.
create or replace function siguiente_correlativo_informe(p_serie serie_cotizacion, p_anio integer)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_clave  text := 'INFORME-' || p_serie::text || '-' || p_anio::text;
  v_valor  integer;
  v_saltos integer := 0;
begin
  insert into correlativos (clave, ultimo) values (v_clave, 0) on conflict (clave) do nothing;
  loop
    update correlativos set ultimo = ultimo + 1 where clave = v_clave returning ultimo into v_valor;
    if v_valor is null then
      raise exception 'No se pudo asignar el correlativo del informe %', v_clave;
    end if;
    exit when not exists (
        select 1 from informes_cierre
         where serie = p_serie and anio = p_anio and correlativo = v_valor)
      and not exists (
        select 1 from correlativos_reservas where clave = v_clave and numero = v_valor)
      and not exists (
        select 1 from correlativos_anulados where clave = v_clave and numero = v_valor);
    v_saltos := v_saltos + 1;
    if v_saltos > 200 then
      raise exception 'La serie % saltó más de 200 números seguidos: revisar correlativos y reservas', v_clave;
    end if;
  end loop;
  return v_valor;
end;
$function$;

-- ------------------------------------------------------------
-- 3. Los anulados de hoy.
insert into correlativos_anulados (clave, numero, motivo, anulado_por)
select 'INFORME-OPEN-2026', n,
       'Número vacío: el 01-09 una migración movió el contador de 5 a 10 y el 011 y el 012 salieron antes. Anulado por decisión de gerencia (03-09): los huecos no se rellenan.',
       '7903ef3b-b139-4fa9-aaec-83f172ae7c69'::uuid
  from generate_series(7, 9) n
on conflict (clave, numero) do nothing;

insert into correlativos_anulados (clave, numero, motivo, anulado_por)
select 'EFAMEINSA-2026', n,
       'Número consumido por borradores creados y borrados la tarde del 24-08, cuando el número todavía se daba al crear la cotización. Anulado por decisión de gerencia (03-09).',
       '7903ef3b-b139-4fa9-aaec-83f172ae7c69'::uuid
  from generate_series(2186, 2190) n
on conflict (clave, numero) do nothing;

insert into correlativos_anulados (clave, numero, motivo, anulado_por)
select 'EFAMEINSA-2026', n,
       'Número consumido por pruebas de la cuenta de práctica el 28-08, borradas. Anulado por decisión de gerencia (03-09): los huecos no se rellenan.',
       '7903ef3b-b139-4fa9-aaec-83f172ae7c69'::uuid
  from generate_series(2202, 2208) n
on conflict (clave, numero) do nothing;
