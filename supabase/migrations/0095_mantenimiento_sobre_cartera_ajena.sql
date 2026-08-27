-- ============================================================
-- CRM EFAMEINSA · Migración 0095 · Atender el mantenimiento de un cliente ajeno
-- ============================================================
-- Ariana (C4), 27-08, corrigiendo lo que yo había supuesto: «a mí no me derivan
-- las llamadas. Las llamadas van a ir para Hever, directamente… siempre y
-- cuando sea un prospecto nuevo que requiera mantenimiento, ahí sí me derivan».
--
-- Y lo que ella hace de verdad: «yo pido los files de todos los clientes para
-- poder llamar… tengo que llamar a todos estos clientes que ya en 2024, 2025 se
-- les ha cotizado equipos pero no han hecho su mantenimiento».
--
-- ESO NO ES ATENDER CASOS: ES PROSPECTAR SOBRE LA BASE INSTALADA. Y trae un
-- problema que el modelo no tenía resuelto: de los 74 clientes de su ruta que
-- ya están en el CRM, **34 son de la cartera de otro comercial** (20 de C5, 13
-- de C1, 1 de C9). Va a llamar a clientes de Katerine y de Brenda para
-- ofrecerles mantenimiento.
--
-- LA CUENTA NO CAMBIA DE DUEÑO — eso ya lo decidió la 0080 («postventa no toma
-- la cartera») y sigue siendo lo correcto: el cliente es de quien lo vendió. Lo
-- que se mueve es la OPORTUNIDAD de mantenimiento, que sí es de Ariana.
--
-- PERO ENTONCES NO PODÍA VER A SU PROPIO CLIENTE. La política que permite a
-- postventa abrir la ficha de un cliente ajeno exige `es_postventa()`, y Ariana
-- es una comercial con la tarea añadida (0093): tendría la oportunidad de
-- mantenimiento en su lista y, al hacer clic, no vería nada. Se cambia por
-- `puede_postventa()`, que es la pregunta correcta: no «¿es del área?», sino
-- «¿puede hacer este trabajo?».

drop policy if exists cuentas_postventa_select on cuentas;
create policy cuentas_postventa_select on cuentas for select to authenticated
  using (puede_postventa() and postventa_tiene_caso(id));

comment on function postventa_tiene_caso is
  'Si quien consulta tiene un caso, un despacho o un informe sobre esta cuenta, puede abrir su ficha aunque el cliente sea de la cartera de otro comercial. Respeta la separación del banco de pruebas (migraciones 0081, 0092 y 0095).';

-- Y también necesita ver los CONTACTOS del cliente al que va a llamar: sin el
-- teléfono, poder abrir la ficha no sirve de nada.
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'contactos' and policyname = 'contactos_postventa_select') then
    drop policy contactos_postventa_select on contactos;
  end if;
end $$;

create policy contactos_postventa_select on contactos for select to authenticated
  using (puede_postventa() and postventa_tiene_caso(cuenta_id));
