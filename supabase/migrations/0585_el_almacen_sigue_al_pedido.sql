-- ============================================================
-- CRM EFAMEINSA · Migración 0585 · El almacén sigue al pedido
-- ============================================================
-- Reunión Carlos–Santos–Lesly del 22-10-2026 (10:29). Carlos: el stock por
-- serie es «la punta de partida» y de ahí sale todo lo demás; el catálogo
-- muestra la suma (50 Titan Max = 50 series) y «cuando cada venta se haga, se
-- descuenta el inventario… así funcionan los ERP». Hoy Lesly, cuando Central
-- le pide la serie para un pedido, «me voy al Excel, corto y lo pego en
-- reserva». Carlos: «no va a hacer eso: solamente le va a dar un check… y se
-- va automáticamente: descuentas acá, descuentas por todos lados». Y si el
-- cliente cambia de equipo, «la libera, el mismo procedimiento, y vuelve a
-- aparecer en el stock».
--
-- Por eso el almacén SIGUE A LA SERIE DEL PEDIDO, sin que nadie lo recuerde:
--  · se registra una serie en una unidad del pedido → esa máquina del almacén
--    pasa a RESERVADA para ese cliente y ese pedido;
--  · se quita o se corrige la serie (o se quita la línea) → vuelve a DISPONIBLE;
--  · el almacén registra la salida del pedido → DESPACHADA, con la fecha.
-- Además, Carlos pidió que cada máquina diga de qué empresa es (Open o
-- Efameinsa) y que la fecha de ingreso esté (ya estaba: ingreso_at).

alter table inventario_equipos
  add column if not exists servicio_id      uuid references servicios_postventa(id) on delete set null,
  add column if not exists pedido_equipo_id uuid references pedido_equipos(id) on delete set null,
  add column if not exists empresa          text;

comment on column inventario_equipos.servicio_id is 'El pedido para el que está reservada o con el que salió (0585): lo pone el CRM al registrar la serie en el pedido.';
comment on column inventario_equipos.pedido_equipo_id is 'La unidad del pedido que lleva esta serie (0585).';
comment on column inventario_equipos.empresa is 'De qué empresa es la máquina: OPEN o EFAMEINSA (Carlos 22-10). Viene del Excel si trae la columna, o la pone operaciones.';

create index if not exists ix_inventario_servicio on inventario_equipos (servicio_id) where servicio_id is not null;

-- ------------------------------------------------------------
-- 1. La serie del pedido reserva (o libera) la máquina del almacén.
create or replace function inventario_sigue_la_serie()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_s record;
begin
  -- Se quitó, se cambió o se borró la línea: la máquina que tenía vuelve a estar disponible.
  if tg_op in ('UPDATE', 'DELETE') and old.serie is not null and (tg_op = 'DELETE' or new.serie is distinct from old.serie) then
    update inventario_equipos
       set estado = 'disponible', servicio_id = null, pedido_equipo_id = null,
           reservado_para = null, reservado_at = null, reservado_por = null,
           nota = left(coalesce(nota || ' · ', '') || 'Liberada del pedido el ' || to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY'), 300)
     where pedido_equipo_id = old.id and estado = 'reservado';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  -- Se puso una serie: si esa máquina está disponible en el almacén, queda para este pedido.
  if new.serie is not null and coalesce(new.sin_serie, false) = false and (tg_op = 'INSERT' or new.serie is distinct from old.serie) then
    select id, cuenta_id, despachado_at, informe_cierre_id into v_s from servicios_postventa where id = new.servicio_id;
    if v_s.despachado_at is not null then
      -- La serie se registró después de la salida (pasa con pedidos viejos): ya no está en planta.
      update inventario_equipos
         set estado = 'despachado', servicio_id = v_s.id, pedido_equipo_id = new.id,
             salida_at = coalesce(salida_at, v_s.despachado_at), informe_cierre_id = coalesce(informe_cierre_id, v_s.informe_cierre_id)
       where upper(serie) = upper(new.serie) and estado in ('disponible', 'reservado') and es_prueba = new.es_prueba;
    else
      update inventario_equipos
         set estado = 'reservado', servicio_id = v_s.id, pedido_equipo_id = new.id,
             reservado_para = v_s.cuenta_id, reservado_at = now(), reservado_por = auth.uid()
       where upper(serie) = upper(new.serie) and estado = 'disponible' and es_prueba = new.es_prueba;
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists zc_inventario_sigue_la_serie on pedido_equipos;
create trigger zc_inventario_sigue_la_serie
  after insert or update of serie or delete on pedido_equipos
  for each row execute function inventario_sigue_la_serie();

-- ------------------------------------------------------------
-- 2. La salida del pedido despacha las máquinas reservadas que van en él.
create or replace function inventario_sale_con_el_pedido()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.despachado_at is not null and old.despachado_at is null then
    update inventario_equipos i
       set estado = 'despachado', salida_at = new.despachado_at,
           informe_cierre_id = coalesce(i.informe_cierre_id, new.informe_cierre_id)
      from pedido_equipos pe
     where pe.id = i.pedido_equipo_id and pe.servicio_id = new.id
       and i.estado = 'reservado' and coalesce(pe.en_este_despacho, true);
  end if;
  return new;
end $fn$;

drop trigger if exists zd_inventario_sale_con_el_pedido on servicios_postventa;
create trigger zd_inventario_sale_con_el_pedido
  after update of despachado_at on servicios_postventa
  for each row execute function inventario_sale_con_el_pedido();

-- ------------------------------------------------------------
-- 3. Lo que ya estaba: máquinas disponibles cuya serie ya figura en un pedido.
update inventario_equipos i
   set estado = case when s.despachado_at is null then 'reservado' else 'despachado' end::estado_inventario,
       servicio_id = s.id, pedido_equipo_id = pe.id,
       reservado_para = case when s.despachado_at is null then s.cuenta_id else null end,
       reservado_at = case when s.despachado_at is null then now() else null end,
       salida_at = case when s.despachado_at is null then null else s.despachado_at end
  from pedido_equipos pe
  join servicios_postventa s on s.id = pe.servicio_id
 where upper(pe.serie) = upper(i.serie) and coalesce(pe.sin_serie, false) = false
   and pe.es_prueba = i.es_prueba and i.estado = 'disponible';

-- ------------------------------------------------------------
-- 4. «Liberar» a mano deja la máquina sin pedido; y no se libera a mano una
--    que un pedido todavía tiene (se quita la serie en el pedido y vuelve sola).
create or replace function mover_equipo_inventario(
  p_id uuid,
  p_estado text,
  p_cuenta uuid default null,
  p_nota text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_eq record;
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El inventario lo mueve operaciones';
  end if;

  select * into v_eq from inventario_equipos where id = p_id;
  if not found then raise exception 'Esa máquina no está en el inventario'; end if;
  if p_estado not in ('disponible', 'reservado', 'despachado', 'baja') then
    raise exception 'Estado desconocido: %', p_estado;
  end if;
  if p_estado = 'reservado' and p_cuenta is null then
    raise exception 'Para reservar hay que decir para qué cliente';
  end if;
  if p_estado = 'disponible' and v_eq.pedido_equipo_id is not null
     and exists (select 1 from pedido_equipos pe where pe.id = v_eq.pedido_equipo_id and upper(pe.serie) = upper(v_eq.serie)) then
    raise exception 'La serie % sigue en un pedido: quítela o corríjala en el pedido y la máquina vuelve sola al stock', v_eq.serie;
  end if;

  update inventario_equipos
     set estado = p_estado::estado_inventario,
         reservado_para = case when p_estado = 'reservado' then p_cuenta else null end,
         reservado_at   = case when p_estado = 'reservado' then now() else null end,
         reservado_por  = case when p_estado = 'reservado' then auth.uid() else null end,
         salida_at      = case when p_estado = 'despachado' then coalesce(v_eq.salida_at, now()) else null end,
         servicio_id    = case when p_estado = 'disponible' then null else servicio_id end,
         pedido_equipo_id = case when p_estado = 'disponible' then null else pedido_equipo_id end,
         nota           = coalesce(p_nota, nota)
   where id = p_id;

  return jsonb_build_object('serie', v_eq.serie, 'estado', p_estado);
end;
$fn$;

-- ------------------------------------------------------------
-- 5. La subida del Excel guarda también la empresa (si la hoja trae la columna).
create or replace function stock_carga_subir(p_carga uuid, p_sacar_ausentes boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_c stock_cargas%rowtype;
  v_f jsonb;
  v_codigo text;
  v_serie text;
  v_prod uuid;
  v_activo boolean;
  v_desc text;
  v_inv inventario_equipos%rowtype;
  v_cargadas int := 0;
  v_movidas int := 0;
  v_iguales int := 0;
  v_creados text[] := '{}';
  v_retirados text[] := '{}';
  v_ocupadas text[] := '{}';
  v_sin_decidir int := 0;
  v_sacadas int := 0;
  v_ref jsonb := '{}'::jsonb;
  v_k text;
  v_resultado jsonb;
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El stock lo sube operaciones';
  end if;
  select * into v_c from stock_cargas
   where id = p_carga and estado = 'revisando' and es_prueba = es_cuenta_prueba()
   for update;
  if not found then
    raise exception 'Esta carga ya se subió o fue reemplazada por un Excel más nuevo';
  end if;

  for v_f in select value from jsonb_array_elements(v_c.filas) loop
    if coalesce(v_f->>'decision', 'pendiente') = 'pendiente' then
      v_sin_decidir := v_sin_decidir + 1;
      continue;
    end if;
    continue when v_f->>'decision' <> 'subir';
    v_codigo := upper(btrim(v_f->>'codigoFinal'));
    continue when v_codigo is null or v_codigo = '';
    v_desc := nullif(btrim(coalesce(v_f->>'descripcion', '')), '');

    select id, activo into v_prod, v_activo from productos where upper(sku) = v_codigo limit 1;
    if v_prod is null then
      insert into productos (sku, marca, modelo, nombre, segmento, categoria, capacidad, activo, ficha)
      values (
        v_codigo,
        coalesce(nullif(btrim(v_f->>'marca'), ''), case when v_f->>'hoja' ilike '%LG%' then 'LG' else 'SIN MARCA' end),
        coalesce(nullif(btrim(v_f->>'modelo'), ''), v_codigo),
        left(coalesce(v_desc, v_f->>'modelo', v_codigo), 300),
        (case when v_f->>'hoja' ilike '%LG%' then 'semi_industrial' else 'industrial' end)::segmento_producto,
        case when v_desc ilike '%LAVADORA%' or v_desc ilike 'LAV%' then 'lavadora'
             when v_desc ilike '%SECADORA%' then 'secadora'
             when v_desc ilike '%RODILLO%' or v_desc ilike '%CALANDRIA%' then 'planchador'
             else null end,
        nullif(btrim(v_f->>'capacidad'), ''),
        false,
        jsonb_build_object(
          'descripcion_maestro', v_desc,
          'falta_ficha', true,
          'origen', jsonb_build_object('stock_importaciones', v_c.archivo, 'creado_desde_stock_at', now()))
      )
      returning id into v_prod;
      v_activo := false;
      v_creados := v_creados || v_codigo;
    end if;
    if not v_activo and not (v_codigo = any(v_creados)) and not (v_codigo = any(v_retirados)) then
      v_retirados := v_retirados || v_codigo;
    end if;

    v_serie := upper(nullif(btrim(coalesce(v_f->>'serie', '')), ''));
    if v_serie is null then
      v_ref := jsonb_set(v_ref, array[v_prod::text], to_jsonb(coalesce((v_ref->>v_prod::text)::int, 0) + coalesce((v_f->>'cantidad')::int, 0)));
      continue;
    end if;

    select * into v_inv from inventario_equipos
     where upper(serie) = v_serie and estado <> 'baja' and es_prueba = es_cuenta_prueba()
     limit 1;
    if not found then
      insert into inventario_equipos (producto_id, serie, estado, ubicacion, ingreso_at, nota,
                                      item_importaciones, descripcion, modelo, capacidad, proveedor, empresa)
      values (v_prod, v_serie, 'disponible', nullif(btrim(v_f->>'ubicacion'), ''),
              coalesce((v_f->>'ingreso')::date, current_date),
              left('Stock de Importaciones · ' || v_c.archivo || coalesce(' · ítem ' || (v_f->>'item'), ''), 300),
              nullif(btrim(v_f->>'item'), ''), left(v_desc, 600), nullif(btrim(v_f->>'modelo'), ''),
              nullif(btrim(v_f->>'capacidad'), ''), nullif(btrim(v_f->>'proveedor'), ''), nullif(btrim(v_f->>'empresa'), ''));
      v_cargadas := v_cargadas + 1;
    elsif v_inv.estado <> 'disponible' then
      v_ocupadas := v_ocupadas || v_serie;
    else
      update inventario_equipos set
             producto_id = v_prod,
             ubicacion = coalesce(nullif(btrim(v_f->>'ubicacion'), ''), ubicacion),
             item_importaciones = coalesce(nullif(btrim(v_f->>'item'), ''), item_importaciones),
             descripcion = coalesce(left(v_desc, 600), descripcion),
             modelo = coalesce(nullif(btrim(v_f->>'modelo'), ''), modelo),
             capacidad = coalesce(nullif(btrim(v_f->>'capacidad'), ''), capacidad),
             proveedor = coalesce(nullif(btrim(v_f->>'proveedor'), ''), proveedor),
             empresa = coalesce(nullif(btrim(v_f->>'empresa'), ''), empresa)
       where id = v_inv.id;
      if v_inv.producto_id <> v_prod then v_movidas := v_movidas + 1; else v_iguales := v_iguales + 1; end if;
    end if;
  end loop;

  for v_k in select jsonb_object_keys(v_ref) loop
    update productos set ficha = coalesce(ficha, '{}'::jsonb) || jsonb_build_object('stock_referencia', (v_ref->>v_k)::int)
     where id = v_k::uuid;
  end loop;

  if p_sacar_ausentes then
    update inventario_equipos i
       set estado = 'despachado', salida_at = now(),
           nota = left(coalesce(i.nota || ' · ', '') || 'Ya no vino en el Excel de stock ' || v_c.archivo, 300)
     where i.estado = 'disponible' and i.es_prueba = es_cuenta_prueba()
       and upper(i.serie) in (select upper(a->>'serie') from jsonb_array_elements(v_c.ausentes) a);
    get diagnostics v_sacadas = row_count;
  end if;

  v_resultado := jsonb_build_object(
    'cargadas', v_cargadas, 'movidas', v_movidas, 'iguales', v_iguales,
    'creados', to_jsonb(v_creados), 'retirados', to_jsonb(v_retirados),
    'ocupadas', to_jsonb(v_ocupadas), 'sinDecidir', v_sin_decidir,
    'referencia', (select count(*) from jsonb_object_keys(v_ref)), 'sacadas', v_sacadas);
  update stock_cargas set estado = 'subida', subida_at = now(), subida_por = auth.uid(), resultado = v_resultado
   where id = p_carga;
  return v_resultado;
end $fn$;
