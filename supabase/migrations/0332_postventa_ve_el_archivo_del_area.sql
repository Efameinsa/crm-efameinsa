-- 0332 · Postventa ve las cotizaciones del archivo de toda el área
--
-- 29-09-2026, Santos: las tres de postventa (Rubí PV, Ariana PV1, Gabriela
-- PV2) tienen las mismas vistas, no tienen cartera propia y comparten las
-- mismas cuentas. Las 265 cotizaciones del archivo (las de Word, anteriores
-- al CRM) están a nombre de PV y la política `cot_hist_comercial` solo deja
-- ver las propias: Ariana y Gabriela no las veían. Solo lectura; cargar y
-- corregir sigue igual.

create policy cot_hist_postventa_area on public.cotizaciones_historicas
  for select to authenticated
  using (
    (select es_postventa())
    and comercial_id in (select p.id from perfiles p where p.es_postventa)
  );
