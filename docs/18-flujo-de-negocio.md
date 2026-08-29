# Plan 18 — El flujo de negocio, de punta a punta

**Qué es esto:** el modelo único del circuito comercial de Efameinsa, del primer contacto a
la venta del mantenimiento cinco años después, con lo que ya funciona, lo que falta y las
decisiones que hacen falta para cerrarlo.

**De dónde sale:** de las reuniones con el ing. Carlos del 21, 25, 27 y 28 de agosto de 2026,
y de la revisión en Central del 28-08 por la tarde. No propone nada que no haya salido de una
de esas conversaciones: lo que hace es ponerlo junto y en orden.

---

## 1. Dónde estamos hoy, sin maquillaje

El CRM ya sostiene el circuito completo **salvo un tramo**, y ese tramo es el que hoy hace que
todo siga viajando por correo.

```
CONTACTO → COMERCIAL → COTIZACIÓN → CIERRE → ‖ CENTRAL ‖ → FINANZAS → POSTVENTA → PARQUE
   ✅          ✅           ✅          ✅       ⚠ a medias    fuera      ✅          ✅
                                                                        del CRM
```

**El tramo a medias.** El comercial ya arma su cierre con expediente —hay ocho informes
emitidos, con hasta cuatro adjuntos cada uno— y Central ya tiene su pantalla con esos
adjuntos y los dos checks. Pero el 28-08 en Central, con los papeles en la mano, lo que había
sobre la mesa era **una orden de compra y una cotización impresas, llegadas por correo**. Dos
cosas explican esa distancia:

1. **Central todavía no mira la pantalla**: la orden vigente sigue siendo «que lo envíen por
   correo», y se mantiene a propósito hasta estar seguros. El correo es un puente, no el
   destino.
2. **Falta el compendio de la gestión.** Carlos lo pidió con nombre propio: «el expediente
   completo, que es tu cierre, cotización, orden de compra, orden de servicio, voucher… **y
   CRM, que es un compendio solamente de esta operación: cómo se hizo la gestión**». Eso no
   existe todavía en ninguna pantalla, y es lo que Darwin describió como «no lo he
   configurado para que vea todo el historial».

**Lo demás está y funciona:** la ruta del contacto desde que Central lo deriva, el cotizador
con correlativo único y aprobación de gerencia por precio bajo, el pedido que cae solo en
postventa cuando Central marca sus dos checks, los diez pasos del pedido, el parque instalado
con 225 máquinas y la ruta de mantenimiento con 248 clientes.

---

## 2. El flujo objetivo, etapa por etapa

Cada etapa se describe igual a propósito: **quién la tiene, qué recibe, qué entrega, cómo
avisa que terminó y qué significa «terminado»**. Un circuito falla siempre en los traspasos,
no dentro de las etapas.

### ① El contacto entra — Central

| | |
|---|---|
| **Recibe** | Llamada, WhatsApp, web, feria |
| **Entrega** | Lead registrado y derivado al comercial que corresponde |
| **Acuse** | El comercial lo ve en su día y arranca su reloj |
| **Terminado** | Con nombre, teléfono, qué pide y a quién se derivó |

Corregir una derivación exige el código de un supervisor (0092): Central no se corrige sola.
El reloj de la medición arranca **acá**, no cuando el comercial se acuerda — por eso la ficha
del comercial muestra «llegó a Central · se lo derivaron · su primer contacto».

### ② La gestión — el comercial

| | |
|---|---|
| **Recibe** | El contacto derivado |
| **Entrega** | Gestiones registradas con su próxima acción |
| **Acuse** | Cada gestión queda con fecha, hora y resultado del catálogo oficial |
| **Terminado** | Nunca: se cierra en venta o en rechazo con motivo |

**Regla que no se negocia:** registrar una gestión toma ≤15 segundos. Todo lo que se diseñe
acá se mide contra eso.

### ③ La cotización — el comercial

| | |
|---|---|
| **Recibe** | El requerimiento del cliente |
| **Entrega** | Presupuesto con correlativo único de la casa (EFAMEINSA u OPEN) |
| **Acuse** | Si baja del precio de referencia, gerencia aprueba o rechaza en su pantalla |
| **Terminado** | Enviada al cliente, con su PDF archivado |

Pendiente: los **tres límites de precio** (inferior, óptimo, superior) con el margen del 20%,
que Carlos dejó anotado para después — hoy hay un solo piso y por eso se pide aprobación más
seguido de lo necesario.

### ④ El cierre de venta — el comercial

| | |
|---|---|
| **Recibe** | El sí del cliente |
| **Entrega** | **El expediente**: informe de cierre + cotización + orden de compra + voucher + acuerdos + **el compendio de la gestión** |
| **Acuse** | Lo emite y aparece en la cola de Central |
| **Terminado** | Con todos los documentos que apliquen. Sin eso no avanza |

«Indispensable que agregues todo; si no, no te permite avanzar» (Carlos, 28-08). La excepción
honesta: **una venta a crédito no tiene voucher**, y el sistema tiene que saber distinguir eso
de un voucher que falta — el caso de Brenda del 28-08.

### ⑤ La verificación y la facturación — Central

| | |
|---|---|
| **Recibe** | El expediente completo, en pantalla |
| **Entrega** | Factura o boleta, y el pedido en el ERP |
| **Acuse** | Marca **«pedido ejecutado»** y **«liquidación»** |
| **Terminado** | Con los dos checks, que es lo que libera el pedido a postventa |

### ⑥ La cobranza — Finanzas

Hoy **fuera del CRM**, y así se queda hasta después de la reunión del ERP: el módulo comercial
del EJB declara traer facturación y cobranzas, y duplicarlo sería el peor error posible. Lo
que el CRM sí guarda es **el estado del pago** —completo, parcial, sin registrar— porque sin
eso postventa no puede decidir un despacho.

### ⑦ La ejecución — postventa

| | |
|---|---|
| **Recibe** | El pedido liberado por Central, con todo lo que el comercial adjuntó |
| **Entrega** | Equipo probado, despachado, instalado y puesto en marcha |
| **Acuse** | Marca **«aprobado»** al recibirlo, y cada uno de los diez pasos con su fecha |
| **Terminado** | Con el informe de puesta en marcha: fotos, lectura de ciclos y conformidad del cliente |

Al cerrar, **la máquina entra al parque instalado con su serie**. Ese es el eslabón que cierra
el círculo.

### ⑧ La venta que nace de la máquina — postventa comercial

| | |
|---|---|
| **Recibe** | El parque instalado: qué máquina, de quién, desde cuándo, último mantenimiento |
| **Entrega** | Mantenimientos y repuestos vendidos |
| **Acuse** | Vuelve a ③: cotiza con el mismo correlativo de la casa |
| **Terminado** | Nunca: el preventivo vuelve cada 4-6 meses |

**Acá el circuito deja de ser una línea y se vuelve un círculo.** Una máquina vendida es un
cliente que vuelve dos veces al año durante diez años; hoy son 225 máquinas y 81 con el
mantenimiento vencido.

---

## 3. Las siete reglas que sostienen el circuito

1. **Un solo expediente digital.** El correo es el puente mientras Central se acostumbra a la
   pantalla, no el destino. El día que se apague, se apaga por decisión y con fecha, no por
   olvido.
2. **Cada traspaso tiene acuse.** Central marca, postventa aprueba, gerencia autoriza. Nadie
   debería poder decir «no me llegó»: si no hay acuse, el trabajo está detenido y se ve.
3. **No se avanza con el expediente incompleto**, y lo que no aplica se declara —«a crédito,
   sin voucher»— en vez de dejarse en blanco.
4. **Lo que se corrige, se corrige con rastro.** Quién, cuándo y por qué. Hoy un cierre
   emitido no se puede corregir, y Ariana tiene varios que corregir: eso empuja la corrección
   fuera del sistema, que es donde no se puede auditar.
5. **Cada cosa se mide donde ocurre.** El reloj del comercial arranca cuando Central deriva;
   el del área, cuando Central libera. Medir desde que alguien se acuerda de registrar no mide
   nada.
6. **La serie es el eje.** Sin serie no hay garantía defendible, ni historial, ni venta de
   mantenimiento. Se pide primero, siempre.
7. **Cada quien ve lo suyo.** Postventa no ve precios de venta pero sí el estado del pago;
   quien vende no ve la ejecución; el cliente es del comercial que lo vendió aunque otro le
   venda el mantenimiento.
8. **Quien se entera avisa; quien puede, decide.** Agregada el 29-08 (migración 0125). El
   comercial descubre al teléfono que el cliente no quiere equipos sino mantenimiento, pero el
   que deriva es Central: entre los dos no había camino, y la decisión moría en una nota de
   gestión que Central no lee. Ahora el comercial avisa desde la ficha de su cliente y el
   contacto entra a la bandeja de triaje con los datos puestos y la propuesta escrita
   —«Post Venta · mantenimiento»—; Central confirma. **No es redirigir**: redirigir movería la
   oportunidad y le entregaría el cliente a postventa, contra la regla 7 y la migración 0080.
   Es un caso nuevo para el mismo cliente.

---

## 4. Lo que falta construir, en orden

| # | Qué | Por qué ahora | Tamaño |
|---|---|---|---|
| 1 | **El compendio de la gestión dentro del expediente**, visible en Central | Es lo único que separa a Central de dejar el correo. Sin él, la pantalla le muestra menos que el sobre impreso | Mediano |
| 2 | **Corregir un cierre emitido**, con versión y rastro | Ariana tiene varias ventas con cambios; hoy la única salida es rehacerlo por fuera | Mediano |
| 3 | **Declarar «a crédito, sin voucher»** en el cierre | Para poder exigir el expediente completo sin bloquear las ventas a crédito | Chico |
| 4 | **Que el comercial vea sus cierres ejecutados** | Lo pidió Carlos el 28-08; hoy emite y pierde de vista el documento | Chico |
| 5 | **Bloqueo por equipo autorizado** y no dejar descargar la cartera | Encargo de seguridad del 28-08. El mapa de accesos ya da con qué decidirlo | Grande |
| 6 | **Los tres límites de precio** con el margen del 20% | Baja las aprobaciones de gerencia a las que de verdad lo son | Mediano |
| 7 | **Fichas de repuestos y de mantenimiento** (Lesly) | Es lo que impide que postventa cotice desde el CRM | Depende de Lesly |
| 8 | **Almacén y Finanzas** | Después del ERP. Antes, no | Después |

---

## 5. Lo que hace falta decidir

1. **¿Cuándo se apaga el correo?** Propuesta: cuando Central confirme una semana completa de
   cierres trabajados desde la pantalla, sin sobre impreso. Con fecha puesta, no «cuando
   salga».
2. **¿Quién puede corregir un cierre emitido, y hasta cuándo?** El comercial que lo hizo
   mientras Central no lo haya facturado, y después solo con el código del supervisor —el
   mismo mecanismo de las derivaciones, que ya está probado.
3. **¿El compendio de la gestión va dentro del PDF o como sección en la pantalla de Central?**
   Recomendación: en la pantalla, y en el PDF solo un resumen de cuatro líneas. El PDF se
   imprime y se archiva; la pantalla es donde se pregunta «¿por qué le dieron ese precio?».
4. **¿Los cambios de Ariana entran como corrección del cierre o como venta nueva?** Depende
   de si cambió el equipo o solo las condiciones — hay que mirar sus casos antes de decidir.

---

## 6. El circuito en una frase

**Central reparte, el comercial vende, Central verifica, postventa ejecuta y la máquina
instalada vuelve a vender sola.** Todo lo demás de este documento es asegurarse de que en
cada flecha alguien firme que recibió.
