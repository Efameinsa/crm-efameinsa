-- «Cotización enviada» no existía como resultado de gestión.
--
-- POR QUÉ: postventa anota todos los días «Se le envío cotización N° 606-26
-- mediante correo…» —siete gestiones solo el 09-09— y las SIETE quedan con
-- resultado NULO, porque en la lista solo hay «Pidió cotización» (el cliente la
-- pidió) y «Evaluando la cotización» (ya la está mirando). Falta justo el paso
-- del medio, que es el que ella hace. Escrito en la nota funciona para leerlo,
-- pero ninguna cotización enviada se puede contar ni medir así.
--
-- Y DE PASO, EL ORDEN. La pantalla ordenaba por id, así que cualquier opción
-- nueva caía al final, después de «Finalizar gestión (no procede)» —que es la
-- salida— y antes de nada útil. Ahora hay una columna de orden propia: la
-- lista se acomoda sin depender de en qué momento se agregó cada cosa.

alter table catalogo_resultados_gestion
  add column if not exists orden integer;

-- El orden de hoy, tal como se ve: por id, en decenas, para que siempre quede
-- sitio para meter una opción entre dos sin renumerar todo.
update catalogo_resultados_gestion set orden = id * 10 where orden is null;

alter table catalogo_resultados_gestion
  alter column orden set not null;

comment on column catalogo_resultados_gestion.orden is
  'En qué orden se ofrecen las opciones al comercial. En decenas a propósito: '
  'deja hueco para intercalar una nueva sin tocar las demás (0197).';

-- Va pegada a «Pidió cotización» (orden 90) y antes de «Evaluando la
-- cotización» (100), porque ese es el recorrido real: la pide, se la envío,
-- la está evaluando.
insert into catalogo_resultados_gestion (codigo, nombre, activo, accion_sugerida, dias_sugeridos, efecto, orden)
values ('COTIZACION_ENVIADA', 'Cotización enviada', true, 'Confirmar que la recibió', 2, null, 95)
on conflict (codigo) do update
   set nombre          = excluded.nombre,
       activo          = true,
       accion_sugerida = excluded.accion_sugerida,
       dias_sugeridos  = excluded.dias_sugeridos,
       orden           = excluded.orden;

-- OJO, A PROPÓSITO: `efecto` queda NULO. Los efectos mueven la oportunidad
-- (rechazo la cierra, venta agenda el cierre, cotizar invita al cotizador), y
-- si esto moviera la etapa a «Cotizada» estaríamos decidiendo por la puerta de
-- atrás algo que todavía espera a Santos: si el borrador de una cotización
-- debe mover la oportunidad. Anotar lo que pasó no cambia de etapa a nadie.
