-- ============================================================
-- CRM EFAMEINSA · Migración 0103 · Dónde está cada laptop
-- ============================================================
-- Carlos, 28-08, sobre el riesgo que lo desvela: «se supone que esta URL la
-- puedo abrir en cualquier lugar del planeta». Y la razón por la que hace falta
-- el mapa, que es la que ordena todo esto: **las laptops son de la empresa y se
-- las llevan**. Saber desde dónde se está gestionando es saber dónde está el
-- equipo. Darwin confirmó el 28-08 que el seguimiento está en el contrato de
-- los empleados.
--
-- Se guarda la ubicación de cada IP, no de cada persona: una IP se consulta UNA
-- vez y sirve para todos los ingresos que vengan de ahí. Eso tiene tres
-- consecuencias buenas:
--   · el proveedor externo ve un puñado de IPs al mes, no el movimiento diario
--     de nadie;
--   · la pantalla abre rápido, porque no consulta nada que ya sepa;
--   · si el servicio se cae, lo ya sabido se sigue viendo.
--
-- Lo que esto NO es: no es la posición del equipo. Una IP ubica al proveedor
-- que la asigna —la antena, la central del barrio— con un margen que en Lima es
-- de kilómetros. Sirve para responder «¿está en Lima, en Arequipa o en
-- Ecuador?», y no para responder «¿en qué calle está». La pantalla lo dice con
-- todas sus letras: prometer precisión de GPS con un dato que no la tiene sería
-- el peor servicio que se le puede hacer a quien va a tomar decisiones con esto.

create table if not exists ubicaciones_ip (
  ip text primary key,

  ciudad   text,
  region   text,
  pais     text,
  pais_codigo text,
  -- Latitud y longitud del punto que devuelve el proveedor. Van como numeric y
  -- no como texto porque el mapa las necesita como números.
  lat numeric(9, 6),
  lon numeric(9, 6),
  -- El operador: «Telefónica del Perú», «Claro», «Entel». Dice tanto como la
  -- ciudad — una IP de datos móviles no es la misma historia que una de fibra.
  proveedor text,

  -- De dónde salió el dato y cuándo, para poder auditarlo y para refrescar lo
  -- viejo sin volver a consultar todo.
  fuente text,
  consultado_at timestamptz not null default now(),
  -- Si el proveedor no supo ubicarla, se registra igual: así no se le vuelve a
  -- preguntar por la misma IP en cada carga de la pantalla.
  resuelta boolean not null default true
);

comment on table ubicaciones_ip is
  'Caché de la ubicación aproximada de cada IP desde la que se entra al CRM. Se consulta una vez por IP (migración 0103). Precisión de ciudad, no de calle.';

create index if not exists ix_ubicaciones_ip_consultado on ubicaciones_ip (consultado_at desc);

alter table ubicaciones_ip enable row level security;

-- La ubicación de los ingresos es información de control: la ve gerencia y
-- admin, que son quienes hacen el seguimiento. Escribirla la escribe el
-- servidor cuando resuelve una IP nueva.
drop policy if exists ubicaciones_ip_gerencia on ubicaciones_ip;
create policy ubicaciones_ip_gerencia on ubicaciones_ip for all to authenticated
  using (es_backoffice())
  with check (es_backoffice());
