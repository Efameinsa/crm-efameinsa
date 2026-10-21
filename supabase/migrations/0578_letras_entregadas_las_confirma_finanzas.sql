-- LAS LETRAS ENTREGADAS LAS CONFIRMA FINANZAS (Santos 21-10, COFACO): «esa
-- parte de subir las letras es algo que le debe corresponder a Finanzas… luego
-- de ello se continúe postventa con verificar despacho». Hasta acá podían
-- marcarlo almacén, postventa y operaciones (0470); ahora solo Finanzas (y
-- gerencia/admin). El almacén sigue marcando que las recogió antes de salir.

create or replace function public.letras_entregadas_al_cliente(p_servicio uuid, p_recibio text, p_fotos jsonb default '[]'::jsonb, p_nota text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_recibio text := nullif(btrim(coalesce(p_recibio, '')), '');
begin
  if not (coalesce(es_backoffice(), false) or rol_actual()::text = 'finanzas') then
    raise exception 'La entrega de las letras al cliente la confirma Finanzas';
  end if;
  if v_recibio is null or length(v_recibio) < 3 then
    raise exception 'Diga quién recibió las letras (nombre, y si se puede, DNI o cargo)';
  end if;
  update servicios_postventa
     set letras_estado = 'entregadas',
         letras_entregadas_at = now(),
         letras_entregadas_por = auth.uid(),
         letras_entregadas_a = v_recibio,
         letras_entregadas_fotos = coalesce(letras_entregadas_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         letras_entregadas_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
     and letras_estado = 'van_con_el_equipo';
  if not found then raise exception 'Este pedido no tiene letras pendientes de entregar'; end if;
end $function$;

create or replace function public.frenar_salida_sin_visto_bueno()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_que text;
begin
  if auth.uid() is null then return new; end if;
  if new.cerrado_at is not null and old.cerrado_at is null then return new; end if;

  if old.despacho_verificado_at is null and new.despacho_verificado_at is not null
     and new.letras_estado = 'van_con_el_equipo' then
    raise exception 'Finanzas todavía no confirmó que las % letras de crédito se entregaron al cliente. Cuando Finanzas lo marque, ya puede verificar el despacho.',
      coalesce(new.letras_cantidad::text, '');
  end if;

  if new.salida_autorizada_at is not null then return new; end if;

  if old.despachado_at is null and new.despachado_at is not null
     and new.letras_estado = 'van_con_el_equipo' and new.letras_recibidas_almacen_at is null then
    raise exception 'Las % letras de crédito van con este equipo y el almacén todavía no confirmó que las tiene. Recójalas en Finanzas y marque «Recibí las letras» antes de registrar la salida.',
      coalesce(new.letras_cantidad::text, '');
  end if;

  if new.finanzas_vb_at is not null then return new; end if;
  if not pide_visto_bueno_finanzas(new) then return new; end if;

  if old.apertura_despacho_at is null and new.apertura_despacho_at is not null then
    v_que := 'emitir la apertura';
  elsif old.guia_confirmada_at is null and new.guia_confirmada_at is not null then
    v_que := 'autorizar la guía';
  elsif old.despachado_at is null and new.despachado_at is not null then
    v_que := 'registrar la salida';
  else
    return new;
  end if;

  raise exception 'Falta el visto bueno de Finanzas para la salida (forma de pago: %; abono: %). Finanzas revisa el pago, las letras y las comisiones. No se puede % todavía. Si hay apuro, gerencia u operaciones autoriza con su código.',
    coalesce(nullif(btrim(new.forma_pago), ''), 'sin dato'), coalesce(nullif(btrim(new.confirmacion_abono), ''), 'sin confirmar'), v_que;
end $function$;
