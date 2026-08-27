-- ============================================================
-- CRM EFAMEINSA · Migración 0087 · El circuito de postventa entra al CRM
-- ============================================================
-- Reunión del 27-08 con el ing. Carlos, más el «MANUAL DE NORMAS LABORALES,
-- FUNCIONES, PROCEDIMIENTOS Y SISTEMA ERP — ÁREA POST-VENTA» (87 páginas, 2025)
-- que entregó Santos. La 0075 trajo la agenda del Excel; esta trae el FLUJO.
--
-- LO QUE CAMBIA, EN UNA FRASE: el expediente deja de ser papel. Hoy el cierre,
-- la cotización, la OC, el voucher y la liquidación viajan impresos de Central
-- a Finanzas y de Finanzas a postventa, que recién ahí empieza a trabajar y
-- registra todo a mano en su Excel. Con esto, Central marca dos checks —pedido
-- ejecutado y liquidación— y el pedido cae solo en la bandeja de postventa con
-- todos los documentos adjuntos.
--
-- POR QUÉ SE EXTIENDE `servicios_postventa` Y NO SE CREA UNA TABLA NUEVA: esa
-- tabla ES la agenda que el área usa todos los días, con las 240 filas de su
-- Excel adentro. Un modelo paralelo partiría la pantalla en dos y los obligaría
-- a mirar en dos lados. Las filas viejas conservan sus columnas de texto
-- (`confirmacion_abono`, `prueba_embalaje`, `planos_preinstalacion`, que en el
-- Excel dicen «SI», «NO» o «POR COORDINAR») y las nuevas usan los campos con
-- fecha y autor que agrega esta migración.
--
-- DEL MANUAL SE TOMÓ LO QUE SIGUE VIVO, NO EL PAPELEO:
--   · La APERTURA (ítems XIII y XIV) es la orden de trabajo con la que se
--     programa un despacho o un servicio. En el manual se imprime, la firma
--     Finanzas, la sella Contabilidad, se saca copia para Almacén y otra para
--     el técnico. Acá son campos del servicio y un estado: el documento se
--     genera cuando hace falta.
--   · Los TIPOS DE SERVICIO del ítem XII, tal cual: puesta en marcha, garantía,
--     preventivo, correctivo, visita de preinstalación, evaluación. Más
--     capacitación y entrega de repuestos, que el ítem XXII agrega.
--   · El FORMATO DE LLAMADA del ítem IV —fecha de compra, fecha de entrega y
--     guía, garantía, fecha de puesta en marcha, protocolo de prueba, último
--     mantenimiento— es exactamente la ficha del equipo. Por eso
--     `equipos_instalados` tiene esos campos: es ese formato, pero calculado.
--   · Los CICLOS: «en los equipos LG se deberá contar los ciclos de lavado»
--     (ítem XXI). Es el kilometraje de la máquina y el argumento para defender
--     una garantía y para vender el mantenimiento.
--   · La GARANTÍA es de 24 meses en los dos formatos de cierre del manual, y el
--     preventivo se recomienda «cada 04 a 06 meses». Van como valores por
--     defecto, no como dogma: gerencia todavía tiene que confirmar desde cuándo
--     corre en Lima.
--
-- LO QUE NO SE TRAJO A PROPÓSITO: las tres copias de colores del informe
-- técnico (blanca, verde, amarilla), las firmas y sellos en papel de la
-- apertura, las tres agendas paralelas del ítem XXV —y sobre todo la regla de
-- «borrar de la agenda al día siguiente», que es justo lo que hace imposible
-- reconstruir un despacho tres meses después.

-- ------------------------------------------------------------
-- 1. El cierre de venta lleva sus documentos adjuntos
-- ------------------------------------------------------------
-- Carlos, 27-08: «el cierre tiene que estar un poquito más robusto… le tengo
-- que agregar los adjuntos: cotización, orden de compra, voucher, acuerdos».
-- La ficha RUC sale de la lista —«ya no sería necesaria»—; el control que sí
-- importa (que la razón social del cierre sea la que se vendió, «a veces son
-- muy similares pero tienen otro rumbo») lo hace la pantalla comparando el
-- documento del cierre contra el de la cuenta.
--
-- Mismo esquema y mismo bucket privado que los adjuntos de gestión (0029) y de
-- leads (0082): {tipo, path, nombre, tipo_mime, tamano, subido_por, subido_at}.
alter table informes_cierre add column if not exists adjuntos jsonb not null default '[]'::jsonb;

comment on column informes_cierre.adjuntos is
  'Documentos del expediente: cotización, orden de compra, voucher, acuerdos. Reemplaza el file impreso que el comercial mandaba a Central (migración 0087).';

-- ------------------------------------------------------------
-- 2. El pedido: de dónde viene, quién lo liberó y quién lo tomó
-- ------------------------------------------------------------
alter table servicios_postventa
  add column if not exists informe_cierre_id uuid references informes_cierre (id),
  -- El pedido lo sigue generando el ERP: acá solo se guarda su número, para
  -- poder cruzar cuando alguien pregunte por él. Frontera limpia (regla 9).
  add column if not exists numero_pedido_erp text,

  -- Los dos checks de Central que liberan el pedido.
  add column if not exists pedido_ejecutado_at  timestamptz,
  add column if not exists pedido_ejecutado_por uuid references perfiles (id),
  add column if not exists liquidacion_at       timestamptz,
  add column if not exists liquidacion_por      uuid references perfiles (id),

  -- El acuse de postventa. Carlos lo pidió con nombre propio: «yo pongo como
  -- postventa aprobado, y a Central le sale ya está aprobado, ya está en
  -- ejecución». Desde acá corre el tiempo con que se mide al área.
  add column if not exists aprobado_at  timestamptz,
  add column if not exists aprobado_por uuid references perfiles (id),

  -- Lima o provincia cambia el circuito entero: en provincia la garantía corre
  -- desde el despacho y la puesta en marcha suele ser por videollamada.
  add column if not exists modalidad text
    check (modalidad is null or modalidad in ('lima', 'provincia')),

  -- Pago estructurado. Hasta ahora `confirmacion_abono` era texto libre y no
  -- se podía saber cuánto falta. Postventa no cobra —«yo no cobro, ojo»— pero
  -- necesita ver el semáforo sin escribirle a nadie.
  add column if not exists monto_pagado          numeric(12,2) not null default 0,
  add column if not exists pago_confirmado_at    timestamptz,
  add column if not exists pago_confirmado_por   uuid references perfiles (id),
  -- Regla dura: no se despacha sin cancelación. Si igual hay que hacerlo, queda
  -- por escrito quién lo autorizó y por qué.
  add column if not exists despacho_sin_cancelar_motivo text,
  add column if not exists despacho_autorizado_por uuid references perfiles (id),

  -- Almacén (manual, ítems XV y XX: prueba, protocolo, embalaje y rotulado).
  add column if not exists serie_solicitada_at  timestamptz,
  add column if not exists prueba_solicitada_at timestamptz,
  add column if not exists prueba_lista_at      timestamptz,
  add column if not exists prueba_lista_por     uuid references perfiles (id),
  add column if not exists protocolo_prueba_ref text,

  -- Plano de preinstalación y verificación de condiciones.
  -- El manual lo manda después del pago; acá sale al aprobar el pedido, para
  -- que el cliente prepare agua, desagüe, energía y vapor mientras termina de
  -- pagar. No cuesta nada y adelanta días de instalación.
  add column if not exists plano_enviado_at     timestamptz,
  add column if not exists preinstalacion_ok_at timestamptz,
  add column if not exists preinstalacion_nota  text,

  -- La dirección, verificada con el cliente. Manual, ítem XIII: «dar doble
  -- check a lo redactado en el cierre, ya que el cliente puede cambiar los
  -- datos proporcionados al área comercial».
  add column if not exists direccion_verificada_at  timestamptz,
  add column if not exists direccion_verificada_con text,
  add column if not exists direccion_entrega        text,

  -- Despacho real.
  add column if not exists despachado_at timestamptz,
  add column if not exists transportista text,
  add column if not exists guia          text,
  add column if not exists recibe_nombre text,
  add column if not exists recibe_doc    text,
  add column if not exists recibe_telefono text,

  add column if not exists cerrado_at timestamptz;

comment on column servicios_postventa.aprobado_at is
  'Acuse de postventa: desde acá corre el tiempo del área. Antes de esto el pedido estaba en manos de Central y Finanzas (migración 0087).';
comment on column servicios_postventa.monto_pagado is
  'Cuánto lleva pagado el cliente. El saldo sale de restarlo del monto; con saldo > 0 el despacho queda detenido salvo autorización expresa.';

create index if not exists ix_servicios_pv_liberado
  on servicios_postventa (aprobado_at, pedido_ejecutado_at)
  where completado = false;

-- ------------------------------------------------------------
-- 3. La base instalada: qué máquinas están en la calle
-- ------------------------------------------------------------
-- La pieza que no existía y de la que cuelga todo lo demás. El manual la pide
-- en cada procedimiento sin tenerla: el formato de llamada (ítem IV) obliga a
-- escribir a mano fecha de compra, guía, garantía, último mantenimiento y
-- fecha de puesta en marcha de un equipo que nadie tiene registrado en ningún
-- lado. Con esto se busca por serie y aparece todo.
create table if not exists equipos_instalados (
  id uuid primary key default gen_random_uuid(),

  -- La serie es la identidad de la máquina: es lo que el cliente lee en la
  -- placa cuando llama, y lo que amarra garantía, ciclos e intervenciones.
  serie text not null,
  cuenta_id uuid references cuentas (id),
  cliente_texto text,
  producto_id uuid references productos (id),
  -- Cuando el equipo no está en el catálogo (los históricos, sobre todo).
  modelo_texto text,

  servicio_id uuid references servicios_postventa (id),
  informe_cierre_id uuid references informes_cierre (id),

  fecha_venta        date,
  fecha_despacho     date,
  guia_remision      text,
  fecha_puesta_marcha date,

  -- El manual dice 24 meses en los dos formatos de cierre. Se deja explícito
  -- por equipo porque no todos los equipos ni todos los contratos son iguales.
  garantia_meses integer default 24,
  garantia_hasta date,

  -- El kilometraje. `ciclos_inicial` es con cuántos quedó tras la puesta en
  -- marcha (normalmente 5, según Carlos); `ciclos_ultimo` es la última lectura
  -- tomada en una intervención.
  ciclos_inicial   integer,
  ciclos_ultimo    integer,
  ciclos_ultimo_at date,

  ultimo_mantenimiento  date,
  proximo_mantenimiento date,

  ubicacion text,
  observaciones text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La serie identifica una máquina: no puede haber dos. Índice único y no
-- constraint de columna para poder crearlo `if not exists` sin romper si la
-- tabla ya existía.
create unique index if not exists ux_equipos_serie on equipos_instalados (upper(trim(serie)));
create index if not exists ix_equipos_cuenta on equipos_instalados (cuenta_id);
create index if not exists ix_equipos_garantia on equipos_instalados (garantia_hasta);
create index if not exists ix_equipos_mantenimiento on equipos_instalados (proximo_mantenimiento)
  where proximo_mantenimiento is not null;

comment on table equipos_instalados is
  'Parque instalado: cada máquina vendida con su serie, garantía, ciclos e historial. Es la cartera del área de postventa (migración 0087).';

drop trigger if exists trg_equipos_updated on equipos_instalados;
create trigger trg_equipos_updated before update on equipos_instalados
  for each row execute function set_updated_at();

-- La garantía se calcula sola, para que nadie tenga que acordarse.
-- En provincia corre desde el despacho (Carlos, 27-08: «la garantía cuando es a
-- provincia corre a partir del despacho»); si no hay despacho registrado se usa
-- la puesta en marcha, y si tampoco, la venta.
create or replace function calcular_garantia_equipo()
returns trigger language plpgsql as $fn$
begin
  if new.garantia_meses is not null then
    new.garantia_hasta := (coalesce(new.fecha_despacho, new.fecha_puesta_marcha, new.fecha_venta)
                           + (new.garantia_meses || ' months')::interval)::date;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_equipos_garantia on equipos_instalados;
create trigger trg_equipos_garantia before insert or update on equipos_instalados
  for each row execute function calcular_garantia_equipo();

-- ------------------------------------------------------------
-- 4. Los informes de servicio
-- ------------------------------------------------------------
-- El manual define cinco formatos (anexos 1 a 5): entrega, preinstalación /
-- evaluación, puesta en marcha, mantenimiento preventivo e informe técnico.
-- Comparten cabecera y estructura, así que son una tabla con un tipo, no cinco.
--
-- Todos exigen registro fotográfico —«todo proceso contará con un registro
-- fotográfico que será adjuntado en el informe»— y firma del cliente. Eso es
-- justamente lo que Carlos quiere poder mostrar cuando el cliente reclama:
-- «venga el informe, la foto… ahí está la hora y fecha, no hay problema».
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_servicio_pv') then
    create type tipo_servicio_pv as enum (
      'puesta_en_marcha',
      'garantia',
      'mantenimiento_preventivo',
      'mantenimiento_correctivo',
      'preinstalacion',
      'evaluacion',
      'capacitacion',
      'entrega'
    );
  end if;
end $$;

create table if not exists informes_servicio (
  id uuid primary key default gen_random_uuid(),

  -- Correlativo anual, como los informes de soporte del manual
  -- («INFORME DE SOPORTE TECNICO N°18-2023»). Se asigna al emitir.
  correlativo integer,
  anio integer not null default extract(year from (now() at time zone 'America/Lima'))::integer,

  tipo tipo_servicio_pv not null,
  servicio_id uuid references servicios_postventa (id),
  equipo_id   uuid references equipos_instalados (id),
  cuenta_id   uuid references cuentas (id),
  cliente_texto text,
  equipo_texto  text,          -- descripción con marca, modelo, capacidad y serie

  -- In situ o videollamada: en provincia la puesta en marcha suele ser remota.
  modalidad text not null default 'in_situ'
    check (modalidad in ('in_situ', 'videollamada', 'planta')),

  ejecutado_at timestamptz not null default now(),
  tecnico      text,           -- el técnico va como texto: es de Almacén, no tiene usuario
  elaborado_por uuid references perfiles (id),

  asunto      text,
  detalle     text,            -- «trabajo realizado» del anexo
  verificacion text,
  observaciones text,          -- «observaciones y recomendaciones» del anexo
  accesorios  text,            -- «accesorios necesarios para la instalación»
  pendientes  text,

  -- La lectura de ciclos, que es lo que convierte el informe en un dato útil
  -- dos años después.
  ciclos integer,

  -- Checklist de capacitación del anexo 4 y del paso 10 del ítem XVIII.
  capacitacion jsonb not null default '{}'::jsonb,   -- {uso, cuidado, mantenimiento_diario}
  -- [{apellidos_nombres, dni}] — el anexo 4 pide nombrar a quién se capacitó.
  capacitados jsonb not null default '[]'::jsonb,

  -- [{path, etiqueta, nombre, tipo_mime}] en el bucket privado 'adjuntos'.
  fotos jsonb not null default '[]'::jsonb,

  cliente_conforme_nombre text,
  cliente_conforme_doc    text,
  firma_path text,

  enviado_at timestamptz,      -- cuándo se le mandó al cliente por correo/WhatsApp
  emitido_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (anio, correlativo)
);

create index if not exists ix_informes_serv_equipo on informes_servicio (equipo_id);
create index if not exists ix_informes_serv_fecha on informes_servicio (ejecutado_at desc);
create index if not exists ix_informes_serv_servicio on informes_servicio (servicio_id);

comment on table informes_servicio is
  'Informes de postventa (anexos 1-5 del manual): puesta en marcha, garantía, mantenimiento, preinstalación. Con fotos, ciclos y conformidad del cliente (migración 0087).';

drop trigger if exists trg_informes_serv_updated on informes_servicio;
create trigger trg_informes_serv_updated before update on informes_servicio
  for each row execute function set_updated_at();

insert into correlativos (clave, ultimo)
  values ('INFORME-SERVICIO-' || extract(year from (now() at time zone 'America/Lima'))::integer, 0)
on conflict (clave) do nothing;

create or replace function siguiente_correlativo_informe_servicio(p_anio integer)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_clave text := 'INFORME-SERVICIO-' || p_anio::text;
  v_valor integer;
begin
  insert into correlativos (clave, ultimo) values (v_clave, 0) on conflict (clave) do nothing;
  update correlativos set ultimo = ultimo + 1 where clave = v_clave returning ultimo into v_valor;
  return v_valor;
end;
$fn$;

-- ------------------------------------------------------------
-- 5. Liberar el pedido a postventa
-- ------------------------------------------------------------
-- El corazón del cambio. Central marca los dos checks; cuando los dos están,
-- nace (o se completa) la fila de la agenda de postventa con todo lo que el
-- comercial adjuntó. Textual de Carlos: «cuando le haga check pedido ejecutado
-- y liquidación… significa que ya le llegue inmediatamente a postventa, y acá
-- me va a aparecer nuevo pedido».
--
-- Es idempotente: marcar dos veces no crea dos pedidos.
create or replace function liberar_pedido_postventa(
  p_informe_id uuid,
  p_numero_pedido text default null,
  p_marcar_pedido boolean default true,
  p_marcar_liquidacion boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_informe informes_cierre%rowtype;
  v_servicio_id uuid;
  v_equipos text;
  v_modalidad text;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin') then
    raise exception 'Solo Central puede liberar un pedido a postventa';
  end if;

  select * into v_informe from informes_cierre where id = p_informe_id;
  if v_informe is null then
    raise exception 'Informe de cierre no encontrado';
  end if;
  if v_informe.emitido_at is null then
    raise exception 'El informe todavía es un borrador del comercial';
  end if;

  select id into v_servicio_id from servicios_postventa where informe_cierre_id = p_informe_id limit 1;

  -- La descripción del equipo se arma con los ítems del informe, que es como
  -- la escriben ellos: marca, modelo, capacidad y serie en un solo texto.
  select string_agg(x->>'descripcion', E'\n') into v_equipos
    from jsonb_array_elements(v_informe.items) x
   where coalesce(x->>'bloque', 'venta') = 'venta';

  -- Provincia si la entrega va por agencia o transportista. Es una primera
  -- lectura: postventa la corrige al coordinar, que es cuando se sabe de verdad.
  v_modalidad := case
    when coalesce(v_informe.entrega_lugar, '') ~* 'agencia|shalom|transport|marvisur|olva|cruz del sur'
      then 'provincia' else 'lima' end;

  if v_servicio_id is null then
    insert into servicios_postventa (
      informe_cierre_id, cuenta_id, cliente_texto, fecha_confirmacion,
      ubicacion, equipo, tipo_servicio, observaciones,
      monto, moneda, forma_pago, modalidad,
      direccion_entrega, despacho_nota, numero_pedido_erp, origen
    ) values (
      p_informe_id, v_informe.cuenta_id,
      coalesce(v_informe.cliente_doc || ' - ', '') || v_informe.cliente_nombre,
      v_informe.fecha,
      v_informe.entrega_lugar, coalesce(v_equipos, 'Sin detalle'),
      'ENTREGA DE EQUIPO', v_informe.nota_despacho,
      v_informe.monto_total, v_informe.moneda,
      array_to_string(v_informe.modalidad_pago, ' + '), v_modalidad,
      coalesce(v_informe.entrega_direccion, v_informe.entrega_lugar),
      v_informe.entrega_fecha, p_numero_pedido, 'crm'
    ) returning id into v_servicio_id;
  elsif p_numero_pedido is not null then
    update servicios_postventa set numero_pedido_erp = p_numero_pedido where id = v_servicio_id;
  end if;

  if p_marcar_pedido then
    update servicios_postventa
       set pedido_ejecutado_at = coalesce(pedido_ejecutado_at, now()),
           pedido_ejecutado_por = coalesce(pedido_ejecutado_por, auth.uid())
     where id = v_servicio_id;
  end if;

  if p_marcar_liquidacion then
    update servicios_postventa
       set liquidacion_at = coalesce(liquidacion_at, now()),
           liquidacion_por = coalesce(liquidacion_por, auth.uid())
     where id = v_servicio_id;
  end if;

  return v_servicio_id;
end;
$fn$;

comment on function liberar_pedido_postventa is
  'Central marca pedido ejecutado y/o liquidación sobre un informe de cierre emitido; con los dos checks el pedido queda visible para postventa (migración 0087).';

-- Postventa acusa recibo. Desde acá corre el reloj del área.
create or replace function aprobar_pedido_postventa(p_servicio_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not es_postventa() and not es_backoffice() then
    raise exception 'Solo postventa puede aprobar un pedido';
  end if;
  update servicios_postventa
     set aprobado_at = coalesce(aprobado_at, now()),
         aprobado_por = coalesce(aprobado_por, auth.uid()),
         responsable_id = coalesce(responsable_id, auth.uid())
   where id = p_servicio_id;
end;
$fn$;

-- ------------------------------------------------------------
-- 6. Quién ve qué
-- ------------------------------------------------------------
alter table equipos_instalados  enable row level security;
alter table informes_servicio   enable row level security;

-- Postventa y backoffice trabajan el parque instalado. Central lo LEE porque es
-- quien recibe la llamada del cliente y necesita poder decirle si su equipo
-- está en garantía sin llamar a nadie. Y el comercial ve los equipos de su
-- cartera: son sus clientes, y saber qué máquinas tienen es media venta.
drop policy if exists equipos_trabajo on equipos_instalados;
create policy equipos_trabajo on equipos_instalados for all to authenticated
  using (es_postventa() or es_backoffice())
  with check (es_postventa() or es_backoffice());

drop policy if exists equipos_lectura on equipos_instalados;
create policy equipos_lectura on equipos_instalados for select to authenticated
  using (
    rol_actual() = 'central'
    or exists (select 1 from cuentas c
               where c.id = equipos_instalados.cuenta_id and c.comercial_id = (select auth.uid()))
  );

drop policy if exists informes_serv_trabajo on informes_servicio;
create policy informes_serv_trabajo on informes_servicio for all to authenticated
  using (es_postventa() or es_backoffice())
  with check (es_postventa() or es_backoffice());

drop policy if exists informes_serv_lectura on informes_servicio;
create policy informes_serv_lectura on informes_servicio for select to authenticated
  using (
    rol_actual() = 'central'
    or exists (select 1 from cuentas c
               where c.id = informes_servicio.cuenta_id and c.comercial_id = (select auth.uid()))
  );

-- Central necesita ESCRIBIR en servicios_postventa para poder marcar sus dos
-- checks. La 0075 solo le había dado lectura, que era correcto cuando la tabla
-- era el espejo de un Excel ajeno; ahora el pedido nace de su trabajo.
drop policy if exists servicios_pv_central_escribe on servicios_postventa;
create policy servicios_pv_central_escribe on servicios_postventa for update to authenticated
  using (rol_actual() = 'central')
  with check (rol_actual() = 'central');

drop policy if exists servicios_pv_central_crea on servicios_postventa;
create policy servicios_pv_central_crea on servicios_postventa for insert to authenticated
  with check (rol_actual() = 'central');

-- El comercial ve el estado del despacho de sus propias ventas. Hoy pregunta
-- por WhatsApp «¿ya salió lo de mi cliente?»; con esto lo mira.
drop policy if exists servicios_pv_comercial on servicios_postventa;
create policy servicios_pv_comercial on servicios_postventa for select to authenticated
  using (
    exists (select 1 from cuentas c
            where c.id = servicios_postventa.cuenta_id and c.comercial_id = (select auth.uid()))
  );
