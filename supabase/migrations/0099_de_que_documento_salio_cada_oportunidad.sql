-- ============================================================
-- CRM EFAMEINSA · Migración 0099 · De qué documento salió cada oportunidad
-- ============================================================
-- Los 445 cierres de postventa de 2024 a 2026 no vienen de un Excel maestro:
-- vienen de 445 informes en Word, uno por servicio, que es el único registro
-- que el área llevó. Al importarlos hace falta poder decir de cuál salió cada
-- oportunidad, y por dos razones:
--
--   1. PARA NO DUPLICARLOS. Correr la importación dos veces —o corregir el
--      lector y volver a correrla— no puede crear 445 oportunidades otra vez.
--      El presupuesto no sirve de llave: 60 presupuestos aparecen en dos o tres
--      informes distintos (un servicio se factura en partes), y 28 informes ni
--      siquiera lo tienen escrito.
--   2. PARA PODER VOLVER AL PAPEL. Cuando dentro de un año alguien pregunte de
--      dónde salió una venta de 2024, la respuesta es el archivo, con nombre y
--      carpeta.
--
-- Es la misma idea que `ventas.referencia_historica`, que guarda el número de
-- presupuesto del Excel de los comerciales. Acá el documento es el original.

alter table oportunidades add column if not exists documento_origen text;

-- Único donde no es nulo: dos oportunidades no pueden salir del mismo informe,
-- pero las 25.000 que ya existen no tienen ninguno.
create unique index if not exists ux_oportunidades_documento_origen
  on oportunidades (documento_origen)
  where documento_origen is not null;

comment on column oportunidades.documento_origen is
  'Ruta del documento del que se importó esta oportunidad (p. ej. el informe de cierre de postventa en R:\). Llave de la importación —correr de nuevo no duplica— y camino de vuelta al papel original (migración 0099).';
