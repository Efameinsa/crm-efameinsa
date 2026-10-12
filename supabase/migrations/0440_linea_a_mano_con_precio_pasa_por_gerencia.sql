-- ============================================================
-- CRM EFAMEINSA · Migración 0440 · La línea escrita a mano con precio pasa
-- por gerencia (comerciales)
-- ============================================================
-- Brenda (C1), 12-10-2026: el 07-10 armó en el CRM las dos cotizaciones del
-- mantenimiento preventivo de NEWREST (minera Raura, US$ 11,800 y 11,000),
-- todo con líneas de SERVICIO escritas a mano. Una línea a mano no tiene
-- precio de lista contra el que compararse, así que la base las daba por
-- «auto_aprobada»: el botón decía «Confirmar cotización» y gerencia nunca las
-- vio en Aprobaciones. Para que gerencia se enterara tenía que confirmarlas,
-- y eso gasta el correlativo y saca el precio sin visto bueno (0064).
--
-- Santos, 12-10: «hazlo». Desde ahora, en una cotización de un comercial,
-- toda línea escrita a mano CON PRECIO pide aprobación de gerencia, igual
-- que un precio bajo la lista: la cotización queda en borrador, sin número,
-- en la bandeja de Aprobaciones, y gerencia puede aprobar u observar.
-- Las líneas a mano en 0 (bonos, «instalación gratuita», «mangueras
-- incluidas») no piden nada. Postventa ya pasaba todo por gerencia (0396).
--
-- crear/editar/emitir_cotizacion se parchan sobre la definición viva
-- (nunca se copian: ver 0074/0091/0396). Lo aprobado sobrevive a la edición
-- en la línea a mano desde la 0396 (clave p+u+d).
-- ============================================================

create or replace function public.linea_a_mano_pasa_por_gerencia(p_autor uuid, p_producto uuid, p_unitario numeric)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_producto is null
     and coalesce(p_unitario, 0) > 0
     and exists (select 1 from perfiles p where p.id = p_autor and p.rol = 'comercial');
$$;
comment on function public.linea_a_mano_pasa_por_gerencia(uuid, uuid, numeric) is
  '0440: en la cotización de un comercial, una línea escrita a mano con precio no tiene lista contra la que medirse, así que pide aprobación de gerencia.';

do $$
declare
  v_def   text;
  v_nuevo text;
begin
  -- 1. crear_cotizacion: el autor es quien la crea (dos lugares: el total y el renglón).
  v_def := pg_get_functiondef('public.crear_cotizacion(uuid,serie_cotizacion,jsonb,text,integer,moneda,numeric)'::regprocedure);
  if v_def not like '%linea_a_mano_pasa_por_gerencia%' then
    v_nuevo := replace(v_def,
      'postventa_pasa_por_gerencia(auth.uid())',
      'postventa_pasa_por_gerencia(auth.uid()) or linea_a_mano_pasa_por_gerencia(auth.uid(), v_producto.id, v_unitario)');
    if v_nuevo = v_def then
      raise exception '0440: no se encontró postventa_pasa_por_gerencia en crear_cotizacion';
    end if;
    execute v_nuevo;
  end if;

  -- 2. editar_cotizacion: el autor es quien la creó, no quien la edita.
  v_def := pg_get_functiondef('public.editar_cotizacion(uuid,jsonb,text,integer,moneda,numeric)'::regprocedure);
  if v_def not like '%linea_a_mano_pasa_por_gerencia%' then
    v_nuevo := replace(v_def,
      'postventa_pasa_por_gerencia(v_cot.creada_por)',
      'postventa_pasa_por_gerencia(v_cot.creada_por) or linea_a_mano_pasa_por_gerencia(v_cot.creada_por, v_producto.id, v_unitario)');
    if v_nuevo = v_def then
      raise exception '0440: no se encontró postventa_pasa_por_gerencia en editar_cotizacion';
    end if;
    execute v_nuevo;
  end if;

  -- 3. emitir_cotizacion: un borrador viejo «auto_aprobada» con línea a mano
  --    con precio tampoco sale sin el visto bueno.
  v_def := pg_get_functiondef('public.emitir_cotizacion(uuid)'::regprocedure);
  if v_def not like '%linea_a_mano_pasa_por_gerencia%' then
    v_nuevo := replace(v_def,
      $r$  if v_cot.estado_aprobacion = 'rechazada_gerencia' then$r$,
      $r$  if v_cot.estado_aprobacion = 'auto_aprobada' and exists (
       select 1 from cotizacion_items ci
        where ci.cotizacion_id = p_cotizacion_id
          and linea_a_mano_pasa_por_gerencia(v_cot.creada_por, ci.producto_id, ci.precio_unitario)) then
    raise exception 'Las líneas escritas a mano con precio pasan por gerencia: pida la aprobación antes de confirmarla';
  end if;
  if v_cot.estado_aprobacion = 'rechazada_gerencia' then$r$);
    if v_nuevo = v_def then
      raise exception '0440: no se encontró el control de rechazo en emitir_cotizacion';
    end if;
    execute v_nuevo;
  end if;
end $$;

-- Los borradores de comerciales que ya existen con líneas a mano con precio
-- pasan a la cola de gerencia (entre ellos los dos de NEWREST del 07-10).
-- «PRUEBA…» queda fuera.
update cotizacion_items ci
   set requiere_aprobacion = true
  from cotizaciones c
 where ci.cotizacion_id = c.id
   and c.estado = 'borrador' and c.enviada_at is null
   and c.estado_aprobacion = 'auto_aprobada'
   and linea_a_mano_pasa_por_gerencia(c.creada_por, ci.producto_id, ci.precio_unitario)
   and coalesce(c.cliente_snapshot->>'razon_social', '') not ilike 'PRUEBA%';

update cotizaciones c
   set estado_aprobacion = 'pendiente_gerencia'
 where c.estado = 'borrador' and c.enviada_at is null
   and c.estado_aprobacion = 'auto_aprobada'
   and exists (select 1 from cotizacion_items ci
                where ci.cotizacion_id = c.id
                  and linea_a_mano_pasa_por_gerencia(c.creada_por, ci.producto_id, ci.precio_unitario))
   and coalesce(c.cliente_snapshot->>'razon_social', '') not ilike 'PRUEBA%';
