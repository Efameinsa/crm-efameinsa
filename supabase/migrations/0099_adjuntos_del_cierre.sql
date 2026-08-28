-- ============================================================
-- CRM EFAMEINSA · Migración 0099 · El voucher se adjunta después
-- ============================================================
-- Brenda (C1), 28-08: «quiero una opción para poder adjuntar documentos, como
-- fotos o PDFs de vouchers». Es la misma pieza que ya había pedido el ing.
-- Carlos el 27-08 —«el cierre tiene que estar un poquito más robusto… le tengo
-- que agregar los adjuntos: cotización, orden de compra, voucher, acuerdos»—
-- y por eso la columna `informes_cierre.adjuntos` existe desde la 0087. Lo que
-- nunca se construyó fue la pantalla: la columna está vacía en las 5 filas de
-- producción porque ningún código la lee ni la escribe.
--
-- ------------------------------------------------------------
-- POR QUÉ HACE FALTA TOCAR LA BASE Y NO SOLO LA UI
-- ------------------------------------------------------------
-- El informe emitido es inmutable (migración 0050): `trg_informe_inmutable`
-- rechaza cualquier update posterior, porque es el documento que Central ya
-- tiene en la mano y no puede cambiar debajo de sus pies. Correcto para los
-- importes, las condiciones y el despacho.
--
-- Pero el voucher NO EXISTE cuando se emite el informe. La venta que motivó
-- esto —INVERSIONES NACIONALES DE TURISMO, OC 4510105315— es a CRÉDITO 30
-- DÍAS: la constancia de pago va a llegar un mes después de que Central ya
-- haya facturado y despachado. Con la regla de la 0050 tal cual, adjuntar el
-- voucher sería imposible justo en el caso más común. Quedaría exactamente
-- donde está hoy: en el WhatsApp de la comercial.
--
-- ------------------------------------------------------------
-- LA REGLA NUEVA
-- ------------------------------------------------------------
-- De un informe emitido se puede AGREGAR un documento, y nada más. Todo lo
-- demás sigue congelado, y un documento que Central ya vio no se quita ni se
-- reemplaza — el expediente crece, nunca se reescribe. Así el PDF que Central
-- imprimió sigue diciendo la verdad y el voucher que llega a los 30 días tiene
-- dónde entrar.
--
-- Mientras el informe es borrador no cambia nada: se edita y se quitan
-- adjuntos con libertad, porque todavía no salió de las manos del comercial.

create or replace function bloquear_edicion_informe()
returns trigger language plpgsql as $fn$
begin
  if old.emitido_at is not null and new.emitido_at is not null then
    -- Todo el documento menos los adjuntos sigue congelado. Se compara la fila
    -- entera para no tener que enumerar 40 columnas y que la próxima que se
    -- agregue quede protegida sola.
    --
    -- Se descuentan tres campos:
    --   · adjuntos   — es justo lo que este cambio viene a permitir;
    --   · updated_at — lo mueve el trigger de la 0001 en cualquier update;
    --   · codigo     — es una columna GENERADA (lpad(correlativo)||'-'||anio) y
    --                  en un trigger BEFORE llega SIEMPRE en NULL, porque
    --                  Postgres la calcula después. Sin descontarlo, la fila
    --                  parecía distinta de sí misma y NINGÚN update pasaba.
    --                  El número sigue protegido: lo que lo forma —correlativo
    --                  y anio— sí se compara.
    if (to_jsonb(new) - 'adjuntos' - 'updated_at' - 'codigo')
       is distinct from (to_jsonb(old) - 'adjuntos' - 'updated_at' - 'codigo') then
      raise exception 'El informe % ya fue emitido y no se modifica', old.codigo;
    end if;

    -- Append-only: los que ya estaban tienen que seguir estando, iguales.
    if not (new.adjuntos @> old.adjuntos) then
      raise exception 'Del informe % los documentos solo se agregan: uno ya adjuntado no se quita ni se reemplaza', old.codigo;
    end if;
  end if;
  return new;
end;
$fn$;

comment on function bloquear_edicion_informe() is
  'Un informe emitido no se modifica (migración 0050), salvo para AGREGAR un documento al expediente — el voucher llega semanas después de emitido (migración 0099).';

-- El expediente completo, con el mismo bucket privado 'adjuntos' y las mismas
-- políticas de storage que los adjuntos de gestión (0029) y de leads (0082).
-- Las rutas van bajo el prefijo cierres/<informe_id>/.
comment on column informes_cierre.adjuntos is
  'Expediente del cierre: [{tipo, path, nombre, tipo_mime, tamano, subido_por, subido_at}] en el bucket privado ''adjuntos'', prefijo cierres/. tipo ∈ (orden_compra, voucher, cotizacion, acuerdo, otro). Reemplaza el file impreso que el comercial le mandaba a Central (migraciones 0087 y 0099).';
