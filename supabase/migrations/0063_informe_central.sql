-- ============================================================
-- CRM EFAMEINSA · Migración 0063 · Informe del día de Central
-- ============================================================
-- Pedido por correo de Alondra (Central) el 24-08: «le envío el detalle que
-- estaría faltando al sistema, como lo que es la agenda diaria de la CENTRAL».
--
-- Su informe diario (AGENDA ALONDRA PALMA.pdf) tiene cinco secciones:
--   1. Actividades realizadas — escritas a mano
--   2. Registros de llamada
--   3. Registro de ingreso de prospectos y/o clientes
--   4. Registro de presupuestos
--   5. Presupuestos del día, separados por OPEN y EFAMEINSA
--
-- De las cinco, CUATRO ya las sabe el sistema: son las llamadas y contactos que
-- ella registra, las derivaciones que hace y las cotizaciones que emiten los
-- comerciales. Las armaba a mano copiando del ERP; el ERP dejó de usarse el
-- lunes, así que se quedó sin cómo hacerlas. La única que el sistema no puede
-- adivinar es la primera —"ingresé al sistema", "revisé correos", "fin de mis
-- labores"— y para eso está la bitácora.
--
-- Es el mismo trato que recibieron los comerciales con su reporte diario: el
-- sistema pone lo que ya registró y la persona solo escribe lo que solo ella
-- sabe.

-- ── Bitácora: las actividades que se escriben a mano ─────────────────────────
create table if not exists bitacora_dia (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references perfiles(id) on delete cascade,
  fecha      date not null,
  orden      integer not null default 0,
  texto      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bitacora_dia_perfil_fecha on bitacora_dia (perfil_id, fecha, orden);

comment on table bitacora_dia is
  'Actividades del día escritas a mano, para el informe diario (migración 0063). El resto del informe sale de lo que el sistema ya registró.';

alter table bitacora_dia enable row level security;

drop policy if exists bitacora_propia on bitacora_dia;
create policy bitacora_propia on bitacora_dia
  for all to authenticated
  using (perfil_id = (select auth.uid()) or es_backoffice())
  with check (perfil_id = (select auth.uid()));

-- ── Los datos que el sistema ya tiene ────────────────────────────────────────
create or replace function informe_central(p_fecha date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
begin
  if not (es_backoffice() or rol_actual() = 'central'::rol_usuario) then
    raise exception 'No autorizado';
  end if;

  return jsonb_build_object(
    'fecha', v_fecha,

    -- Sección 1: lo escrito a mano por quien pide el informe.
    'bitacora', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'orden', b.orden, 'texto', b.texto) order by b.orden, b.created_at)
      from bitacora_dia b
      where b.fecha = v_fecha and b.perfil_id = auth.uid()
    ), '[]'::jsonb),

    -- Secciones 2 y 3: todo lo que entró ese día, con su canal y qué pedía.
    -- Se incluye lo derivado a otras áreas: Central recibe TODO contacto
    -- entrante, no solo los de venta, y su informe siempre lo reflejó.
    'contactos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', l.codigo,
               'canal', l.canal,
               'area', l.area_destino,
               'estado', l.estado,
               'nombre', l.nombre_contacto,
               'razon_social', l.razon_social,
               'telefono', l.telefono,
               'solicita', l.mensaje,
               'recibido_at', l.recibido_at,
               'asignado_a', pa.nombre,
               'codigo_comercial', pa.codigo_comercial
             ) order by l.recibido_at)
      from leads l
      left join perfiles pa on pa.id = l.asignado_a
      where (l.recibido_at at time zone 'America/Lima')::date = v_fecha
        and l.estado <> 'historico'
    ), '[]'::jsonb),

    -- Sección 4 y 5: los presupuestos del día, con su razón social.
    'presupuestos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', c.codigo,
               'serie', c.serie,
               'estado', c.estado,
               'total', c.total,
               'moneda', c.moneda,
               'cliente', cu.razon_social,
               'comercial', p.nombre,
               'codigo_comercial', p.codigo_comercial,
               'creada_at', c.created_at
             ) order by c.created_at)
      from cotizaciones c
      join oportunidades o on o.id = c.oportunidad_id
      left join cuentas cu on cu.id = o.cuenta_id
      left join perfiles p on p.id = c.creada_por
      where (c.created_at at time zone 'America/Lima')::date = v_fecha
    ), '[]'::jsonb),

    'totales', jsonb_build_object(
      'contactos', (select count(*) from leads l
                     where (l.recibido_at at time zone 'America/Lima')::date = v_fecha and l.estado <> 'historico'),
      'derivados', (select count(*) from leads l
                     where l.asignado_at is not null
                       and (l.asignado_at at time zone 'America/Lima')::date = v_fecha),
      'sin_asignar', (select count(*) from leads l where l.estado = 'pendiente_triaje'),
      'presupuestos', (select count(*) from cotizaciones c
                        where (c.created_at at time zone 'America/Lima')::date = v_fecha),
      'presupuestos_efameinsa', (select count(*) from cotizaciones c
                                  where (c.created_at at time zone 'America/Lima')::date = v_fecha and c.serie = 'EFAMEINSA'),
      'presupuestos_open', (select count(*) from cotizaciones c
                             where (c.created_at at time zone 'America/Lima')::date = v_fecha and c.serie = 'OPEN')
    )
  );
end $$;

revoke all on function informe_central(date) from public;
grant execute on function informe_central(date) to authenticated;
