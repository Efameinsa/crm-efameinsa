-- ============================================================
-- CRM EFAMEINSA · Migración 0038 · Correlativo oficial y reinicio anual
-- ============================================================
-- Dos cosas que quedaron pendientes desde el inicio y que el archivo de
-- cotizaciones (migración 0036) permite por fin resolver con datos:
--
-- 1) EL CRM ARRANCABA EN 1. La empresa venía numerando sus presupuestos desde
--    hace años; el CRM abrió su propia cuenta y llegó a 21 (EFAMEINSA) y 2
--    (OPEN) durante las pruebas. Si el piloto arrancaba así, el primer
--    presupuesto real habría salido con un número ya usado — justo el problema
--    que el ing. Carlos describió ("cliente A la 100, cliente B la 100").
--    El último número OFICIAL, leído de los documentos que la empresa emitió:
--      · EFAMEINSA → 2176   (Presu_2176-26, del 19-08-2026)
--      · OPEN      → 446    (Presu_446-26,  del 19-08-2026)
--    Ambos son del día más reciente del archivo, o sea "hasta dónde nos hemos
--    quedado". Se descartaron dos valores más altos por ser errores de tipeo
--    dentro del documento, comprobados contra el nombre del archivo: un "3000"
--    en el archivo Presu_2086-26 y un "679" en el archivo Presu_180-26.
--
-- 2) LA SERIE REINICIA CADA AÑO. El correlativo era un contador continuo, pero
--    los 2.644 documentos lo confirman: todos son "-26" y van del 8 al 2176.
--    En enero la empresa vuelve a 1. Con el contador continuo, el CRM habría
--    seguido en 2177 en 2027 y los números no habrían cuadrado con la
--    contabilidad. Ahora la clave del contador incluye el año.
--
-- El correlativo de leads ('PRO') NO se toca: es una serie interna del CRM,
-- no un documento oficial con validez ante el cliente.

-- ------------------------------------------------------------
-- Contador por serie y año, que se crea solo la primera vez que se usa
-- ------------------------------------------------------------
create or replace function siguiente_correlativo_anual(p_serie text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio  integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_clave text := p_serie || '-' || v_anio;
  v        integer;
begin
  -- El año nuevo empieza en 0 salvo que se haya precargado el último número
  -- oficial (ver el insert de más abajo). `on conflict do nothing` deja que
  -- dos inserciones simultáneas no se pisen.
  insert into correlativos (clave, ultimo) values (v_clave, 0)
    on conflict (clave) do nothing;

  update correlativos set ultimo = ultimo + 1 where clave = v_clave
    returning ultimo into v;
  if v is null then
    raise exception 'No se pudo asignar el correlativo de la serie %', p_serie;
  end if;
  return v;
end $$;

-- ------------------------------------------------------------
-- El trigger de cotizaciones pasa a usarlo
-- ------------------------------------------------------------
create or replace function asignar_correlativo_cotizacion()
returns trigger language plpgsql security definer as $$
begin
  if new.correlativo is null then
    new.correlativo := siguiente_correlativo_anual(new.serie::text);
    -- El código impreso lleva el año, como en los documentos de la empresa
    -- ("Presu_2177-26"), para que un número de este año no se confunda con el
    -- mismo número del año pasado.
    new.codigo := 'Presu_' || new.correlativo::text || '-' ||
                  to_char((now() at time zone 'America/Lima'), 'YY');
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- Punto de partida oficial para 2026
-- ------------------------------------------------------------
insert into correlativos (clave, ultimo) values
  ('EFAMEINSA-2026', 2176),
  ('OPEN-2026', 446)
on conflict (clave) do update set ultimo = greatest(correlativos.ultimo, excluded.ultimo);

-- Las claves viejas sin año quedaron con los números de las pruebas (21 y 2).
-- Se dejan a 0 para que, si algo las usara por error, no emita un número que
-- ya existe en un documento real.
update correlativos set ultimo = 0 where clave in ('EFAMEINSA', 'OPEN');

comment on function siguiente_correlativo_anual(text) is
  'Correlativo de cotizaciones por serie y año (la empresa reinicia la numeración cada enero). El punto de partida de 2026 son los últimos números oficiales leídos del archivo de documentos: EFAMEINSA 2176, OPEN 446.';
