-- ============================================================
-- CRM EFAMEINSA · Migración 0075 · El área de postventa entra al CRM
-- ============================================================
-- Reunión del 25-08 10:10 con el ing. Carlos y Lesly. Postventa venía
-- trabajando en Excel aparte (R:\COPIA CRM POST VENTA) y hay que meterla hoy:
-- «atendemos urgente postventa, está esperando para que le deriven y comience
-- a hacer sus cuestiones».
--
-- CÓMO ENTRA, TEXTUAL DE CARLOS: «yo más bien diría que le des el acceso a la
-- parte comercial, o sea, como si fuera un comercial, en este momento». No es
-- un rol nuevo: es un perfil `comercial` con su código, que usa la herramienta
-- que ya existe. Por eso acá no se toca `rol_usuario`.
--
-- QUÉ HACE POSTVENTA, según la reunión. Central recibe la llamada y la deriva,
-- igual que un lead comercial, pero de dos clases:
--   · GARANTÍA   — «llama el cliente, dice que su máquina no está operativa».
--   · REPUESTO   — «manda foto por WhatsApp: requiere este repuesto ABC».
-- y una tercera que apareció después: MANTENIMIENTO PREVENTIVO.
-- Postventa recibe la gestión, llama, averigua y la registra. Hasta ahí llega
-- hoy: «para cotizar necesitamos la ficha [de repuestos] y todavía no ha sido
-- subida», así que sigue cotizando a mano fuera del sistema.
--
-- POR QUÉ SUS NÚMEROS NO ENTRAN EN LOS DE VENTAS. Un caso de garantía no es
-- una venta y su gestión no compite en la meta de 30 seguimientos diarios de
-- los comerciales. Se marca el perfil, igual que se hizo con la cuenta de
-- práctica (0072), y las funciones de gerencia lo dejan fuera.

alter table perfiles add column if not exists es_postventa boolean not null default false;

comment on column perfiles.es_postventa is
  'Perfil del área de postventa: usa el CRM como un comercial pero su trabajo no entra en los indicadores de venta (migración 0075).';

-- ------------------------------------------------------------
-- Gerencia: la supervisión y el resumen dejan fuera a postventa.
-- ------------------------------------------------------------
-- Mismo mecanismo que la 0072: se toma la definición VIVA y se le agrega la
-- condición, en vez de copiar unas funciones largas que ya se redefinieron
-- varias veces. Si el texto esperado no está, se levanta el error: una
-- exclusión que falla en silencio es peor que no tenerla.
do $$
declare
  v_nombre text;
  v_def    text;
  v_nuevo  text;
begin
  foreach v_nombre in array array['resumen_gerencia', 'supervision_diaria']
  loop
    select pg_get_functiondef(oid) into v_def from pg_proc where proname = v_nombre limit 1;
    if v_def is null then
      raise exception 'No existe la función %', v_nombre;
    end if;
    v_nuevo := replace(
      v_def,
      'where p.rol = ''comercial'' and p.activo and not p.es_prueba',
      'where p.rol = ''comercial'' and p.activo and not p.es_prueba and not p.es_postventa'
    );
    if v_nuevo = v_def then
      raise exception 'No se encontró el filtro de comerciales en %', v_nombre;
    end if;
    execute v_nuevo;
  end loop;
end $$;

-- ------------------------------------------------------------
-- De qué clase es el caso que Central deriva.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_postventa') then
    create type tipo_postventa as enum ('garantia', 'repuesto', 'mantenimiento');
  end if;
end $$;

alter table oportunidades add column if not exists tipo_postventa tipo_postventa;

comment on column oportunidades.tipo_postventa is
  'Clase de caso de postventa cuando Central deriva al área: garantía (equipo no operativo), repuesto o mantenimiento preventivo. Null en una oportunidad comercial normal (migración 0075).';

-- ------------------------------------------------------------
-- La agenda de postventa: el Excel que ya llevan, tal como lo llevan.
-- ------------------------------------------------------------
-- Calcada de `RESUMEN AGENDA DE POST VENTA 25-08-2026.xlsx`, que es el
-- documento con el que trabajan hoy: por cada venta confirmada siguen el
-- despacho y la puesta en marcha, paso por paso.
--
-- LAS FECHAS VAN DOS VECES, Y ES A PROPÓSITO. En su Excel la columna «Fecha de
-- despacho» dice tanto `21-04-26` como «POR COORDINAR» o «PROGRAMAR ENTREGA
-- PARA 30-06-2026». Guardar solo la fecha perdería la mitad de las filas;
-- guardar solo el texto haría imposible armar una agenda por día. Se guardan
-- las dos: la fecha cuando se puede leer, y siempre la nota tal como la
-- escribieron.
create table if not exists servicios_postventa (
  id                uuid primary key default gen_random_uuid(),
  cuenta_id         uuid references cuentas (id),
  -- El Excel trae «20556440981 - MARANATHA COMEX S.A.C.» en una sola celda y
  -- no todas las filas van a cruzar contra una cuenta del CRM. Se conserva el
  -- texto original para no perder de vista a quién se refiere la fila.
  cliente_texto     text,
  fecha_confirmacion date,
  ubicacion         text,
  -- Descripción del equipo CON SUS SERIES, tal como la escriben: es lo que
  -- identifica la máquina concreta que se despachó.
  equipo            text,
  tipo_servicio     text not null,
  observaciones     text,
  monto             numeric(12,2),
  moneda            moneda not null default 'USD',
  forma_pago        text,
  confirmacion_abono text,
  prueba_embalaje   text,
  fecha_despacho    date,
  despacho_nota     text,
  planos_preinstalacion text,
  puesta_en_marcha  date,
  puesta_nota       text,
  completado        boolean not null default false,
  informe           text,
  -- Cuando el caso nace de una derivación de Central en vez del Excel.
  oportunidad_id    uuid references oportunidades (id),
  responsable_id    uuid references perfiles (id),
  origen            text not null default 'crm',   -- 'crm' | 'excel'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists ix_servicios_pv_estado on servicios_postventa (completado, fecha_despacho);
create index if not exists ix_servicios_pv_cuenta on servicios_postventa (cuenta_id);
create trigger trg_servicios_pv_updated before update on servicios_postventa
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Informes de soporte técnico (hoja SOPORTE TECNICO del mismo Excel).
-- ------------------------------------------------------------
-- Videollamadas y visitas: puesta en marcha, verificación de preinstalación.
create table if not exists soporte_tecnico (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid references cuentas (id),
  cliente_texto   text,
  equipo          text,           -- «LAVADORA TITAN MAX S: 509KWSB0A214»
  detalle         text,
  fecha_ejecutado date,
  fecha_envio     date,
  responsable_id  uuid references perfiles (id),
  origen          text not null default 'crm',
  created_at      timestamptz not null default now()
);
create index if not exists ix_soporte_fecha on soporte_tecnico (fecha_ejecutado desc);

-- ------------------------------------------------------------
-- Quién ve qué.
-- ------------------------------------------------------------
-- Postventa y backoffice trabajan estas dos tablas; Central las lee, porque es
-- quien deriva y quien tiene que poder responderle al cliente que llama a
-- preguntar por su despacho.
alter table servicios_postventa enable row level security;
alter table soporte_tecnico     enable row level security;

create or replace function es_postventa()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_postventa from perfiles where id = auth.uid()), false)
$$;

drop policy if exists servicios_pv_trabajo on servicios_postventa;
create policy servicios_pv_trabajo on servicios_postventa for all to authenticated
  using (es_postventa() or es_backoffice())
  with check (es_postventa() or es_backoffice());

drop policy if exists servicios_pv_central on servicios_postventa;
create policy servicios_pv_central on servicios_postventa for select to authenticated
  using (rol_actual() = 'central');

drop policy if exists soporte_trabajo on soporte_tecnico;
create policy soporte_trabajo on soporte_tecnico for all to authenticated
  using (es_postventa() or es_backoffice())
  with check (es_postventa() or es_backoffice());

drop policy if exists soporte_central on soporte_tecnico;
create policy soporte_central on soporte_tecnico for select to authenticated
  using (rol_actual() = 'central');
