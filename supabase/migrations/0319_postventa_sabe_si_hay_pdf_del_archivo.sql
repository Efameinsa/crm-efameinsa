-- POSTVENTA ABRE LAS COTIZACIONES DEL ARCHIVO CON LOS NÚMEROS TAPADOS
-- (reunión de gerencia, 28-09: «postventa tiene que ver todo y estarían
-- borraditos los números… en los PDFs»).
--
-- La historia sin cifras (0221) le devolvía a postventa `pdf_path: null` a
-- propósito, porque el documento imprime precios. Ahora el documento se le
-- sirve con los importes tapados (/api/cotizaciones-historicas/[id]/pdf), así
-- que la pantalla necesita saber si HAY documento —sin la ruta—: se agrega
-- `tiene_pdf`. Lo demás de la función queda igual (volcada de la base viva).
CREATE OR REPLACE FUNCTION public.historial_cuenta_para_postventa(p_cuenta uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when not (puede_postventa() and not es_cuenta_prueba()) then null
    else jsonb_build_object(
      'oportunidades', coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'origen', o.origen))
          from oportunidades o where o.cuenta_id = p_cuenta), '[]'::jsonb),
      'actividades', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'tipo', a.tipo, 'nota', a.nota, 'realizada_at', a.realizada_at,
          'oportunidad_id', a.oportunidad_id, 'adjuntos', '[]'::jsonb,
          'proxima_accion', a.proxima_accion, 'proxima_accion_at', a.proxima_accion_at,
          'proxima_accion_hora', a.proxima_accion_hora,
          'catalogo_resultados_gestion', case when r.id is null then null
            else jsonb_build_object('codigo', r.codigo, 'nombre', r.nombre) end
        ) order by a.realizada_at desc)
          from actividades a
          join oportunidades o on o.id = a.oportunidad_id
          left join catalogo_resultados_gestion r on r.id = a.resultado_id
         where o.cuenta_id = p_cuenta), '[]'::jsonb),
      'cotizaciones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'codigo', c.codigo, 'estado', c.estado, 'estado_aprobacion', c.estado_aprobacion,
          'total', null, 'moneda', c.moneda, 'created_at', c.created_at, 'oportunidad_id', c.oportunidad_id
        ) order by c.created_at desc)
          from cotizaciones c join oportunidades o on o.id = c.oportunidad_id
         where o.cuenta_id = p_cuenta), '[]'::jsonb),
      'cot_historicas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'codigo', h.codigo, 'correlativo', h.correlativo, 'anio', h.anio, 'serie', h.serie,
          'fecha', h.fecha, 'monto_sin_igv', null, 'items', to_jsonb(h.items), 'n_equipos', h.n_equipos,
          'pdf_path', null, 'tiene_pdf', h.pdf_path is not null
        ) order by h.fecha desc)
          from cotizaciones_historicas h where h.cuenta_id = p_cuenta), '[]'::jsonb),
      'ventas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'fecha_venta', v.fecha_venta, 'monto_total', null, 'moneda', v.moneda,
          'oportunidad_id', v.oportunidad_id, 'cotizacion_id', v.cotizacion_id,
          'referencia_historica', v.referencia_historica, 'equipo_historico', v.equipo_historico,
          'anulada_at', v.anulada_at,
          'cotizaciones', case when c.id is null then null else jsonb_build_object(
            'codigo', c.codigo, 'serie', c.serie,
            'cotizacion_items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'cantidad', i.cantidad, 'precio_unitario', null,
                'productos', case when p.id is null then null
                  else jsonb_build_object('marca', p.marca, 'modelo', p.modelo, 'nombre', p.nombre) end))
                from cotizacion_items i left join productos p on p.id = i.producto_id
               where i.cotizacion_id = c.id), '[]'::jsonb)) end
        ) order by v.fecha_venta desc)
          from ventas v
          join oportunidades o on o.id = v.oportunidad_id
          left join cotizaciones c on c.id = v.cotizacion_id
         where o.cuenta_id = p_cuenta), '[]'::jsonb)
    ) end
$function$

;
