-- ============================================================
-- CRM EFAMEINSA · Migración 0147 · Los servicios del Excel encuentran a su cliente
-- ============================================================
-- Reclamo de la señorita de postventa el 01-09, con Santos al lado: a
-- PERUVIAN NATURE S & S S.A.C. le hicieron este año mantenimiento preventivo
-- y correctivo, y en el CRM solo aparece lo del 2024. Y se ve una duplicidad.
--
-- LO QUE PASABA. Los dos trabajos de 2026 (repuestos US$ 1.244 y correctivo
-- US$ 1.003, confirmados el 24-03-2026) SÍ están en la base: entraron el
-- 25-08 con la cola de despachos del Excel de Hever, como `servicios_postventa`.
-- Pero quedaron con `cuenta_id` NULO: el Excel dice «PERUVIAN NATURE S & S
-- SAC» y la ficha dice «PERUVIAN NATURE S & S S.A.C», y el cruce del import
-- (crear-postventa.mjs) era por razón social EXACTA. Sin cliente, no salen en
-- ninguna ficha. No es un caso: 123 de los 186 servicios del Excel están
-- sueltos, y 50 casan con una ficha apenas se ignoran puntos y espacios.
--
-- La duplicidad: el archivo histórico tiene dos veces la cotización OPEN
-- 854-25 — una es el archivo «Presu_855-25, … - copia», una copia renombrada
-- cuyo contenido sigue diciendo 854. Es el único grupo con «copia» del
-- archivo; las otras 257 colisiones de número son otro asunto (ver docs/19).
--
-- LO QUE HACE.
--   1. Enlaza los servicios sueltos cuya razón social casa con UNA sola
--      ficha ignorando puntuación, espacios y el RUC pegado adelante. Si
--      casa con dos fichas (cliente partido), NO adivina: se queda suelto y
--      se resuelve cuando se fusionen (docs/fichas-partidas).
--   2. PERUVIAN NATURE: sus carpetas del servidor (X: informes, W: fotos),
--      que el cruce por nombre exacto tampoco encontró («PERUVIAN NATURE &
--      S.A.C»). Ahí están los informes de 2025 y el preventivo del 07-01-2026.
--   3. Retira la fila «- copia» del archivo.
-- ============================================================

-- 1. Servicios sueltos → su ficha, solo cuando la coincidencia es única.
do $$
declare
  v_enlazados integer;
  v_ambiguos  integer;
begin
  with n as (
    select s.id,
           regexp_replace(upper(regexp_replace(s.cliente_texto, '^\d{8,11}\s*-\s*', '')), '[^A-Z0-9]', '', 'g') as k
      from servicios_postventa s
     where s.cuenta_id is null and s.cliente_texto is not null
  ),
  c as (
    select regexp_replace(upper(razon_social), '[^A-Z0-9]', '', 'g') as k,
           (array_agg(id))[1] as id,
           count(*) as n
      from cuentas
     group by 1
  )
  update servicios_postventa s
     set cuenta_id = c.id
    from n join c on c.k = n.k and c.n = 1
   where s.id = n.id;
  get diagnostics v_enlazados = row_count;

  select count(*) into v_ambiguos
    from (
      select regexp_replace(upper(regexp_replace(s.cliente_texto, '^\d{8,11}\s*-\s*', '')), '[^A-Z0-9]', '', 'g') as k
        from servicios_postventa s where s.cuenta_id is null and s.cliente_texto is not null
    ) n
    join (
      select regexp_replace(upper(razon_social), '[^A-Z0-9]', '', 'g') as k, count(*) as n
        from cuentas group by 1 having count(*) > 1
    ) c on c.k = n.k;

  raise notice '0147: % servicios enlazados a su ficha; % siguen sueltos por cliente partido (dos fichas con el mismo nombre)', v_enlazados, v_ambiguos;
end $$;

-- 2. PERUVIAN NATURE: sus carpetas del servidor.
update cuentas
   set carpetas_servidor = jsonb_build_object(
         'informes', 'X:\S. PRIVADO\PERUVIAN NATURE & S.A.C',
         'fotos',    'W:\FOTOS\PRIVADO\PERUVIAN NATURE S & S S.A.C')
 where num_doc = '20502203461'
   and carpetas_servidor is null;

-- 3. La copia renombrada del archivo: se va la fila «- copia», se queda la
--    que lleva el nombre del número que dice adentro.
delete from cotizaciones_historicas h
 where h.archivo ilike '%copia%'
   and exists (
     select 1 from cotizaciones_historicas o
      where o.serie = h.serie and o.anio = h.anio and o.correlativo = h.correlativo
        and o.id <> h.id and o.archivo not ilike '%copia%');
