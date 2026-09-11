-- ============================================================
-- Postventa ve la historia del cliente —ventas, cotizaciones, gestiones— sin montos
-- ============================================================
-- Ariana, 11-09, en su cuenta de postventa, con HOTEL ROUTE 66: «no encuentra
-- información de sus ventas». Santos preguntó si faltaba cargar. No: el
-- cliente tiene dos ventas (2022 y 2023) y dos presupuestos del archivo
-- (2025), todos en el CRM. Lo que pasa es que están en expedientes de C5, y
-- las políticas de `oportunidades`, `ventas`, `actividades`, `cotizaciones` y
-- `cotizaciones_historicas` solo le abren a postventa lo que tiene
-- tipo_postventa. En la ficha veía «Sin historial registrado» y cero compras:
-- la misma pantalla que el comercial ve llena.
--
-- Carlos, 10-09, sobre qué tiene que ver el área de una venta ajena: «cuándo le
-- vendió, dónde, qué equipo, todo el detalle de los equipos» y «que salga la
-- descripción del producto y todo eso, pero que no salga el monto». Por eso NO
-- se abren las políticas —una política abre la fila entera, con el monto
-- adentro— sino una función que devuelve la historia completa SIN cifras:
-- ni monto_total, ni total, ni precio_unitario, ni monto_sin_igv. Tampoco
-- devuelve la ruta del PDF del archivo: ese documento imprime precios.
--
-- La pantalla que la consume es la misma ficha de siempre (cargarHistorialCuenta
-- con sinMontos): el comercial sigue viendo sus cifras por RLS; postventa ve la
-- misma cronología con las cifras en blanco.

create or replace function historial_cuenta_para_postventa(p_cuenta uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
          'pdf_path', null
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
$$;

comment on function historial_cuenta_para_postventa is
  'La historia completa de un cliente para el área de postventa —oportunidades, gestiones, cotizaciones, presupuestos del archivo y ventas— SIN ningún monto ni el PDF del archivo (gerencia, 10-09). Es lo que la ficha muestra cuando la mira postventa; el comercial sigue viendo sus cifras por RLS.';

revoke all on function historial_cuenta_para_postventa(uuid) from public;
grant execute on function historial_cuenta_para_postventa(uuid) to authenticated;
