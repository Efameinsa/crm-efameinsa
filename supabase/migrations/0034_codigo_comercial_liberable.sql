-- ============================================================
-- CRM EFAMEINSA · Migración 0034 · El código de comercial se libera al salir
-- ============================================================
-- Al fusionar C8 → C1 (Brenda Taboada, reunión con el ing. Carlos 19-08) hizo
-- falta dejar el código C8 libre para otra persona. Chocaron dos reglas del
-- esquema inicial:
--   · `codigo_comercial text unique` — dos perfiles no pueden tener C8, así
--     que el perfil retirado tiene que soltarlo para que alguien lo tome;
--   · `check (rol <> 'comercial' or codigo_comercial is not null)` — pero un
--     perfil con rol comercial estaba obligado a conservar un código.
--
-- El modelo correcto es el que describió Carlos: los códigos C1..C10 son
-- POSICIONES de la empresa, no identidades de la persona. Una posición la
-- ocupa un comercial activo a la vez; cuando alguien la deja, queda libre.
-- Por eso la regla pasa a exigir código solo a los comerciales ACTIVOS.
--
-- El histórico no se pierde: perfiles.codigo_anterior (migración 0033) guarda
-- con qué código operaba antes quien cambió de posición.

alter table perfiles drop constraint if exists comercial_con_codigo;

alter table perfiles add constraint comercial_activo_con_codigo
  check (rol <> 'comercial' or not activo or codigo_comercial is not null);

comment on column perfiles.codigo_comercial is
  'Posición comercial vigente (C1..C10), única entre los perfiles que la tienen. Un comercial activo siempre la tiene; al desactivarse queda en null y el código vuelve a estar disponible para otra persona.';
