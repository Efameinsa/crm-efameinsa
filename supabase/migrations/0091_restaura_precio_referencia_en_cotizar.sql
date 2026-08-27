-- ============================================================
-- CRM EFAMEINSA · Migración 0091 · Devuelve el precio de referencia a crear/editar_cotizacion
-- ============================================================
-- Reportado por Darwin el 27-08 a media mañana: la señorita Ariana (C4) armó
-- una cotización y la pantalla le pidió aprobación de gerencia sin que ella
-- hubiera bajado ningún precio.
--
-- No fue un descuento. Fue una regresión de esta misma mañana.
--
-- ------------------------------------------------------------
-- QUÉ PASÓ
-- ------------------------------------------------------------
-- La migración 0074 dejó UNA regla: gerencia decide cuando el precio pedido
-- está por debajo de `precio_referencia_producto()` (el piso pactado y, mientras
-- gerencia no lo cargue, el mejor precio disponible: deseado → medio → base →
-- optimo). Para no copiar dos funciones de 100 líneas, la 0074 parchó las
-- definiciones VIVAS de crear_cotizacion y editar_cotizacion con un regexp, y
-- dejó escrito por qué: «copiarlas es como se rompió el reporte diario el 24-08».
--
-- Pasó exactamente eso. La 0086 (dirección por contacto) y la 0088 (color del
-- ítem) volvieron a escribir las dos funciones enteras tomando como base copias
-- ANTERIORES a la 0074 —la 0088 lo dice en su propia cabecera: «Base:
-- crear_cotizacion de la 0086 y editar_cotizacion de la 0067»— y con eso
-- reapareció la búsqueda vieja:
--
--     v_tier_piso := case when segmento = 'semi_industrial' then 'deseado' else 'base' end;
--
-- La 0088 se aplicó a producción el 27-08 09:46:52 (hora de Lima).
--
-- ------------------------------------------------------------
-- POR QUÉ ROMPE JUSTO A LOS SEMI-INDUSTRIALES
-- ------------------------------------------------------------
-- Ningún semi-industrial tiene hoy un precio 'deseado' vigente: 23 de los 24
-- solo tienen 'optimo' cargado, y los tres niveles del LAVMA172 (TITAN MAX
-- SINGLE) vencieron el 25-08. Los tres niveles los define gerencia y todavía no
-- llegaron — es lo mismo que ya preveía la 0074.
--
-- Con la búsqueda vieja, entonces, `v_precio_piso` sale NULL en TODOS ellos, y
-- eso rompe el circuito por los dos extremos a la vez:
--
--   1) En la base: `bajo_lista` nunca se marca. Un semi-industrial se puede
--      rebajar lo que sea y no le llega nada a gerencia. Ya ocurrió: entre el
--      26-08 09:22 y el 26-08 18:22 salieron al cliente el Presu_475 y el
--      Presu_479 con el LAVMA172 a 3.750 (lista 3.950) y el Presu_476 con el
--      LAVGIA13 a 2.199 (lista 2.250), los tres marcados `bajo_lista = false`.
--
--   2) En la pantalla: el ítem se guarda con `precio_lista = NULL`, y el
--      cotizador —que sí sigue la regla de la 0074— lee ese NULL como «equipo
--      sin precio cargado» y anuncia «requiere aprobación de gerencia». El botón
--      pasa a «Pedir aprobación a gerencia», pero al pulsarlo finalizarCotizacion
--      encuentra la cotización en `auto_aprobada`, no avisa a nadie, y el
--      borrador se queda sin número y sin llegar a /gerencia/aprobaciones.
--
-- Eso último es lo que vio Ariana: aprobación pedida por un equipo que estaba
-- a precio de lista.
--
-- ------------------------------------------------------------
-- LA CORRECCIÓN
-- ------------------------------------------------------------
-- Se vuelve a parchar la definición VIVA, con el mismo regexp de la 0074, para
-- no perder lo que trajeron la 0086 (dirección del contacto) y la 0088 (color
-- del ítem). Si el bloque viejo no estuviera —porque alguien ya lo arregló— la
-- migración avisa en vez de aplicarse a medias.
do $$
declare
  v_nombre  text;
  v_def     text;
  v_nuevo   text;
  v_tocadas integer := 0;
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
      raise notice 'La función % ya usaba precio_referencia_producto(); no se toca.', v_nombre;
    else
      execute v_nuevo;
      v_tocadas := v_tocadas + 1;
    end if;
  end loop;

  if v_tocadas = 0 then
    raise notice 'Nada que corregir: las dos funciones ya estaban al día.';
  end if;
end $$;

-- ------------------------------------------------------------
-- Los borradores que todavía no salieron se vuelven a medir con la regla buena.
-- ------------------------------------------------------------
-- Solo borradores sin enviar: un documento que ya salió al cliente no se
-- reabre (trigger de inmutabilidad, 0062). Lo que se recupera acá es el
-- `precio_lista` que la pantalla lee como referencia — el NULL es lo que hacía
-- que el cotizador pidiera aprobación por un equipo a precio de lista.
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

-- El borrador que se quedó sin nada que decidir deja de esperar a gerencia, y
-- el que sí tiene una rebaja real pasa a esperarla.
update cotizaciones c
   set estado_aprobacion = 'auto_aprobada'
 where c.estado_aprobacion = 'pendiente_gerencia'
   and c.estado = 'borrador'
   and c.enviada_at is null
   and not exists (
     select 1 from cotizacion_items i
      where i.cotizacion_id = c.id and i.requiere_aprobacion
   );

update cotizaciones c
   set estado_aprobacion = 'pendiente_gerencia'
 where c.estado_aprobacion = 'auto_aprobada'
   and c.estado = 'borrador'
   and c.enviada_at is null
   and exists (
     select 1 from cotizacion_items i
      where i.cotizacion_id = c.id and i.requiere_aprobacion
   );
