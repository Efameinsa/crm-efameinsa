-- ============================================================
-- CRM EFAMEINSA · Migración 0081 · Arreglo de la policy de la 0080
-- ============================================================
-- La 0080 le dio a postventa una policy de lectura sobre `cuentas` que pregunta
-- «¿tengo una oportunidad de esta cuenta?». Preguntarlo así entra en bucle: la
-- policy de `oportunidades` (0013) pregunta a su vez «¿es mía la cuenta?», y
-- Postgres corta con
--
--     42P17: infinite recursion detected in policy for relation "cuentas"
--
-- Con eso, el perfil de postventa no podía leer NINGUNA cuenta: sus casos
-- salían sin el nombre del cliente. Se detectó al verificar con su sesión real
-- antes de avisar que estaba listo; a los comerciales no les afectó porque la
-- condición `es_postventa()` corta antes de llegar a la subconsulta.
--
-- La salida es la que ya usa el resto del proyecto para preguntas que cruzan
-- tablas con RLS: una función `security definer` que responde el sí o el no.
-- Al ejecutarse como dueña no vuelve a pasar por las policies, y el bucle se
-- rompe.

create or replace function postventa_tiene_caso(p_cuenta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from oportunidades o
            where o.cuenta_id = p_cuenta and o.comercial_id = auth.uid()
         )
      or exists (select 1 from servicios_postventa s where s.cuenta_id = p_cuenta)
      or exists (select 1 from soporte_tecnico   s where s.cuenta_id = p_cuenta)
$$;

comment on function postventa_tiene_caso(uuid) is
  'Responde si el área de postventa tiene trabajo sobre esa cuenta (un caso derivado, un servicio o un soporte). Es security definer para que las policies puedan preguntarlo sin recursión (migración 0081).';

revoke all on function postventa_tiene_caso(uuid) from public;
grant execute on function postventa_tiene_caso(uuid) to authenticated;

drop policy if exists cuentas_postventa_select on cuentas;
create policy cuentas_postventa_select on cuentas for select to authenticated
  using (es_postventa() and postventa_tiene_caso(cuentas.id));

drop policy if exists contactos_postventa_select on contactos;
create policy contactos_postventa_select on contactos for select to authenticated
  using (es_postventa() and postventa_tiene_caso(contactos.cuenta_id));
