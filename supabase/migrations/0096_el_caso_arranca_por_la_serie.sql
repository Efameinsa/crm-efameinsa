-- ============================================================
-- CRM EFAMEINSA · Migración 0096 · El caso técnico arranca por la serie
-- ============================================================
-- Decisión D6 de la reunión del 27-08, dicha sin margen de duda: «ojo, el
-- número de serie acá es vital… trabajamos con el número de serie siendo el
-- patrón para toda la trazabilidad».
--
-- El caso ya existe como oportunidad con `tipo_postventa` (migración 0080) y
-- eso no cambia: las etapas comerciales sirven —Carlos las revisó una por una,
-- «esperando el repuesto entra en seguimiento»— y una tabla nueva partiría el
-- historial del cliente en dos. Lo que falta es lo que el caso NO podía
-- guardar: de qué máquina habla.
--
-- Sin esto, el flujo que Carlos narró completo —la lavadora que no lava, el
-- código E5, el caño cerrado— termina en un texto libre que nadie puede cruzar
-- con nada. Con esto, la serie trae garantía, ciclos y último preventivo, que
-- es justo lo que convierte un reclamo en una venta de mantenimiento.

-- ------------------------------------------------------------
-- 1. De qué máquina habla el caso
-- ------------------------------------------------------------
alter table oportunidades
  add column if not exists equipo_id uuid references equipos_instalados (id),
  -- La serie tal como la leyó el cliente por teléfono, aunque esa máquina
  -- todavía no esté fichada en el parque instalado. Es el caso normal hoy: hay
  -- 10 equipos fichados y años de máquinas en la calle. Guardarla igual es lo
  -- que permite fichar el equipo después y recuperar su historial.
  add column if not exists serie_texto text,
  -- «Me sale E5». El código de error es el primer dato del diagnóstico y el
  -- que se repite entre clientes: buscarlo es media respuesta.
  add column if not exists codigo_error text;

create index if not exists ix_oportunidades_equipo on oportunidades (equipo_id)
  where equipo_id is not null;
create index if not exists ix_oportunidades_serie on oportunidades (upper(trim(serie_texto)))
  where serie_texto is not null;

comment on column oportunidades.equipo_id is
  'La máquina del caso, cuando su serie ya está en el parque instalado. La serie es el patrón de trazabilidad (D6, migración 0096).';
comment on column oportunidades.serie_texto is
  'La serie tal como la dictó el cliente, aunque el equipo no esté fichado todavía. Sin esto el caso no se puede cruzar con nada.';

-- ------------------------------------------------------------
-- 2. Los informes que de verdad vuelven de una atención
-- ------------------------------------------------------------
-- El manual define cinco formatos; la reunión del 27-08 (15.29, §3) aclaró que
-- los que se emiten de verdad son menos y no son exactamente esos: informe de
-- llamada, revisión (recepción del equipo), mantenimiento, informe final e
-- informe técnico de servicio. Los cuatro que faltaban se agregan al enum que
-- ya existe: son un tipo más del mismo documento, no cuatro tablas.
alter type tipo_servicio_pv add value if not exists 'llamada';
alter type tipo_servicio_pv add value if not exists 'revision';
alter type tipo_servicio_pv add value if not exists 'informe_final';
alter type tipo_servicio_pv add value if not exists 'tecnico';

-- ------------------------------------------------------------
-- 3. Quién puede mirar la máquina de un cliente ajeno
-- ------------------------------------------------------------
-- Misma lógica que la 0095, que ya resolvió esto para la ficha del cliente y
-- sus contactos: Ariana llama a clientes de la cartera de Katerine y de Brenda
-- para ofrecerles mantenimiento —41 de sus 103— y sin ver el equipo la llamada
-- es a ciegas: no sabe si está en garantía ni cuándo fue el último preventivo,
-- que es el argumento entero de la venta.
--
-- La cuenta NO cambia de dueño (regla 1 y migración 0080). Lo que se abre es la
-- lectura del equipo de un cliente sobre el que ya tiene un caso propio.
drop policy if exists equipos_lectura on equipos_instalados;
create policy equipos_lectura on equipos_instalados for select to authenticated
  using (
    rol_actual() = 'central'
    or exists (select 1 from cuentas c
               where c.id = equipos_instalados.cuenta_id and c.comercial_id = (select auth.uid()))
    or (puede_postventa() and postventa_tiene_caso(equipos_instalados.cuenta_id))
  );

drop policy if exists informes_serv_lectura on informes_servicio;
create policy informes_serv_lectura on informes_servicio for select to authenticated
  using (
    rol_actual() = 'central'
    or exists (select 1 from cuentas c
               where c.id = informes_servicio.cuenta_id and c.comercial_id = (select auth.uid()))
    or (puede_postventa() and postventa_tiene_caso(informes_servicio.cuenta_id))
  );

comment on policy equipos_lectura on equipos_instalados is
  'Central lo lee para responder al cliente; el comercial ve los equipos de su cartera; y quien atiende postventa ve el equipo del cliente sobre el que ya tiene un caso, aunque la cuenta sea de otro (migraciones 0087, 0095 y 0096).';
