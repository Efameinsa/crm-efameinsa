-- ============================================================
-- CRM EFAMEINSA · Migración 0076 · El comercial puede sumar una cotización vieja
-- ============================================================
-- Brenda reportó el 25-08 que su cotización 1549-25 de SAYWA HOTEL TOURS «no
-- está en su sistema».
--
-- LO PRIMERO: ESA SÍ ESTÁ. Está en el archivo con su fecha (11-09-2025), su
-- PDF y a su nombre —el import la resolvió bien incluso viniendo firmada con su
-- código anterior, C8—. Lo que no había era manera de LLEGAR a ella: «Mi
-- gestión» abre en el mes en curso, y aunque se elija «Todo», la lista corta en
-- 60 documentos ordenados por fecha, así que uno de septiembre de 2025 queda
-- fuera del alcance. Eso se arregla en la pantalla nueva de «Mis cotizaciones»,
-- que busca por número y por cliente.
--
-- PERO EL RECLAMO DE FONDO ES CIERTO: al archivo le faltan documentos. Contando
-- huecos en la numeración, faltan 119 números en EFAMEINSA 2025 y algo más de
-- 80 en 2026 — cotizaciones que existieron y que el parseo de las unidades S: y
-- T: no alcanzó a leer (archivos que no estaban, nombres fuera de patrón,
-- documentos que nunca se guardaron en la ruta). Sin una forma de agregarlas,
-- esas ventas quedan sin historia: cuando el cliente vuelve, el comercial no
-- tiene con qué decir a qué precio se le cotizó.
--
-- POR QUÉ ENTRAN ACÁ Y NO EN `cotizaciones`. Misma razón que en la 0036: la
-- tabla del CRM asigna correlativo sola y es inmutable. Un documento de 2025 ya
-- tiene su número puesto y no debe tocar la numeración de este año.
--
-- EL DUPLICADO SE EVITA SOLO. `archivo` se arma con el mismo patrón que usan
-- los documentos reales ("Presu_1549-25, SAYWA HOTEL TOURS SCRL") y ya existe
-- el índice único (serie, archivo): si alguien intenta cargar una que ya está,
-- la base la rechaza en vez de duplicarla.

alter table cotizaciones_historicas
  add column if not exists cargada_por uuid references perfiles (id);

comment on column cotizaciones_historicas.cargada_por is
  'Quién la agregó a mano desde el CRM. NULL = vino del parseo de las unidades S:/T: (migración 0076).';

-- ------------------------------------------------------------
-- El comercial puede sumar las suyas, y solo las suyas.
-- ------------------------------------------------------------
-- `with check` amarra las tres cosas que importan: que se la ponga a sí mismo,
-- que quede firmada por él y que sea de un año pasado. Cotizar el año en curso
-- es trabajo del CRM y tiene que llevar correlativo del CRM; permitir cargarla
-- a mano acá abriría la puerta a inventar números de este año por fuera.
drop policy if exists cot_hist_comercial_agrega on cotizaciones_historicas;
create policy cot_hist_comercial_agrega on cotizaciones_historicas for insert to authenticated
  with check (
    comercial_id = (select auth.uid())
    and cargada_por = (select auth.uid())
    and anio is not null
    and anio < extract(year from (now() at time zone 'America/Lima'))::integer
  );

drop policy if exists cot_hist_backoffice_todo on cotizaciones_historicas;
create policy cot_hist_backoffice_todo on cotizaciones_historicas for all to authenticated
  using ((select es_backoffice())) with check ((select es_backoffice()));
