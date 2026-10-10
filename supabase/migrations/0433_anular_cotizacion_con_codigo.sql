-- 0433 · Anular una cotización numerada, con código
--
-- 10-10-2026, Rubí (Postventa 1): la Presu_1118-26 (YAWAR INKA, USD 225 +
-- IGV = 265.50) salió con fallas y la rehízo; preguntó si se puede eliminar.
-- Regla de gerencia (03-09): los números no se borran ni se rellenan, se
-- ANULAN y quedan a la vista. El estado «anulada» existe desde la 0286, pero
-- solo se ponía a mano por script. Santos: «crea la funcionalidad de anular y
-- que figure donde corresponda».
--
-- Mismo trámite que corregir (0123/0375): quien puede cotizar en el
-- expediente escribe el motivo (mínimo 15) y operaciones o gerencia dictan el
-- código. FRENO: si hay una venta viva o un cierre emitido, primero se anula
-- el cierre (0114/0162), que es lo que mueve la venta y el récord.

alter table public.cotizaciones
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_por uuid references public.perfiles(id),
  add column if not exists anulada_autorizo uuid references public.perfiles(id),
  add column if not exists anulada_motivo text;

comment on column public.cotizaciones.anulada_motivo is
  '0433: por qué se anuló (lo escribe quien la anula; lo lee gerencia y Central).';

-- Qué impide anularla, ANTES de pedir el código.
create or replace function public.frenos_anular_cotizacion(p_cotizacion uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_cot    cotizaciones;
  v_cierre record;
  v_venta  record;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion;
  if not found then
    return jsonb_build_object('puede', false, 'motivo', 'Esa cotización no existe');
  end if;

  if not puede_cotizar_en(v_cot.oportunidad_id) then
    return jsonb_build_object('puede', false, 'motivo', 'Esta cotización no es suya');
  end if;

  if v_cot.estado = 'anulada' then
    return jsonb_build_object('puede', false, 'motivo', 'Esta cotización ya está anulada');
  end if;

  -- Un borrador sin número se borra; uno con número pero sin enviar se edita.
  if v_cot.correlativo is null or v_cot.enviada_at is null then
    return jsonb_build_object(
      'puede', false,
      'motivo', 'Todavía es un borrador: no gastó número. Se edita o se borra desde el cotizador.');
  end if;

  select i.id, i.codigo into v_cierre
    from informes_cierre i
   where i.cotizacion_id = p_cotizacion
     and i.emitido_at is not null
     and i.anulado_at is null
   limit 1;
  if v_cierre.id is not null then
    return jsonb_build_object(
      'puede', false,
      'motivo', format('Esta cotización tiene el cierre de venta N.º %s emitido. Anule primero el cierre y después la cotización.', v_cierre.codigo));
  end if;

  select v.id into v_venta
    from ventas v
   where v.cotizacion_id = p_cotizacion and v.anulada_at is null
   limit 1;
  if v_venta.id is not null then
    return jsonb_build_object(
      'puede', false,
      'motivo', 'Esta cotización tiene una venta registrada. Pida a operaciones que anule la venta (o el cierre) antes de anular la cotización.');
  end if;

  return jsonb_build_object(
    'puede', true,
    'codigo', v_cot.codigo,
    'total', v_cot.total,
    'moneda', v_cot.moneda);
end;
$function$;

create or replace function public.anular_cotizacion(p_cotizacion uuid, p_motivo text, p_pin text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_quien    uuid := auth.uid();
  v_frenos   jsonb;
  v_autorizo uuid;
  v_nombre   text;
  v_codigo   text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  if length(coalesce(btrim(p_motivo), '')) < 15 then
    raise exception 'Escriba por qué se anula la cotización: es lo que queda en el registro y lo que lee quien autoriza';
  end if;

  v_frenos := frenos_anular_cotizacion(p_cotizacion);
  if not (v_frenos->>'puede')::boolean then
    raise exception '%', v_frenos->>'motivo';
  end if;

  -- Operaciones o gerencia, como corregir (0123). Acá se quema el código.
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  begin
    insert into autorizaciones_supervisor (
      supervisor_id, solicitante_id, ventana, accion, motivo
    ) values (
      v_autorizo, v_quien, ventana_pin_actual(), 'anular_cotizacion', btrim(p_motivo)
    );
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola anulación: pida uno nuevo.';
  end;

  update cotizaciones
     set estado = 'anulada',
         anulada_at = now(),
         anulada_por = v_quien,
         anulada_autorizo = v_autorizo,
         anulada_motivo = btrim(p_motivo)
   where id = p_cotizacion
  returning codigo into v_codigo;

  select nombre into v_nombre from perfiles where id = v_autorizo;

  return jsonb_build_object(
    'codigo', v_codigo,
    'autorizo', coalesce(v_nombre, 'un supervisor'),
    'autorizo_id', v_autorizo);
end;
$function$;

revoke all on function public.frenos_anular_cotizacion(uuid) from public, anon;
revoke all on function public.anular_cotizacion(uuid, text, text) from public, anon;
grant execute on function public.frenos_anular_cotizacion(uuid) to authenticated;
grant execute on function public.anular_cotizacion(uuid, text, text) to authenticated;
