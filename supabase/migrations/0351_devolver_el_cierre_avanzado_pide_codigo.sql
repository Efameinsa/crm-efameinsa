-- ============================================================
-- CRM EFAMEINSA · Migración 0351 · Devolver un cierre que ya avanzó pide código
-- ============================================================
-- Ing. Carlos, 30-09 (12:35). Central tenía el pedido de un cierre al que ya
-- le había pedido las series; vio que el cierre estaba mal y se lo devolvió al
-- comercial sin pedirle permiso a nadie:
--
--   «Ahí hay dos deficiencias: el proceso ya avanzó, ya le habían pedido
--    serie… y le ha permitido hacerlo sin reparos. La central no puede
--    hacerlo unilateralmente… ya está en finanzas y ya están muchos procesos,
--    ya avanzó. Va a tener que solicitar eso».
--
-- Fueron el 045 y el 046 de Gabriela: los dos con las series pedidas al
-- almacén, el pedido ya generado (PED-0006/0007) y uno con la liquidación de
-- Finanzas ya subida. Devolver los saca de la cola de Central y del tubo de
-- Finanzas; mientras tanto el almacén y Finanzas siguen trabajando sobre algo
-- que el comercial está cambiando.
--
-- EL CRITERIO DE «YA AVANZÓ» (avance_del_cierre). Sale de los pasos que el
-- pedido del cierre (servicios_postventa.informe_cierre_id, 0290-0306) ya
-- dejó marcados. Basta UNO:
--   · Almacén: Central pidió las series (series_pedidas_at o, en la vía
--     vieja, serie_solicitada_at) o alguna máquina ya tiene serie
--     (pedido_equipos.serie).
--   · Finanzas: Central le metió urgencia
--     (urgencia_finanzas_at), Finanzas subió la liquidación
--     (liquidacion_subida_at, liquidacion_at o una fila en
--     liquidaciones_pedido), se pidió o registró el pago
--     (pago_solicitado_at, pago_confirmado_at o pagos_pedido), o ya hay
--     factura (facturas_pedido).
--   · Salida: apertura de despacho, salida autorizada o despachado.
-- NO CUENTA que el pedido tenga número (numero_pedido_erp, pedido_generado_at)
-- ni que esté marcado ejecutado: son marcas de Central, no trabajo de otra
-- área, y con el número contando TODA devolución pediría código. Carlos
-- habló de lo que otros ya trabajaron: «ya le habían pedido serie… ya está
-- en finanzas».
-- Un cierre emitido sin pedido, o con el pedido recién creado y nada más, se
-- sigue devolviendo como siempre: solo con el motivo (0178). Eso es lo que
-- Carlos pidió en 05-09 y no cambia.
--
-- CON CÓDIGO DE GERENCIA. validar_codigo_autorizacion con ámbito
-- 'devolver_cierre' (que no es 'operaciones' ni 'derivacion'): solo gerencia
-- o admin. Carlos dijo «va a tener que solicitar eso», y quien ve el pedido
-- en Finanzas es gerencia. El código SE GASTA (fila en
-- autorizaciones_supervisor, como la corrección del cierre en 0154): por la
-- 0343 el PIN cambia apenas se usa, así que la pantalla del supervisor ya
-- muestra otro. Y queda escrito quién autorizó en devoluciones_cierre.autorizo.
--
-- AVISA. Con autorización, gerencia se entera en la campana, con el motivo; y
-- Finanzas también si el pedido ya estaba en su lado. Una cuenta de práctica
-- no avisa a nadie real (0336).
-- ============================================================

alter table public.devoluciones_cierre
  add column if not exists autorizo uuid references public.perfiles (id),
  add column if not exists avance   text;

comment on column public.devoluciones_cierre.autorizo is
  'El supervisor (gerencia) cuyo código autorizó devolver un cierre que ya había avanzado (0351, Carlos 30-09). Null si no hizo falta.';
comment on column public.devoluciones_cierre.avance is
  'Lo que el pedido ya tenía hecho cuando se devolvió, en palabras (0351). Null si no había avanzado.';


-- ------------------------------------------------------------
-- ¿El cierre ya avanzó? Una sola regla para la base y para la pantalla.
-- ------------------------------------------------------------
create or replace function public.avance_del_cierre(p_informe uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_pasos      text[] := '{}';
  v_finanzas   boolean := false;
  s            servicios_postventa%rowtype;
begin
  if not (es_backoffice() or es_operaciones() or rol_actual() = 'central'::rol_usuario) then
    raise exception 'Solo Central, operaciones o gerencia ven el avance de un cierre';
  end if;

  for s in select * from servicios_postventa where informe_cierre_id = p_informe loop
    -- Almacén
    if s.series_pedidas_at is not null or s.serie_solicitada_at is not null then
      v_pasos := array_append(v_pasos, 'series pedidas al almacén');
    elsif exists (select 1 from pedido_equipos e where e.servicio_id = s.id and nullif(btrim(e.serie), '') is not null) then
      v_pasos := array_append(v_pasos, 'series registradas');
    end if;

    -- Finanzas
    if s.urgencia_finanzas_at is not null then
      v_pasos := array_append(v_pasos, 'urgencia a Finanzas');
      v_finanzas := true;
    end if;
    if s.liquidacion_subida_at is not null or s.liquidacion_at is not null
       or exists (select 1 from liquidaciones_pedido l where l.servicio_id = s.id) then
      v_pasos := array_append(v_pasos, 'liquidación de Finanzas subida');
      v_finanzas := true;
    end if;
    if s.pago_solicitado_at is not null or s.pago_confirmado_at is not null
       or exists (select 1 from pagos_pedido p where p.servicio_id = s.id) then
      v_pasos := array_append(v_pasos, 'pago en Finanzas');
      v_finanzas := true;
    end if;
    if exists (select 1 from facturas_pedido f where f.servicio_id = s.id) then
      v_pasos := array_append(v_pasos, 'facturado');
      v_finanzas := true;
    end if;

    -- Salida
    if s.apertura_despacho_at is not null or s.salida_autorizada_at is not null or s.despachado_at is not null then
      v_pasos := array_append(v_pasos, 'en despacho');
    end if;
  end loop;

  return jsonb_build_object(
    'avanzo', coalesce(array_length(v_pasos, 1), 0) > 0 or v_finanzas,
    'en_finanzas', v_finanzas,
    'pasos', to_jsonb(v_pasos));
end $function$;

revoke all on function public.avance_del_cierre(uuid) from public, anon;
grant execute on function public.avance_del_cierre(uuid) to authenticated;

comment on function public.avance_del_cierre(uuid) is
  'Qué pasos del pedido ya se hicieron sobre este cierre (series, Finanzas, salida). Si avanzó, devolverlo pide código de gerencia (0351, Carlos 30-09).';


-- ------------------------------------------------------------
-- Central devuelve (parche sobre la 0178, única definición hasta hoy)
-- ------------------------------------------------------------
-- La firma cambia: la vieja (uuid, text) se va para que PostgREST no tenga
-- dos candidatas. La llamada vieja sin p_pin sigue sirviendo cuando no hace
-- falta el código.
drop function if exists public.devolver_cierre(uuid, text);

create or replace function public.devolver_cierre(p_informe uuid, p_motivo text, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inf      informes_cierre%rowtype;
  v_motivo   text := btrim(coalesce(p_motivo, ''));
  v_id       uuid;
  v_avance   jsonb;
  v_pasos    text;
  v_autorizo uuid;
  v_quien    text;
  v_sup      text;
  v_titulo   text;
  v_cuerpo   text;
begin
  if not (es_backoffice() or es_operaciones() or rol_actual() = 'central'::rol_usuario) then
    raise exception 'Solo Central, operaciones o gerencia devuelven un cierre';
  end if;
  if length(v_motivo) < 15 then
    raise exception 'Escriba qué está mal. El comercial solo va a leer eso para corregirlo';
  end if;

  select * into v_inf from informes_cierre where id = p_informe for update;
  if not found then raise exception 'Ese cierre ya no está'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre todavía es un borrador: no hay nada que devolver';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'Ese cierre está anulado. Devolver no aplica';
  end if;
  if exists (select 1 from devoluciones_cierre d where d.informe_id = p_informe and d.resuelto_at is null) then
    raise exception 'Ese cierre ya está devuelto y esperando corrección';
  end if;

  -- 0351: si el pedido ya avanzó, Central no lo devuelve sola (Carlos, 30-09).
  v_avance := avance_del_cierre(p_informe);
  if (v_avance->>'avanzo')::boolean then
    select string_agg(x, ', ') into v_pasos from jsonb_array_elements_text(v_avance->'pasos') x;
    if nullif(regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g'), '') is null then
      raise exception 'Este cierre ya avanzó (%). Para devolverlo pida el código a gerencia', coalesce(v_pasos, 'en Finanzas');
    end if;

    v_autorizo := validar_codigo_autorizacion(p_pin, 'devolver_cierre');
    select nombre into v_sup from perfiles where id = v_autorizo;

    -- Se gasta: el PIN del supervisor cambia al instante (0343).
    begin
      insert into autorizaciones_supervisor (supervisor_id, solicitante_id, ventana, accion, motivo)
      values (v_autorizo, auth.uid(), ventana_pin_actual(), 'devolver_cierre',
              format('%s · %s', coalesce(v_inf.codigo, 'cierre'), v_motivo));
    exception when unique_violation then
      raise exception 'Ese código ya se usó. Pídale el nuevo a gerencia.';
    end;
  end if;

  insert into devoluciones_cierre (informe_id, motivo, devuelto_por, autorizo, avance)
  values (p_informe, v_motivo, auth.uid(), v_autorizo, case when v_autorizo is not null then v_pasos end)
  returning id into v_id;

  -- Avisos de la devolución autorizada. La práctica no avisa a reales (0336).
  if v_autorizo is not null and not coalesce(es_cuenta_prueba(), false) then
    select nombre into v_quien from perfiles where id = auth.uid();
    v_titulo := format('Cierre %s devuelto al comercial con autorización de %s',
                       coalesce(v_inf.codigo, ''), coalesce(v_sup, 'gerencia'));
    v_cuerpo := left(format('Lo devolvió %s. Ya tenía: %s. Motivo: %s',
                            coalesce(v_quien, 'Central'), coalesce(v_pasos, '—'), v_motivo), 500);
    -- Solo personas reales: ni las cuentas de práctica ni las «Propuesta ·»
    -- (que tienen rol finanzas y se llevaban 12 avisos por devolución). Uno
    -- por persona: gerencia primero, Finanzas solo si el pedido ya estaba allá.
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    select distinct on (d.id) d.id, 'cierre_devuelto', v_titulo, d.cuerpo, d.url
      from (
        select p.id, 1 as orden, v_cuerpo as cuerpo, '/central/cierres?ver=devueltos' as url
          from perfiles p
         where p.activo and not coalesce(p.es_prueba, false) and p.rol = 'gerencia'::rol_usuario
        union all
        select p.id, 2, v_cuerpo || ' — El pedido queda en pausa hasta que el comercial lo corrija.', '/finanzas/liquidar'
          from perfiles p
         where (v_avance->>'en_finanzas')::boolean
           and p.activo and not coalesce(p.es_prueba, false) and p.rol = 'finanzas'::rol_usuario
           and p.nombre not like 'Propuesta ·%'
      ) d
     order by d.id, d.orden;
  end if;

  return jsonb_build_object(
    'devolucion', v_id,
    'codigo', v_inf.codigo,
    'comercial', v_inf.creado_por,
    'autorizo', v_sup);
end $function$;

revoke all on function public.devolver_cierre(uuid, text, text) from public, anon;
grant execute on function public.devolver_cierre(uuid, text, text) to authenticated;

comment on function public.devolver_cierre(uuid, text, text) is
  'Central devuelve al comercial un cierre mal hecho, con el motivo (0178). Si el pedido ya avanzó (series, Finanzas, salida) pide código de gerencia, lo gasta, guarda quién autorizó y avisa a gerencia y Finanzas (0351, Carlos 30-09).';
