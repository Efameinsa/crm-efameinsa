# Los correlativos de los cierres — reunión de Santos con Lesly y postventa, 02-09-2026

Dos reclamos salieron de la reunión: «Central tiene ocho pedidos pero la
numeración es incorrecta» (captura `ver1.jpeg`: 001-005 y luego 010-012) y
«Ariana y Hever están con 10 y no hay secuencia; Hever se quedó en 16».
Son dos problemas distintos y solo el primero era del CRM.

## 1. El hueco 006-009 de la serie OPEN

**No lo causaron los duplicados.** Un cierre anulado conserva su número por
regla (docs/19, regla 2): el 001 y el 003 anulados siguen ocupando su sitio y
no corren nada.

Lo que pasó fue esto:

| Cuándo | Qué |
|---|---|
| 28-08 | Carlos reserva el N.º 10 de OPEN para la primera venta de Ariana (0124). El contador va por el 5 y debe **saltar** el 10 cuando llegue. |
| 29-08 10:35 | Ariana emite el 010. El contador sigue en 5, como estaba previsto. |
| 01-09 15:10 | La migración 0145 (serie de práctica) «devuelve» los contadores reales al **máximo emitido de verdad**. El máximo de OPEN era el 010 reservado, así que el contador pasó de 5 a 10. |
| 01-09 16:32 | Katerine emite el 011 (Sierra Travel); 02-09 17:17, el 012 (V y P Ice). |

Es decir: la 0145 tomó la reserva de Ariana como si fuera el último número
corrido. Los cuatro números 006-009 nunca se entregaron.

**Corrección aplicada el 02-09 a las 18:20** con
`scripts/corregir-correlativo-open-y-anular-003.mjs --aplicar`: el contador
`INFORME-OPEN-2026` vuelve a **5**. `siguiente_correlativo_informe()` ya salta
los números que existen, así que los próximos cuatro cierres reciben 006, 007,
008 y 009 y después la serie sigue en 013. Ensayado dentro de la transacción
antes de aplicar: el próximo número es 006-2026. No se tocó ningún documento
emitido: renumerar el 011 y el 012 habría cambiado papeles que Central y los
clientes ya tienen (misma decisión que el 29-08 con el 010).

Es exactamente lo que Carlos había descrito: «le damos el 10 y después lo
agregamos mientras van sumándose».

**Regla para la próxima vez:** un saneo de contadores no puede usar
`max(correlativo)` cuando hay números reservados. El último número corrido es
el máximo **sin contar las reservas consumidas**.

## 2. El 003-2026 (Grupo Alimenticio), anulado

Duplicado del 004-2026 (Grupo Alimenticio San José, mismo RUC 20602498833,
mismo importe USD 3.186; Brenda adjuntó un código de equipo errado). Central
lo pidió en la reunión. La venta ya vivía en el 004 y el pedido de postventa
del 003 ya estaba cerrado (`corregir-duplicados-001-003.mjs`, esta tarde), así
que solo faltaba marcarlo anulado. Quedó con el mismo formato que dejó Central
al anular el 001 desde la pantalla (anulado por admin, autorizó Santos, motivo
completo). Central ahora ve: por liberar 2, liberados 4, anulados 2, total 8.

## 3. Los «dos dieces» de Ariana y Hever: no es un bug, son dos series

Hever no numera en el CRM. Sus cierres de postventa son Word en el servidor,
`\\192.168.10.210\Mantenimiento\POST VENTA 2026\CIERRE DE VENTAS\OPEN\<MES>`,
y esa serie **arranca en 001 cada mes**: julio llegó a 014, agosto a 016
(Hotel Curasi, 31-08). El siguiente ya está creado sin número
(`SETIEMBRE\INFORME N°xxxx-VELASQUEZ SANCHEZ MARGARITA PETRONA.doc`, 02-09
18:14): es el cierre que Lesly dijo que «tiene que hacer ahorita».

El 010 de Hever es «INFORME N° 010 - FLORES RIOJA MARCIA» del 17-08, de su
serie de agosto. El 010 de Ariana es el de la serie anual del CRM. Coinciden
en el número porque son dos numeraciones distintas para el mismo documento,
no porque alguien se haya saltado a nadie.

Hoy conviven tres numeraciones de «INFORME OPEN N.º X-2026»:

1. La serie anual del CRM (comerciales; Ariana adentro por decisión de
   Carlos): 001-005, 010-012, y ahora 006-009 por rellenar.
2. La serie mensual de Word de Hever (postventa): agosto 001-016.
3. Antes de abril, la serie anual de Word de Brenda como C8: 0001-0062.

**Lo que hay que decidir (gerencia), no lo que hay que programar.** La
recomendación es una sola serie anual por razón social, la del CRM, y que los
cierres de postventa entren ahí: desde hoy (17:39, d9a767f) el cierre de venta
del CRM acepta repuestos y servicios, que es justo lo que Hever cierra. La
cuenta de Hever (`postventa@efameinsa.com`, perfil «Post Venta», rol comercial
con código PV) ya puede cotizar y emitir el cierre desde la oportunidad, como
cualquier comercial; lo único que le falta es la entrada «Mis cierres» en su
menú (`nav-lateral.tsx`, `ENLACES_POSTVENTA`). Su cierre de Velásquez Sánchez
sería el primero de postventa en el CRM y tomaría el 006. Si gerencia prefiere que Hever siga en Word, entonces su serie tiene
que dejar de reiniciarse cada mes y arrancar donde el CRM no llegue (por
ejemplo desde el 101), porque con dos series iguales la contadora va a recibir
dos «010-2026» de Open Investments.

Los cierres de agosto de Hever (001-015) están importados en el CRM como ventas
de PV (`documento_origen`); el 016 del 31-08 y lo que venga después no, porque
la importación fue el 28-08.
