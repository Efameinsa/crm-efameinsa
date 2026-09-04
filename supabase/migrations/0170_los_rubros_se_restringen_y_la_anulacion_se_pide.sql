-- ============================================================
-- CRM EFAMEINSA · Migración 0170 · Los rubros se restringen, y la anulación se pide
-- ============================================================
-- Reunión del 04-09 a las 14:30. Dos decisiones, y la primera revierte lo que
-- se había pedido el 03-09 (migración 0163).
--
-- 1) LOS COMERCIALES YA NO AGREGAN RUBROS
--
--   «Has agregado que puedan poner los rubros que ellos consideren: nos van a
--    llenar de 30 rubros. Hay que restringirlo. Que sí lo puedan modificar,
--    porque ya está muy bien, excelente, pero no que agreguen ellos. Van a
--    agregar “peluquerías”, pero también le hemos vendido a spa, y spa es como
--    lo tenemos catalogado; uno le va a llamar peluquería, el otro spa, el
--    otro otra cosa. Hay cosas que no hay que abrirles mucho.»
--
-- El comercial sigue pudiendo CAMBIAR el rubro de su cliente eligiendo de la
-- lista —eso funciona bien y clasifica la cartera—; crear un rubro nuevo pasa
-- a operaciones y gerencia, que son quienes cuidan las listas del sistema.
--
-- 2) UNA VENTA SE PUEDE CAER DESPUÉS DE FACTURADA: SE ANULA Y SE REHACE
--
-- El caso real: el cierre 011-2026 de Sierra Travel, US$ 2.600, facturado el
-- 01-09 y con el pago programado para hoy. La gerenta del cliente encontró una
-- cotización más barata de la competencia y frenó la compra; se negoció y bajó
-- a US$ 2.300. El cierre ya había pasado por Central, liquidación y postventa,
-- que hasta pidió la prueba y el embalaje.
--
--   «Anulamos el pedido y volvemos de cero. Se cayó la venta y todo se cae,
--    todos los cálculos regresan a foja cero y el gestor tiene que volver a
--    hacer todo. De verdad, más tranquilo para la empresa.»
--
-- Y quién hace cada cosa:
--
--   «Que el administrador operativo tenga la función de anular el pedido. El
--    comercial manda un clip: necesito anular el pedido, y pone todas sus
--    historias. Le llega al administrador, anulación de pedido solicitada;
--    ingresa, anula. En la central sale anulado por Lesly, operaciones. Y le
--    llega después el nuevo pedido, el nuevo cierre.»
--   «A Central la veo más como derivación y supervisión; a Lesly, más como
--    apagar incendios cuando pasa algo.»
--
-- Lo que ya existía: `anular_cierre` (0113/0162) deja anular a Central,
-- operaciones y gerencia con código de autorización, y arrastra la venta.
-- Lo que faltaba: que el comercial —que es quien se entera de que la venta se
-- cayó— pueda PEDIRLO sin llamar por teléfono, y que a operaciones le llegue.
-- ============================================================

-- ── 1. Crear rubros vuelve a ser de operaciones y gerencia ────────────────
create or replace function public.agregar_rubro(p_nombre text)
returns table(rubro_id integer, rubro_nombre text, nuevo boolean, reactivado boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_fila   catalogo_rubros%rowtype;
begin
  -- Antes bastaba con ser un usuario activo (0163). Carlos, 04-09: los rubros
  -- son una lista del sistema y se cuidan desde operaciones.
  if not (es_backoffice() or es_operaciones()) then
    raise exception 'Los rubros nuevos los crea operaciones o gerencia. Elija uno de la lista o pídalo.';
  end if;
  if length(v_nombre) < 3 then
    raise exception 'El rubro necesita al menos tres letras';
  end if;
  if length(v_nombre) > 40 then
    raise exception 'El rubro es muy largo: hasta 40 letras, como se va a leer en el desplegable';
  end if;

  select * into v_fila from catalogo_rubros r where rubro_clave(r.nombre) = rubro_clave(v_nombre);
  if found then
    if not v_fila.activo then
      update catalogo_rubros set activo = true where id = v_fila.id;
      return query select v_fila.id, v_fila.nombre, false, true;
    else
      return query select v_fila.id, v_fila.nombre, false, false;
    end if;
    return;
  end if;

  v_nombre := upper(left(v_nombre, 1)) || substr(v_nombre, 2);
  insert into catalogo_rubros (nombre, activo, creado_por, creado_at)
  values (v_nombre, true, auth.uid(), now())
  returning * into v_fila;
  return query select v_fila.id, v_fila.nombre, true, false;
end;
$function$;

comment on function public.agregar_rubro(text) is
  'Crea o reactiva un rubro. Desde el 04-09 solo operaciones y gerencia: los comerciales eligen de la lista (Carlos: «nos van a llenar de 30 rubros»).';

-- ── 2. El comercial pide la anulación; operaciones la ejecuta ─────────────
create table if not exists anulaciones_solicitadas (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references informes_cierre (id) on delete cascade,
  solicitada_por uuid not null references perfiles (id),
  motivo text not null,
  created_at timestamptz not null default now(),
  atendida_at timestamptz,
  atendida_por uuid references perfiles (id),
  -- 'anulado' cuando de verdad se anuló; 'descartada' si operaciones decidió
  -- que no procedía. Nulo mientras está pendiente.
  resultado text check (resultado in ('anulado', 'descartada'))
);

comment on table anulaciones_solicitadas is
  'Pedidos de anulación de un cierre hechos por el comercial. Los ejecuta operaciones con su código (Carlos, 04-09 14:30).';

create index if not exists anulaciones_pendientes_idx
  on anulaciones_solicitadas (created_at desc) where atendida_at is null;

alter table anulaciones_solicitadas enable row level security;

drop policy if exists anulaciones_lectura on anulaciones_solicitadas;
create policy anulaciones_lectura on anulaciones_solicitadas
  for select to authenticated
  using (
    es_backoffice() or es_operaciones()
    or (select rol_actual()) = 'central'::rol_usuario
    or solicitada_por = (select auth.uid())
  );

create or replace function public.solicitar_anulacion_cierre(p_informe uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quien   uuid := auth.uid();
  v_inf     record;
  v_dueno   uuid;
  v_nombre  text;
  v_id      uuid;
  v_destino uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 15 then
    raise exception 'Cuente qué pasó con la venta: es lo que va a leer operaciones para decidir';
  end if;

  select i.*, c.comercial_id into v_inf
    from informes_cierre i left join cuentas c on c.id = i.cuenta_id
   where i.id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre todavía es un borrador suyo: bórrelo o corríjalo, no hace falta anularlo';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'El cierre % ya está anulado', v_inf.codigo;
  end if;

  v_dueno := v_inf.comercial_id;
  if v_dueno is distinct from v_quien and not (es_backoffice() or es_operaciones()) then
    raise exception 'Solo el comercial del cliente puede pedir la anulación de su cierre';
  end if;

  -- Pedirlo dos veces no abre dos pedidos: el que está pendiente es el mismo.
  select id into v_id from anulaciones_solicitadas
   where informe_id = p_informe and atendida_at is null limit 1;
  if v_id is not null then
    return jsonb_build_object('codigo', v_inf.codigo, 'repetido', true);
  end if;

  insert into anulaciones_solicitadas (informe_id, solicitada_por, motivo)
  values (p_informe, v_quien, btrim(p_motivo))
  returning id into v_id;

  select nombre into v_nombre from perfiles where id = v_quien;

  -- El aviso va a quien apaga incendios: operaciones. Y a gerencia, que es
  -- quien negocia estos casos.
  for v_destino in
    select p.id from perfiles p
     where p.activo and not coalesce(p.es_prueba, false)
       and (p.es_operaciones or p.rol in ('gerencia', 'admin'))
  loop
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (
      v_destino,
      'anulacion_solicitada',
      'Piden anular el cierre ' || coalesce(v_inf.codigo, 'sin número'),
      coalesce(v_nombre, 'Un comercial') || ': ' || btrim(p_motivo),
      '/central/cierres?anulaciones=1'
    );
  end loop;

  return jsonb_build_object('codigo', v_inf.codigo, 'repetido', false, 'id', v_id);
end $function$;

comment on function public.solicitar_anulacion_cierre(uuid, text) is
  'El comercial pide anular un cierre emitido y el aviso llega a operaciones y gerencia, que lo ejecutan con su código (Carlos, 04-09 14:30).';

-- Cerrar el pedido —porque se anuló, o porque operaciones decidió que no
-- procedía— es de operaciones y gerencia. El comercial pide y mira, no cierra.
drop policy if exists anulaciones_atiende on anulaciones_solicitadas;
create policy anulaciones_atiende on anulaciones_solicitadas
  for update to authenticated
  using (es_backoffice() or es_operaciones())
  with check (es_backoffice() or es_operaciones());
