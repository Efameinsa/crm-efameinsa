-- ============================================================
-- CRM EFAMEINSA · Migración 0396 · Postventa: toda cotización pasa por
-- gerencia mientras dure la capacitación
-- ============================================================
-- Santos, 05-10-2026, por orden de gerencia: «Puesto que post venta aún está
-- en capacitación, por ahora que todas las cotizaciones sin excepción, así
-- estén por encima o por debajo del precio de catálogo, soliciten aprobación;
-- solo para el caso de post venta, sea Gabriela o Rubí, o cualquiera que
-- tenga el usuario de post venta». Y la revisión con acuse de la 0392
-- («visto por gerencia») «no va»: la reemplaza esta aprobación.
--
-- La regla es del AUTOR de la cotización (perfil comercial con es_postventa),
-- no del expediente: Lesly (operaciones) no entra, y un comercial con la
-- llave `hace_postventa` tampoco. Para apagarla cuando termine la
-- capacitación basta con volver a crear `postventa_pasa_por_gerencia`
-- devolviendo false.
--
-- crear_cotizacion, editar_cotizacion y emitir_cotizacion se parchan sobre
-- la definición viva (nunca se copian: ver 0074/0091); si el bloque no
-- aparece, se aborta.
-- ============================================================

create or replace function public.postventa_pasa_por_gerencia(p_autor uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from perfiles p
     where p.id = p_autor
       and p.es_postventa is true
       and p.rol = 'comercial'
  );
$$;
comment on function public.postventa_pasa_por_gerencia(uuid) is
  'Postventa en capacitación (0396): toda cotización de un comercial de postventa pide aprobación de gerencia, renglón por renglón.';

do $$
declare
  v_def   text;
  v_nuevo text;
begin
  -- 1. crear_cotizacion: el autor es quien la crea.
  v_def := pg_get_functiondef('public.crear_cotizacion(uuid,serie_cotizacion,jsonb,text,integer,moneda,numeric)'::regprocedure);
  if v_def not like '%postventa_pasa_por_gerencia%' then
    v_nuevo := replace(v_def,
      'exige_aprobacion_gerencia(v_producto.id, v_bajo_lista)',
      '(exige_aprobacion_gerencia(v_producto.id, v_bajo_lista) or postventa_pasa_por_gerencia(auth.uid()))');
    if v_nuevo = v_def then
      raise exception '0396: no se encontró exige_aprobacion_gerencia en crear_cotizacion';
    end if;
    execute v_nuevo;
  end if;

  -- 2. editar_cotizacion: el autor es quien la creó, no quien la edita.
  v_def := pg_get_functiondef('public.editar_cotizacion(uuid,jsonb,text,integer,moneda,numeric)'::regprocedure);
  if v_def not like '%postventa_pasa_por_gerencia%' then
    v_nuevo := replace(v_def,
      'exige_aprobacion_gerencia(v_producto.id, v_bajo_lista)',
      '(exige_aprobacion_gerencia(v_producto.id, v_bajo_lista) or postventa_pasa_por_gerencia(v_cot.creada_por))');
    if v_nuevo = v_def then
      raise exception '0396: no se encontró exige_aprobacion_gerencia en editar_cotizacion';
    end if;
    v_def := v_nuevo;

    -- Lo aprobado sobrevive a la edición también en la línea escrita a mano
    -- (servicios de postventa): se reconoce por su descripción y su precio.
    -- Antes solo había renglones del catálogo que pidieran aprobación.
    v_nuevo := replace(v_def,
      $r$jsonb_build_object('p', producto_id, 'u', precio_unitario)$r$,
      $r$jsonb_build_object('p', producto_id, 'u', precio_unitario, 'd', case when producto_id is null then descripcion end)$r$);
    if v_nuevo = v_def then
      raise exception '0396: no se encontró la lista de aprobados en editar_cotizacion';
    end if;
    v_def := v_nuevo;
    v_nuevo := replace(v_def,
      $r$v_ya_aprobado := v_requiere and v_producto.id is not null and v_aprobados_antes @> jsonb_build_array(
      jsonb_build_object('p', v_producto.id, 'u', v_unitario));$r$,
      $r$v_ya_aprobado := v_requiere and v_aprobados_antes @> jsonb_build_array(
      jsonb_build_object('p', v_producto.id, 'u', v_unitario, 'd', case when v_producto.id is null then v_descripcion end));$r$);
    if v_nuevo = v_def then
      raise exception '0396: no se encontró v_ya_aprobado en editar_cotizacion';
    end if;
    execute v_nuevo;
  end if;

  -- 3. emitir_cotizacion: la de postventa no sale sin el visto bueno, aunque
  --    sea un borrador viejo que nadie volvió a guardar.
  v_def := pg_get_functiondef('public.emitir_cotizacion(uuid)'::regprocedure);
  if v_def not like '%postventa_pasa_por_gerencia%' then
    v_nuevo := replace(v_def,
      $r$  if v_cot.estado_aprobacion = 'rechazada_gerencia' then$r$,
      $r$  if v_cot.estado_aprobacion = 'auto_aprobada' and postventa_pasa_por_gerencia(v_cot.creada_por) then
    raise exception 'Por ahora toda cotización de postventa pasa por gerencia: pida la aprobación antes de confirmarla';
  end if;
  if v_cot.estado_aprobacion = 'rechazada_gerencia' then$r$);
    if v_nuevo = v_def then
      raise exception '0396: no se encontró el control de rechazo en emitir_cotizacion';
    end if;
    execute v_nuevo;
  end if;
end $$;

-- Los borradores de postventa que ya existen pasan a la cola de gerencia
-- (los que tienen monto; los vacíos se recalculan al volver a guardarse, y
-- emitir_cotizacion igual los frena). «PRUEBA TEST» queda fuera.
update cotizacion_items ci
   set requiere_aprobacion = true
  from cotizaciones c
 where ci.cotizacion_id = c.id
   and c.estado = 'borrador' and c.enviada_at is null
   and c.estado_aprobacion = 'auto_aprobada'
   and c.total > 0
   and postventa_pasa_por_gerencia(c.creada_por)
   and coalesce(c.cliente_snapshot->>'razon_social', '') not ilike 'PRUEBA%';

update cotizaciones c
   set estado_aprobacion = 'pendiente_gerencia'
 where c.estado = 'borrador' and c.enviada_at is null
   and c.estado_aprobacion = 'auto_aprobada'
   and c.total > 0
   and postventa_pasa_por_gerencia(c.creada_por)
   and coalesce(c.cliente_snapshot->>'razon_social', '') not ilike 'PRUEBA%';
