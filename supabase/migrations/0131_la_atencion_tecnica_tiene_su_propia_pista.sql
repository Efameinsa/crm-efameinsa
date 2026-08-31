-- ============================================================
-- Postventa: la atención técnica deja de correr por las etapas comerciales
-- ============================================================
-- El 27-08 el ing. Carlos validó que las etapas comerciales servían para
-- postventa —«los estados están bien, funcionan bastante similar: esperando el
-- repuesto entra en seguimiento»— y se resolvió con vocabulario, sin migración:
-- `ETIQUETA_ETAPA_POSTVENTA` en src/lib/postventa.ts renombra `potencial` a
-- «Programado» y listo.
--
-- El 31-08 se desdijo, y con razón. Textual, en la reunión de la mañana:
--
--   «Está muy bien, le llamamos los estados, los estados están bien definidos,
--    y la calificación y la etapa están bien definidos, PERO ORIENTADO A LA
--    PARTE COMERCIAL. FALTAN LAS ETAPAS Y LA CALIFICACIÓN EN LA PARTE DE LA
--    ATENCIÓN TÉCNICA (…) tiene que haber un cierre, un estatus; es lo que
--    falta, veo que es lo que falta.»
--
-- Y esa misma mañana mandó por WhatsApp el modelo, que es lo que implementa
-- esta migración:
--
--   1. Flujo: Solicitud → Registro → Diagnóstico → Planificación → Atención →
--      Pruebas → Conformidad → Cierre CRM → Seguimiento
--   2. Clasificación: garantía, mantenimiento preventivo, mantenimiento
--      correctivo o servicio facturable
--   3. «Tan pronto se asigna una ATENCIÓN DE SERVICIO desde central se
--      clasifica: servicio de puesta en marcha / problema técnico — por
--      garantía o servicio facturado. ATENCIÓN DE SOLICITUD DE REPUESTO/MTTO
--      aquí se aplica el proceso regular de clasificación y etapas de un
--      gestor comercial.»
--
-- POR QUÉ UNA TABLA NUEVA Y NO MÁS COLUMNAS EN `oportunidades`.
-- Porque son DOS PISTAS y él las separó explícitamente. La de repuestos y
-- mantenimiento es una venta y sigue siendo una oportunidad, con sus etapas
-- comerciales intactas — no se toca nada de eso. La técnica es otro objeto: no
-- tiene monto ni cierre de venta, tiene garantía, técnico asignado, informe con
-- fotos y conformidad del cliente. Meterla en `oportunidades` obligaría a que
-- cada pantalla comercial supiera esquivarla, que es exactamente el error del
-- filtro por `origen` que ya vació el Kanban dos veces.
--
-- Y LAS DOS SE CRUZAN, que es el punto del circuito que dictó: una atención
-- técnica termina descubriendo un repuesto por vender, y ahí NACE una
-- oportunidad comercial. Por eso `atenciones.oportunidad_id` es opcional en las
-- dos direcciones: la atención puede venir de una venta o parirla.

-- ── Los dos ejes de la clasificación ──────────────────────────────────────
--
-- OJO: hoy existe `tipo_postventa` = (garantia, repuesto, mantenimiento), que
-- MEZCLA los dos ejes —«garantía» es quién paga, «repuesto» es qué pidió el
-- cliente— y por eso no se puede responder «¿cuántas atenciones en garantía
-- hubo?» sin ambigüedad. No se toca ese enum: lo usan la derivación de Central
-- (0080, 0107) y la ruta de mantenimiento, y romperlo hoy es apagar el CRM.
-- Los ejes nuevos viven en la tabla nueva y conviven con él.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_atencion') then
    create type tipo_atencion as enum (
      'puesta_en_marcha',      -- servicio de puesta en marcha
      'problema_tecnico',      -- incidencia: la máquina falla
      'solicitud_repuesto',    -- pista comercial
      'solicitud_mantenimiento'-- pista comercial
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'clasificacion_atencion') then
    create type clasificacion_atencion as enum (
      'garantia',    -- la cubre la garantía: no se factura
      'preventivo',  -- mantenimiento preventivo
      'correctivo',  -- mantenimiento correctivo
      'facturable'   -- servicio que se cobra
    );
  end if;
  -- Las nueve etapas, en el orden exacto en que las escribió.
  if not exists (select 1 from pg_type where typname = 'etapa_atencion') then
    create type etapa_atencion as enum (
      'solicitud', 'registro', 'diagnostico', 'planificacion', 'atencion',
      'pruebas', 'conformidad', 'cierre', 'seguimiento'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'resultado_atencion') then
    create type resultado_atencion as enum ('resuelto', 'no_procede', 'derivado');
  end if;
end $$;

-- ── La atención ───────────────────────────────────────────────────────────
create table if not exists atenciones (
  id            uuid primary key default gen_random_uuid(),

  -- De quién y sobre qué máquina. `equipo_id` es la pieza que hace posible el
  -- condicional de la garantía sin preguntarle nada a nadie: `equipos_instalados`
  -- ya trae garantia_meses, garantia_hasta, ultimo_mantenimiento y
  -- proximo_mantenimiento de las 314 máquinas del parque.
  cuenta_id     uuid references cuentas (id),
  equipo_id     uuid references equipos_instalados (id),
  cliente_texto text,          -- cuando todavía no se sabe qué ficha es
  equipo_texto  text,          -- lo que dictó el cliente, antes de calzar la serie

  -- Los dos ejes. `clasificacion` nace NULA a propósito: se sabe recién en el
  -- diagnóstico, y forzarla antes obliga a adivinar.
  tipo          tipo_atencion not null,
  clasificacion clasificacion_atencion,

  etapa         etapa_atencion not null default 'solicitud',

  -- La pista comercial, cuando la hay. En los dos sentidos: la atención puede
  -- nacer de una venta o terminar pariendo una («inmediatamente cotizo mi
  -- presupuesto de mantenimiento preventivo, y cotizo mi repuesto»).
  oportunidad_id      uuid references oportunidades (id),
  oportunidad_origen  uuid references oportunidades (id),

  -- La garantía, resuelta y con fecha, no deducida cada vez que alguien mira.
  en_garantia            boolean,
  garantia_verificada_at timestamptz,
  garantia_verificada_por uuid references perfiles (id),
  -- El segundo condicional que dictó: «¿este cliente ha hecho mantenimiento
  -- preventivo o no lo ha hecho?». Manda la recomendación al técnico.
  hizo_preventivo        boolean,

  -- Quién la tiene. `asignado_a` es de postventa; `tecnico` es quien la
  -- ejecuta, y hoy se escribe a mano porque los técnicos no tienen cuenta en el
  -- CRM (igual que en `informes_servicio.tecnico`).
  recibido_por  uuid references perfiles (id),
  asignado_a    uuid references perfiles (id),
  tecnico       text,

  -- El reloj de cada etapa. Mismo criterio que `servicios_postventa`: una marca
  -- por paso, para poder leer la carrera de postas y para que el cierre semanal
  -- pueda contar recibidos / atendidos / en proceso / cerrados sin inventar
  -- reglas nuevas.
  solicitado_at    timestamptz not null default now(),
  registrado_at    timestamptz,
  diagnosticado_at timestamptz,
  programada_at    timestamptz,   -- cuándo se va a atender (fecha y hora)
  atendido_at      timestamptz,
  pruebas_at       timestamptz,
  conformidad_at   timestamptz,
  cerrado_at       timestamptz,

  -- La conformidad la firma el cliente, no nosotros.
  conformidad_nombre text,
  conformidad_doc    text,

  informe_servicio_id uuid references informes_servicio (id),
  resultado     resultado_atencion,
  detalle       text,
  motivo_cierre text,

  -- El seguimiento posterior: la última etapa del flujo que dictó. Puede llegar
  -- hasta fidelización, así que no se cierra sola.
  seguimiento_at  timestamptz,
  seguimiento_nota text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  es_prueba     boolean not null default false
);

create index if not exists ix_atenciones_etapa    on atenciones (etapa, solicitado_at desc);
create index if not exists ix_atenciones_cuenta   on atenciones (cuenta_id);
create index if not exists ix_atenciones_equipo   on atenciones (equipo_id);
create index if not exists ix_atenciones_asignado on atenciones (asignado_a, etapa);
create index if not exists ix_atenciones_agenda   on atenciones (programada_at) where cerrado_at is null;

comment on table atenciones is
  'La pista TÉCNICA de postventa (0131, pedido del ing. Carlos el 31-08). Las nueve '
  'etapas que dictó, la clasificación de quién paga y el circuito con almacén. La pista '
  'comercial —vender el repuesto o el mantenimiento— sigue siendo una oportunidad.';

-- El sello de tiempo con la función que ya usa el resto del esquema; no se
-- crea una gemela.
drop trigger if exists tr_atenciones_updated_at on atenciones;
create trigger tr_atenciones_updated_at before update on atenciones
  for each row execute function set_updated_at();

-- ── Quién puede qué ───────────────────────────────────────────────────────
--
-- OJO CON EL NULL. La 0127 arregló catorce funciones donde `if not
-- es_backoffice()` no entraba cuando el perfil venía nulo y dejaba pasar a
-- quien no tenía perfil. Acá todas las condiciones se escriben en positivo y
-- envueltas en coalesce, para que la ausencia de perfil sea NO, nunca SÍ.
alter table atenciones enable row level security;

-- Lee el área, gerencia, admin, operaciones y Central: todos necesitan ver el
-- estado de una atención, y ninguno de ellos tiene cartera que proteger acá.
drop policy if exists atenciones_lectura on atenciones;
create policy atenciones_lectura on atenciones for select to authenticated
  using (
    coalesce(es_postventa(), false)
    or coalesce(es_backoffice(), false)
    or coalesce(es_operaciones(), false)
    or coalesce(rol_actual() = 'central', false)
    or asignado_a = auth.uid()
  );

-- Crea Central (es quien recibe la llamada del cliente) y el propio postventa.
drop policy if exists atenciones_alta on atenciones;
create policy atenciones_alta on atenciones for insert to authenticated
  with check (
    coalesce(es_postventa(), false)
    or coalesce(es_backoffice(), false)
    or coalesce(es_operaciones(), false)
    or coalesce(rol_actual() = 'central', false)
  );

-- La mueve el área y quien la tenga asignada. Central NO: una vez derivada, el
-- caso es del área — es la misma regla que ya rige las derivaciones (0107) y
-- por la que existe el PIN de supervisor para corregirlas.
drop policy if exists atenciones_edicion on atenciones;
create policy atenciones_edicion on atenciones for update to authenticated
  using (
    coalesce(es_postventa(), false)
    or coalesce(es_backoffice(), false)
    or coalesce(es_operaciones(), false)
    or asignado_a = auth.uid()
  )
  with check (
    coalesce(es_postventa(), false)
    or coalesce(es_backoffice(), false)
    or coalesce(es_operaciones(), false)
    or asignado_a = auth.uid()
  );
