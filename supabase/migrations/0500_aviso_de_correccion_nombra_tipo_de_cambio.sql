-- EL AVISO «CIERRE CORREGIDO» NOMBRA EL TIPO DE CAMBIO Y EL N.º DE OPERACIÓN (15-10-2026).
-- Gabriela agregó el tipo de cambio al OPEN 060-2026 y Central recibió
-- «Cambió: nada visible (misma información)»: avisar_cierre_corregido (0492)
-- no comparaba los campos nuevos de 0493 y 0498. Definición viva + esos dos.

CREATE OR REPLACE FUNCTION public.avisar_cierre_corregido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quien        text;
  v_rol_corrigio text;
  v_autorizo     text;
  v_motivo       text;
  v_cambios      text[] := '{}';
  v_facturacion  boolean := false;
  v_entrega      boolean := false;
  v_equipos      boolean := false;
  v_ped          servicios_postventa;
  v_titulo       text;
  v_cuerpo       text;
  v_pedido_txt   text;
begin
  if coalesce(new.es_prueba, false) then return new; end if;

  select coalesce(p.codigo_comercial || ' · ', '') || p.nombre, p.rol::text
    into v_quien, v_rol_corrigio
    from perfiles p where p.id = new.corregido_por;

  -- La versión archivada (misma transacción) guarda el motivo y quién dictó el código.
  select v.motivo, a.nombre into v_motivo, v_autorizo
    from informes_cierre_versiones v
    left join perfiles a on a.id = v.autorizo
   where v.informe_id = new.id and v.version = old.version
   order by v.archivada_at desc limit 1;

  -- Qué cambió, en palabras, y a quién le importa.
  if new.cliente_nombre is distinct from old.cliente_nombre then
    v_cambios := array_append(v_cambios, 'razón social a la que se factura'); v_facturacion := true; v_entrega := true; end if;
  if new.cliente_doc is distinct from old.cliente_doc then
    v_cambios := array_append(v_cambios, 'RUC'); v_facturacion := true; v_entrega := true; end if;
  if new.cliente_direccion is distinct from old.cliente_direccion then
    v_cambios := array_append(v_cambios, 'dirección fiscal'); v_facturacion := true; end if;
  if new.cliente_correo is distinct from old.cliente_correo then
    v_cambios := array_append(v_cambios, 'correo del cliente'); end if;
  if new.referencia is distinct from old.referencia then
    v_cambios := array_append(v_cambios, 'referencia'); end if;
  if new.asunto is distinct from old.asunto then
    v_cambios := array_append(v_cambios, 'asunto'); end if;
  if new.presupuesto_ref is distinct from old.presupuesto_ref then
    v_cambios := array_append(v_cambios, 'presupuesto de referencia'); end if;
  if new.orden_compra is distinct from old.orden_compra then
    v_cambios := array_append(v_cambios, 'orden de compra'); v_facturacion := true; end if;
  if new.cliente_nuevo is distinct from old.cliente_nuevo then
    v_cambios := array_append(v_cambios, 'cliente nuevo'); end if;
  if new.urgente is distinct from old.urgente then
    v_cambios := array_append(v_cambios, case when new.urgente then 'ahora es urgente' else 'ya no es urgente' end); v_entrega := true; end if;
  if new.modalidad_pago is distinct from old.modalidad_pago then
    v_cambios := array_append(v_cambios, 'modalidad de pago'); v_facturacion := true; end if;
  if new.forma_pago is distinct from old.forma_pago then
    v_cambios := array_append(v_cambios, 'forma de pago'); v_facturacion := true; end if;
  -- 0500: el N.º de operación (0493) y el tipo de cambio (0498) también cuentan.
  if new.numero_operacion is distinct from old.numero_operacion then
    v_cambios := array_append(v_cambios, 'N.º de operación'); v_facturacion := true; end if;
  if new.tipo_cambio is distinct from old.tipo_cambio then
    v_cambios := array_append(v_cambios, 'tipo de cambio'); v_facturacion := true; end if;
  if new.comprobante is distinct from old.comprobante then
    v_cambios := array_append(v_cambios, 'comprobante'); v_facturacion := true; end if;
  if new.nota_condiciones is distinct from old.nota_condiciones then
    v_cambios := array_append(v_cambios, 'condiciones de pago'); v_facturacion := true; end if;
  if new.entrega_fecha is distinct from old.entrega_fecha then
    v_cambios := array_append(v_cambios, 'fecha de entrega'); v_entrega := true; end if;
  if new.entrega_hora is distinct from old.entrega_hora then
    v_cambios := array_append(v_cambios, 'hora de entrega'); v_entrega := true; end if;
  if new.entrega_lugar is distinct from old.entrega_lugar then
    v_cambios := array_append(v_cambios, 'lugar de entrega'); v_entrega := true; end if;
  if new.entrega_direccion is distinct from old.entrega_direccion then
    v_cambios := array_append(v_cambios, 'dirección de entrega'); v_entrega := true; end if;
  if new.nota_despacho is distinct from old.nota_despacho then
    v_cambios := array_append(v_cambios, 'nota de despacho'); v_entrega := true; end if;
  if new.contacto_venta is distinct from old.contacto_venta then
    v_cambios := array_append(v_cambios, 'contacto de venta'); end if;
  if new.contacto_contabilidad is distinct from old.contacto_contabilidad then
    v_cambios := array_append(v_cambios, 'contacto de contabilidad'); v_facturacion := true; end if;
  if new.contacto_despacho is distinct from old.contacto_despacho then
    v_cambios := array_append(v_cambios, 'quién recibe'); v_entrega := true; end if;
  if new.items is distinct from old.items then
    v_cambios := array_append(v_cambios, case
      when new.monto_total is distinct from old.monto_total
      then format('equipos o precios (importe de %s %s a %s %s)', coalesce(old.moneda, 'USD'),
                  to_char(coalesce(old.monto_total, 0), 'FM999G999G990D00'), coalesce(new.moneda, 'USD'),
                  to_char(coalesce(new.monto_total, 0), 'FM999G999G990D00'))
      else 'equipos (mismo importe)' end);
    v_facturacion := true; v_entrega := true; v_equipos := true; end if;
  if new.incluye is distinct from old.incluye then
    v_cambios := array_append(v_cambios, 'lo que incluye'); v_entrega := true; v_equipos := true; end if;
  if new.gratis is distinct from old.gratis then
    v_cambios := array_append(v_cambios, 'lo gratuito'); v_entrega := true; v_equipos := true; end if;
  if new.garantia is distinct from old.garantia then
    v_cambios := array_append(v_cambios, 'garantía'); v_entrega := true; end if;
  if new.nota_final is distinct from old.nota_final then
    v_cambios := array_append(v_cambios, 'nota final'); end if;

  -- El pedido que nació de este cierre (el generado, si lo hay; si no, el último).
  select * into v_ped from servicios_postventa
   where informe_cierre_id = new.id and cerrado_at is null
   order by (pedido_generado_at is not null) desc, created_at desc
   limit 1;
  v_pedido_txt := case
    when v_ped.id is null then ' Todavía no tiene pedido.'
    when v_ped.pedido_generado_at is null then ' Su pedido todavía no se generó.'
    else format(' Su pedido %s se generó con la versión %s: el pedido no cambia solo, compare y ajuste lo que haga falta.',
                coalesce(v_ped.numero_pedido_erp, 'sin número'), old.version) end;

  v_titulo := format('Cierre %s corregido (versión %s) · %s', coalesce(new.codigo, ''), new.version,
                     left(coalesce(new.cliente_nombre, 'Cliente'), 80));
  v_cuerpo := format('Lo corrigió %s%s. Motivo: %s. Cambió: %s.',
                     coalesce(v_quien, 'alguien sin nombre'),
                     case when v_autorizo is not null then ' con el código de ' || v_autorizo else '' end,
                     coalesce(nullif(btrim(v_motivo), ''), 'sin motivo'),
                     case when cardinality(v_cambios) > 0 then array_to_string(v_cambios, ', ') else 'nada visible (misma información)' end);

  -- Solo personas reales: ni práctica ni las «Propuesta ·» (0351, 0491).
  -- 1. Central, siempre que no haya corregido Central.
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'cierre_corregido', v_titulo, v_cuerpo || v_pedido_txt, '/central/cierres?q=' || coalesce(new.codigo, '')
    from perfiles p
   where v_rol_corrigio is distinct from 'central'
     and p.rol = 'central'::rol_usuario
     and p.activo and not coalesce(p.es_prueba, false)
     and p.nombre not like 'Propuesta ·%'
     and p.id is distinct from new.corregido_por;

  -- 2. Quien lo emitió, si lo corrigió otro.
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'cierre_corregido',
         format('Su cierre %s fue corregido (versión %s) · %s', coalesce(new.codigo, ''), new.version, left(coalesce(new.cliente_nombre, 'Cliente'), 80)),
         v_cuerpo, '/comercial/cierres/' || new.id
    from perfiles p
   where p.id = new.creado_por
     and p.id is distinct from new.corregido_por
     and p.activo and not coalesce(p.es_prueba, false);

  -- 3. Si el pedido ya existe, los que lo trabajan, según lo que cambió.
  if v_ped.id is not null and v_ped.pedido_generado_at is not null then
    if v_facturacion then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      select p.id, 'cierre_corregido', v_titulo,
             v_cuerpo || format(' Es el pedido %s: revise facturación y pago.', coalesce(v_ped.numero_pedido_erp, 'sin número')),
             '/finanzas/pedidos/' || v_ped.id
        from perfiles p
       where p.rol in ('finanzas'::rol_usuario, 'facturacion'::rol_usuario)
         and p.activo and not coalesce(p.es_prueba, false)
         and p.nombre not like 'Propuesta ·%'
         and p.id is distinct from new.corregido_por;
    end if;
    if v_entrega and v_ped.pedido_ejecutado_at is not null then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      select p.id, 'cierre_corregido', v_titulo,
             v_cuerpo || format(' Es el pedido %s, ya en postventa: revise cliente, equipos y entrega.', coalesce(v_ped.numero_pedido_erp, 'sin número')),
             '/postventa/pedidos/' || v_ped.id
        from perfiles p
       where coalesce(p.es_postventa, false)
         and not es_cuenta_area_postventa(p.id)  -- la cuenta del área reparte sola a PV1, PV2… (0333): sin esto llegaba doble
         and p.activo and not coalesce(p.es_prueba, false)
         and p.nombre not like 'Propuesta ·%'
         and p.id is distinct from new.corregido_por;
    end if;
    if v_equipos and (v_ped.series_pedidas_at is not null or v_ped.pedido_ejecutado_at is not null) then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      select p.id, 'cierre_corregido', v_titulo,
             v_cuerpo || format(' Es el pedido %s: compare los equipos del pedido con el cierre.', coalesce(v_ped.numero_pedido_erp, 'sin número')),
             '/almacen/pedidos/' || v_ped.id
        from perfiles p
       where coalesce(p.es_almacen, false)
         and p.activo and not coalesce(p.es_prueba, false)
         and p.nombre not like 'Propuesta ·%'
         and p.id is distinct from new.corregido_por;
    end if;
  end if;

  return new;
end $function$;
