-- ============================================================
-- CRM EFAMEINSA · Migración 0074 · Gerencia decide solo cuando se baja el precio
-- ============================================================
-- Revierte el criterio de la migración 0067. Lo pidió el ing. Carlos el 25-08,
-- después de que le llegaran las primeras cotizaciones detenidas:
--
--   «Yo diría que coticemos el precio de lista nada más. La función debería ser
--    cuando quieres REDUCIR ese precio. En las industriales yo diría que no
--    necesitan aprobación, que lo ejecuten.»
--
-- El 24-08 el área comercial había pedido lo contrario —«todo industrial,
-- le comunicamos a usted»— y así se implementó. Carlos, al verlo: «Ah, esa es
-- su lógica. No todo, qué raro.» Manda gerencia. La migración 0067 ya avisaba
-- que 55 de los 65 equipos activos son industriales y que eso iba a detener la
-- mayoría de las cotizaciones; eso fue exactamente lo que pasó.
--
-- REGLA NUEVA, UNA SOLA: gerencia decide cuando el precio pedido está POR
-- DEBAJO del precio de referencia del equipo. Al precio de referencia o por
-- encima, el comercial cotiza y envía sin pedir permiso, sea industrial o
-- semi-industrial.
--
-- ------------------------------------------------------------
-- QUÉ ES EL "PRECIO DE REFERENCIA" Y POR QUÉ CAMBIA CÓMO SE BUSCA
-- ------------------------------------------------------------
-- Hasta ahora se comparaba contra el precio PISO: tier 'deseado' en
-- semi-industrial, 'base' en industrial. Y la migración 0068 agregó que un
-- equipo SIN piso cargado fuera siempre a gerencia, porque sin piso nadie puede
-- certificar que el precio esté bien.
--
-- Ese "sin piso, siempre pregunta" ahora chocaría de frente con lo que pidió
-- Carlos: hay 7 semi-industriales que solo tienen cargado el 'optimo' —los tres
-- niveles los define gerencia y todavía no llegaron (Carlos, el mismo 25-08:
-- «ahora que termine Leslie, te voy a dar los límites»)— así que esos 7
-- pedirían aprobación INCLUSO cotizados al precio de lista. Le volveríamos a
-- llenar la bandeja por otra puerta.
--
-- La salida no es apagar el control, es comparar contra el mejor precio que sí
-- tenemos: deseado → medio → optimo. Mientras falte el piso, el único precio
-- que el sistema puede certificar es el de lista, así que cotizar a ese precio
-- pasa solo y cualquier rebaja pregunta. Cuando gerencia cargue los tres
-- niveles, el margen de maniobra del vendedor aparece sin tocar código.
--
-- Y sigue atrapando lo que motivó la 0068: una LG TITAN MAX de lista 8.590
-- cotizada en 6.600 —1.990 menos, en cuatro cotizaciones, tres ya enviadas—
-- vuelve a caer del lado de "esto lo mira gerencia".

-- ------------------------------------------------------------
-- El precio contra el cual se mide una rebaja.
-- ------------------------------------------------------------
create or replace function precio_referencia_producto(p_producto_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    -- Semi-industrial: el piso pactado; si gerencia todavía no lo cargó, se
    -- cae al siguiente nivel disponible hasta llegar al precio de lista.
    max(precio) filter (where tier = 'deseado'),
    max(precio) filter (where tier = 'medio'),
    max(precio) filter (where tier = 'base'),
    max(precio) filter (where tier = 'optimo')
  )
  from precios_producto
  where producto_id = p_producto_id and vigente_hasta is null;
$$;

comment on function precio_referencia_producto(uuid) is
  'Precio contra el que se mide si una cotización está rebajada: el piso pactado, y mientras gerencia no lo cargue, el mejor precio disponible (migración 0074).';

-- ------------------------------------------------------------
-- La regla, en un solo lugar.
-- ------------------------------------------------------------
create or replace function exige_aprobacion_gerencia(p_producto_id uuid, p_bajo_lista boolean)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_bajo_lista, false)
      -- Un equipo sin NINGÚN precio cargado no se puede contrastar contra nada.
      -- No es el caso de los 7 sin piso —esos tienen su precio de lista— sino
      -- el de un equipo que entró al catálogo sin precio.
      or exists (
        select 1 from productos p
         where p.id = p_producto_id
           and not exists (
             select 1 from precios_producto pp
              where pp.producto_id = p.id and pp.vigente_hasta is null
           )
      );
$$;

comment on function exige_aprobacion_gerencia(uuid, boolean) is
  'Regla única: gerencia decide cuando el precio pedido está por debajo del precio de referencia del equipo, o cuando el equipo no tiene ningún precio cargado. Ser industrial ya NO exige aprobación (migración 0074 revierte la 0067).';

-- ------------------------------------------------------------
-- crear_cotizacion y editar_cotizacion pasan a usar la referencia.
-- ------------------------------------------------------------
-- Se toma la definición VIVA y se le cambia solo el bloque que buscaba el
-- precio piso, en vez de copiar acá dos funciones de 100 líneas que ya se
-- redefinieron en 0062, 0064, 0067 y 0069 — copiarlas es como se rompió el
-- reporte diario el 24-08. Si el bloque no estuviera, se levanta el error en
-- vez de aplicar la migración a medias.
do $$
declare
  v_nombre text;
  v_def    text;
  v_nuevo  text;
begin
  foreach v_nombre in array array['crear_cotizacion', 'editar_cotizacion']
  loop
    select pg_get_functiondef(oid) into v_def from pg_proc where proname = v_nombre limit 1;
    if v_def is null then
      raise exception 'No existe la función %', v_nombre;
    end if;
    v_nuevo := regexp_replace(
      v_def,
      'v_tier_piso := case when v_producto\.segmento = ''semi_industrial'' then ''deseado'' else ''base'' end;\s*select precio into v_precio_piso\s*from precios_producto\s*where producto_id = v_producto\.id and tier = v_tier_piso and vigente_hasta is null;',
      'v_precio_piso := precio_referencia_producto(v_producto.id);',
      'g'
    );
    if v_nuevo = v_def then
      raise exception 'No se encontró el bloque del precio piso en %; revisar antes de seguir', v_nombre;
    end if;
    execute v_nuevo;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Lo que ya está en la bandeja de gerencia se vuelve a medir con la regla nueva.
-- ------------------------------------------------------------
-- Solo borradores sin enviar: un documento que ya salió al cliente no se
-- reabre. El trigger de inmutabilidad (0062) permite exactamente eso.
--
-- Se recalcula también `precio_lista`, que es lo que la pantalla de aprobación
-- le muestra a gerencia como referencia: con la búsqueda vieja, los 7 equipos
-- sin piso guardaban NULL y la pantalla decía «Precio lista —», que es parte de
-- por qué Carlos no entendía qué se le estaba pidiendo.
update cotizacion_items i
   set precio_lista        = precio_referencia_producto(i.producto_id),
       bajo_lista          = precio_referencia_producto(i.producto_id) is not null
                             and i.precio_unitario < precio_referencia_producto(i.producto_id),
       requiere_aprobacion = exige_aprobacion_gerencia(
                               i.producto_id,
                               precio_referencia_producto(i.producto_id) is not null
                               and i.precio_unitario < precio_referencia_producto(i.producto_id)
                             )
  from cotizaciones c
 where c.id = i.cotizacion_id
   and c.estado = 'borrador'
   and c.enviada_at is null
   and i.producto_id is not null;

-- La cotización que se quedó sin nada que decidir deja de esperar a gerencia.
update cotizaciones c
   set estado_aprobacion = 'auto_aprobada'
 where c.estado_aprobacion = 'pendiente_gerencia'
   and c.estado = 'borrador'
   and c.enviada_at is null
   and not exists (
     select 1 from cotizacion_items i
      where i.cotizacion_id = c.id and i.requiere_aprobacion
   );
