-- ============================================================
-- CRM EFAMEINSA · Migración 0039 · Cotizaciones históricas por CARTERA
-- ============================================================
-- La política de 0036 dejaba ver al comercial solo las cotizaciones que él
-- había firmado. Eso rompe la regla que gerencia pidió desde la demo
-- (migración 0013): el comercial ve TODO lo de las cuentas de su cartera,
-- también lo que hicieron otros antes que él — "un reemplazo por vacaciones
-- tiene que entender al cliente sin llamar a nadie".
--
-- Con la política anterior, Katerine abría la ficha de un cliente suyo y las
-- cotizaciones que Brenda le había hecho el año pasado no aparecían, aunque
-- la cuenta ya sea de su cartera. Justo el historial que hace falta para no
-- cotizar por debajo de lo que ya se le cotizó al cliente.

drop policy if exists cot_hist_comercial on cotizaciones_historicas;

create policy cot_hist_comercial on cotizaciones_historicas for select to authenticated
  using (
    comercial_id = (select auth.uid())
    or exists (
      select 1 from cuentas c
      where c.id = cotizaciones_historicas.cuenta_id
        and c.comercial_id = (select auth.uid())
    )
  );
