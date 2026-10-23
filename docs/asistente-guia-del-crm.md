# Base de conocimiento del CRM Efameinsa

Vigente al 23-10-2026. Explica cómo funciona el CRM y por qué pasa lo que pasa. Sirve para responder a todas las áreas: Central, comerciales (C1–C10), postventa (PV, PV1, PV2, PV3), operaciones, almacén, Finanzas, Contabilidad/Facturación, Importaciones, gerencia y administración.

## 0. Cómo usar este documento

- **La última decisión manda.** En Efameinsa, cada reunión de gerencia deroga lo que contradiga de las anteriores. Aquí se escribe solo la regla vigente. Cuando ayuda a entender, se dice «antes era X; desde <fecha> es Y».
- **Los datos vivos no están aquí.** Precios, montos, clientes concretos, quién tiene qué cliente o en qué paso va un pedido se consultan en el CRM con los permisos de la persona que pregunta. Este documento solo explica reglas.
- **Los códigos nunca se dicen.** El CRM pide en varios sitios un «código de autorización» (código del supervisor, de operaciones o de gerencia). Se explica quién lo da y para qué, pero el valor no se comparte jamás. Lo dicta la persona autorizada en el momento.
- **«(por confirmar)»** marca reglas anunciadas o construidas cuyo estado actual no está verificado. En esos casos, recomiende consultar con Santos (CRM) o con operaciones.
- **Los cambios al CRM se piden por el Buzón de sugerencias** (botón de la bombilla en la barra), no a Lesly ni de palabra. Así lo ordenó gerencia el 07-10 y lo reafirmó el 13-10.
- **Lo del catálogo se le pide a Lesly con «Pedir a Lesly»** (desde el 17-10, al lado de Sugerencias en la barra): un producto que no está, un precio, el stock o corregir la ficha técnica, la descripción, las fotos o el código de un producto. Eso no es del CRM, lo actualiza operaciones; por el buzón tardaría más porque hay que reenviárselo. Los rubros no se piden: cada uno los agrega desde «Cambiar rubro».

### Principios que explican casi todo

1. **Anular, no borrar.** Lo que ya salió a un cliente (cotización numerada, informe de cierre) no se borra. Se anula: conserva su número, queda visible y deja de contar. Los números no se reutilizan ni se rellenan. Si hay un hueco en la numeración, se marca como anulado.
2. **Todo cambio deja rastro.** Corregir algo emitido pide motivo y código. Queda registrado quién lo pidió, quién autorizó, cuándo y por qué. Gerencia lo explicó con la caja del supermercado: nada se corrige en silencio, «si no, no vamos a poder medir».
3. **Cada quien ve lo suyo.** El comercial ve su cartera. Postventa y almacén no ven precios. Gerencia ve todo.
4. **La serie es el eje de la trazabilidad.** La serie de cada máquina viaja del almacén al cliente y de ahí al registro de equipos instalados, con su garantía. Sin serie no hay garantía verificable.
5. **Quien se entera avisa; quien puede decide.** Si un comercial o postventa recibe algo que es de otra área, lo pasa a Central («Pasar contacto a Central»). No lo resuelve por su cuenta.
6. **Lo que empieza en OPEN termina en OPEN.** Cada cadena de documentos (cotización → cierre → pedido → apertura → informes) mantiene la razón social con la que empezó.
7. **El circuito falla en los traspasos, no dentro de las etapas.** Por eso cada traspaso tiene un acuse (un «check») y un responsable visible.
8. **Las reglas importantes están en el sistema, no solo en la pantalla.** Si un botón está gris, normalmente el sistema tampoco dejará hacerlo por otra vía. Lo que corresponde es cumplir lo que falta o pedir la autorización.

---

## 1. El circuito de punta a punta

En una frase: **Central reparte, el comercial vende, Central verifica, Finanzas confirma, postventa ejecuta con el almacén, y la máquina instalada vuelve a vender sola (mantenimiento y repuestos).**

### 1.1 Entrada del contacto

- **Dueño:** Central (Alondra).
- **Qué entra:** todo contacto: llamadas, correos, formularios web y de Google Ads, visitas y WhatsApp. Más o menos la mitad no es comercial: servicio técnico, postventa, RR. HH., proveedores, facturas, Finanzas.
- **Excepciones que no pasan por Central:**
  - Los **WhatsApp de anuncios** van directo al comercial (ver 3.9).
  - Desde el 09-10, los **formularios de Meta** van al comercial dueño de la campaña.
- **Qué sale:** un contacto registrado con su número **PRO-#####**, su vía (llamada, WhatsApp, correo…) y su área de destino.
- **«Terminado»:** el contacto quedó derivado a un área o persona, unido a un cliente que ya existe, cerrado como repetido o descartado.
- **Bloqueos típicos:**
  - La **vía de contacto es obligatoria** desde el 09-10. Antes venía «WhatsApp» marcado por defecto y eso falseaba la medición.
  - El CRM avisa si el mismo usuario registra dos veces el mismo teléfono en 24 horas. También vigila lo derivado en las últimas 2 horas, para que no haya duplicados.

### 1.2 Derivación de Central

- **Dueño:** Central.
- **Qué hace:** antes de derivar, el CRM busca coincidencias por RUC/DNI, celular (aunque esté mal tipeado), correo y dominio del correo. Si el contacto ya es de un cliente con dueño, propone a ese comercial.
- **Qué sale:** un expediente (oportunidad) asignado a un comercial, o un caso de postventa, o un aviso a otra área.
- **«Terminado»:** el comercial o el área lo recibió. A partir de ahí corre el reloj de quien lo recibe.
- **Bloqueos típicos y por qué:**
  - **«Cliente nuevo» con coincidencias pide escribir una razón** (desde el 11-09). Sin ella se duplicaban fichas.
  - **Derivar a postventa pide código** de gerencia, administración u operaciones (desde el 09-10). Por qué: gerencia pidió «que no derive unilateralmente, nos está metiendo en problemas». No piden código ni el aviso a postventa sin derivar, ni el caso que postventa registra ella misma.
  - **Corregir una derivación ya hecha pide código del supervisor.** Central no se corrige sola.
  - **Derivar no cambia la cartera.** Si el cliente es de otro comercial, el CRM avisa. Mover un cliente de cartera es decisión de gerencia.

### 1.3 Gestión del comercial (expediente)

- **Dueño:** el comercial al que se le derivó.
- **Qué entra:** el expediente con lo que pidió el cliente («Inicio · lo que solicitó el cliente»).
- **Qué hace:** registra gestiones (llamada, WhatsApp, correo, visita, videollamada) con resultado y **próxima acción**, califica el interés de compra y cotiza.
- **«Terminado»:** se llega a venta («Registrar venta» sobre una cotización) o a rechazo con motivo.
- **Bloqueos típicos y por qué:**
  - **Sin próxima acción**, la cabecera muestra en ámbar «Sin próxima acción». Es lo que mira la supervisión diaria.
  - **Un derivado sin atender genera alerta a las 4 horas** (antes 24 horas; cambió el 22-09). Gerencia: «no días, horas».
  - **El estado de un derivado se mide por las gestiones y cotizaciones, no por la etapa.** Al derivar, la oportunidad nace «asignada», y uno abandonado se vería igual que uno recién llegado.

### 1.4 Cotización

- **Dueño:** el comercial. En servicios y repuestos, cualquiera de postventa.
- **En postventa los casos son del área** (desde el 16-10, caso COR-PORACION 3C): cualquiera de postventa puede agregar y corregir contactos en un cliente con caso de postventa, aunque el caso esté a nombre de otra compañera. Regla de Santos: «todos deberían poder ver todo», pero cada acción queda con el nombre de quien la hizo.
- **Qué entra:** el expediente y el catálogo, que gestiona Lesly (operaciones).
- **Qué sale:** una cotización numerada **Presu_####-26** de la serie EFAMEINSA u OPEN, con su PDF.
- **La serie sale sola** (desde el 21-10, por orden de gerencia): si lleva equipos, EFAMEINSA; si son solo repuestos o servicios, OPEN. Ya no se pregunta «¿por qué Efameinsa y no Open?» ni se escribe motivo, ni en la cotización ni en el cierre (el cierre hereda la serie de la cotización). Se puede cambiar a mano y se respeta. Antes era «Open primero» (23-09) con motivo para elegir Efameinsa.
- **«Terminado»:** la cotización está «Confirmada», es decir, tiene número. El envío al cliente se hace por fuera (correo o WhatsApp con el PDF). **El CRM no envía la cotización al cliente.**
- **Bloqueos típicos y por qué:**
  - **Sin RUC o DNI en la ficha no se emite** (el borrador sí se puede armar). Regla de gerencia del 02-09.
  - **Si necesita visto bueno**, el botón final dice **«Pedir aprobación a gerencia»** en lugar de «Confirmar cotización». Mientras espera, sigue como borrador y no gasta número (ver 1.5).
  - Si una línea del catálogo no aparece en el buscador, puede estar retirada o no tener código. Eso se resuelve con Lesly.

### 1.5 Aprobación de gerencia

- **Dueño:** gerencia, en la pantalla **Aprobaciones**. Se firma como «Gerencia Comercial».
- **Qué entra:** cotizaciones en estado **«Espera a gerencia»**.
- **Por qué llega una cotización a gerencia:**
  1. Algún renglón queda por debajo del precio de lista.
  2. Tiene una **línea escrita a mano con precio** (desde el 12-10). Las líneas a mano en cero, como bonos o «instalación gratuita», no piden nada.
  3. La hizo **alguien de postventa**. Desde el 05-10, todas las de postventa pasan por gerencia, a cualquier precio, «mientras dure la capacitación».
  4. Es un **kit con cantidades cambiadas** (desde el 06-10). Va sin código.
- **Qué sale:** aprobada, devuelta para corregir por renglón, observada o rechazada entera.
- **«Terminado»:** aprobada. Entonces el autor pulsa «Confirmar» y recién ahí se asigna el número.
  - **El aviso «gerencia aprobó» le llega a quien armó la cotización, y también al dueño del expediente si es otra persona** (desde el 16-10, caso de Ariana en un expediente a nombre de Rubí). Dice «falta confirmarla» y lleva directo al botón Confirmar. En la lista de cotizaciones, el borrador aprobado dice «aprobada · falta confirmar», y lo que pasó por gerencia sigue a la vista aunque se busque un cliente.
  - **Queda registrado quién confirmó** cada cotización: se ve «la hizo X · confirmada por Y».
- **Bloqueos típicos:** la cotización no avanza hasta que gerencia decida. Una aprobación de palabra no sirve: tiene que darse en Aprobaciones.

### 1.6 Venta e informe de cierre

- **Dueño:** el comercial. En ventas de servicios, quien de postventa la haya hecho.
- **Qué entra:** la cotización aceptada por el cliente, o un acuerdo sin cotización del CRM, que también vale.
- **Qué hace:** registra la venta («Registrar venta» o «Venta ejecutada» desde el expediente) y arma el **informe de cierre**. Lleva:
  - qué se vende (equipo, repuesto, mantenimiento u otro servicio);
  - a quién se factura;
  - condición de pago (porcentaje antes del despacho y días de crédito);
  - lugar, fecha y hora de entrega;
  - la cotización enlazada («¿De qué presupuesto copio los equipos?»);
  - la orden de compra y los vouchers.
- **Qué sale:** el cierre emitido, con número **NNN-AAAA** de su serie (por ejemplo, «OPEN 014-2026»).
- **«Terminado»:** emitido y visible para Central en «Cierres de venta».
- **Bloqueos típicos y por qué:**
  - No se emite sin lugar de entrega ni sin condición de pago.
  - Si el RUC o la razón social del cierre no coinciden con la ficha, el CRM avisa arriba. Un mismo cliente llegó a estar en tres fichas de tres carteras.
  - Una venta a crédito no tiene voucher: se declara así.
  - Una vez emitido, el cierre queda sellado. Ver 3.4.

### 1.7 Central verifica y convierte el cierre en pedido (los «checks» de Central)

- **Dueño:** Central.
- **Qué entra:** el cierre emitido.
- **Pasos en la tarjeta del cierre:**
  1. **«Series de los equipos».** Central pide las series al almacén en el mismo acto, o elige «Las escribo yo» (siempre en los REG). Con serie hay stock; sin serie, no hay.
     - **Accesorios (desde el 16-10, pedido de Lesly):** antes de «Pedir series al almacén», Central responde **«¿Los equipos incluyen accesorios?»**: «No incluye» o «Sí incluye» y escribe qué accesorio va y con qué máquina. Sin responder no se puede pedir el código. Hay que leer el cierre, sobre todo en lavadoras y secadoras industriales. El almacén lo ve en el pedido (recuadro ámbar «Incluye accesorios»), en la hoja «Imprimir la solicitud» y en el aviso. Si Central se equivocó, lo corrige con «Cambiar» en el mismo paso y al almacén le llega el aviso. Los pedidos pedidos antes de la regla dicen «Central no indicó si los equipos llevan accesorios»: revisar el cierre.
  2. **«Generar el pedido».** Nace el pedido **PED-NNNN-AAAA**. Puede generarse aunque falten series: la hoja dirá «serie pendiente». En un REG, no se puede generar si alguna fila de equipo no tiene serie (salvo el REG «por entregar», cuyo equipo sigue en almacén).
  3. **«Liquidación de Finanzas».** Finanzas sube el PDF y Central lo acepta o lo rechaza con motivo. «Aceptar» exige el PDF.
     - **El pedido sigue al cierre corregido** (desde el 21-10, buzón de Jhon): si se corrige un cierre y cambia el total (por ejemplo, los precios pasan a ser sin IGV), el pedido abierto toma el nuevo total solo, salvo que Central lo haya ajustado a mano, y queda anotado en sus observaciones. Antes el pedido se quedaba con el total viejo y la liquidación salía sin IGV.
     - **Las anteriores no se borran** (desde el 16-10): Finanzas sube una liquidación por cada movimiento (pago a cuenta, factura, cancelación) y todas quedan guardadas. En Central > Cierres van numeradas en su orden (N.º 1 es la primera; la última dice «Vigente», las demás «Anterior»): debajo de «Ver la liquidación» en este paso, en «Para el expediente físico» y dentro del botón «Expediente» del cierre, junto con las facturas.
     - **El aviso lleva directo al pedido** (desde el 17-10): los avisos de la campana «Liquidación lista/actualizada», «Factura …», «Facturación observó», «Series listas» y «… corrigió el cierre» tienen el botón «Abrir el pedido», que abre Central > Cierres ya buscado por el N.º de pedido (o del cierre) con su tarjeta sola: ahí está «Para el expediente físico» con «Abrir / imprimir» de cada liquidación y factura. Ya no hay que buscar el cliente a mano.
     - **Constancias de pago** (desde el 19-10, buzón de Jhon): en «Para el expediente físico» y dentro del botón «Expediente» del cierre, Central ve la constancia de cada abono que confirmó Finanzas (monto, fecha, banco, N.º de operación y quién confirmó) con «Abrir / imprimir», para el expediente físico. Si dice «Finanzas no adjuntó la constancia», el abono se confirmó sin ella: pedírsela a Finanzas.
  4. **«Pedido ejecutado».** Es el check que **libera** el pedido: desde ahí lo ven postventa, almacén y Finanzas. Sin liquidación, solo se libera con código de gerencia u operaciones.
- **Herramientas de Central en este tramo:**
  - «Apurar al almacén»: cuando ya se pidieron las series y falta alguna.
  - «Apurar a Finanzas»: cuando falta la liquidación.
  - Ambos admiten un aviso cada 10 minutos por área. Desde el segundo, también se entera gerencia.
  - «Urgencia a Finanzas»: cuando el cliente necesita factura o quiere despachar ya.
- **Qué sale:** un pedido liberado. A postventa le llega como «Nuevo pedido» con campanada.
- **«Terminado»:** pedido ejecutado.
- **Bloqueos típicos y por qué:**
  - **Postventa no ve el pedido hasta que Central lo libera.**
  - **Central puede devolver un cierre mal hecho**, con motivo. Devolver no es anular. Si el proceso ya avanzó (series pedidas o pedido en Finanzas), devolverlo pide código, porque almacén y Finanzas ya trabajan sobre él. Un número de pedido por sí solo no cuenta como avance.
  - **Desde el 12-10, Central debe comparar el código del producto con el cierre.** Se despachó una lavadora equivocada porque el código no mostraba la descripción. Que el código traiga siempre su descripción depende de los datos del catálogo (por confirmar si ya está completo).
  - **Si el cierre se corrige después de emitido (desde el 15-10), Central recibe el aviso en la campana** con quién lo corrigió, el motivo y qué cambió. El pedido no se actualiza solo: Central compara el pedido con la versión vigente del cierre y ajusta (equipos, entrega, cliente) o pide al almacén lo que falte. Si el pedido ya existe, Finanzas, postventa y almacén reciben el mismo aviso cuando lo que cambió les toca (3.5).

### 1.8 Finanzas: pago, liquidación y visto bueno

**Facturar sin correo** (desde el 20-10): la orden de postventa se atiende con «Dar el OK para facturar» y con eso el pedido entra a «Por facturar» de Facturación, sin otra liquidación. Finanzas también registra la factura y la nota de crédito desde su pedido. Una nota de crédito anula la factura y el pedido vuelve a «Por facturar». «No se factura» con motivo lo saca de la lista. Postventa, el comercial y Central ven la guía, las facturas, las notas de crédito, las liquidaciones y las constancias en el pedido («Documentos del expediente · Contabilidad y Finanzas»).

- **Dueño:** Finanzas (Jhon).
- **Qué entra:** pedidos liberados, aperturas emitidas y pedidos de confirmación de pago.
- **Qué hace:**
  - Confirma los abonos: «Por confirmar» → «Confirmados». Puede **observar** un pago.
  - **Genera la liquidación desde el CRM** (desde el 17-10, reunión de gerencia con Jhon). Ya no se copia el pedido a la plantilla de Excel: en **«Por liquidar»** cada pedido tiene el botón **«Generar liquidación»** (también dentro del pedido, en «Liquidaciones y facturas», y en «Con factura, liquidación por actualizar» y «Ya liquidados»). Se abre una pantalla propia: a la izquierda todos los campos ya llenos (fecha, cliente, RUC, pedido, cada equipo con cantidad, precio, detalle y series, cada abono con banco, operación y factura, detracción/retención, letras, recuadro de la operación, forma de pago, cotización, OC, guía y nota) y **cualquiera se puede corregir**; a la derecha la hoja se redibuja en vivo tal como va a salir. Las secciones tocadas se marcan «ajustado» y «Volver a lo del CRM» deshace todo. «Ver el PDF» abre el archivo; a su lado, **«Expediente»** (desde el 19-10, buzón de Jhon) abre en solo lectura el voucher, la orden de compra, la cotización y los demás papeles del cierre, para revisarlos antes de validar: el CRM no da nada por bueno solo. «Validar y enviar a Central» lo guarda. **Confirmar abono** (desde el 19-10, buzón de Jhon): en «Abonos y facturas» está el botón «Confirmar abono» (monto, fecha, N.º de operación, banco y, si se quiere, la captura). El abono entra de inmediato a esa misma liquidación como el siguiente (Abono 1, 2…), sin perder lo ya ajustado, y deja de salir «pendiente de pago». Se confirma solo lo que ya se ve acreditado en la cuenta. **Entrega gratuita** (desde el 19-10): lo que el cierre entrega gratis («VENTA 2 – GRATUITO») sale en el detalle con «ENTREGA GRATUITA · NO SE COBRA» y en su recuadro propio debajo del TOTAL; no suma a la base imponible, al IGV ni al total por cobrar. En el editor cada línea tiene la casilla «Entrega gratuita» para marcarla o quitarla. Los ajustes se heredan en la liquidación siguiente del mismo pedido. El PDF sale con el mismo formato de la plantilla de Excel de Finanzas: carta al cliente, equipos con sus series, SUB TOTAL / IGV / TOTAL, un bloque por factura (TOTAL, ABONO con fecha, banco y N.º de operación, COMISIÓN, TOTAL SALDO), el bloque «FT CIERRE PDTE» con lo que falta, la lista de comisiones, el recuadro «OPERACIÓN CANCELADA / PENDIENTE DE PAGO», la NOTA, el cuadro de letras y al pie la firma de quien liquida. El CRM pone solo el cliente y su RUC, el número de pedido, los renglones del cierre con precio unitario e importe, las series, subtotal, IGV y total, cada abono confirmado con su fecha, banco y N.º de operación, la comisión que descontó el banco, las facturas registradas, la forma de pago, la cotización y la orden de compra. Finanzas solo completa lo que falta: a qué factura va cada abono («Pendiente de factura» si todavía no sale) y, en el recuadro «Toda la operación» (o «Lo que falta cobrar» si ya hay abonos), la factura del saldo o de una venta a crédito sin abonos (viene con la última factura registrada que no es de ningún abono; vacío sale «FT PDTE»). **Si una factura se anuló con nota de crédito, se deja el N.º de factura en blanco:** la liquidación queda «Factura pendiente», Contabilidad recibe el aviso «Otra vez por facturar» y la ve en «Por facturar». Las siguientes liquidaciones la mantienen en blanco hasta que Contabilidad registre la factura nueva, que entonces aparece ya puesta (desde el 19-10), si la operación **afecta a detracción (12 %) o retención (3 %)** y si ya se cobró, si **el saldo va en letras** (cuántas, cada cuántos días, fecha de giro e intereses: arma el cuadro de letras), la guía y una nota. Mira la **vista previa** y pulsa **«Validar y enviar a Central»**: queda como la liquidación con el número siguiente y Central recibe el aviso para seguir el pedido.
  - **Facturar solo el anticipo** (desde el 21-10, buzón de Jhon): en «Abonos y facturas», «¿Qué se factura ahora?» tiene «Todo» o «Solo un anticipo». Con el anticipo, la hoja sale con el cuadro «FT ANTICIPO» solo por ese monto (el N.º de factura que se ponga va ahí) y el saldo queda en «FT CIERRE PDTE», por facturar y cobrar. Si el pedido dice el % de adelanto («50% ADELANTO…») y todavía no hay abonos, el monto ya viene puesto. **Observación para facturación:** «Por anticipo», «Cierre de anticipo» o «Sin indicación» (el CRM sugiere la que corresponde) más un comentario libre para Contabilidad; sale en un recuadro de la hoja y del PDF, en el aviso a Contabilidad y en «Por facturar» («Observación de Finanzas»).
  - **Una liquidación por cada movimiento, siempre el mismo formato** (contado, anticipos, comisiones, detracción y letras son la misma liquidación; cambian las filas de abajo): entra un abono → liquidación nueva; Contabilidad registra la factura → a Finanzas le llega el aviso y genera la siguiente, que ya trae el número de factura. Si un abono queda «pendiente de factura», Contabilidad recibe el aviso «Por facturar» o «Nuevo anticipo por facturar». La liquidación la hace siempre Finanzas, nunca Contabilidad.
  - **Comisión del banco en la liquidación:** el abono sale por lo que pagó el cliente y la comisión aparte; si el saldo que queda es la comisión, la liquidación dice «falta la comisión del banco», al **comercial** le llega el aviso para cobrarla (es su responsabilidad) y a postventa solo para que lo sepa.
  - **Detracción o retención:** lo retenido cuenta como pagado. La liquidación sale «Operación cancelada · pendiente cobro de la detracción» y **postventa puede seguir con el despacho** aunque falte cobrarla.
  - Subir un PDF hecho a mano sigue existiendo («Subir un PDF hecho a mano») para casos raros.
  - Da el **visto bueno de Finanzas** a las ventas con crédito o letras.
  - Atiende las «Órdenes de facturar y cobrar».
- **Qué sale:** el pago confirmado, la liquidación vigente y el visto bueno con el estado de las letras.
- **«Terminado»:** pago confirmado según lo acordado, o visto bueno dado.
- **Bloqueos típicos y por qué:**
  - **El pago se confirma con Finanzas aunque el voucher esté adjunto.** Hay vouchers falsos y depósitos con comisión descontada.
  - **Dónde ve el comercial sus abonos y la comisión del banco** (desde el 16-10, Katerine): cada cierre emitido tiene un botón **«Pagos»**, en la ficha del cliente (pestaña «Ventas» → «Cierres») y dentro del cierre. Muestra los abonos que Finanzas confirmó y, si el banco descontó una comisión (por ejemplo interplaza), cuánto, por qué y la evidencia: esa diferencia la cobra el comercial. Antes solo se llegaba desde el aviso de Finanzas en la campana.
  - **El comercial consulta el pago a Finanzas por el CRM, ya no por correo** (desde el 16-10, Katerine; lo pidió gerencia). En «Pagos» del pedido, recuadro «Consultar a Finanzas», hay dos botones y los dos piden el voucher del cliente: **«Preguntar si hubo comisión»** (¿el banco cobró comisión interplaza o bancaria en ese abono?) y **«Avisar que el cliente canceló»** (el cliente pagó el saldo; Finanzas lo ubica en el banco y confirma el abono). A Finanzas le llega el aviso y el pedido aparece como «solicitado». Finanzas contesta en el mismo pedido, en «Consultas del comercial»: «No hubo comisión» o «Hubo comisión» con el monto y el pantallazo del banco, que el comercial le reenvía al cliente para que vea que está sustentado. Si Finanzas confirma u observa el abono, eso también contesta la consulta. La respuesta le llega al comercial a la campana y queda en «Pagos». El comercial no termina la operación hasta que el cliente termina de pagar.
  - **Se pueden adjuntar varios vouchers en la misma consulta (desde el 19-10, pedido de una comercial):** en los dos botones, hasta 10. Se eligen varios a la vez o se usa «Agregar otro voucher»; cada uno se puede quitar antes de enviar. Finanzas los ve como «Voucher 1», «Voucher 2»… y el aviso le dice cuántos son. Antes era: un solo voucher por consulta.
  - **Dónde sube el comercial un voucher que llegó después:** en el mismo cierre, recuadro «Expediente», botón «Voucher». Como el cierre ya está emitido, pide el código de Central (lo dicta Central). Igual Finanzas tiene que confirmar el pago.
  - **Venta a crédito sin visto bueno de Finanzas no sale** (desde el 14-10). Ver 3.6.
  - Un pedido sin número de pedido no aparece en «Liquidar».

### 1.9 Postventa recibe y prepara el pedido

- **Dueño:** postventa (PV1 Rubí, PV2 Brenda Taboada, PV3 Ariana).
- **Qué entra:** el pedido liberado.
- **Pasos (varían según el tipo de pedido: equipo, repuesto, accesorio, embalaje, mantenimiento o servicio):**
  1. **«Pedido aprobado por postventa».** Es el acuse. Desde ahí corre el reloj del área.
  2. **Pedir la prueba al almacén** («Probado y embalado»). En repuestos, la orden es «Preparar y embalar»: no se prueba; se fotografía y se embala.
  3. **Plano de preinstalación.** Tres salidas: «Marcar enviado», «No lleva plano» (con motivo; los repuestos no llevan) o «No se le envió» (con motivo y responsable). Esta última no esconde el paso: queda registrado que no se envió.
  4. **Preinstalación.** En Lima, videollamada **antes** del despacho. En provincia, confirmación del cliente **después**, con fotos de agua, desagüe y energía.
  5. **Dirección y quién recibe, verificados con el cliente.** El campo **«Destino del equipo»** (Lima o provincia) es obligatorio, y el documento de quien recibe también. Primero se elige quién recibe: **una persona** (nombre y DNI) o **una empresa** (razón social y RUC; el CRM revisa que el RUC exista). En la apertura sale «DNI: …» o «RUC: …» según lo elegido (Rubí, 15-10). Por qué: nueve de cada diez veces cambia la dirección, el teléfono o quien recibe. Además, la modalidad cambia la preinstalación, la puesta en marcha y la garantía.
  6. **«Emitir apertura»** (de despacho o de servicio). Pide confirmación antes de emitir. La apertura es la orden de trabajo para el almacén y el técnico. Ver 3.8.
     - El botón «Emitir» está en el paso «Apertura» del pedido, no en la hoja de la apertura. En la hoja, «Enviar al almacén y a Finanzas» solo funciona si la apertura ya está emitida (desde el 14-10). Antes se podía marcar «enviada» sin emitirla, y el almacén no la veía (caso Beneficencia de Huancayo).
     - La apertura pide «guía de salida del equipo» (desde el 14-10). El **motivo** de la guía no lo pone postventa: lo define Contabilidad al autorizarla (ver 1.10).
     - **Orden de compra u orden de servicio** (desde el 16-10, lo pidió Rubí): en la hoja de la apertura, «Datos que se coordinan» pregunta «¿El cliente mandó orden de compra u orden de servicio?» con tres botones: «Orden de compra», «Orden de servicio» o «El cliente no mandó orden». Con orden, se escribe su número. Sale en la **fila 2** de la apertura, justo después de «Servicio a realizar» (las demás filas corrieron un número: Cliente es la 3, Primer destino la 4, etc.). Si no se elige y el cierre trae su orden de compra, sale esa sola; si no, la fila dice «—» y la hoja lo marca en «Falta llenar» (no impide emitir).
- **Qué sale:** una apertura emitida que llega sola al almacén y a Finanzas/Contabilidad.
- **«Terminado»:** apertura emitida y guía autorizada.
- **Bloqueos típicos y por qué:**
  - **Cambiar algo impreso de una apertura emitida pide código** de operaciones o gerencia, pero solo si cambia algo que sale impreso (fecha u hora ya fijadas, dirección, quién recibe, destino). Si se corrige, la autorización de la guía se anula y Finanzas y el almacén deben volver a aprobar.
  - **Venta a crédito sin visto bueno de Finanzas: no se emite la apertura.**
  - **«Registrar la salida» es solo cuando el equipo salió de verdad** (caso VIDAWASI, 19-10). Si se pulsa al programar, el CRM da el pedido por despachado: la apertura desaparece de «Aperturas por confirmar» de Finanzas y Contabilidad y el almacén la ve en «Ya salieron», aunque los avisos hayan llegado. Si pasó por error, pedir a Santos que deshaga esa acción.

### 1.10 Contabilidad autoriza la guía

- **Dueño:** Contabilidad (la cuenta de Facturación). Si Contabilidad no está, Finanzas.
- **Qué hace:** confirma la apertura e indica:
  - el **motivo de la guía** (obligatorio desde el 14-10, audio de Contabilidad): **venta** (sale el equipo vendido), **traslado** (servicios: se devuelve o se recoge un equipo), **consignación** (sale por posible venta) u **«Otro»**, con el motivo escrito (por ejemplo, devolución). El CRM propone venta si hay cierre y no es servicio, y traslado en lo demás; decide Contabilidad. Rige de ahí en adelante: las guías autorizadas antes no tienen motivo y no se frenan;
  - el comprobante (factura, boleta o sin comprobante) y su número, que es obligatorio si hay factura o boleta.
- **Flujo de la guía:** postventa ordena la salida (apertura) → Contabilidad aprueba la guía y dice el motivo → el almacén emite la guía con ese motivo y despacha.
- **Qué sale:** «Finanzas autorizó la guía», con el motivo («Guía por VENTA»). Postventa recibe aviso; si la venta es a crédito o con saldo, el aviso le recuerda dar la «Orden a Finanzas para facturar y cobrar» cuando el cliente confirme que recibió el equipo y está conforme. El almacén ve el pedido en «Guías autorizadas por Finanzas».
- **Bloqueo típico:** en ventas a crédito, sin visto bueno de Finanzas no se autoriza la guía.

### 1.11 Almacén: prueba, embalaje y despacho

**Fotos del despacho** (desde el 20-10): el almacén sube las fotos de la carga en planta y, si va por agencia, la foto en la agencia con la guía. Las dos salen como pendientes en «Mi día» hasta subirlas. Postventa las ve en el pedido con su título y puede «Pedir al almacén» (una vez cada 4 horas). Desde el 20-10 (noche) las fotos ya no salen abiertas en el pedido: cada grupo dice «Ver fotos (N)» y se abren en su propia página (planta y agencia), igual que «Ver fotos y videos del protocolo».
**Panorama del almacén** (desde el 20-10): arriba está la tarjeta «Faltan fotos» (cuántas de planta y cuántas de agencia) y el grupo «Equipos que llegan a planta». Lesly: «en el panorama de pendientes no le sale».
**Equipos que llegan a planta** (desde el 20-10): la orden de recepción (REC-00001…) la da postventa desde el caso. El almacén registra que llegó (con fotos), la revisión (técnico y diagnóstico) y qué sigue (devolver o cotizar).

- **Dueño:** almacén (Diana, cuenta ALM; Ariana, cuenta ALM2). Lesly supervisa desde operaciones.
- **Qué entra:** las solicitudes de serie y código, las pruebas pedidas y las aperturas emitidas.
- **Pasos:**
  1. Asigna la serie a cada unidad (una fila por máquina; las torres llevan dos series).
  2. Prueba **cada máquina**, sube el protocolo y marca **«Probada y embalada»**.
  3. Cuando postventa programa, confirma con **«Estamos listos»**.
  4. Despacha con fotos de la salida y video.
  5. Sube la guía y marca **«Despacho concluido»** (o «Entregado en planta»).
- **«Terminado»:** despacho concluido con guía.
- **Bloqueos típicos y por qué:**
  - **«Probada y embalada» exige el protocolo completo** de cada máquina (ver 3.7). El botón se pone gris y dice qué falta.
  - **«Sin apertura de despacho no sale nada del almacén.»** Si postventa programó sin cumplir los pasos, el almacén ve el despacho en rojo, con lo que falta, y no puede prepararlo ni sacarlo.
  - **Con saldo pendiente, la salida queda trabada** hasta que se autorice. Se compara lo pagado con lo **acordado antes del despacho** (el porcentaje del cierre), no con el total.
  - **Si las letras «van con el equipo»**, el almacén debe marcar que recibió las letras. Sin eso, no sale.
- **Horario de atención de la agencia** (desde 15-10, Lesly): cuando la entrega es **por agencia**, postventa lo levanta en la coordinación y lo anota en «Dirección y quién recibe» (campo «Horario de atención de esa agencia», ej. «L-V 8:00 a 18:00 · Sáb 8:00 a 13:00»). Es obligatorio: sin él no se guarda lo verificado ni se emite la apertura. Sale en la fila «Primer destino» de la apertura («HORARIO DE ATENCIÓN: …») y el almacén lo ve en su pedido junto a la dirección de la agencia. En la apertura desde un caso de garantía con repuestos por agencia también se pide. Cambiarlo después de emitida la apertura pide el código, como la dirección.
- **Elegir fotos no es guardarlas** (desde 15-10): al elegir fotos, video o PDF de la máquina sale un aviso amarillo «N archivos elegidos todavía no están guardados» y el botón cambia a **«Guardar N archivos»** (resaltado). Al pulsarlo, cada archivo tiene **su propia barrita** con el porcentaje y arriba dice «Subiendo X de N… no recargue ni cierre la página». Si se intenta recargar o cerrar con archivos elegidos sin guardar, el navegador pregunta antes. Si uno falla, su barrita queda en rojo y lo elegido sigue en pantalla para volver a pulsar.
- **Corregir la guía o las fotos de una entrega ya registrada** (desde 19-10, Almacén): en el recuadro verde «Despachado con guía…» del pedido está el botón **«Corregir la guía o las fotos»**. Abre la misma tarjeta con lo guardado (agencia o transportista, N.º de guía, quién recibió); se cambia lo que esté mal y se pulsa «Guardar la corrección». Las fotos que no se tocan se quedan; una foto nueva reemplaza a la anterior del mismo tipo (la de la guía, la de la máquina…). No cambia la fecha de la entrega ni el doble check de postventa, y postventa recibe un aviso con la guía anterior y la nueva. Si la máquina ya estaba registrada con la guía anterior, pasa a la nueva.
- **Quitar una foto o documento subido por error** (desde 15-10): en la fila de la máquina, junto a cada archivo guardado hay una **✕**. Pregunta antes de quitar y el archivo deja de salir en el informe de prueba y embalaje. Si la máquina ya está marcada «Probada y embalada», el informe está guardado: primero se abre con el código de Lesly (en el informe de protocolo) y recién ahí aparece la ✕, igual que para agregar.

### 1.12 Entrega, puesta en marcha y cierre del pedido

**Cerrar el pedido** (desde el 20-10): las series se marcan de las del pedido; solo se escribe la que falte. La fecha de inicio de la garantía se elige (se propone la de la puesta en marcha o la de la salida). Sin puesta en marcha no se cierra, salvo con el código de gerencia u operaciones y el motivo (por ejemplo, provincia sin visita). El cierre queda en el historial del cliente con fecha y nombre. Antes del cierre, el paso «Guía y fotos enviadas al cliente» se marca con «Enviar guía y fotos al cliente».

- **Dueño:** postventa, con el técnico.
- **Pasos:**
  1. **«Despacho verificado por postventa».** Es el doble check. No se da si las letras siguen pendientes de entrega, y **el código de gerencia no lo salta**.
  2. **«Letras entregadas al cliente»**, con fotos y con quién las recibió. Desde el 21-10 lo registra **solo Finanzas** (o gerencia), desde su pedido; postventa y el almacén ven «Falta que Finanzas confirme…».
  3. **Puesta en marcha** con su informe por equipo («¿De qué equipo es este informe?»), fotos y lectura de ciclos. Con dos o más equipos, la opción que sale primero es «Los N equipos, cada uno con su ficha»: se llena una sola vez y se guarda un informe (una hoja) por cada serie, cada uno con su propio contador de ciclos; también se puede elegir un solo equipo o «Todos los equipos en una sola hoja», y después del primero queda «Otro informe» (Ariana, 16-10). Desde el 14-10 el informe se llena por partes: detalle del trabajo realizado, puesta en marcha, contador de ciclos, observaciones, solución y recomendaciones (lo vacío no se imprime). En repuestos: «Repuesto instalado». En servicios: «Mantenimiento/Revisión ejecutado, con informe».
  4. **«Informe enviado» al cliente.** Para marcarlo hay que subir una constancia.
  5. **«Orden a Finanzas para facturar y cobrar».** Aparece cuando se pagó menos del 100 % antes del despacho (crédito o saldo). Finanzas la marca «atendida».
  6. **«Pedido cerrado».**
- **Qué sale:** la máquina entra al **registro de equipos instalados** (parque instalado) con su serie y garantía.
- **Desde el 14-10, cada etapa muestra quién la hizo y a qué hora.** Lo marcado antes de esa fecha queda sin nombre.
- **Ojo: «pedido cerrado» no es «entregado».** Un pedido también se cierra solo cuando su informe de cierre se anula. Antes de decir que algo se entregó, revise si el cierre fue anulado y si hubo despacho.

### 1.13 Después de la venta: postventa continua

**Pasos en orden** (desde el 20-10): la apertura no se envía por correo ni se copia hasta que esté emitida en el pedido; la orden a Finanzas para facturar va después de la puesta en marcha (antes, con código y motivo). Las fotos del protocolo van en orden (placa, equipo completo, detalles) y se pueden reordenar en el protocolo. El comercial ve las facturas en «Pagos y facturas» del cierre.

**Gestión completa y casos con código** (desde el 20-10): en postventa toda gestión lleva qué se habló y la próxima acción con fecha (o se cierra). Cerrar «Anotar gestión» sin guardar no deja expediente. Cada caso técnico tiene código (CASO-00001…) y su historial paso a paso, que desde el 20-10 (noche) está dentro de «El circuito» como «Historial de las gestiones»: los cambios del caso (etapa, responsable, técnico, apertura de servicio, tipo), las llamadas, WhatsApp y notas del expediente hechas mientras el caso estuvo abierto, lo que se derivó al almacén y la salida y llegada del técnico, cada línea con fecha y quién la hizo. Desde el 22-10 cada línea dice de dónde viene («Este caso», «Expediente del cliente», «Derivación al almacén», «Apertura de servicio») y tiene «Ver ›», que lleva a ese lugar; «Ver en el expediente» baja hasta esa gestión y la marca. Ese historial no se edita: junta lo que se registró en otros sitios, y una gestión ya registrada no cambia su texto (solo se le suman fotos con el «+»); para agregar algo se registra una gestión nueva (Brenda, 22-10). Si el cliente vuelve a llamar por el mismo problema, se suma al caso abierto. El código en la búsqueda de atenciones abre el caso.

- **Dueño:** postventa.
- **Qué incluye:**
  - casos técnicos (problemas, garantía, repuestos, mantenimientos);
  - venta de mantenimiento preventivo sobre los equipos instalados («Ruta de mantenimiento» y «Ventas de la empresa»);
  - repuestos;
  - informes.
- **Preventivo:** cada 4 meses, con alerta a los 3 meses para ofrecerlo antes (gerencia, 23-09). La Ruta de mantenimiento mantiene a propósito su criterio de 6 meses para marcar un preventivo «vencido» (ver la sección de dudas).
- **Cómo se miden:** postventa no se mide en soles. Se mide en tiempos:
  - de pedido aprobado a despacho (separando lo detenido por pago);
  - de despacho a puesta en marcha;
  - porcentaje de informes cargados;
  - porcentaje de direcciones verificadas;
  - primera respuesta de los casos.

### 1.14 Los procesos en diagrama (repasarlos)

- **Desde el 16-10-2026** todo el personal ve los procesos de postventa dibujados paso a paso (diagramas BPMN: un carril por área, compuertas con su pregunta, en ámbar lo que frena). Están en el menú **Procesos** ([Procesos de la empresa](/procesos)) y cada uno se abre en una pestaña nueva, con botón **Pantalla completa**.
- **Cuándo ofrecerlos:** cuando alguien pregunta cómo funciona un tramo del pedido, quién hace qué o por qué algo no avanza, responda y agregue el enlace al diagrama que corresponde. Los enlaces son exactamente estos:
  - [P12 · Recorrido del pedido entre áreas](/procesos/p12): la vista de todo el pedido, de la compra al equipo instalado.
  - [P1 · Del cierre de venta al pedido liberado](/procesos/p1): Central, almacén (series) y Finanzas (liquidación) antes de postventa.
  - [P2 · Preparación del pedido y apertura de despacho](/procesos/p2): prueba, preinstalación, pago parcial en ámbar, visto bueno.
  - [P3 · Guía, despacho y verificación](/procesos/p3): guía con motivo, letras, despacho y doble check.
  - [P4 · Puesta en marcha y cierre del pedido](/procesos/p4): informe por máquina, orden de facturar, equipos instalados.
  - [P5 · Pedido de repuesto o accesorio](/procesos/p5): recojo en planta, agencia o entrega en el local.
  - [P6 · Venta y ejecución de un servicio](/procesos/p6): cotización por gerencia, cierre de servicio, apertura, informe y factura.
  - [P7 · Atención de un caso técnico](/procesos/p7): entrada, serie y garantía, diagnóstico y resultado.
  - [P8 · Apertura de llamada al almacén](/procesos/p8): revisión o videollamada para cotizar.
  - [P9 · Preventivos y ruta de mantenimiento](/procesos/p9): de los 3 meses sin preventivo a la venta del servicio.
  - [P10 · Corrección y anulación de un cierre](/procesos/p10): código de Central, 30 minutos, avisos.
  - [P11 · Excepciones de pago en el despacho](/procesos/p11): pago parcial, salida con código, crédito, letras, segundo anticipo.
- Si el diagrama y esta guía no coinciden, manda la guía (y avise que el diagrama puede estar desactualizado).

### 1.15 Mi cuenta del cliente en efameinsa.com (piloto desde el 17-10)

- **Qué es:** el cliente entra a www.efameinsa.com con su correo o su celular y una contraseña, y ve su historial del CRM: cotizaciones con su PDF, pedidos paso a paso (con fotos del protocolo, de la salida y de la agencia, y la guía), casos de servicio técnico, sus equipos con garantía y próximo mantenimiento, y un chat.
- **Qué ve el cliente y qué no:** solo pasos con fecha real y documentos suyos. Nunca ve notas internas, montos internos, comisiones ni el nombre interno de un estado. Si un paso no tiene fecha en el CRM, no aparece como hecho: **marcar cada paso a tiempo es lo que el cliente ve**.
- **Avisos por estado:** cada paso marcado en el CRM genera un correo (y, cuando esté el número de soporte, un WhatsApp corto) con enlace a Mi cuenta: cotización enviada, pedido confirmado, pago recibido, planos, probado y embalado, despacho programado, salió de planta, en la agencia, ¿ya lo recibió?, instalación agendada, técnico en camino, puesta en marcha, documentos, caso registrado, programado, resuelto, mantenimiento.
- **Piloto:** desde el 17-10 los avisos salen de verdad **solo** a una lista de prueba que define Santos; a los demás clientes no les llega nada todavía (quedan anotados «en ensayo»).
- **Botones nuevos en el pedido y en el caso (postventa, almacén, operaciones, gerencia):** «El técnico salió hacia el cliente» y «El técnico llegó al local». Se marcan cuando ocurre; se pueden deshacer («llegó» antes que «salió» no se deshace).
- **«Ya lo recibí»:** el cliente lo confirma desde Mi cuenta cuando el equipo está en la agencia o salió de planta. Queda en el pedido con hora y nota; al dueño de la cuenta y a postventa les llega un aviso.
- **Mensajes de Mi cuenta:** lo que el cliente escribe en su chat aparece en la ficha del cliente y en el pedido o caso («Mensajes de Mi cuenta») y avisa al comercial dueño (y a postventa si es de un pedido o caso). Se responde desde ahí con su nombre; al cliente le llega el aviso «Tiene una respuesta de Efameinsa».

- **Cuentas de la prueba del recorrido (19-10):** central_test@efameinsa.com (Central de prueba), comercial_test@efameinsa.com (Comercial de prueba, código CT), almacen_test@ (código ALMT), postventa_test@ (código PVT), finanzas_test@ y operaciones_test@ son cuentas de práctica que sí trabajan, con los mismos permisos que la persona real de su área. **Solo lo que se hace con ellas dispara avisos al cliente durante el piloto; lo que hacen las cuentas oficiales no le manda nada a nadie.** Lo que registran es práctica: no entra en reportes ni en la carga de nadie, y la bandeja de central_test solo muestra contactos de práctica. Sirven para recorrer la venta y la postventa con un cliente ficticio (correo soypuromarketing@gmail.com, celular 949 304 862) y ver llegar cada aviso a Santos. Las demás cuentas «_test» (admin, facturación, gerencia, preventivo) siguen siendo de demostración, en solo lectura.
- **Revisión de los avisos por gerencia:** en mkt.efameinsa.com, Revisión, cada correo y WhatsApp lleva los botones Aprobado, Observación y No va; también cada secuencia. Gerencia entra con una clave propia de mkt y solo revisa (no edita).

---

## 2. Qué ve y qué puede hacer cada rol

### 2.1 Comercial (C1–C10)

- **Ve:** su cartera (sus fichas y sus expedientes). En la ficha de cada cliente de su cartera ve todo el historial, incluidas las cotizaciones históricas, aunque las haya firmado otro comercial. Desde el 22-10 también las ve en «Cotizaciones y ventas», con la etiqueta «hecha por Cx» cuando las hizo otra persona («Mis cotizaciones» sigue mostrando solo las suyas). Por qué: así no cotiza por debajo de lo que otro ya ofreció al mismo cliente (regla del 20-08).
- **No ve:**
  - fichas, cotizaciones ni cierres de otra cartera (el buscador no las encuentra; el PDF de una cotización ajena da «no encontrado»);
  - datos o metas de otros comerciales (gerencia, 24-08);
  - si pierde un cliente por traspaso, los datos de postventa de ese cliente (los ve el nuevo dueño).
- **Puede:**
  - registrar gestiones, cotizar, emitir cierres de sus clientes;
  - **pedir la anulación** de su cierre («Pedir la anulación», con motivo) o, desde el 14-10, **anularlo él mismo con código** de operaciones o gerencia («Anular con código»);
  - pedir expedientes o clientes ajenos con código (ver 3.1);
  - pasar contactos a Central;
  - **pedir Infocorp** desde el expediente (desde el 12-10: Central lo obtiene y lo sube, con visibilidad restringida);
  - pedir files.
- **No puede:**
  - corregir lo ya numerado sin código;
  - crear rubros nuevos (solo elige de la lista);
  - crear cierres en cartera ajena.
- **WhatsApp:** trabaja en la bandeja del CRM. La línea personal está cerrada salvo excepción (ver 3.9).
- **Acceso:** solo desde la oficina (gerencia, 23-09). Excepción: los perfiles de **trabajo de campo** (piloto de C1 desde el 01-10), con ubicación del celular y consentimiento escrito.

### 2.2 Central

- **Ve:**
  - la bandeja de contactos;
  - «Lo que derivé» (cómo va cada derivado: sin atender, en gestión, cotizado, cerrado) y el historial de gestión del comercial en solo lectura;
  - **Clientes**, que muestra la cartera completa en solo lectura (de quién es cada cliente). Desde el 17-10 (buzón, Central: «para buscar más rápido la información de cada cliente») la ficha se abre con pestañas, igual que la de gerencia: Resumen, Pedidos y casos, Equipos, Ventas, Historial, Correos de campaña, Documentos y sedes, Datos y contactos. Es de lectura: no trae «Corregir nombre o RUC», «Anotar gestión» ni editar contactos, y cada expediente abre su derivación («Ver la derivación»). «Más acciones» → «Vista anterior de la ficha» vuelve a la de una sola página;
  - «Ver la historia de la empresa»;
  - Presupuestos: cantidades por comercial y buscador por cliente y serie, incluido el archivo de Word;
  - todos los informes de cierre («Cierres de venta») y «Sus pedidos»;
  - en la campana: cada cierre emitido, cada cierre anulado por otro y, desde el 15-10, cada cierre corregido con código (con qué cambió).
- **No entra** a las pantallas del comercial. Del pedido ve la versión imprimible («Ver pedido PED-…»).
- **Puede:**
  - registrar, derivar, unir a una ficha existente, avisar al dueño, descartar;
  - revisar, devolver y liberar cierres;
  - registrar series («Las escribo yo»);
  - generar pedidos, aceptar o rechazar liquidaciones, marcar «Pedido ejecutado»;
  - apurar al almacén y a Finanzas, mandar urgencias;
  - manejar los files;
  - registrar visitas a planta;
  - gestionar los REG;
  - mandar «Avisar a…» (Finanzas, postventa y comercial dueño) y revertir avisos mal enviados (con código);
  - subir Infocorp;
  - **dictar el código para corregir un cierre emitido o agregarle documentos** (desde el 15-10, por decisión de Carlos; lo coordina con Carlos). Central ve su código en la barra lateral («PIN de autorización») y solo sirve para eso. Ver 3.5 y 3.11.
- **Necesita código para:**
  - corregir una derivación;
  - derivar a postventa;
  - unir un contacto ya derivado a una ficha de otro comercial;
  - devolver un cierre con el proceso avanzado;
  - liberar un pedido sin liquidación;
  - anular cierres;
  - corregir una solicitud con cotización o venta;
  - revertir avisos.
- **No decide cartera.** Unir un contacto a una ficha y cambiar la cartera completa son dos pasos distintos con código, a propósito, para que Central no decida de quién es el cliente.
- **Cómo trabaja Central (Carlos, 15-10): «tú no recibes nada, o recibes todo pero lo lees».**
  - **Antes de dar los checks a un cierre, se lee el expediente completo.** Dar dos clics sin leer es el error que Carlos señaló: el cierre de un cliente grande pasó a Finanzas sin su orden de servicio.
  - **¿Este cierre necesita orden de servicio u orden de compra?** Depende del cliente; no todos la llevan. Suelen trabajar con ella las empresas medianas y grandes, y algunas con su propia plataforma de proveedores: sin ese documento no se les puede facturar ni despachar. Para saberlo, en cualquier orden: (1) leer toda la información del cierre; (2) mirar el histórico del cliente en su ficha, si sus compras anteriores llevaron orden de servicio o de compra («tres clics, no leer una Biblia»); (3) preguntarle al comercial. Si el cliente trabaja con orden y falta, no se pasa: se le dice al comercial que la agregue.
  - **Un cliente que llega por un fabricante o proveedor.** GMP es la marca de calandrias que Efameinsa representa y vende. Cuando GMP (u otro fabricante) reenvía a una persona, es porque ese equipo lo vendimos nosotros: el cliente buscó al fabricante por un precio menor y, por la alianza, el fabricante lo remite. Hay que **identificar al cliente por la serie de la placa** que mandó (en el ERP antiguo, en los correos o con el buscador por serie), registrarlo en su ficha y derivarlo: es una oportunidad de venta. No se registra como «una persona X».
  - **Si algo no cuadra, se pregunta antes de pasar,** al comercial o a Carlos. La coordinación interna de gerencia con un vendedor no cambia el procedimiento de Central: «cumple tu procedimiento».

### 2.3 Postventa (PV, PV1, PV2, PV3)

- **PV es el área; PV1, PV2 y PV3 son las personas** (gerencia, 29-09). La cuenta PV del área no tiene ingreso de usuario: su buzón de correo es el que conocen los clientes.
  - Un aviso dirigido a PV se reparte entre todas las personas de postventa activas.
  - Un caso del área pasa a ser de quien lo gestiona primero.
  - **Un cliente, una carpeta de postventa** (desde el 17-10). Cada cliente tiene un solo expediente de postventa abierto: su «carpeta», como la historia clínica del ingeniero Carlos. Todo lo nuevo entra ahí: lo que deriva Central (sea del tipo que sea), el caso que registra postventa y «Ofrecer mantenimiento». Cada asunto es un **caso** dentro de la carpeta, con su tipo y su responsable. El tipo de la carpeta dice en qué se trabaja ahora; cada caso conserva el suyo.
  - **Quién lleva la carpeta:** la persona a la que Central le deriva lo último, la que arma o confirma una cotización, o la que aprieta «Me quedo con esta carpeta». **Ayudar no quita la carpeta:** una llamada o un WhatsApp de una compañera queda con su nombre, pero la carpeta sigue con quien la lleva. A quien la tenía le llega un aviso.
  - **En el expediente** está el recuadro «Carpeta de postventa del cliente»: quién la lleva, los casos abiertos con su responsable, lo que derivó Central en 30 días y las cotizaciones vivas. Si el cliente todavía tuviera otro expediente de postventa abierto, ahí mismo sale «Unir aquí» (lo pueden hacer postventa, Central, operaciones y gerencia, con el motivo escrito; todo pasa a la carpeta con su autor).
  - **Central, al derivar a postventa**, ve si el cliente ya tiene carpeta, quién la lleva y sus casos abiertos: el pedido entra ahí como un caso nuevo.
  - **«Mías» y «Del área»** en Vender → tablero: «Mías» son las carpetas que una lleva; «Del área», todas las de postventa, y cada tarjeta dice quién la lleva. Cualquiera del área puede trabajar cualquier carpeta y cotizar desde cualquier caso.
  - **Al confirmar una cotización queda el seguimiento:** si el expediente no tenía próxima acción o la tenía vencida, queda «Hacer seguimiento de la cotización …» para el siguiente día hábil, a nombre de quien la confirmó.
  - **«Hoy cubro a…»** (inicio de postventa): cuando una compañera falta, otra la cubre hasta la fecha que elija. Sus carpetas y casos siguen a nombre de la ausente (a su vuelta no hay nada que mover); quien cubre recibe copia de sus avisos y ve lo que a ella le tocaba hoy o tenía vencido. «Ya volvió» termina la cobertura.
  - **En el reporte diario** de cada persona de postventa (hoja «Panel del día») hay una franja con: cuántas veces ayudó en carpetas que lleva otra, cuántas la ayudaron, la mediana de tiempo de respuesta a lo que derivó Central (en horas de oficina, últimos 6 días) y cuántas derivaciones siguen sin gestión.
  - Central, al derivar, elige «Postventa (área)».
- **PV1, PV2 y PV3 tienen permisos idénticos y no tienen cartera propia** (28-09 y 29-09). Nunca se asigna cartera a un perfil de postventa. Postventa atiende clientes de cualquier cartera sin quitárselos a nadie.
- **Ve:**
  - todas las fichas (el buscador no le limita la cartera);
  - el registro de equipos instalados, los casos, los pedidos liberados, el calendario, la ruta;
  - la historia del cliente con el autor de cada gestión, **sin montos**;
  - la OC, el voucher y los PDF del expediente, **con los montos tapados** (decisión del 23-09; PDF tapados desde el 28-09);
  - el **estado** del pago («Pagado completo», «Pago parcial», «Pago sin registrar»), pero no la cifra.
- **Corrige nombre, RUC y rubro de clientes sin dueño** (desde el 14-10, caso Hospital Chanka): botón «Corregir nombre o RUC» junto al nombre del cliente. Como postventa no tiene cartera, sus clientes suelen quedar sin dueño. Si el cliente es de un comercial, lo corrige el comercial.
- **Excepción: Brenda (PV2 y C1) corrige los datos de cualquier cliente** (Santos, 20-10): busca en todos los clientes y corrige nombre, RUC o DNI, rubro, dirección de la empresa y contactos, aunque sea de otra cartera; el dueño recibe aviso. No le da ver cotizaciones, cierres ni precios de otras carteras desde postventa (eso lo ve desde su cuenta comercial) ni mover clientes de cartera.
- **No ve:** precios de venta ni cifras de ventas de los comerciales. Esto incluye las cotizaciones antiguas: ve las descripciones, no los precios.
- **Puede:**
  - cotizar servicios y repuestos, y corregir las cotizaciones del área aunque las haya hecho otra compañera;
  - emitir cierres de servicios en cualquier cartera (ese cierre es de quien lo creó; el dueño de la cartera lo sigue viendo);
  - registrar casos (también autoderivados), seguimientos sin abrir caso, aperturas e informes;
  - agregar y corregir contactos en clientes donde tiene un caso (borrar sigue siendo del dueño);
  - corregir la serie de una máquina.
- **Restricciones vigentes:**
  - **toda cotización de postventa pasa por gerencia** (desde el 05-10, mientras dure la capacitación);
  - borrar una cotización de postventa pide código;
  - enviar con saldo pendiente pide código (desde el 14-10).

### 2.4 Operaciones (Lesly)

- **El macro** (desde el 21-10, la «foto macro» que pidió Lesly el 20-10): primer botón del menú de operaciones y del almacén. Todo el almacén y operaciones en números: por despachar, probar y embalar, generación de código, llamadas sin informe, fotos y guías que faltan, equipos que llegan a planta, pedidos al catálogo, equipos sin precio, ficha o foto, y fichas repetidas. Cada tarjeta lleva a la pantalla donde se trabaja; en rojo lo urgente.

- **Stock y códigos** (desde el 21-10, pedido de Lesly y del ingeniero; en el menú de operaciones, debajo de «Catálogo»). Dos pestañas:
  - **Subir el Excel de stock:** Lesly sube el Excel de stock de Importaciones tal como viene. Se leen solo las hojas de STOCK (industriales y LG); reserva y vendidos no se suben. **La columna COSTO no se lee: los costos nunca entran al CRM** (el precio de venta lo da el ingeniero aparte). El CRM compara cada máquina con el catálogo —no solo por modelo: también control (Dual Digital / Unilinc), calentamiento (GLP, gas natural, eléctrico, vapor), cilindro, voltaje y, en LG, el código de sistema (CWG = lavadora, CDG = secadora)— y la clasifica: **OK** (el código que puso está bien), **Ya existe — faltaba ponerlo** (no tenía código, pero en el catálogo ya hay uno con la misma configuración: no se crea nada; antes se llamaba «Sugerido»), **Elegir** (calzan varios), **Código nuevo** (no existe esa configuración: propone un código tentativo que no repite ninguno, ni los retirados) y **Revisar** (código equivocado, modelo que no cuadra con la descripción, o una serie que el CRM ya tiene con un cliente). En cada casilla se ve si el código ya existe (sobrio) o si es nuevo y se va a crear (borde punteado ámbar y «Código nuevo · se crea»). Se revisa por grupos de máquinas iguales: «Subir así» (con el código que quede en la casilla) o «No subir». Se puede cerrar y volver. **Desde el 22-10 (tarde) el Excel entra solo:** al leerlo, todo lo que está claro (código de Lesly, código nuevo que ella escribió) **entra al almacén en el acto** con su serie como disponible, y desde ahí es el stock «en almacén» que ven las comerciales en «Stock de equipos» y en el cotizador. La pantalla solo muestra las **observaciones** (falta código, revisar, serie que ya está con un cliente): al resolver una («Entra al almacén con X»), entra sola; «Sacar del almacén» la da de baja. Ya no existe el botón «Subir al almacén» (Santos: «que todas suban en automático y solo señale las observaciones»). Lo único que sigue siendo una decisión aparte: las máquinas que estaban en el almacén y ya no vienen en el Excel (botón «N del almacén no vinieron en el Excel…» → marcarlas como salidas). Si una celda UBICACIÓN del Excel trae un número (un costo corrido de columna, pasó en dos filas el 22-10), el CRM la descarta y la máquina queda como PLANTA: el costo no entra por ninguna puerta. Las piezas sin serie (coches) suman al stock de referencia del código. Un código nuevo se crea en el catálogo **en preparación** (retirado): no se cotiza hasta que Lesly le ponga la ficha y lo active. Si en un Excel nuevo ya no viene una máquina que estaba disponible, se puede marcar como salida.
  - **Desde el 21-10 (tarde) manda el Excel de Lesly** (Santos: «mejor no te guíes del catálogo»): el código que viene en el Excel se respeta tal cual, sin compararlo con los productos ni proponer otro. Estados: «Código de Lesly» (ya existe en el sistema), «Código nuevo · se da de alta» (no existe: se agrega al subir, en preparación), «Código retirado · se reactiva», «Falta código» (la casilla está vacía: hay que escribirlo, el CRM no lo adivina) y «Revisar» solo para una serie que el CRM ya tiene con un cliente o un mismo código puesto a modelos distintos en el Excel. Las decisiones siempre se pueden cambiar: «No subir», «Subir de todos modos» (pide confirmar si la serie ya está con un cliente) y «Deshacer».
  - **Códigos y series:** la lista de todos los códigos con su configuración y cuántas hay en almacén; «¿Qué código le toca a un equipo que llega?» (se pega la descripción de Importaciones y el CRM dice si ya existe un código con esa misma configuración, para no duplicar, o propone el siguiente libre); y «¿Dónde está esta serie?» (dice si una serie está en el almacén, en un pedido o con qué cliente, con enlace a la ficha y al pedido).
  - **Descargar resumen (PDF)** (desde el 21-10, pedido de Santos con la hoja impresa de Sailstar como modelo): arriba de la revisión. Baja el «Resumen general de stock» de la revisión que se está trabajando, agrupado por marca y tipo (por ejemplo «SAILSTAR · LAVADORAS»), con las columnas de siempre (código, modelo, equipo, stock, marca, serie, disponible) más el estado de cada máquina, el código que traía el Excel si cambió, los códigos nuevos marcados y la decisión con su casilla (sube / no sube / por decidir). Arriba trae un recuadro con lo relevante: cuántas suben, cuántas faltan y por qué, los códigos nuevos, las series que ya están con un cliente y las que no traen serie. Sirve para imprimir, marcar a mano o mandar. Sin costos.
  - **Resumen general de stock — el informe de los lunes, ahora lo arma el CRM** (desde el 22-10, reunión Santos–Lesly). Importaciones entregaba cada lunes a las comerciales un informe impreso; desde ahora sale del CRM con lo que hay en el almacén, en **dos PDF**: **Industriales**, separado por proveedor (Alliance con Primus y Unimac, GMP, Sailstar, Sidi Mondial, Bimap, Blanca Pres, Hegmei…), dentro por tipo (lavadoras, secadoras, rodillos y calandrias, prensas, mesas, calderines, coches), cada máquina con su código de Importaciones, modelo, descripción, serie y dónde está (planta o exhibición), subtotal por tipo y **TOTAL EQUIPOS por proveedor**; y **LG**, consolidado por modelo (Titan Light single / stack lower, Titan Max, Giant C Max…) con el stock de cada uno, los subtotales de secadoras y lavadoras y la exhibición aparte. Los botones están en «Stock y códigos» (abajo) y en **«Stock» del comercial** (arriba): el informe no lleva precios ni costos, lo puede bajar cualquiera. Mientras el almacén esté vacío el PDF lo dice; mientras hay una carga en revisión, Lesly tiene además una **vista previa** con lo que va a subir. **El circuito semanal queda así:** Lesly sube su Excel actualizado en «Stock y códigos», revisa, pulsa «Subir al almacén», y el resumen sale solo; Importaciones ya no tiene que armarlo a mano.
  - **Almacén por serie** (pestaña de «Stock y códigos», desde el 22-10, reunión de Carlos; **gerencia la tiene en su menú** como «Stock y códigos» y **edita igual que operaciones**): el listado principal del stock. Se lee de dos formas: **«Por código»** (una fila por código con el equipo, el proveedor, cuántas disponibles y cuántas reservadas; al abrirla salen sus series) y **«Por serie»** (lista plana **numerada**, de a 100). Cada máquina trae su código, equipo, serie, ubicación, **fecha de ingreso**, **empresa** (OPEN o EFAMEINSA: viene del Excel si trae la columna, o se elige en la fila) y estado. Filtros por estado (en planta, disponibles, reservadas, despachadas), **proveedor** (Alliance, GMP, Sailstar…), **marca** (Primus, Unimac, LG…), **empresa** y buscador (código, modelo, serie, cliente o pedido). Arriba, las cifras (disponibles, reservadas, despachadas, en camino) y **«Totales por proveedor, tipo y modelo»** (industriales por proveedor y tipo; LG por modelo), lo mismo que sale en los PDF. Carlos: «este inventario es la punta de partida»; el catálogo y el cotizador muestran la suma de esas series por código (50 Titan Max en el almacén = 50 en la ficha).
  - **Lo que está por llegar (proyección)** (desde el 22-10, Carlos: «quiero ver la proyección de lo que está llegando, con fecha… que no se sume»): en «Almacén por serie», Lesly anota lo que Importaciones tiene en camino (código, cantidad, fecha estimada, proveedor, contenedor u orden de compra) con «Anotar lo que viene», y marca «Ya llegó» cuando entra (y viene en el Excel de stock con su serie). El comercial lo ve en «Stock» (recuadro «En camino») y en el catálogo como **«+N en camino · llega dd/mm»**: se puede vender, pero **no suma al stock**.
  - **Cotejo con el catálogo** (desde el 22-10, Carlos: «¿ya se actualizó el stock que había en el CRM con esto? — todavía no se ha hecho el contraste»): el catálogo venía mostrando la cifra «(ref.)» del maestro de agosto. En «Almacén por serie» hay una tabla código a código con la cifra vieja, lo que trae la carga en revisión, lo que el almacén cuenta por serie y si la ficha está activa, en preparación o retirada. **Al pulsar «Subir al almacén», los equipos que no vinieron en el Excel dejan de mostrar la cifra vieja** (se guarda la anterior); operaciones también puede pulsar «Cotejar el catálogo ahora». Desde entonces el stock que ve el comercial es el del almacén. Los repuestos no se tocan.
  - **El inventario que ve el comercial** (en «Stock», desde el 22-10, plegado arriba del catálogo con su resumen: «N disponibles en M códigos»): las máquinas en planta por código (y por serie al abrir o en la lista plana): código, equipo, serie, ubicación, empresa, disponible o reservada, y lo que viene en camino, **sin costo, sin fecha de ingreso ni para quién está reservada**. La lista no se copia ni se imprime y lleva el nombre de quien la mira como marca de agua: Carlos pidió que no se pudiera capturar la pantalla; un navegador no puede impedir una captura, pero así una foto dice de dónde salió.
  - **El almacén sigue al pedido, solo** (desde el 22-10): cuando el almacén o postventa registra la serie en una unidad del pedido, esa máquina queda **reservada** para ese cliente y ese pedido (y el catálogo descuenta una); si se quita o se corrige la serie, o se quita la línea, la máquina **vuelve a estar disponible**; cuando el almacén registra la salida del pedido, queda **despachada** con la fecha. Nadie tiene que mover nada a mano ni cortar y pegar filas en el Excel. Una máquina que un pedido todavía tiene no se puede «liberar» desde el almacén: se quita la serie en el pedido y vuelve sola.
  - **«Elegir del almacén»** (en la unidad del pedido, junto a «Registrar la serie», desde el 22-10): en vez de escribir la serie, se busca por código o modelo entre las máquinas disponibles del almacén y se toca la que sale; el CRM registra la serie y la reserva. Carlos: «en lugar de sube, le pone un check para que le dé esta serie al pedido de la Central».
  - **Cómo se arma un código** (Lesly, 21-10): empieza por el tipo (LAV, SEC, CAL, ME, PR, CO), lleva algo del modelo (LAVG50 = GP50, LAVW23 = WET 23) y una variante del mismo modelo —otro panel, otro voltaje, dosificador— suma un número al final (LAVW105 → LAVW1051). Un mismo modelo puede tener varios códigos porque cambia el panel (UCT060 con M30 = LAV060, con M9 = LAV0601): por eso cada máquina muestra su tipo y su panel. Nunca se repite un código, ni uno retirado.
  - **Las Sailstar 2026** que llegaron con sistema de aire FRL (GP50, GP70, una SS23, WET23, WET17) no son las que ya estaban: van con código nuevo (variante con un 1 al final: LAVG501, LAVG701, LAVS231, LAVW231, LAVW171). Las que solo traen dosificador externo, sin FRL, conservan el código de siempre (así las codificó Lesly el 21-10).
  - **Si Lesly ya escribió en su Excel un código que no existe** (PROF02, LAVG501…), el CRM lo toma como «Código nuevo» y lo crea con ese nombre al subir; si escribió un código retirado (SECNSEN), las máquinas entran con él y queda por ponerle la ficha y activarlo.
  - **Una serie que ya está con un cliente** (Importaciones liquida después de vendida) aparece con el cliente y el pedido, viene como «No subir» y se pasa a vendido o reserva en el Excel de Importaciones.

- **Rol propio** («operaciones»): no es comercial, ni almacén, ni gerencia.
- **Hace:**
  - **dicta el código de operaciones** para anular cierres, corregir derivaciones, corregir documentos numerados, cambiar una apertura emitida, modificar una máquina ya «probada y embalada», corregir informes y unir fichas;
  - **desde el 15-10 ya no autoriza corregir un cierre emitido ni agregarle documentos:** eso lo autoriza solo Central. Si se escribe el código de Lesly ahí, el CRM avisa que es de operaciones y que hay que pedírselo a Central;
  - mantiene el **catálogo** (productos, servicios, repuestos, precios, fichas, códigos, stock);
  - reparte permisos temporales (por ejemplo, la llave para ver y cotizar mantenimiento);
  - edita el Directorio y la lista de técnicos;
  - supervisa postventa, almacén, Central y Finanzas desde «Hoy»;
  - tiene su sección de almacén («Por hacer», «Generación de código», «Calendario»).
- **No hace:**
  - traspasar cartera (es decisión de gerencia: «es plata de alguien»);
  - ver paneles, comisiones ni números de la empresa.
- Su regla de cotizaciones: las de operaciones **no** entran en la regla «toda cotización de postventa va a gerencia».

### 2.5 Almacén (ALM, ALM2)

- **Ve:** pedidos y aperturas, llamadas de postventa (derivación de llamadas), aperturas urgentes, generación de código y series, calendario de despachos, visitas, letras y «Guías autorizadas por Finanzas».
- **No ve:** precios. Tampoco ve el precio en el cuadro de repuestos del informe de videollamada.
- **Puede:**
  - asignar y registrar series (avisa si el largo no es el típico de la marca; corregir una serie ya registrada pide código);
  - marcar «Sin stock» con motivo;
  - subir protocolos y marcar «Probada y embalada»;
  - «Estamos listos», despachar, subir la guía (la guía se emite con el motivo que indicó Contabilidad al autorizarla: venta, traslado, consignación u otro);
  - subir informes de llamadas;
  - cambiar el técnico mientras no haya informe;
  - registrar visitas de proveedor;
  - emitir el «Reporte del almacén».
- **Agenda del almacén (desde el 21-10, pedido de Santos):** la primera pantalla de la cuenta de almacén (antes «Mi día»). Son tareas DEL ÁREA (hoy las trabaja Diana). Tiene, de arriba abajo:
  - **Tres indicadores con meta cero:** pruebas esperando 2 días o más, despachos atrasados (con fecha y apertura, sin salir) y salidas sin cerrar (salieron y falta la foto de la carga, la de la agencia o la guía). Verde cuando está en cero, rojo cuando no. La meta del almacén no es una cantidad: es cero colgados. Al lado, «Hecho hoy» cuenta las acciones del día.
  - **«Hoy, en orden»:** la lista de tareas en el orden de ataque: 1) despachos que salen hoy y atrasados, 2) pruebas pedidas por postventa, 3) llamadas de postventa, 4) salidas por cerrar, 5) equipos que llegan a planta, 6) series que pidió Central. Cada tarea dice por qué está ahí y tiene su botón. Al lado, la agenda de hoy con hora (despachos, atenciones, llamadas, visitas).
  - **«Lo que hizo el almacén hoy»:** lo que el CRM registró solo, con hora y quién: probó y embaló, registró la serie, confirmó listo, salida de planta, dejó en la agencia, recibió letras, tomó la llamada, subió el informe, recibió o revisó un equipo que llegó, terminó un protocolo de stock. No hay que escribir nada. Al lado, «Otras gestiones de hoy» en texto libre (inventario, orden del almacén, repuestos que llegaron, entregas en ventanilla) hasta que se mapeen como pasos.
  - **«Todos los números»** plegado: los cuadros de antes (generación de código, por probar, despachos de hoy, atrasados, guías autorizadas, aperturas sin tomar…), para quien los busca.
  - **«Reporte del día»** (botón arriba, con selector de fecha): el cierre del día del almacén en PDF, como el de postventa: indicadores, lo hecho con hora y quién, otras gestiones, lo pendiente en orden y lo de mañana (despachos programados, pruebas en cola, llamadas). Queda grabado y gerencia lo ve en «Cierre del día» como el de los demás.
- **Equipos que llegan a planta:** la lista está en el menú («Equipos que llegan») y en la agenda; antes solo existía la ficha de cada recepción.

### 2.6 Finanzas (Jhon)

- **Ve:** el expediente completo de lo que liquida, en solo lectura (cotización enlazada, OC, cierre, pedido, vouchers). Los vouchers de Finanzas solo los ven Finanzas y gerencia.
- **Puede:**
  - confirmar u observar pagos;
  - generar y validar liquidaciones (el CRM las arma; ver 1.8);
  - dar el visto bueno a créditos y letras;
  - autorizar guías si Contabilidad no está;
  - atender órdenes de facturar;
  - ver cuentas por cobrar.
- **No entra** a los informes técnicos de postventa: el correo de la orden de facturar los describe, pero no los enlaza.
- **«Casos de Central»** (desde el 21-10): lo que Central le pide con un caso (confirmar abono, devolución, cargo bancario, letras…). Lo toma, responde o pide un dato por el mismo caso (ver 3.10).

### 2.7 Contabilidad / Facturación

- Es la misma cuenta (Facturación 1).
- **Pantallas:**
  - «Por facturar»;
  - «Observados», con revisión automática de congruencia: empresa, RUC, moneda, monto con IGV y OC adjunta;
  - «Facturados»;
  - «Enviada al cliente».
- **Autoriza las guías** de las aperturas (desde el 12-10) indicando el motivo de la guía (desde el 14-10) y el comprobante.
- **«Ver el expediente» en cada apertura** (desde el 15-10, lo pidió Facturación): en «Aperturas por confirmar», también en las de contado y las ya confirmadas, despliega el cliente con su RUC, el cierre, el pedido, el comercial, el equipo, la forma de pago y las cifras, con el botón para abrir el cierre completo y sus adjuntos. En las ventas a crédito sigue dentro de «Ver la validación del crédito».
- **Varios anticipos** (desde el 14-10): un pedido ya facturado vuelve a «Por facturar», con el aviso «Nuevo anticipo por facturar», cuando Finanzas sube una liquidación nueva con «factura pendiente» después de la última factura. Registrada la factura nueva, Finanzas genera la liquidación siguiente, que ya trae el número (desde el 17-10).
- **A crédito factura cuando postventa da la orden** (14-10): los días de crédito corren desde la factura, así que se espera a que el cliente confirme que el equipo llegó y está conforme.
- **«Casos de Central»** (desde el 21-10): emitir o corregir una factura, nota de crédito, reenviarla al cliente o la guía. Responde con el documento adjunto (ver 3.10).

### 2.8 Importaciones

- Perfil propio desde el 06-10, con un solo menú: **«Por importar»**. Ahí están las máquinas sin serie de pedidos abiertos no despachados, con pestañas por motivo.
- Anota la fecha estimada de llegada y una nota.
- **No ve clientes ni precios.** Mostrar esa fecha a postventa dentro del pedido está pendiente (por confirmar).

### 2.9 Gerencia

- **Ve todo.** Aprobaciones, Supervisión diaria por comercial (incluye postventa), «Cierre del día» (quién no cerró su reporte), visitas del equipo, metas, cartera liberable, finanzas y cuentas por cobrar, marketing y WhatsApp (turnos y dueños de campaña), accesos y equipos, y alertas de conducta.
- **Decide:**
  - traspasos de cartera y fichas en disputa entre comerciales;
  - precios bajo lista;
  - devoluciones con proceso avanzado;
  - reglas nuevas.
- **Dicta el código del supervisor.** Es rotativo, dura pocos minutos y se quema al usarse. Puede levantar el código por un día, pero el motivo sigue siendo obligatorio.
- **Ve la «Auditoría del asistente»** (desde el 15-10, pedido de Carlos): cada pregunta que el personal le hizo a Efamein, con la respuesta, como un chat. Sirve para entender qué no saben las personas y qué falta explicar.

### 2.10 Administración

- Gestiona usuarios. Solo puede borrar los que no tienen historial; a los demás los desactiva.
- **Cuando alguien deja la empresa** (Carlos, 15-10): el jefe o Recursos Humanos avisa a Santos por correo **el mismo día**, y se desactiva su usuario enseguida (el CRM se abre desde cualquier parte del mundo). Al desactivarlo, deja de recibir leads y se le cierran las sesiones. Su cartera se entrega a quien gerencia decida. **No se sigue trabajando con el usuario y la contraseña de quien se fue:** se reasigna la cartera a la persona que la atiende.
- Atiende el buzón de sugerencias («Observaciones del sistema»). Gerencia lo lee; cada persona ve solo las suyas.

### 2.11 Cuentas de práctica

- Las cuentas de práctica (C0, PV0, ALM0, etc.) ven datos de ejemplo, no los reales.
- Numeran con prefijo **PRUEBA** («PRUEBA_…», «PRUEBA-9xx»), sin gastar la serie real, y no cuentan en ningún indicador.
- No envían correos ni hacen sonar avisos reales.
- Por qué: unas pruebas internas gastaron números reales y una comercial reclamó un salto.

### 2.12 Controles que aplican a todos

- **Accesos y equipos:** gerencia ve quién entró, desde qué equipo y desde qué zona aproximada. Las laptops son de la empresa y el seguimiento figura en el contrato. Solo se mira, no se bloquea.
- **Conducta sospechosa** (desde el 02-10): el CRM detecta capturas de pantalla, copias de texto, descargas e impresiones, y avisa a gerencia. Por qué: hay información delicada, como los teléfonos de los contactos. Solo detecta y alerta; no bloquea.
- **Registro de acciones y «Deshacer este clic»** (desde el 16-10): cada cambio que hace una persona en casos, expedientes, prospectos, derivaciones, contactos, fichas, máquinas, pedidos, visitas, gestiones, cierres y aperturas queda anotado, clic por clic: quién, cuándo y qué cambió (cómo estaba y cómo quedó). Lo ven administración, gerencia y operaciones en «Registro de acciones». Si alguien se equivocó, uno de ellos pulsa «Deshacer este clic», escribe el motivo y todo vuelve a como estaba; a quien hizo el clic le llega un aviso. **Cuando no se puede deshacer, el CRM dice por qué:** si después alguien volvió a cambiar lo mismo, hay que deshacer primero ese clic más nuevo; si lo que se creó ya tiene cosas que dependen de él, hay que resolver eso antes. Lo que hacen los procesos automáticos no se anota. **Si usted se equivocó con un clic, avise por el buzón del CRM o a operaciones: no hace falta pedir que se arregle la base a mano.**
- **Devolver a la bandeja** (desde el 16-10, Central): en «Derivados», cada contacto derivado tiene «Devolver a la bandeja». Vuelve a «por repartir» como si no se hubiera derivado (se quita el expediente y la ficha que creó la derivación) y al comercial le llega «Derivación retirada». Si el comercial ya hizo gestiones, el CRM no lo deja y explica que primero hay que moverlas con «Mover las gestiones a otro expediente». Solo funciona con derivaciones hechas desde el 16-10; las anteriores se piden a administración.
- **Mover las gestiones a otro expediente** (desde el 16-10; Central, operaciones, gerencia y administración): en la cabecera del expediente. Se busca el expediente correcto (del mismo cliente o de otra ficha, por nombre, RUC o código PRO), se escribe el motivo y pasan las gestiones, los contactos y las visitas. El expediente que queda vacío pasa a histórico sin próxima acción. Las cotizaciones y los cierres no se mueven a otra ficha: si es el mismo cliente partido en dos, se unen las fichas.
- **Versión nueva del CRM** (regla vigente desde el 17-10): la pantalla que usted está usando **nunca se recarga sola**. Cuando sale una versión nueva, aparece la pastilla «Hay una versión nueva» abajo a la izquierda, y la siguiente vez que pase a otra pantalla (menú, enlace o «Atrás»), esa otra pantalla ya abre actualizada. Si tiene algo escrito sin guardar, guárdelo y pulse la pastilla. (El 16-10 se probó una recarga automática con la pantalla quieta; Santos la quitó el 17-10 porque podía perderse lo que se estaba haciendo.)
- **Lo que se corrige en la ficha del cliente llega a sus pedidos** (desde el 17-10): al cambiar la razón social o el RUC/DNI de la ficha, el nombre se pone al día solo en los pedidos que no han terminado, los casos abiertos, las máquinas del cliente y los informes de servicio que todavía no se emitieron. Lo que ya se entregó (informes emitidos, pedidos terminados) queda como salió. El cierre no cambia solo: su «Se le factura a» se corrige con «Editar» (o con código de Central si ya se emitió). Las cotizaciones toman los datos de la ficha al confirmarse, y una ya confirmada se pone al día desde la cotización.
- **Los botones dicen por qué no dejan** (desde el 16-10): si un botón está gris o algo no se puede hacer, debajo o dentro de la ventana dice qué falta («Falta la fecha y el técnico», «Falta el código de 4 dígitos»). Léalo antes de reportar que «no deja».
- **La celebración** (desde el 23-10, pedido de Santos, como el unicornio de Asana): cuando usted **cierra un pedido, cierra una atención o da por cerrado un caso de Central**, Efamein sale un momento al centro de la pantalla con confeti; cuando **pasa de un estado a otro** (aprobar un pedido, marcar un paso, registrar el despacho, confirmar un abono, dar el visto bueno, ordenar facturar, cerrar una etapa de la atención, marcar una tarea como hecha…), la «e» del isotipo cruza por arriba de la pantalla y estampa un sello. Dura dos segundos, no tapa botones y no hay que cerrarla. Si en su equipo tiene activado «reducir movimiento», no la verá: no es una falla.
- **Los avisos pequeños de abajo a la derecha se cierran con la «×»** (desde el 23-10, pedido de Santos): los avisos cortos que aparecen abajo a la derecha al guardar, registrar o cuando algo falla («Gestión registrada», «El servidor rechazó…») traen una «×» arriba a la derecha para cerrarlos al instante; si no se tocan, se van solos como antes. En el celular salen encima del menú de abajo y en la computadora por encima de Efamein, sin tapar ni uno ni otro.
- **«Salir»** cierra la sesión en ese equipo (por confirmar si ya rige; antes cerraba en todos).

---

## 3. Reglas por tema

### 3.1 Cartera, fichas y expedientes

**Cliente con RUC o DNI** (desde el 20-10): el cierre de venta no se emite si la ficha no tiene RUC ni DNI; se completa en la ficha («Corregir nombre o vincular RUC»). Las fichas repetidas del mismo cliente se unen desde «Fichas repetidas» (Central, operaciones y gerencia). Postventa puede quitar un contacto mal puesto en un cliente con caso o pedido; el dueño de la cartera recibe el aviso.

**Unir fichas y fichas sueltas** (desde el 16-10)
- **Unir dos fichas del mismo cliente:** desde «¿Es el mismo cliente?» en la ficha o el caso, o desde el aviso de una serie que ya está en otra ficha («Revisar y unir las dos fichas»). Se ven las dos fichas, cuál se une y cuál se queda (se queda la que tiene RUC), se escribe el motivo y se pide el **código de operaciones**. Si las dos tienen RUC propio, solo gerencia o administración pueden unirlas (lo deciden ellos: pueden ser empresas distintas o sedes).
- **«Unir con otra ficha»** (desde el 20-10, caso de Katerine con Lavanderías GLUP): cuando el CRM no sugiere la pareja, el comercial la busca él mismo. El botón está en la ficha del cliente (bloque «Cliente y contactos») y en el expediente (debajo de «Corregir datos del cliente»). Se busca la otra ficha por nombre, RUC o DNI, celular o nombre de un contacto; se elige **cuál se queda como principal** (el CRM propone la que tiene RUC o DNI, porque es con la que se cotiza y factura) y se escribe el motivo. **Si las dos fichas son de la cartera de quien une, no pide código** (no mueve el cliente de nadie); si alguna es de otra cartera, pide el código de operaciones como siempre. Al unir, el expediente comercial abierto y sin papeles de la ficha que se une se suma solo al expediente vivo del mismo comercial en la ficha que queda, y un contacto con el mismo celular no se duplica. Todo queda en el registro de acciones y administración lo puede deshacer.
- **Fichas sueltas:** fichas sin expedientes, casos, máquinas, prospectos, cierres, pedidos ni cotizaciones. Administración, gerencia y operaciones las ven en «Fichas sueltas» y las archivan con un motivo (duplicada sin datos, proveedor, prueba…). Una ficha archivada sale de las listas de clientes pero no se borra; se restaura desde «Archivadas», y **vuelve sola** si le entra un expediente, un caso o un prospecto. Si la ficha suelta es el duplicado de una con historia, lo correcto es unirla, no archivarla.

**Ficha, expediente y cartera**
- **Ficha** es el cliente (RUC o DNI). **Expediente** es un negocio concreto con ese cliente (la oportunidad). **Cartera** son las fichas de un comercial.
- **El cliente es del comercial que lo atendió.** Si llega un lead de un cliente existente, se propone a su dueño.
- **El RUC manda.** No se puede registrar un cliente que ya existe con ese documento. Para deduplicar, se busca por RUC/DNI, luego teléfono, luego correo; nunca por nombre.

**Cómo se lee y se trabaja la ficha del cliente** (desde el 17-10, a raíz de Ariana: «no veo toda la información, tengo que apretar para que aparezcan más cosas»)
- **Todo está en la ficha, repartido en pestañas:** Resumen (lo vivo y lo último que pasó), Pedidos y casos, Equipos, Ventas, Historial (todo lo hablado), Correos de campaña, Documentos y sedes, Datos y contactos. Las pestañas quedan fijas arriba al bajar. La línea bajo el nombre (expedientes vivos, pedidos, casos, equipos, última venta) lleva a cada pestaña.
- **«Anotar gestión»** (el botón granate de la ficha) abre el formulario en un panel al costado, sin salir de la ficha: qué hizo, qué pasó, en qué quedó y qué sigue. Arriba dice en qué expediente se guarda (postventa: el del área con ese cliente; comercial: el suyo) y trae «Abrir el expediente» por si quiere el detalle. Reemplaza a «Registrar seguimiento».
- **Cada expediente vivo dice en la misma ficha** su tipo, etapa, la cotización y su estado (confirmada, aprobada, espera a gerencia), la próxima acción (o el aviso ámbar si falta) y la última gestión. Para el resto, «Abrir expediente». **Si el cliente es parte de un grupo** (una cadena con varias razones sociales, como Turismo Costa del Sol con Hotelera Cusco), la lista trae también los expedientes vivos de las otras empresas del grupo, cada uno con el nombre de su empresa. La cotización sigue a nombre de la empresa de su expediente.
- **Lo de vez en cuando está en «Más acciones»:** visita o videollamada, derivar llamada, traer a preparación, ofrecer mantenimiento, otra razón social y la vista anterior de la ficha. A la vista quedan «Anotar gestión», «Registrar un caso» y «Apertura de servicio».
- **Si el cliente tiene una máquina que no está en «Equipos»** (comprada antes del CRM o en otro lado), postventa la registra ahí mismo con «Registrar un equipo de este cliente»; la serie y la foto de la placa pueden llegar después.
- **En el expediente**, arriba a la izquierda está «← Ficha del cliente» para volver. En los expedientes de postventa ya no salen «Calificación» ni «Pide servicio, no equipos», que son de la venta de equipos.
- **El formulario de gestión viene abierto** con sus tres pasos a la vista (antes «¿En qué quedó?», la próxima acción y el botón aparecían recién al escribir).

**Llamadas desde el CRM y modo setter** (desde el 20-10, pedido de Santos)
- **El botón «Llamar»** está junto a cada teléfono de la ficha del cliente (cabecera y «Datos y contactos»), en Mi cartera y en el cotizador. Cada llamada hecha con él queda anotada en la ficha, en la pestaña **«Llamadas»**, y en el expediente abierto del cliente como gestión de tipo llamada.
- **En la app de Android** la llamada sale con el plan corporativo del celular y, al terminar, el CRM anota la hora y la duración real. **Desde el navegador, la PWA o el iPhone** el botón abre el marcador y, al volver al CRM, pregunta «¿Cómo le fue?» (contestó, cuántos minutos, o no contestó).
- **La grabación del audio está en pausa por decisión de Santos (20-10):** hoy ninguna llamada se graba ni se transcribe. La pantalla de gerencia (Reportes → «Llamadas grabadas») y la pestaña «Llamadas» muestran quién llamó a quién, cuándo y cuánto habló. Si se reactiva, se avisará y se pedirá aceptar el aviso de grabación (Ley 29733).
- **Quién ve qué:** cada comercial ve sus llamadas; gerencia y administración ven todas, por día, comercial o cliente, con «Exportar a Excel».
- **Modo setter:** la cuenta marcada como setter (hoy, la de administración de Santos) puede encender en la app «Modo setter». Cada lead nuevo que llegue de un formulario de Meta (por el Google Sheets) y traiga teléfono genera un aviso en el celular con el nombre y el número, y la app **lo llama sola a los pocos segundos** (si tiene el permiso «Mostrar sobre otras apps»; si no, basta un toque en el aviso). En el aviso se puede **Cancelar** antes de que marque. Un lead que lleva más de 30 minutos en espera ya no se llama. **Al colgar, el setter tipifica con un toque** (Muy interesado, Interesado, Poco interesado, Busca financiamiento, sin dinero, número equivocado, busca doméstica, no le interesa, no contestó, llamar después). Mientras el celular del setter está en línea, el lead espera su tipificación y recién entonces se reparte al comercial con la intención marcada; los descartes se cierran con su motivo; «no contestó» se reintenta dentro del horario y al tercer intento pasa al comercial. Si el setter no tipifica en 45 minutos, o tiene el celular apagado, el lead se reparte como siempre. Gerencia ve el informe en Reportes → Llamadas grabadas → «Setter».

**Cartera liberable**
- Un cliente **sin venta en 3 meses** es liberable, y la cartera se redistribuye cada 3 meses (gerencia, 23-09). Antes eran 6 meses.
- La pantalla «Cartera liberable» de gerencia solo señala qué se puede mover. **Moverlo lo decide gerencia, nunca es automático.**
- Anunciado el 01-10 y **no implementado**: el lead nuevo de campaña sería del comercial por 15 días, el cliente de compra continua por 6 meses y el que trae el propio comercial de forma permanente.

**Derivar no mueve la cartera**
- Ni una derivación a otro comercial ni una a postventa cambian al dueño de la ficha. Por qué: antes quien contestaba el teléfono cambiaba la cartera con un clic, sin saberlo.

**Un expediente por cliente y por comercial**
- Si el cliente vuelve a escribir y ya tiene un expediente abierto con ese comercial, se suma ahí («El cliente volvió a escribir por…»). Gerencia lo comparó con una historia clínica.
- **Desde el 16-10, también si estaba rechazado:** si ese comercial le cerró al cliente un expediente como rechazado en los últimos 30 días y Central se lo vuelve a derivar, se reabre ese mismo expediente en «Seguimiento», con una nota, en vez de abrir otro. Y si se envía una cotización desde un expediente rechazado, pasa solo a «Cotizada».
- Caso (Moisés, 16-10): un cliente rechazado el 15-10 volvió a escribir «Hola» al día siguiente y le salió dos veces en Oportunidades, uno «Asignada» y otro «Rechazada» con la cotización. Se unieron en uno solo.
- En postventa, un caso nuevo se suma al expediente de postventa del mismo cliente y del mismo tipo si sigue abierto y se movió en los últimos 30 días. Si no, abre uno propio. Nunca se funde con uno comercial.

**Pedir un expediente que es de otro** (botón «Pedir el expediente»)
- Lo usa quien atiende un expediente ajeno y tiene motivo para trabajarlo.
- Pide el código del supervisor y un motivo. Queda nota y se avisa al dueño anterior.
- **No mueve la cartera del cliente.**
- No sirve para expedientes con venta o cierre emitido; esos los mueve gerencia.

**Pedir el cliente para su cartera** (botón «Pedir este cliente para su cartera»)
- Cuando el RUC ya está en la cartera de otro.
- Pide código (lo dicta gerencia, así que gerencia decide en el momento) y motivo.
- Pasa la ficha con todos sus expedientes.
- **Las ventas viejas se quedan con quien las hizo**, porque afectan comisiones.
- No aplica a instituciones con sedes que comparten RUC.
- Quien pierde el cliente recibe aviso con el motivo.

**Expediente suyo, ficha en otra cartera (desde el 22-10)**
- Puede pasar que el expediente sea suyo y la ficha del cliente esté en la cartera de otro comercial. Pasa sobre todo con ventas e históricos de los Excel antiguos.
- Antes, la pantalla decía «Cuenta sin nombre». Ahora muestra el nombre y el RUC del cliente, y un recuadro: «La ficha de este cliente está en la cartera de …».
- Los contactos y el historial del cliente los ve quien tiene la ficha.
- Si la ficha tiene RUC o DNI, desde ese recuadro sale el botón «Es mi cliente — pedirlo para mi cartera». Si no tiene documento, el traspaso lo hace gerencia.
- En Hoy, la agenda y los cierres semanal y mensual, el cliente sale con su nombre y «ficha en cartera de …».

**Fichas duplicadas**
- **«Es un cliente que ya tenemos» / «Unir a esta ficha».** Une un contacto o prospecto a la ficha existente. Busca por nombre, RUC, correo o dominio del correo; el dominio solo sirve si no es un correo personal y apunta a una única ficha. La ficha conserva su comercial. Solo pide código si el contacto ya estaba derivado a otro comercial.
- **«¿Es el mismo cliente?»** El CRM sugiere fichas parecidas. Unir pide código de operaciones y nunca es automático.
- **«Unir con otra ficha».** Si el CRM no sugirió la pareja, el comercial la busca (nombre, RUC, celular o contacto) desde la ficha o el expediente y elige cuál queda como principal. Sin código si las dos fichas son de su cartera.
- **El que escribe ya es contacto de la ficha.** Desde el 20-10, si el celular y el nombre de la persona coinciden con un contacto de una ficha (aunque la razón social sea otra, como Dennis Gallardo en Lavanderías GLUP), el CRM lo une a esa ficha al derivar, en vez de abrir una nueva.
  - **Si las fichas son de carteras distintas, decide gerencia.**
  - Entre dos fichas con RUC (persona natural y empresa) se queda la de la empresa que factura.
- **Ficha «cascarón».** Los formularios de Google Ads solo traen nombre, teléfono y ciudad, y abren una ficha sin RUC. Si coinciden teléfono y correo, el CRM la reconoce como el mismo cliente.
- **Teléfono mal tipeado.** El CRM extrae el celular aunque haya dígitos de más o dos números juntos.
- **Si el RUC y el teléfono apuntan a fichas distintas**, el diálogo de asignar avisa en ámbar.
- **«No me aparece el seguimiento».** Casi siempre está en otra ficha del mismo cliente (nombre comercial o razón social, o una ficha sin RUC). Busque por RUC y por parte del nombre.

**Grupo económico y sedes**
- **Mismo cliente con otra razón social:** no se fusiona. Va como ficha aparte enlazada a la ficha madre (grupo económico); la cotización imprime el RUC de la ficha.
- Si el cliente pide cotizar con otro RUC de su grupo: en el cotizador, «A nombre de» → «Otra empresa del grupo». La empresa hija queda en la cartera del mismo comercial.
- **Sedes de un mismo RUC:** solo ESSALUD, Marina de Guerra y MINSA funcionan como «institución madre + sedes». Central elige la sede o crea «Otra sede (nueva)», y cada sede puede tener otro dueño. Para cualquier otra empresa el RUC es único. Agregar una institución a esta lista lo decide gerencia.

**Historial y gestiones**
- **Historia archivada.** Un expediente nuevo muestra su propia historia. Arriba aparece el recuadro gris «Así se quedó», con lo último de los expedientes históricos. Lo histórico se consulta y **no cuenta como trabajo**.
- **Gestión en otra ficha.** Si el cliente fue atendido en otra ficha, no se acusa a nadie de «sin gestión»: la ficha dice dónde está la atención. Las notas del sistema y las gestiones importadas del Excel no cuentan como contacto.
- **«La base del Excel».** Al pie de «Mi día» están las oportunidades importadas que nadie ha tocado, con el botón **«Retomar»**. Retomar no es lo mismo que «Potencial».

**Rubros y códigos de comercial**
- **Rubros:** cualquiera puede cambiar el rubro de un cliente («Cambiar rubro»). **Solo operaciones, gerencia y administración crean rubros nuevos** (desde el 04-09: «nos van a llenar de 30 rubros»).
- **Los códigos C1–C10 son posiciones, no personas.** Al irse alguien, el código queda libre. El código anterior de una persona se muestra como «antes Cx». Un comercial nuevo reutiliza la posición, que ya trae su cartera.

### 3.2 Gestión comercial, metas y reportes

**Etapas e interés de compra**
- **Etapas:** Asignada → Filtrada → Cotizada → Seguimiento → Potencial → Venta / Rechazada.
  - «Cotizada» la pone el cotizador.
  - «Venta» solo nace de «Registrar venta» o «Venta ejecutada», nunca a mano. Así se protegen las cifras y la última venta del cliente, que alimenta la regla de cartera.
  - **«Registrar venta» no tiene botón para deshacerse** (22-10, caso de Brenda). Si se pulsó por error, avise de inmediato a Santos o a gerencia: la venta se anula (queda en gris como «Venta anulada») y la cotización vuelve a quedar lista. No registre otra venta encima.
  - **«Potencial» significa «lo que voy a cerrar esta semana».**
- **Rechazar exige motivo.** «Busca lavadora doméstica (no industrial)» es un motivo propio: no es spam, porque el motivo se informa a Google y Meta y sirve para afinar los anuncios. «Compra a futuro» va antes que el rechazo.
- **Salidas que no son pérdida:** «Ya no es mío — pasó a otra área» y «Duplicado o ya no corresponde — archivar».
- **Interés de compra, 5 niveles:**
  - **Alto potencial:** espera la OC o el depósito, o ya hace planos.
  - **Medio-alto:** tiene local o fecha.
  - **Medio:** busca ubicación.
  - **Medio-bajo:** busca financiamiento.
  - **Bajo:** «quiero saber».
  - Al marcar «Interesado», el CRM pide calificar en el mismo clic, porque «interesado» no dice qué nivel es.
- **«Corresponde cerrar»:** un prospecto sin respuesta en 1 mes, o una cotización sin respuesta en 3 meses, aparece en «Mi día» para que la persona decida. **El CRM no lo cierra solo.**

**Seguimiento cuando el cliente cotiza con la competencia** (Carlos, 15-10)
- Si el cliente dice «estoy cotizando con la competencia, llámame el día 10», **no se espera al 10**: se le llama antes (el 6, el 7, el 8), con respeto y sin acosar. Esperar la fecha que dio es perder la venta: muchas veces compra antes.
- Carlos: «si no eres agresivo en la parte comercial, vamos a tener un problema». La regla general: si dice «llámame el próximo año», se le llama este año.
- Caso: una venta se perdió con la competencia porque el comercial esperó la fecha que el cliente le dio.

**Tarea de la agenda de un cliente ya atendido en otro expediente** (desde el 15-10)
- Si en la agenda se abre una tarea de un cliente que ya se cerró o se siguió atendiendo en otro expediente suyo, sale un aviso ámbar con la fecha del cierre y la última gestión de allá, y el botón «Archivar esta ficha», que la quita del calendario en el momento (no cuenta como perdida). El mismo aviso sale en el expediente.
- Si la tarea vencida es justo la del cliente sin interés, se registra la gestión desde esa misma tarjeta de la agenda con «Sin interés» y el motivo, y se cierra ahí.
- Caso (Moisés, 15-10): «Registrar seguimiento» abrió un expediente nuevo, pero sus gestiones de «Sin interés» quedaron en el expediente ya rechazado; el nuevo seguía vacío y salía vencido en su agenda.

**Qué cuenta como gestión**
- Cuentan como contacto real: llamada, correo, visita y videollamada.
- **Desde el 30-09, la gestión por WhatsApp no suma a la meta de gestiones** porque inflaba el indicador. Se cuenta aparte.
- Visitas y videollamadas son indicadores propios.
- Un **seguimiento efectivo** es un contacto con resultado distinto de «No contestó».
- La meta diaria de seguimientos efectivos la fija gerencia en «Metas». La propuesta nueva de metas sigue pendiente de aprobación.

**Agregar una imagen a una gestión ya registrada** (desde el 21-10)
- En «Historial de este expediente», al lado del resultado de cada gestión hay un botón **«+»** (ícono de imagen). Abre un cuadro donde se **pega una captura con Ctrl+V**, se arrastra o se sube la foto, el PDF o el video.
- Sirve para completar lo que ya se anotó (la foto de la placa que el cliente mandó después, el pantallazo del chat). **No registra una gestión nueva** ni cambia la nota, el resultado ni la fecha: no cuenta como contacto.
- Lo ven el dueño del expediente y gerencia. También puede agregarlas quien registró esa gestión.
- Cada imagen agregada después queda marcada «+ después» en la miniatura y, al pasar el mouse, dice quién la agregó y cuándo.
- Las fotos pesadas se achican solas antes de subir. Hasta 5 archivos por vez y 10 por gestión.

**Reportes del comercial**
- **Reporte diario:** queda grabado en el CRM. Gerencia ve en «Cierre del día» quién no cerró su día.
- **Cierre semanal** (en «Mi agenda»):
  - el sábado, desde el mediodía, el botón se pone granate;
  - muestra proyectado contra vendido;
  - pide «¿Qué vas a hacer para mejorar tus ventas?» y «¿Qué necesitas?»;
  - al declararlo queda congelado como histórico.

### 3.3 Cotizaciones

**Número, serie y empresa**
- **Borrador sin número.** La cotización nace como borrador con el primer equipo y se guarda sola. El número se asigna al **«Confirmar cotización»**, y solo si no necesita aprobación o ya la tiene. Pedir aprobación nunca gasta número. Por qué: antes se asignaba al crear y se perdían números.
- **Correlativo:** Presu_####-AA. Hay una serie anual por empresa (EFAMEINSA y OPEN), que reinicia en enero. Es de la empresa, no del comercial: por eso un comercial ve «saltos» entre sus números. Comerciales y postventa comparten la serie.
- **Qué empresa usar:** **Open Investments es la primera opción** (gerencia, 23-09). Los clientes nuevos van con OPEN. Para elegir EFAMEINSA, el CRM pide un motivo. Si un cliente antiguo insiste en EFAMEINSA, se acepta como excepción.
- **Emitida = inmutable.** Para cambiarla hay que corregirla con código o duplicarla. «Duplicar» crea una cotización nueva con número nuevo.

**Precios**
- **No hay un porcentaje de descuento libre ni un piso fijo.** Todo lo que quede bajo el precio de lista va a gerencia.
- **Descuento al final del total** (desde el 16-10, lo pidió gerencia por medio de Katerine): debajo del total, «+ Agregar descuento o paquete especial». Se elige «Descuento» o «Descuento por paquete especial», se escribe el monto en la moneda de la cotización y se marca «incluye IGV» si se negoció con IGV. En el PDF sale debajo del SUB TOTAL, luego «SUB TOTAL CON DESCUENTO», el IGV y el TOTAL. Sirve para cerrar un paquete en una cifra sin tocar el precio de cada equipo. **Todo descuento pasa por gerencia** antes de confirmar; si ya se aprobó y no se cambia, no se vuelve a pedir.
- Antes de cotizar:
  - a un cliente nuevo, se miran costo y margen;
  - a un cliente existente, su historial y los presupuestos anteriores del mismo equipo, para no dar precios distintos sin razón.
- **Los servicios que se renuevan cada año suben como mínimo un 10 %** sobre el año anterior, salvo una justificación aprobada.
- **Los repuestos no tienen precio mínimo:** se considera antigüedad, stock, importación, costo, historial y margen.
- **Precio de referencia congelado:** cada renglón guarda el precio de lista del día en que se agregó. Una cotización emitida nunca se vuelve a medir contra la lista. Si Lesly corrige un precio, solo se vuelven a medir los borradores.
- **Catálogo:** lo gestiona Lesly dentro del CRM (desde el 10-09). Si un Word viejo y el CRM difieren, **manda el CRM**. Nunca se elige la cifra más baja. El stock del buscador se actualiza cada semana con el Excel de Importaciones; «stock s/d» significa que no hay dato. Desde el 21-10 Lesly sube ese Excel en «Stock y códigos» y el stock pasa a contarse por serie («en almacén»).

**IGV y moneda**
- **IGV:** los montos se guardan sin IGV y el PDF suma el 18 %. Los servicios del catálogo se cargan sin IGV.
- **Check «incluye IGV» por renglón:** solo al final, cuando la venta ya se cerró en una cifra redonda (gerencia: «cotizar neto como siempre»).
- **Moneda:** el CRM guarda en dólares y puede cotizar en soles; lo escrito en soles se respeta tal cual. El tipo de cambio lo fija gerencia, no el comercial. El cierre hereda la moneda de la cotización, y corregir un cierre no cambia su moneda. **Todo se vende en dólares**, salvo que la venta haya empezado en soles; si el cliente paga en soles con el tipo de cambio de la empresa, el cierre sigue en dólares (Carlos, 15-10, caso del consorcio del Portal Marqués).
- **Forma de pago:** se elige de una lista y trae su saldo (por ejemplo, Contado = 100 %). Si la forma y el saldo se contradicen, sale un aviso ámbar.

**Líneas y contenido del PDF**
- **Línea escrita a mano:**
  - se usa para lo que no está en el catálogo, y debe tener descripción;
  - **con precio mayor que cero, en cotizaciones de comerciales, pide aprobación de gerencia** (desde el 12-10);
  - en cero (bonos, instalación gratuita) no pide nada.
  - Por qué: no tiene lista con qué compararse y salía «auto aprobada». Gerencia rechazó la alternativa de avisar después de confirmar: siempre aprobación previa.
- **Kit:** solo se editan las cantidades de sus componentes. El cambio va a gerencia sin código y no crea un producto nuevo.
- **Ficha técnica en la cotización:** formato fijo, tal cual la ficha del catálogo. El comercial no agrega fotos ni resaltados en el CRM; si quiere destacar algo, lo manda aparte.
- **Postventa en su cotización:**
  - «Editar nombre» del renglón y «Detalle» bajo el renglón (por ejemplo, la serie de la máquina a la que va el repuesto);
  - «Nota del PDF», editable solo en borrador;
  - «Sin garantía» no se imprime.
- **Cuentas bancarias:** desde el 14-10, el PDF de EFAMEINSA también imprime sus cuentas bancarias (antes solo OPEN).

**Corregir una cotización numerada** (botón «Corregir esta cotización»)
- Corrige quien la hizo (en postventa, cualquiera del área).
- Primero escribe el motivo (15 caracteres como mínimo) y después pide el código de operaciones o gerencia. El código abre una ventana de unos 30 minutos.
- **Se conservan** el número, la serie, el cliente y la fecha. La versión anterior queda archivada.
- **El PDF dice «v2», «v3»…** (gerencia, 23-09), y toda corrección debe estar sustentada.
- Por qué existe: ese número ya lo tiene el cliente o el banco, por ejemplo en un leasing.
- **Frenos:**
  - si tiene un cierre emitido vivo, primero se anula el cierre;
  - no se puede ahondar un descuento.
- **Defecto conocido (12-10):** la pantalla de corrección apaga «Guardar» si algún precio está bajo lista, aunque gerencia ya lo haya aprobado. Si le pasa, repórtelo por el buzón.

**Anular una cotización** (botón «Anular cotización», desde el 10-10)
- Pide motivo (15 caracteres como mínimo) y código de operaciones o gerencia.
- No se puede si la cotización no es suya, si es un borrador, si ya está anulada o si tiene un cierre emitido o una venta vivos.
- La anulada queda tachada, con su motivo, y no cuenta en ninguna cifra. Central la ve «Anulada».
- Por qué: los números no se borran ni se rellenan. Marcarla «perdida» o «vencida» mentiría en los reportes.

**Otras reglas**
- **Venta parcial:** el CRM no hace cierres parciales. **La venta se registra por lo que dice el informe de cierre**, no por el total cotizado. Lo recomendado es duplicar la cotización con solo lo vendido.
- **Estados que verá:**
  - de envío: Borrador, Confirmada, Aceptada, Perdida, Vencida, Anulada. Central y gerencia dicen «Enviada al cliente» donde el comercial ve «Confirmada»;
  - de aprobación: Aprobada, Espera a gerencia, Aprobada por gerencia, Rechazada, más la marca «observada».

### 3.4 Aprobación de gerencia

- **Qué ve gerencia en Aprobaciones:** quién creó la cotización, las gestiones de ese expediente y, desde el 05-10, las del mismo cliente en otros expedientes de los últimos 90 días. Por qué: una vez se rechazó por «no hay gestión» cuando la llamada estaba en otro expediente.
- **Lo que puede hacer gerencia:**
  - **«Aprobar».**
  - **«Observar sin rechazar»** (desde el 07-10): la cotización sigue editable. El autor corrige y responde, y vuelve a gerencia.
  - **«Revisar renglón por renglón»** (desde el 13-10): cada renglón se aprueba o se marca «Corregir» con un comentario, y luego «Devolver para corregir». **El borrador no se borra.** Los renglones aprobados siguen aprobados si no se tocan. El autor ve tarjetas rojas «Corregir: <equipo>», corrige y responde.
  - **«Rechazar la cotización entera»:** queda como histórico y hay que hacer otra. Antes del 13-10 esta era la única opción; ahora es la excepción.
- **La aprobación sobrevive a la edición:** queda pegada al par equipo + precio. Si se cambia el precio, se vuelve a pedir.
- **El autor se entera por la campana**, con la nota de gerencia. Postventa ve en «Mis cotizaciones» la sección «Lo que pasó por gerencia» (últimos 60 días).
- **Postventa en capacitación:** Aprobaciones muestra «Postventa en capacitación · N de M por aprobar». No hay fecha de fin.

### 3.5 Cierres (informe de cierre de venta)

**Qué es y cómo se arma**
- **Qué es:** el documento con lo que la empresa necesita para **ejecutar** la venta: qué se vende, a quién se factura, dirección y transporte, quién recibe, condición de pago y observaciones. La cotización es lo que se ofrece; el cierre es lo que se ejecuta. Su formato es fijo porque Central busca cada dato siempre en el mismo sitio.
- **Borrador sin número.** «Guardar borrador» se puede editar sin código. **«Emitir»** asigna el correlativo una sola vez. Hasta entonces, el PDF dice BORRADOR.
- **Numeración:** NNN-AAAA, una serie anual por empresa (EFAMEINSA y OPEN). Lo emitido no se renumera. Lo anulado conserva su número. Puede haber números reservados (por ejemplo, para cierres antiguos en Word de postventa); quien emite no tiene que hacer nada especial con ellos.
- **Cada renglón tiene tipo** (equipo, repuesto o servicio). Se puede «Pegar una lista» desde Excel. **Las líneas de servicio no piden serie.** Un mantenimiento genera un pedido de tipo mantenimiento.
- **«Se le factura a»** se edita en su propio cuadro, solo para ese documento; no cambia la ficha. Avisa si el RUC es distinto.
- **Cliente antiguo o nuevo (desde el 19-10):** está a la vista dentro de «Se le factura a», con dos pastillas «Antiguo» y «Nuevo», sin tener que pulsar «Editar». El CRM propone **antiguo** si el cliente ya nos compró, tiene equipos o servicios de postventa, **o viene de un expediente antiguo** (de los Excel de seguimiento anteriores al CRM); si no, propone nuevo. El comercial tiene la última palabra. En un cierre ya emitido se cambia con la corrección (código de Central): en la vista del cierre, «Editar» muestra las mismas pastillas.
- **Correo del cliente y N.º de operación (desde el 15-10, pedido de Gabriela):** dentro de «Se le factura a» está el correo del cliente a la vista («Editar» para escribirlo o cambiarlo; si falta, sale un aviso). Debajo de «Forma de pago» hay un campo «N.º de operación»: si el cliente ya pagó, se escribe el número del voucher; si todavía no paga, se deja vacío. Los dos datos salen en el cierre, en su PDF y en el «Expediente» que abren Finanzas y Facturación, listos para copiar. En un cierre ya emitido se agregan con la corrección (código de Central).
- **Condición de pago obligatoria:** porcentaje antes del despacho y días de crédito. Las pastillas Contado, Crédito y 50 % adelanto la proponen. La política general de la empresa es un adelanto más el saldo antes del despacho, aunque la venta a crédito es normal en la casa. **Ese porcentaje es lo que postventa mira para despachar.** Si la forma de pago escrita describe un adelanto con saldo posterior («20 % adelanto, 80 % a fin de mes») y el porcentaje dice 100, el formulario avisa en ámbar (desde el 15-10): si el equipo sale con el adelanto, hay que poner ese porcentaje y los días del saldo; si sale recién con todo pagado, se deja en 100.
- **Quién recibe (desde el 16-10):** se elige un contacto de la ficha u «Otra persona…» con nombre, DNI/CE y teléfono. Con «+ Agregar otra persona que puede recibir» se suman más personas autorizadas a recibir el despacho (hasta 10). Salen como «También recibe» en el cierre, en su PDF y en la hoja del pedido, y quedan guardadas como contactos del cliente para la próxima entrega. En un cierre ya emitido se agregan con la corrección.
- **Documentos:** voucher(s), OC y otros acuerdos. Si se eligió «¿De qué presupuesto copio los equipos?», la cotización enlazada ya cuenta como documento y no hace falta adjuntarla.
- **Al emitir, el cierre se ata a su venta.** La venta se registra sin IGV y con el importe del cierre. Si el cierre llega después, la venta se corrige y la diferencia queda anotada.

**Después de emitido**
- **Emitido = sellado.** Agregar documentos o corregir pide motivo y **código de Central** (ventana de unos 30 minutos). Al personal se le dice solo eso: el código se le pide a Central. Desde el 15-10; antes era el de operaciones (Lesly) o gerencia. Carlos lo cambió por el caso NEWREST: Central es quien ejecuta el cierre, así que cualquier cambio pasa por ella. Central no se autoriza a sí misma una corrección. Para agregar un documento (por ejemplo, el voucher que llega tarde), Central sí puede usar el suyo. Se crea una versión nueva, la anterior se archiva y se recalcula la venta. No cambian ni el número, ni la serie, ni la fecha, ni el cliente, ni la moneda.
- **Quién se entera de una corrección (desde el 15-10):** nadie tiene que avisar a mano.
  - **Central siempre** (salvo que la corrección la haya hecho Central), porque Central ejecuta el cierre. El aviso en la campana dice quién corrigió, con el código de quién, el motivo y **qué campos cambiaron**, y si el pedido ya existe, con qué versión se generó.
  - **Quien emitió el cierre**, si lo corrigió otro (Central, operaciones o gerencia).
  - **Si el pedido ya existe, los que lo trabajan, solo según lo que cambió:** Finanzas y Facturación cuando cambia razón social, RUC, dirección fiscal, equipos o importe, pago, comprobante, orden de compra o condiciones; postventa cuando el pedido ya está liberado y cambia cliente, equipos, entrega, quién recibe, lo que incluye, garantía o urgencia; almacén cuando ya se pidieron las series y cambian los equipos, lo que incluye o lo gratuito.
  - **El pedido no cambia solo.** Los equipos del pedido se copian del cierre al generarlo; si la corrección toca equipos, entrega o cliente, Central compara el pedido con la versión vigente y ajusta lo que haga falta. En «Cierres de venta» el cierre corregido lleva la marca «v2 · corregido el…».
  - Antes del 15-10 no había aviso: el único existía cuando Central había devuelto el cierre y el comercial respondía «ya lo corregí». Caso que lo originó: OPEN 057-2026 (NEWREST), corregido con el pedido ya en postventa.
- **Devolución de Central:** el cierre aparece arriba en «Mis cierres» del comercial, con el motivo. El comercial corrige y responde «ya lo corregí». Cada vuelta queda registrada.

**Anular un cierre**
- El comercial **pide la anulación** desde la vista de su cierre, con motivo. Llega a operaciones y gerencia, y en Central aparece arriba en un recuadro amarillo.
- **Operaciones, Central, gerencia o quien emitió el cierre anulan con código** (el de operaciones o gerencia). Desde el 14-10, quien emitió el cierre ve «Anular con código» junto a «Pedir anulación»; antes solo podía pedirla.
- **Qué pasa al anular:**
  - la venta cae y el pedido se cierra solo;
  - si era un duplicado, la venta pasa al cierre que lo reemplaza;
  - el comercial recibe aviso con el motivo;
  - si no lo anuló Central, Central recibe aviso con quién lo anuló y el motivo; Finanzas también, si ya tenía el pedido;
  - el cierre queda en la pestaña «Anulados» de Cierres de venta, con su motivo;
  - después se rehace lo que corresponda (cotización y cierre nuevos, con aprobación si baja de lista).
- Gerencia: «no se anuló una venta, se anuló un papel».

**Cierres REG (regularizados), desde el 05-10**
- Son cierres hechos en Word **antes** de que existiera el CRM.
- Se suben con el **correlativo siguiente** de la serie del CRM (no con su número de Word), marcados «REG».
- **No suman a la venta** (la venta ya está registrada desde el Excel maestro) ni cuentan en la supervisión.
- Pasan por todo el circuito desde Central, para que postventa tenga la realidad completa. **Central escribe las series ella misma** («Las escribo yo»), porque el almacén ya entregó. No se puede generar un pedido REG con filas de equipo sin serie.
- El pedido REG nace con los pasos previos marcados como hechos en la fecha de entrega.
- **REG «por entregar» (desde el 14-10):** para una venta anterior al CRM cuyo equipo **sigue en el almacén** (por ejemplo, se entrega cuando el cliente termine de pagar). Central lo ve como «REG · por entregar»: no nace con los pasos dados por hechos, sigue el circuito normal (pedir series al almacén, visto bueno y pagos de Finanzas, apertura, guía y salida) y no exige series para generar el pedido. Regla práctica: si el equipo ya salió, REG normal; si sigue en almacén, REG por entregar. Caso: Seventh Heaven.
- Central los ve en la pestaña «Regularizados (REG)».
- **Un Word hecho después del CRM no es REG.** Se carga como cierre normal, con sus documentos adjuntos antes de emitir, y sigue el circuito normal. Un repuesto aún no entregado tampoco es REG.

**Ventas antiguas sin cierre**
- Para traer una venta antigua al circuito se usa «Traer a preparación» desde la ficha, o se crea su cierre en el CRM enlazado a la venta existente, a nombre de quien vendió.
- Si el equipo ya se entregó, hay que confirmarlo con postventa u operaciones antes de mover nada en almacén.

### 3.6 Pedidos, pagos, crédito y letras

**Número y tipos de pedido**
- **Número:** PED-NNNN-AAAA. Lo genera Central.
- **Tipos y recorrido:** equipo; repuesto (entrega en planta, por agencia o en el local del cliente, con o sin instalación); accesorio (coches y carros, sin instalación); embalaje; mantenimiento preventivo o correctivo; servicio de revisión.
- **Si un pedido pide pasos que no le tocan, casi siempre el tipo está mal puesto.** Se corrige con el selector de tipo del pedido.

**Filas, series y stock**
- **Una fila por máquina, con su serie.** Si un renglón trae varias series, se separa en filas.
- **Los equipos regalados también piden serie** (desde el 15-10). Todo equipo que se entrega, aunque venga en un bloque gratuito del cierre (por ejemplo una plancha de regalo), lleva su fila y pide su serie al almacén. Los servicios sin costo siguen sin pedir serie.
- En un repuesto, la «SERIE:» del renglón es la de la máquina a la que va la pieza. Central debe pulsar «Pedir al almacén».
- **Hojas impresas «Solicitud de código» y «Respuesta del almacén» con cantidad** (desde el 16-10, a pedido de Lesly). Las unidades iguales (mismo artículo, mismo código sin serie, o todas pendientes, misma procedencia y stock) salen en una sola fila con la columna «Cant.», y el N.º muestra el rango (por ejemplo «7–10» para 4 niples). Los equipos con serie de placa siguen saliendo uno por fila, porque cada serie es una máquina.
- **Pedido de producto o de servicio** (desde el 21-10, Santos). Al preparar el pedido (paso 1), Central elige: **Producto** —equipo, repuesto o accesorio— pide el código al almacén («Pedir series al almacén»); **Servicio** —mantenimiento, revisión, embalaje— no pide código y el almacén no interviene. La opción «Servicio» viene marcada cuando las líneas del cierre son servicios. «Armar el detalle del servicio» trae las líneas del cierre (o, si el cierre no las tiene, de la cotización) al cuadro **«Detalle del servicio»**: N.º, descripción, cantidad, serie del equipo atendido y precio (opcional). Cada casilla se corrige escribiendo encima; «Agregar línea», el tacho para quitar y «Guardar cambios» guardan todo de una vez (si queda algo sin guardar, se avisa). Se puede hasta que el pedido salga, y queda en las observaciones del pedido. La hoja impresa del pedido muestra ese cuadro.
- **Central arma o corrige la lista «Equipos y series» del pedido** (desde el 21-10, a pedido de Central con el pedido de FAMILY FARMS). Un cierre que solo trae servicios (por ejemplo, mantenimientos preventivos) no arma filas solo. En «Cierres de venta», dentro de «Equipos de este pedido», Central puede: **«Traer las líneas del cierre»** (una fila por unidad, con la serie que venga escrita en el texto y enganchada a la máquina del cliente si ya está registrada), **«+ Agregar equipo o trabajo»** (texto y, si la tiene, serie), y en cada fila **«Corregir el texto»** o **«Quitar del pedido»**. Se puede mientras el pedido no haya salido y la fila no esté probada ni tenga archivos del almacén. Una serie ya puesta se sigue cambiando con «Corregir serie» y el código de operaciones. Todo queda en las observaciones del pedido con quién y cuándo. La hoja impresa del pedido muestra además el trabajo del cierre en «Trabajo y otros conceptos del cierre».
- **«No corresponde: es un servicio, no lleva código ni serie»** (desde el 16-10, a pedido de Lesly). Si un servicio (por ejemplo una instalación) llegó a la lista de equipos del pedido como si fuera una máquina, pidiendo serie, prueba y fotos, el almacén, postventa o Central lo quitan con ese botón en su fila. Los renglones que empiezan con «SERVICIO» salen resaltados en ámbar. Se puede mientras la fila no tenga serie real, no esté probada ni tenga archivos, y no sea lo único del pedido (en ese caso se avisa a Central para que revise el cierre). En las observaciones del pedido queda escrito qué se quitó, quién y cuándo. Ya no hace falta ponerle un código de relleno como «NO LLEVA CÓDIGO».
- **«No va en este despacho»** marca un despacho parcial.
- **Otro circuito para el equipo que no salió** (desde 15-10). Si un pedido con varios equipos ya salió y uno se quedó (por ejemplo la secadora que llegó después), postventa abre «Equipos de este pedido» → «¿Algún equipo no salió en este despacho? Abrirle su propio circuito», marca el equipo y escribe el motivo. Nace un pedido nuevo del mismo cierre: el pago confirmado por Finanzas, la aprobación, la condición de pago y el plano ya vienen hechos; empieza de nuevo en prueba y embalaje (se le solicita al almacén), dirección verificada, apertura, despacho, puesta en marcha y cierre. El equipo se muda al pedido nuevo (no queda en los dos) y el pedido nuevo no lleva monto: la venta se cuenta una sola vez, en el pedido original. Cada pedido enlaza al otro en su cabecera. Antes del despacho también sirve para lo marcado «No va en este despacho».
- **Sin stock:** una fila sin serie o con código pero sin mercadería se marca «Sin stock» con motivo (importación, compra local o fabricación). Se limpia sola cuando se registra la serie real.
- Las series escritas como «NO HAY STOCK» o «PENDIENTE» son un truco viejo que ya no se usa.

**Condición de pago y saldo**
- **La condición de pago manda en el despacho.** Se compara lo pagado con lo acordado antes del despacho, no con el total. Solo se pide «quién autorizó y por qué» si entró menos de lo acordado.
- Gerencia, operaciones y administración pueden definir la condición de pago de un pedido.
- **Salir con saldo pendiente** pide código. Desde el 14-10, postventa también necesita código; ya no basta un motivo.
- **Un pago confirmado puede ser parcial, y se ve en ámbar (desde el 15-10).** Finanzas confirma cada abono que entra, no «que ya pagó todo». Si lo confirmado no llega a lo acordado antes del despacho (el 100 % si es contado, o el adelanto pactado), el pedido no lo muestra en verde: el paso de pago dice «Pago parcial: Finanzas confirmó solo un adelanto, falta el saldo», arriba del pedido sale un anuncio ámbar con cuánto pagó y cuánto falta (sin cifras para quien no ve montos), y en el control de pedidos y la bandeja aparece «Pago parcial». Postventa no hace la apertura hasta que Finanzas confirme lo que falta o gerencia u operaciones autoricen la salida con código. **Para revisar todos de una vez:** Control de pedidos → «Por paso» → filtro «Pago parcial (N)»; ahí está el botón que arma la hoja «Clientes con pago parcial» para imprimir o guardar en PDF y mandar a gerencia (es el «reporte de despachos» que pidió Carlos el 15-10). Caso que lo originó: Wong Lu Vega (pagó el 20 % y el pedido se leía como pagado); ese día había seis pedidos abiertos igual.

**Visto bueno de Finanzas para ventas a crédito** (desde el 14-10)
- **Cuándo se necesita:** toda **venta** (no los servicios ni los casos) en la que:
  - el pago antes del despacho sea menor al 100 %; o
  - la forma de pago sea letras, crédito, financiamiento o a plazo («factura a 30 días»); o
  - el abono esté a crédito o sin confirmar.
- **Qué frena mientras no esté:** la apertura del despacho, la autorización de la guía y la salida del almacén.
- **Qué indica Finanzas:** el estado de las letras: «No lleva letras», «Las letras van con el equipo», «El cliente tiene las letras, falta que las firme» o «Letras firmadas». También la cantidad y la comisión interplaza o bancaria, si la hubo.
- **Salida de emergencia:** el código de gerencia u operaciones, que queda registrado como «Salida autorizada con código, sin visto bueno de Finanzas».
- **Por qué:** un equipo salió a crédito sin sus letras porque el Excel decía «SI» al adelanto y el CRM lo leyó como pagado completo.

**Sin pago confirmado no hay apertura, y nadie despacha sin coordinar** (Carlos, 15-10)
- **La apertura de servicio es la orden de despacho.** El almacén despacha lo que dice la apertura y no mira condiciones de pago. Por eso **postventa no hace la apertura si el pedido no está pagado o validado por Finanzas.** El CRM ya lo frena (visto bueno de Finanzas y saldo con código, desde el 14-10).
- **Antes de que salga un equipo, postventa coordina dos veces** («triangulación doble»):
  1. con **Finanzas**: «¿ya tienes las letras? el cliente recoge mañana a las 8»;
  2. con el **almacén**: «coordina conmigo, no con Finanzas: no despachas nada hasta que yo te diga que están las letras».
- El almacén no tiene lazo directo con Finanzas: su contacto es postventa.
- **La letra es dinero.** En condiciones normales se entrega la letra, el cliente la firma y recién se despacha. Con un cliente grande y confiable, gerencia puede acordar que las letras viajen con el chofer; eso se coordina por correo con postventa antes.
- Caso: COFACO (14-10). El comercial avisó por correo que las letras iban con el transportista, pero postventa no estaba, el almacén despachó y Finanzas todavía estaba haciendo las letras. Fallaron postventa, el almacén y Finanzas a la vez.

**Letras que viajan con el equipo** (desde el 14-10)
1. El almacén marca «recibí las letras». Sin eso, no sale.
2. Al entregarlas, **Finanzas** registra «letras entregadas», con fotos y con quién las recibió (desde el 21-10; antes también podían almacén y postventa). Se avisa a postventa.
3. **Sin letras entregadas no hay «Despacho verificado»**, y el código no lo salta.
4. Finanzas marca «firmadas» cuando vuelven.

**Orden a Finanzas para facturar y cobrar** (desde el 13-10)
- Es el último paso antes de «Pedido cerrado» cuando se ejecutó sin cobrar el 100 %.
- La da postventa. Avisa a Finanzas y Facturación por campana y por correo.
- **Cuándo darla en una venta a crédito** (Contabilidad, 14-10): cuando el cliente confirme que el equipo llegó, está instalado y conforme. Los días de crédito corren desde la factura; si se factura con el equipo todavía en tránsito a provincia, el cliente reclama con razón.
- Por qué: «el 99 % me paga primero; el 1 % voy, viajo, invierto y luego te cobro».

**Otras reglas del pedido**
- **Urgencias y apuros:**
  - «Urgencia a Finanzas» pone el pedido primero y en rojo en «Pagos por confirmar»;
  - desde el segundo aviso por el mismo pedido, gerencia se entera.
- **Empresa del documento:** los documentos de un pedido salen con la empresa de su cierre. Sin cierre, con la empresa anotada en la apertura, y si no hay nada, EFAMEINSA. Si un informe sale con el membrete equivocado, revise si el pedido tiene cierre o empresa anotada.
- **Documentos en cada paso:** en el pedido, cada paso muestra sus documentos (pago, cierre, protocolo, apertura, guía, fotos, informes) a un clic.
- **«Abiertos / Todos»:** Control de pedidos abre en «Abiertos». Los pedidos viejos del Excel sin movimiento («historia del Excel») no suman. Vuelven a «Abiertos» si alguien les marca un paso.

### 3.7 Almacén: series, protocolo y «Probada y embalada»

- **Un protocolo por máquina**, no uno por pedido.
- **«Probada y embalada» exige, por cada máquina de la unidad** (incluida la secadora de una torre):
  - al menos una foto;
  - la ficha (modelo de la placa, serie, técnico);
  - en la hoja de chequeo, si hay plantilla, al menos una casilla marcada (desde el 14-10 no se exigen todas: se marca solo lo que corresponde).
- **El N.º de protocolo lo pone el CRM, correlativo** (desde el 20-10, pedido de Lesly). No se escribe: sale al marcar «Probada y embalada» (o «Protocolo terminado» en un equipo en stock), con el formato 0003-2026, 0004-2026…, y vuelve a 0001 cada año. Aparece en el pedido y en el informe de prueba y embalaje. La secadora de una torre lleva el número de su lavadora; un kit de repuestos, uno solo; el equipo que viene con protocolo de stock conserva el suyo. Los protocolos marcados antes no cambian. Antes era una casilla opcional (Santos, 14-10).
- **Excepciones:**
  - **Ninguna máquina exige PDF ni Word** (desde el 21-10, pedido de Lesly): todo el protocolo se hace en el CRM —fotos, ficha y, si hay plantilla, la hoja de chequeo— y el informe de prueba y embalaje lo genera el sistema. Se puede adjuntar un Word si se quiere, pero no frena. Vale igual en la cuenta de almacén y en la de operaciones. Antes solo se había quitado a las máquinas con hoja (lavadora, secadora, desmanchadora, prensa, rodillo y calderín, 13-10); las demás (centrífuga, ablandador…) lo seguían pidiendo.
  - El repuesto solo pide protocolo, foto y técnico.
  - **Un accesorio que acompaña a la máquina principal del mismo pedido** (la plancha vaporizante del calderín, un kit de mangueras, una base) **solo pide sus fotos** (desde el 21-10, buzón del almacén, caso VITALIAN): no pide ficha ni hoja de chequeo; si la tiene, la hoja queda en el informe pero no frena. Si el producto va solo en un pedido, se prueba como una máquina.
  - **Una fila de SERVICIO** (embalaje, transporte, instalación…: el renglón empieza con «SERVICIO» y no es una máquina) se mide como un repuesto: bastan las fotos y el técnico; no pide Word ni PDF, modelo, serie ni hoja de chequeo, porque el informe de prueba y embalaje lo genera el sistema con las fotos. Se puede adjuntar un Word si se quiere (desde el 17-10, buzón de Lesly, caso ABACHI).
- **Pedido de repuestos con varias piezas = un KIT, un solo protocolo** (desde el 16-10, a pedido de Ariana, con el kit de instalación a gas de LINO ESPIRITU). En el pedido del almacén sale el bloque **«Protocolo del kit completo»**: se suben una vez las fotos del kit armado (video y PDF opcionales), el técnico y la fecha, y **«Kit completo probado y embalado»** marca todas las piezas que van en el despacho. Las filas de las piezas ya no piden fotos una por una; las fotos que ya se habían subido pieza por pieza también cuentan. El informe de prueba y embalaje sale en **una sola hoja**: «INFORME DE PROTOCOLO DE PRUEBA DE KIT DE REPUESTOS» (el nombre del kit se cambia en «Completar o corregir los datos de esta hoja»), con la tabla de piezas, su código y su cantidad, y todas las fotos juntas.
- **Hojas de chequeo** (lavadora desde el 13-10; secadora, desmanchadora, prensa, rodillo/calandria y calderín desde el 14-10; plancha vaporizante desde el 21-10): replican el papel, casilla por casilla. Prensa, rodillo y calderín se marcan por tipo de energía (gas, eléctrico, vapor); cada columna tiene «Todo ✓» y, desde el 21-10 (Diana, calderín eléctrico), «Todo N/A» para la energía que la máquina no usa. Cada renglón se marca ✓, ✗ o **«N/A»**. Desde el 14-10 basta con marcar lo que corresponde (al menos una casilla); los vacíos ya no frenan. **Cómo se marca** (17-10, Ariana): se toca el ✓ (conforme) o el ✗ (con falla) en las dos columnas de la derecha de cada renglón —en pantalla se ven tenues hasta marcarlas; en papel salen en blanco—. El campo «Observaciones» es solo texto. Al terminar se aprieta «Guardar protocolo» abajo; si no, lo marcado se pierde. Una casilla vacía se ve gris con borde punteado; marcada, llena en verde (✓) o rojo (✗). **Un ✓ en la columna «CANT.» de Programación (clic derecho o mantener apretado) también cuenta como hoja marcada** para «Probada y embalada» (desde el 17-10). **Energía que el equipo no tiene** (21-10, Diana): en prensa, rodillo y calderín cada columna GAS / ELÉCTRICO / VAPOR tiene, debajo de «Todo ✓», el botón **«Todo N/A»**, que pone N/A en toda esa columna aunque ya tuviera ✗ (ej.: calderín eléctrico → «Todo N/A» en GAS y en VAPOR, y se marca solo ELÉCTRICO). Tocar una casilla N/A la deja vacía otra vez.
- **Protocolo de equipo en stock** (desde el 14-10, pedido de Lesly): en Almacén → pestaña **«Protocolos»** se puede hacer el protocolo de una máquina que todavía no tiene pedido, por su serie, con la misma hoja (ficha, fotos, video, PDF y hoja de chequeo). Al darlo por terminado pasa solo a la máquina del pedido que tenga esa serie, y en el pedido solo falta marcar «Probada y embalada». Desde que pasó al pedido, se corrige en el pedido.
- **Pestaña «Protocolos»** (Almacén): lista todos los protocolos, de pedidos y de stock, con N.º, serie, técnico, fecha y estado; tiene buscador y filtros. Desde el 20-10, «Mi día» del almacén tiene arriba los botones «Protocolos» y «Subir protocolo de equipo en stock».
- **Búsquedas del almacén** (desde el 20-10, buzón del almacén): en Pedidos, «Todos los pedidos en curso» encuentra también los pedidos cerrados; busca palabra por palabra, sugiere los parecidos si el nombre está mal escrito y avisa si el filtro de fechas lo esconde. «Aperturas de postventa» tiene su propio buscador (cliente, equipo o N.º de pedido) e incluye las de pedidos cerrados.
- **«Salieron, falta la guía»** solo lista los pedidos que llevan guía. Las revisiones técnicas no llevan guía (sale el técnico, no una máquina): para el almacén ya están hechas y las cierra postventa con el informe del técnico.
- **El video de la prueba es opcional** y no reemplaza al protocolo.
- **Por qué existe esta regla** (13-10): se marcó una máquina como probada sin una sola foto ni documento. «Tiene que estar todo… y si hay que modificar, que pida el código».
- **Modificar una máquina ya «probada y embalada»** (protocolo, hoja, fotos) pide el código de operaciones, con motivo.
- **Torres:** llevan dos series («+ Otra serie en esta unidad»). La secadora viaja con su unidad y no suma en la cantidad de la apertura.
- **Serie:** el CRM avisa si el largo no es el típico de la marca; es solo un aviso. Corregir una serie registrada pide código. **También la de la secadora de una torre** (desde el 21-10, buzón de Lesly): junto a ella dice «¿Equivocada? Corregir o quitar con código»; se elige cuál serie (lavadora o secadora), se escribe la correcta o «Quitar esta serie», con motivo y código de operaciones o gerencia. Queda escrito en el pedido (anterior, nueva, motivo y quién autorizó) y avisa en la campana a Central, postventa y almacén (no a quien la cambió). Antes la de la secadora se quitaba con «Quitar» sin código.

### 3.8 Postventa

**Cada gestión pertenece a un caso** (desde el 20-10, reunión de gerencia de la tarde)
- Al anotar una gestión de un cliente que tiene casos abiertos (CASO-…), arriba aparece «¿De qué caso es esta gestión?» con cada caso, su equipo y su serie. Hay que marcar uno o varios, o «No es de ningún caso». Sin elegir, la gestión no se guarda. Vale para postventa y para el comercial.
- Si el cliente tiene un solo caso abierto, viene marcado.
- Central, al derivar a postventa un cliente con casos abiertos, elige de cuál es la llamada o marca «Es otro problema u otro equipo» y escribe cuál. Así no se abre otro caso del mismo problema.
- En el historial del cliente cada caso tiene **su color** y su etiqueta (CASO-00129). Arriba hay un filtro por caso: «Todos», cada caso, o «Sin caso».
- El cierre de un caso aparece en la línea de tiempo con su resultado y su motivo («CASO-00099 cerrado · no procede»).
- Reclasificar un caso deja una línea en su historial («Reclasificado: era problema técnico, ahora es repuesto»). Un caso de repuesto muestra arriba que se atiende con cotización y pedido.
- El botón «Cerrar este caso» está a la vista debajo del circuito. Los casos se cierran: así se termina el mes.

**Fichas parecidas: el mismo cliente registrado distinto** (desde el 21-10, pedido de Santos)
- En «Fichas repetidas» hay dos pestañas: «Iguales» (mismo nombre o mismo documento) y «Parecidas: revisar a mano».
- «Parecidas» muestra parejas de fichas que podrían ser el mismo cliente, con su porcentaje de coincidencia y el porqué: nombre parecido, un nombre dentro del otro, mismo teléfono o mismo correo.
- Las dos fichas salen lado a lado: documento, cartera, contactos, dirección, lo que tiene cada una y su última gestión. El CRM propone cuál se queda (la que tiene RUC o más movimiento).
- Si son el mismo cliente, «Unir» (pide el motivo y, si mueve carteras, el código de operaciones). Si no, «No son el mismo cliente» y la pareja no vuelve a salir.
- Cómo decidir (respuesta a Central, 22-10): abrir las dos fichas y comparar teléfonos, contactos y dirección; si hay RUC, consultarlo en SUNAT; si los nombres son muy distintos, confirmarlo antes con el comercial de la cartera. **Ante la duda, no unir.**
- Dos fichas con documentos distintos no se proponen: son clientes distintos. La búsqueda se hace cada noche. La lista abre en 60 % y se puede ver desde 80 % o desde 45 %.
- La usan Central, operaciones y gerencia.

**Fichas gemelas: el DNI dentro del RUC 10** (desde el 20-10)
- El RUC de una persona natural es 10 + su DNI + un dígito. El CRM ya sabe que la ficha con DNI 44224120 y la del RUC 10442241207 son la misma persona.
- El freno a casos duplicados mira también esas fichas y la misma máquina (serie) en cualquier ficha.
- Central ve esa coincidencia como fuerte: «Su DNI está dentro del RUC 10 de esta ficha». Hay que elegir esa ficha.
- «Fichas repetidas» muestra también los grupos por documento (el mismo RUC/DNI o el DNI dentro del RUC 10).
- A postventa no se deriva un cliente sin RUC o DNI y sin ficha elegida: Central tiene que buscarlo por su documento, o escribir por qué se deriva sin él.

**El técnico fue y no lo solucionó** (desde el 20-10)
- En el paso «Atención» del caso está «No se solucionó en la visita». Se escribe qué se hizo y se elige: «Reprogramar otra visita» (el caso vuelve a Planificación) o «El equipo viene a planta» (abre la apertura de servicio interna del mismo caso).
- Un caso puede tener otra apertura de servicio si la anterior ya salió («Otra apertura de servicio»).

**La apertura interna es la recepción del equipo** (desde el 20-10)
- Al emitir una apertura de servicio **interna**, el CRM crea sola la orden de recepción (REC-…) para el almacén, con los antecedentes del equipo y qué se ejecuta. El almacén la recibe, la revisa y deja su informe en esos pasos; no ve nada de cobro.
- Ya no hay un botón aparte «El equipo viene a planta» en el caso: es la apertura interna.

**Los repuestos no son máquinas del cliente** (desde el 20-10)
- Las piezas de un kit o de un pedido de repuesto ya no aparecen como «equipos del cliente» en el caso ni en la apertura. Solo las máquinas.
- En la torre apilable, la principal se llama «Lavadora · …» y la otra «Secadora · …», cada una con su serie. En el pedido, el almacén ve «TORRE apilable: … bajar el panel».

**Regularizar pedidos antiguos** (desde el 20-10)
- En Pedidos → Control → «Regularizar» están los pedidos de antes del CRM, o entregados hace más de un mes, que siguen sin cerrar. Primero los que siguen en garantía, de la entrega más reciente a la más antigua.
- Cada fila dice lo primero que falta y a quién le toca. Postventa lo pide al área (Finanzas, almacén) y lo sigue hasta cerrar el pedido. Antes era «historia del Excel» y se ocultaba.

**En la ficha del cliente** (desde el 20-10)
- Postventa ve a la derecha «Aperturas de servicio»: cada una con su caso, si es externa o interna y en qué va.
- Desde el caso hay un botón «Volver a la ficha de …».
- Los contadores dicen «pedidos por entregar o cerrar» y «casos abiertos (CASO-…)».
- Un pedido de tipo revisión se llama «Revisión del equipo».
- El mensaje de la guía al cliente lleva su código de atención (CASO-…) para que lo mencione si vuelve a escribir.

**Stock para el comercial** (desde el 20-10)
- En el menú del comercial está «Stock»: el catálogo en solo lectura con el stock de cada equipo. «En almacén» es lo contado por serie; «(ref.)» es la cifra del último Excel de stock, que hay que confirmar con Lesly.

**Tipo de caso primero** (desde el 13-10)
- Al registrar, primero se elige el tipo, que pasa a ser el título de la apertura, y después se escribe el detalle.
- **Tipos:** Puesta en marcha, Problema técnico, Soporte técnico, Repuesto, Mantenimiento, Revisión por garantía, Refuerzo de capacitación y Otro (con texto libre).
- El tipo se corrige con «Cambiar tipo».
- **Clasificación del caso** (paso 2, Antecedentes): Garantía, Preventivo, Correctivo, Servicio facturable, Revisión y, desde el 15-10, **«Capacitación · no se cobra»** (visita para enseñarle al personal del cliente a usar la máquina). Si la capacitación se cobra, se elige «Servicio facturable». El aviso «el equipo está en garantía y lo está clasificando como cobrable» solo sale con opciones que se cobran.
- «Servicio técnico» no es un tipo de caso: es un encabezado de apertura.

**La serie ya está en otra ficha** (desde el 16-10, caso de Ariana)
- Si al fichar la máquina de un caso se escribe una serie que ya está registrada en **otra ficha** (otro cliente que no es sede del mismo grupo), el CRM **no deja seguir** y muestra un aviso con el nombre y el RUC de esa ficha.
- Casi siempre es el mismo cliente partido en dos fichas (por ejemplo, una sin RUC y con el nombre mal escrito). Hay que avisar por el buzón del CRM para que unan las fichas. Después, la máquina aparece en la lista del caso y se elige con «Es esta», con la garantía que corresponde a su guía.
- Antes, el CRM usaba en silencio la máquina de la otra ficha y el caso quedaba con la garantía de esa guía, sin tomar la fecha que se escribía.

**Cómo entra un caso**
- Llega derivado por Central (que necesita código para derivar a postventa) o lo registra postventa ella misma como autoderivado.
- También se puede registrar un **seguimiento** en el cliente sin abrir caso.

**Serie y garantía**
- **La serie va primero.** Con la serie, el CRM muestra el equipo, la garantía, los ciclos y el último preventivo. «NUNCA» indica que nunca tuvo preventivo: es una oportunidad de venta. Sin serie, el caso queda como «equipo sin identificar».
- **Garantía:** 24 meses por defecto, **desde la guía de remisión de venta** (desde que sale de la empresa, no desde que llega).
  - Una guía que devuelve una máquina después de un servicio no fecha garantía: darla desde una reparación regalaría años.
  - Consignación, devolución y repuestos con serie no cuentan.
  - Nunca se crea una ficha de cliente desde una guía.
  - Si la garantía del cierre es distinta de 24 meses, vea la sección de dudas.
- **Máquina que no vendimos:** «¿La vendimos nosotros?» → no: se registra como equipo del cliente, sin garantía.

**Antecedentes del equipo** (desde el 20-10, lo pidió Brenda)
- Sirve antes de una revisión o un mantenimiento (preventivo o correctivo) en planta, sobre todo en equipos que no vendimos.
- Está en la ficha del equipo y en el caso, en el recuadro «Antecedentes del equipo». Se llena con «Registrar antecedentes» y se corrige con «Editar antecedentes». Lo hace postventa (también operaciones y gerencia).
- **A. Compra:** fecha de compra, proveedor o empresa vendedora, N.º de guía de remisión, N.º de factura u orden de compra y la garantía (vigente, vencida o por verificar).
- **B-D. Historial:** si recibió mantenimiento, si se le compraron repuestos y si presentó fallas antes. Las respuestas son sí, no o «por verificar / sin información». Con «sí» se escribe el detalle (cuándo, quién, qué).
- **E. Documentos y evidencias:** primero se elige qué es (guía, factura u OC; acta de instalación o entrega; informe de mantenimiento anterior; orden de servicio o comprobante de repuestos; foto) y luego se adjunta el archivo (PDF, foto, Word o Excel). Se puede quitar uno ya subido.
- Queda escrito quién lo actualizó y cuándo. La solicitud es el caso y el trabajo hecho va en el informe técnico.

**Si el problema es en realidad un paso pendiente del pedido**
- Por ejemplo, falta la puesta en marcha. La atención se cierra como **derivado → pedidos** y se sigue en el pedido.
- Si el pedido está completo, el caso se reclasifica (por ejemplo, como refuerzo de capacitación).
- Una llamada sobre un pedido en curso no abre un caso suelto.

**Qué se hizo en el cliente** (paso de la atención)
- Se anota qué se hizo, los repuestos usados (si hubo) y los ciclos que marca el contador. Los ciclos pasan solos a la ficha de la máquina.
- **Caso con varias máquinas** (desde el 16-10, lo pidió Rubí): si al caso se le agregaron otras máquinas, el paso muestra un recuadro por máquina («Serie … · tipo · principal» y uno por cada otra), cada uno con su «Qué se hizo», «Repuestos usados» y «Ciclos». Los ciclos de cada una van a su propia ficha. La principal es obligatoria; las demás se llenan según lo que se hizo. Al revisar después esa etapa, se ve lo registrado de cada máquina.

**Cerrar una atención**
- Exige elegir un resultado: resuelto, no procede o derivado. No viene marcado por defecto.
- Cada gestión de la atención queda como nota, con autor y hora, en el expediente y en la ficha.

**Apertura** (orden de trabajo)
- **Tipos:** Entrega, Entrega y puesta en marcha, Mantenimiento, Solo puesta en marcha (el técnico va sin equipo) y aperturas de servicio con su encabezado.
- **«SERVICIO E INSTALACIÓN DE:»** (desde el 16-10, a pedido de Rubí) es otra opción en «¿Qué se va a hacer?»: el técnico hace el servicio y la instalación que se vendió. Es el encabezado de la fila 1 en la hoja, el PDF y el correo de la apertura.
- **Apertura desde un caso sin pedido** (garantía o servicio a un cliente antiguo): botón **«Apertura de servicio»**. Crea un pedido de origen «caso». Desde el 13-10 lista los equipos del cliente para marcar todos los que van. **Desde el 20-10 (noche) pregunta primero dónde se hace el servicio: «Externo»** (el técnico va al local del cliente, el circuito de siempre) **o «Interno»** (el equipo se atiende en nuestra planta). La interna no pide dirección, transporte, agencia, Lima o provincia ni viáticos, y sí pide los antecedentes del equipo: para qué es (qué se necesita ejecutar, obligatorio), fecha de compra, N.º de guía, si está en garantía, si tuvo problemas antes, si se le vendió repuesto, si se le vendió mantenimiento (preventivo o correctivo), y si se cambió algún repuesto. Lo que ya se sabe de la máquina viene propuesto. Esos antecedentes salen en la hoja de la apertura y en el pedido (postventa y almacén), y quedan guardados en «Antecedentes del equipo» de la máquina.
- **Contenido:** modelo de 11 filas de operaciones: servicio, cliente, primer destino, destino final, programación, quién recibe con DNI, personal, transporte, viáticos, coordinación con logística, etc.
- **El cliente de la apertura es el del cierre.** Si no hay cierre, se toma de la ficha.
- **«A quién llama el almacén»** empieza vacío y es obligatorio, porque puede ser un técnico del cliente que no está en la ficha.
- **Técnico obligatorio.** Se elige de la lista de técnicos (se imprime con su DNI) o se escribe uno externo.
- **Solicitud de guía:** traslado de equipo, materiales, equipo y materiales, o repuestos.
- Si cambia el encabezado de una apertura emitida, se avisa a Finanzas y al almacén.
- **Correos:** los avisos salen según la empresa del pedido, a las áreas del Directorio. El botón «Enviar por correo» solo envía a direcciones internas.

**Derivación de llamada al almacén** (antes el botón decía «Derivar llamada»)
- Postventa pide una revisión o videollamada. El pie del formulario dice qué falta para poder enviar.
- El almacén sube el informe (versión 1) con lo que le falta al cliente para cotizar, y postventa arma la versión para el cliente.
- Una vez enviado, el formato no se edita: se anula y se rehace.
- Anular una llamada derivada: postventa necesita código; operaciones y gerencia no.

**Informes**
- Se corrigen con «Corregir informe», con código de operaciones y motivo, y queda el historial «Correcciones».
- Para marcar un informe como enviado al cliente hay que subir una constancia.

**Agenda y reportes de postventa**
- **Agenda de las tres postventas** (desde el 19-10): el calendario de la agenda muestra a todas las de postventa lo mismo del área (pedidos, casos, atenciones, visitas, llamadas). Las tareas y los pendientes anotados de cada una son suyos; **Brenda (PV2)** además ve los de Rubí (PV1) y Ariana (PV3), rotulados «PV1 · Rubí» / «PV3 · Ariana», solo para mirarlos: marcarlos o borrarlos sigue siendo de su dueña. Su reporte diario sigue siendo solo de lo suyo.
- **Agenda** (desde el 13-10): abre en «Lo que falta, paso por paso», solo con pedidos abiertos, y cada pendiente enlaza a su pedido. El calendario está en otra pestaña. El PDF del reporte diario de cada persona de postventa trae esa hoja **solo con sus pedidos** (desde el 16-10): los que firmó en algún paso o en los que gestionó al cliente en los últimos 90 días. La lista de toda el área sigue en la agenda y en Control. Desde el 16-10 trae además la hoja **«Problemas técnicos y su estado»**: los casos de problema técnico asignados a la persona, con el paso en que están, qué falta, a quién le toca y cuántos días llevan (primero lo urgente), y los que cerró ese día. En la sección **«4. Leads recibidos de Central»** de todos los reportes, la columna **«Entró por»** dice cómo se comunicó el cliente con Central («El cliente llamó», «WhatsApp del cliente»…): **no es una gestión de quien recibe el lead**. La columna **«En qué quedó»** dice si sigue sin gestión, si lo gestionó la persona o si lo atendió y cerró otra compañera. La hoja de problemas técnicos cuenta los casos técnicos (problema técnico, revisión por garantía, soporte y «Otro») de quien **tomó** el caso o, si nadie lo tomó, de quien lo tiene asignado, y muestra los cerrados del día con su motivo. Desde el 16-10 (reunión de las 17:57) trae además **«Solicitudes de repuesto · abiertas y cerradas»**: sus expedientes de repuesto. **Abierta** = sin gestión, en gestión (por ejemplo, consultando stock y foto al almacén) o cotizada. **Cerrada** = vendida o cerrada con su motivo (por ejemplo, ya se le había cotizado al mismo cliente). En negrita, las que llegaron ese día.
- **Cómo se atiende una solicitud de repuesto** (reunión 16-10): llega el requerimiento (por ejemplo, una válvula) → se le pide al almacén el stock y la foto → se corrobora y se cotiza. Mientras tanto la solicitud está **abierta**. Se **cierra** cuando se vende, o cuando no corresponde atenderla (por ejemplo, un prevendedor pide lo mismo que ya se le cotizó al cliente).
- **Cómo se lee el reporte diario de postventa** (desde el 16-10, de lo general al detalle): **1. Resumen del día · lo que gerencia pregunta** (cuatro tarjetas: problemas técnicos, repuestos, cotizaciones y pedidos, y debajo **«Lo urgente, en orden»**: problemas técnicos urgentes, repuestos sin gestión, seguimientos vencidos y pedidos que le tocan, con los días); **2. Panel del día**; **3. Problemas técnicos y repuestos** en una sola hoja, con su estado y los días desde que llegó; **4. Lo que falta gestionar**; **5. Sus pedidos abiertos · siguiente paso**: un pedido por fila, con lo que falta y agrupados por a quién le toca (primero lo de postventa); **6. Detalle** de cada gestión. Colores: **granate = le toca a usted**, **ámbar = espera a otra área o al cliente**, **verde = cerrado**.
- **Las preguntas de gerencia para postventa cada día:** ¿qué problemas técnicos tenemos por resolver?, ¿cuáles se resolvieron?, ¿qué cotizaciones hay? y ¿qué repuestos se pidieron y en qué estado están? El reporte diario las contesta en sus hojas.
- **Reportes por autor** (desde el 13-10): cada persona de postventa ve solo lo suyo, separado por línea (repuestos, mantenimiento y correctivo, garantía y soporte, despacho y puesta en marcha, seguimiento).
  - Un presupuesto es de quien lo armó.
  - Una venta es del autor de su cotización.
  - Los comerciales siguen midiéndose por cartera.

**El mapa del recorrido y «Apurar» (desde el 23-10)**
- En el **caso** de postventa, arriba de «El circuito», hay una sección **«Mapa»**: una línea por recorrido con dónde está atascado y a qué área le toca. **«Abrir el mapa»** (o un clic en la línea) lo abre en **pantalla completa**, como mapa.efameinsa.com: **un carril por área** (Cliente, Comercial, Central, Postventa, Técnico, Almacén, Finanzas, Contabilidad / Facturación) con su nombre fijo a la izquierda, cada paso en el carril de quien lo hace y la flecha que pasa de un carril a otro cuando el trabajo cambia de área. Rueda = acercar, arrastrar = mover, doble clic = ver todo. Si hay varios recorridos (caso, apertura de servicio, equipo en planta), se eligen arriba. A la derecha (abajo en el celular) está el detalle del paso tocado y «Apurar».
- El mapa del caso muestra el caso, su apertura de servicio (si la tiene) y el equipo que viene a planta (recepción). **Verde suave = hecho**; **rojo = falta**; la etapa **donde está atascado palpita en rojo** y dice desde cuándo; **gris punteado = no corresponde** (por ejemplo, pruebas en un repuesto) o se pasó sin ese paso.
- El mapa del **pedido** va de la venta al cierre: cierre emitido (comercial), series (almacén), pedido generado, liquidación (Finanzas) y liberación (Central); después los pasos de postventa, la guía (Contabilidad), el despacho (almacén), la verificación, la puesta en marcha y, si es a crédito, el OK de Finanzas y la factura.
- Toque cualquier etapa para ver quién la hizo y cuándo, o qué la traba. En la etapa atascada está el botón **«Apurar a <área>»**: le llega a esa área un aviso con sirena. Se puede apurar una vez cada 15 minutos por área; desde el segundo apuro también se entera gerencia. El **primer y el segundo apuro** llegan con **zumbido** (📳 en el aviso): la pantalla de quien lo recibe tiembla medio segundo y suena un «bzzz», como el zumbido de Messenger; desde el tercero llega solo la sirena. Al cliente no se le apura: se le llama. Lo que debe el técnico se le apura a postventa, que lo programa.
- **Quién lo ve:** postventa y operaciones (caso y pedido), el almacén (su ficha del pedido), Finanzas (su ficha del pedido), Contabilidad / Facturación («Ver el mapa» en su bandeja, abre «Pagos y facturas») y el **comercial**, solo en los pedidos de sus ventas: en su cierre y en «Pagos y facturas». El comercial no apura casos de postventa.
- El mapa no se edita: muestra los pasos reales. Para que avance, se hace el paso en su pantalla de siempre.
- **El aviso del «Apurar» no saca a nadie de lo que hace:** llega abajo, dice quién apura, qué paso falta y desde cuándo, y se queda hasta que lo toquen. «Ver en el mapa» abre el mapa encima de la pantalla actual, sin cambiar de página.

**El chat de cada caso (desde el 23-10)**
- Cada **caso** y cada **pedido** tiene su **canal de coordinación**, como un pequeño Slack: todos con todos los involucrados. Están quien lleva el caso, quien movió algún paso del caso o de su pedido / apertura, quien apuró o escribió y, en un pedido, el comercial de la venta. Cada mensaje les llega a todos con un aviso discreto («Responder» abre el chat encima de lo que esté haciendo).
- Se abre con **«Chat del caso»** (o «Chat del pedido») en la sección Mapa, que marca en rojo los mensajes sin leer, o desde el mapa con «Escribir en el chat del caso».
- **«Agregar a…»** (botón con la figura y el «+» arriba): para sumar a alguien que no está por defecto y ayude a destrabar (gerencia, administración, Central…). Le llega un aviso y en el chat queda «X agregó a Y». Un agregado entra al canal aunque por su puesto no viera el caso.
- Cada mensaje dice **quién y a qué hora**, y debajo **«Visto por…»** quiénes ya lo leyeron (cuenta como visto solo si la persona tenía el chat abierto y a la vista).
- La ventana flota abajo a la derecha: se agranda arrastrando la esquina de arriba a la izquierda (recuerda el tamaño), se maximiza, se minimiza a una pastilla y se cierra. Enter envía; Mayús + Enter salta de línea. Mientras está abierta, la bolita de Efamein se pasa al lado izquierdo.
- El **«Apurar»** deja su línea en el chat (📳), con lo que se escriba en «¿Qué necesita?».
- **El canal se cierra cuando termina el caso o el pedido**: queda guardado, de solo lectura. Los mensajes no se editan ni se borran y salen en el historial del caso («Chat del caso»).
- No es para hablar con el cliente: eso sigue por WhatsApp y Mi cuenta.

**Preventivos y Ruta de mantenimiento**
- Alerta de preventivo a los 3 meses («Preventivos por ofrecer»).
- En la **Ruta de mantenimiento**: rojo = NUNCA tuvo preventivo; ámbar = vencido (6 meses o más); verde = al día; gris = sin registro.
- «Nunca» y «sin registro» no son lo mismo: solo «nunca» se puede afirmar en una llamada.

**Repuestos**
- Un repuesto aprobado manda una orden «Preparar y embalar» al almacén.
- En crédito o pago parcial, el último paso es la «Orden a Finanzas».

### 3.9 WhatsApp y leads

**A quién llega un WhatsApp** (en este orden)
1. Si el número ya es de un cliente de otro comercial activo, va **al dueño de la cartera** (desde el 05-10; antes quedaba retenido en Central). Solo se retiene en Central si ese dueño ya no está activo.
2. Si no, va al **dueño de la campaña** del anuncio.
3. Si la campaña no tiene dueño, va al **comercial de turno del día**, que gerencia configura.

**Ventanas de respuesta y línea personal**
- Se puede escribir mientras esté abierta alguna de dos ventanas: 24 horas desde el último mensaje del cliente o 72 horas desde el clic en el anuncio. Pasado eso, se llama. **Nunca se usan plantillas pagadas.**
- **La línea personal está cerrada** (06-10). La comunicación con clientes va por la bandeja del CRM. Si de verdad hace falta la línea personal, **el cliente escribe primero**, con un enlace desde el CRM. Nunca se le escribe en frío.
- Por qué: una línea personal quedó restringida como spam por mensajes repetidos. Tampoco se usan bots ni métodos que parafraseen mensajes.

**Tipificación**
- El resultado se marca el mismo día. Se usa «No contesta» (no «Sin respuesta»).
- Lo positivo se informa a Meta y Google para mejorar los anuncios: interesado, cotizado y compra (al emitir el cierre). Lo negativo queda solo en el CRM.
- Tipificar e informar los leads es **obligatorio** (plazo de regularización: 09-10).

**Avisos**
- Cada mensaje entrante avisa al dueño del chat con sonido propio. La pestaña «No leídos» va primero.
- La alerta «WhatsApp sin respuesta» llega como máximo una vez por hora, con los 3 chats que más esperan. No avisa si después del último mensaje hubo una gestión o una cotización.

**Casos especiales**
- **Cliente rechazado que vuelve a escribir:** el chat pasa al dueño de la ficha, que usa «Volvió a escribir: abrir seguimiento».
- **Clientes con @usuario** (ocultan su número): se les puede responder, pero no llamar. Si escriben un celular que es de otro comercial, el CRM avisa.
- **El público no ve productos ni precios** en el perfil de WhatsApp.

### 3.10 Central: triaje, derivación y correcciones

**Al registrar y asignar**
- La captura detecta duplicados en vivo. Mientras el contacto no se derive, se puede usar «Corregir los datos».
- El diálogo de asignar muestra las coincidencias. Al hacer clic en una, el contacto se une a esa ficha antes de derivar.

**Cliente que ya atiende alguien y vuelve a escribir**
- La cinta ámbar dice «Ya lo está viendo C# · Nombre» y ofrece **«Avisarle a C#»**.
- Ese botón anota una nota en su expediente (no cuenta como gestión), le manda «Su cliente volvió a escribir» y cierra el contacto como repetido.
- **«Descartar» significa «el contacto no procedía»**: se lee literal en marketing y afecta el costo por lead. Nunca se usa para algo repetido.

**Otras herramientas**
- **«Ver la historia de la empresa»:** busca por razón social, palabras, dominio y siglas. Solo mira: no une ni deriva.
- **«Buscar en todo el CRM»** (lupa de arriba, /buscar): un contacto de Central **sin ficha** es una consulta que nunca llegó a cotización ni compra (casi siempre de los Excel antiguos de Central): no tiene expediente y por eso no sale «Abrir». La fecha que se ve es cuándo llamó, no cuándo se pasó al CRM. Si el mismo celular hoy es contacto de un cliente, la fila lo dice y «Abrir» lleva a esa ficha (Central, 15-10: TERRANOVA REPRESENTACIONES era una llamada de 2019; la misma persona escribe hoy por otra empresa).
- **Seguimiento a comerciales:**
  - los derivados quietos más de 7 días aparecen como «Preguntar a Cx por el seguimiento»;
  - la urgencia al comercial le llega en vivo, y desde la segunda por el mismo contacto se entera gerencia.
- **«Avisar a…»:** Finanzas, postventa y el comercial dueño, en una sola acción. Se deshace con «Revertir» (con código), y el contacto vuelve a triaje.

**Corregir lo que pidió el cliente** (lápiz en «Inicio · lo que solicitó el cliente»)
- Pueden el autor, Central y gerencia.
- Es libre si el contacto sigue en la bandeja o tiene menos de 15 minutos. Después pide motivo, y si ya hay cotización o venta, también código.
- Queda el historial con lo anterior tachado.
- No se puede mudar a otra ficha si ya tiene cotización, venta, cierre o servicio.

**Files y visitas**
- **Files (archivadores físicos):**
  - se piden en «Files», marcando OPEN, EFAMEINSA o ambos, y solo de lo que está en el inventario;
  - recorrido: solicitado → entregado → «Recibí» → «Terminé» (avisa a Central para recogerlo) → devuelto;
  - Central puede entregar el file a postventa enlazado al pedido;
  - por qué: antes se usaba un cuaderno de cargos, «cero control»;
  - los cierres nuevos pueden no estar aún en el inventario (por confirmar cómo pedirlos).
  - **Cliente que está en los Excel antiguos o en el inventario de files, pero no figura en el CRM** (regla del ingeniero Carlos, 15-10):
    1. se le pide a Santos que lo cargue (por el buzón de observaciones o directamente);
    2. cuando ya está en el CRM, el comercial o el área que lo gestiona pide el file en «Files»;
    3. Central entrega el file con el registro del CRM, no por fuera del sistema.
- **Visitas a planta:** «Viene a la planta» avisa a Central, almacén y logística, y genera la hoja para vigilancia. Desde el 14-10 a Central y al almacén les sale un **mensaje grande** al centro de la pantalla, con campanada, que se queda hasta pulsar «Entendido» (o «Imprimir para vigilancia» / «Ver las visitas»); si el CRM estaba cerrado, aparece al entrar. Desde el 15-10, al elegir el cliente salen **sus equipos con su serie** para solo marcar «Lo recoge» (va en el aviso, el correo y la hoja de vigilancia) o «Prepararlo para la visita» (pasa solo a «Preparación de máquinas» del almacén); el documento de quien viene, y de cada acompañante, se elige con un botón **DNI o C.E.** (carné de extranjería), y así sale en el aviso y en la hoja. Al registrar cómo terminó la visita está **«Recogió equipo»**: si se marcaron equipos con «Lo recoge», sale elegido y la gestión del cliente anota qué equipos se llevó (modelo y serie). Ya anunciada la visita, debajo de la fecha están «Cambiar fecha u hora» y **«Acompañantes»** (desde el 16-10): ahí se suman, corrigen o quitan acompañantes con nombre y DNI o C.E., mientras el cliente no haya llegado; lo hace quien la registró o Central. Central recibe el aviso, sale el correo de visitas y, si vigilancia ya tenía la hoja, se apaga «Vigilancia avisada» para volver a imprimirla. También existe «Registrar visita de proveedor».
- **«Derivar» desde «Hoy» (desde el 21-10):** abre solo ese contacto, con «Asignar» ya abierto; no la bandeja entera. Si otra persona ya lo derivó, la pantalla dice a quién y cuándo. Arriba están «Volver a Hoy» y «Ver toda la bandeja».
- **Contacto de pagos, facturas o letras (desde el 21-10):** en «Asignar» solo hay comerciales y postventa. Para Finanzas o Facturación, cada contacto de la bandeja tiene **«A Finanzas o Facturación»**: abre un caso con el mensaje del cliente ya escrito, y el contacto sale de la bandeja y queda en «Derivados a otras áreas». Ejemplo: un cliente pregunta por el número de factura de sus letras.
- **Casos a otras áreas (desde el 21-10, Santos).** Central abre un caso para **Finanzas** o **Facturación** con «Derivar a un área», en la ficha del cliente o en cada fila de «Sus pedidos». Elige el área, el motivo, escribe qué necesita, adjunta lo que haga falta (voucher, OC, captura) y elige el plazo:
  1. **Hoy, sin apuro:** al área le llega a la campana con sonido.
  2. **Urgente (2 horas):** la misma alerta de «Urgencia a Finanzas», que no se cierra sola, con aviso al celular. Si en 2 horas nadie lo toma, vuelve a sonar en el área y se enteran Central y gerencia.
  3. **Para una fecha.**
  - El caso lleva código propio (**CC-0001**) y estados: Nuevo → En manos del área → Respondido → Cerrado. Si al área le falta algo, pasa a «Esperando a Central» hasta que Central conteste.
  - El área lo atiende en «Casos de Central» (menú de Finanzas y de Facturación): «Tomar el caso», «Responder a Central» (con archivos) o «Pedir un dato a Central». Cada área ve solo los suyos.
  - Central lo sigue en «Casos a otras áreas»: puede contestar el dato, «Volver a avisar» (del tercer aviso en adelante gerencia se entera), decir «No quedó resuelto» (vuelve al área) o «Dar por cerrado». Un caso respondido que Central no cierra se cierra solo a los 2 días.
  - **RR. HH.** aparece en el diálogo pero apagada: todavía no tiene cuenta en el CRM, así que no se le puede derivar.
  - Cada paso queda con nombre y hora en el historial del caso.

### 3.11 Códigos de autorización (cómo funcionan, sin valores)

- **Código del supervisor:**
  - lo dictan gerencia, administración y operaciones (y Central, solo para los cierres);
  - cambia cada pocos minutos (el anterior también vale un rato, porque se dicta por teléfono);
  - **se quema al usarse**;
  - siempre exige un motivo;
  - quien lo tiene no se lo pide a sí mismo;
  - los intentos fallidos quedan registrados;
  - dos correcciones seguidas necesitan supervisores distintos.
- **Código de operaciones (Lesly):** para correcciones operativas (aperturas emitidas, protocolos, informes, series, fichas, destino). Ya no sirve para corregir cierres (desde el 15-10).
- **Código de Central** (desde el 15-10): solo para corregir un cierre emitido o agregarle documentos. Lo dicta Central coordinando con Carlos. Al personal se le indica solo Central.
- **Código de gerencia:** para lo que tiene impacto económico (devolver un cierre con el proceso avanzado, liberar un pedido sin liquidación, una salida con saldo o sin visto bueno).
- **Por orden directa de Santos (gerencia)** se puede hacer una operación sin el código de operaciones, dejando rastro: «por orden de Santos (gerencia)». No aplica a pedidos que lleguen por otra vía.
- **El asistente nunca da ni pide códigos.** Indica quién los dicta.

---

## 4. Glosario y directorio

### 4.1 Glosario

- **PRO-#####:** número de un contacto o lead registrado en Central. Su serie viene del histórico de Central.
- **Presu_####-26:** número de una cotización (número-año), de la serie EFAMEINSA u OPEN. También se ve como «OPEN 500-26».
- **NNN-AAAA (por ejemplo, 014-2026):** número de un informe de cierre de venta, con su serie («EFAMEINSA 005-2026»).
- **PED-NNNN-AAAA:** número de un pedido.
- **REG:** cierre regularizado, es decir, un cierre de Word anterior al CRM subido con el correlativo siguiente. No suma a la venta.
- **PRUEBA…:** documentos de cuentas de práctica. No cuentan.
- **GMP:** marca de calandrias que Efameinsa representa y vende. Si GMP remite a alguien, es un cliente nuestro (ver 2.2).
- **EFAMEINSA / OPEN (Open Investments):** las dos razones sociales con las que factura la empresa. Cada una tiene su serie de cotizaciones y de cierres. OPEN es la primera opción.
- **C1…C10:** posiciones de comercial (no personas).
- **PV:** el área de postventa. **PV1, PV2, PV3:** las personas de postventa.
- **ALM, ALM2:** cuentas de almacén. **IMP:** cuenta de Importaciones.
- **Ficha:** el cliente (RUC o DNI) con sus contactos, equipos e historia.
- **Expediente:** un negocio con un cliente (la oportunidad). En postventa, el expediente del caso.
- **Cartera:** las fichas de un comercial. **Liberable:** cliente sin venta en 3 meses.
- **Ficha cascarón:** ficha sin RUC creada por un lead de anuncios.
- **Grupo económico:** fichas madre e hijas de empresas relacionadas, enlazadas sin fusionar.
- **Caso / atención:** solicitud de postventa, con su tipo y sus etapas.
- **Pedido:** la venta en ejecución, desde que Central la libera hasta «Pedido cerrado».
- **Pedido ejecutado / liberar:** el check de Central que entrega el pedido a postventa, almacén y Finanzas.
- **Liquidación:** el documento de Finanzas que Central acepta.
- **Apertura:** la orden de trabajo de postventa al almacén o al técnico (de despacho, de servicio o de llamada). Para almacén y postventa, «apertura» equivale a despacho.
- **Protocolo:** el registro de la prueba de cada máquina.
- **Probada y embalada:** el paso del almacén que exige el protocolo completo.
- **Visto bueno de Finanzas:** autorización de salida para ventas a crédito o con letras.
- **Letras:** letras de cambio de una venta a crédito. Estados: no lleva, van con el equipo, entregadas, firmadas.
- **Guía (de remisión):** el documento de salida. Fecha la garantía si es de venta.
- **Parque instalado / equipos instalados:** las máquinas vendidas, con su serie y su garantía. En textos para clientes se prefiere decir «equipos instalados».
- **Ciclos:** el «kilometraje» de la máquina. Se anotan en la puesta en marcha y en cada informe.
- **Ruta de mantenimiento:** la campaña para vender preventivos sobre los equipos instalados.
- **Historia del Excel / La base del Excel / Histórico:** datos importados de antes del CRM, que se consultan pero no cuentan como trabajo.
- **Próxima acción:** la siguiente tarea agendada en un expediente.
- **Potencial:** lo que el comercial promete cerrar esta semana.
- **Corresponde cerrar:** expedientes sin respuesta (prospecto 1 mes, cotización 3 meses) que una persona debe revisar.
- **Código (del supervisor, de operaciones, de gerencia):** autorización de un solo uso, con motivo. Nunca se comparte.
- **Files:** archivadores físicos de los clientes.
- **Directorio:** la pantalla con los correos internos de cada persona (OPEN y EFAMEINSA) y la lista de técnicos.
- **Crece:** la plataforma interna de capacitación y puntos. El CRM le envía puntos por gestiones, cotizaciones, cierres, leads y sugerencias. Los puntos de gestión comercial tienen un tope de **2.500 al mes por persona** (desde el 16-10; antes era 1.000). Cuando alguien llega al tope, sus actividades se siguen registrando en el CRM pero salen con «+0» en Crece hasta el 1 del mes siguiente. Las sugerencias no tienen tope.

### 4.2 Directorio de personas y códigos (solo nombres y funciones)

**Gerencia y CRM**
- **Carlos (ing.):** gerente general. Decide las reglas de negocio, los precios bajo lista y los traspasos de cartera.
- **Karen:** gerencia (finanzas, RR. HH. y marketing).
- **Santos:** gestión, marketing y CRM. Construye el CRM y tiene rango de gerencia en el sistema. Los cambios al CRM se le piden por el buzón.

**Central y operaciones**
- **Central:** Alondra.
- **Operaciones:** Lesly (catálogo, códigos, permisos, almacén y supervisión de áreas).

**Comerciales**

| Código | Persona |
|---|---|
| C1 | Brenda Taboada (antes C8; piloto de trabajo de campo) |
| C2 | Moisés Baldeón |
| C3 | vacante |
| C4 | Ariana Flores |
| C5 | Katherine Tello |
| C6 | Abel Abad (desde octubre) |
| C9 | Desiree Salinas |
| C7, C8, C10 | sin persona asignada (por confirmar) |

**Postventa**
- PV1: Rubí.
- PV2: Brenda Taboada desde el 19-10 (además de su C1). El historial anterior de PV2 figura como Gabriela Palacios (PV2-GP).
- PV3: Ariana Flores.

**Otras áreas**
- **Almacén:** Diana (ALM, desde el 21-10; reemplaza a Jeysson Alania, que ya no trabaja en la empresa) y Ariana Flores (ALM2).
- **Finanzas:** Jhon Calsin.
- **Contabilidad / Facturación:** cuenta Facturación.
- **Importaciones:** cuenta IMP (por confirmar quién la usa; ver dudas).
- **RR. HH.:** Yasmin Cuéllar (sin cuenta en el CRM por ahora).
- **Sistemas:** Juan Carlos (JC).
- **Técnicos:** lista con DNI en el Directorio.

---

## 5. Preguntas frecuentes

**1. ¿Por qué mi cotización está «Espera a gerencia»?**
Porque necesita visto bueno. Pasa cuando algún precio queda bajo lista, cuando tiene una línea escrita a mano con precio, cuando es de postventa (todas, durante la capacitación) o cuando es un kit con cantidades cambiadas. Mientras espera, sigue como borrador y no tiene número. Cuando gerencia apruebe, le llega un aviso y pulsa «Confirmar». (3.3, 3.4)

**2. Gerencia me devolvió la cotización. ¿Tengo que hacer otra?**
No, salvo que la haya rechazado entera. Si la devolvió renglón por renglón, verá tarjetas rojas «Corregir: <equipo>» en el cotizador. Corrija esos renglones, guarde y responda. Lo aprobado se mantiene si no lo toca. Si la observó sin rechazar, también corrige y responde. (3.4)

**3. ¿Por qué no puedo confirmar la cotización?**
Las causas habituales son tres: la ficha no tiene RUC ni DNI; necesita aprobación de gerencia (el botón dirá «Pedir aprobación a gerencia»); o una línea a mano no tiene descripción. Si la pantalla dice «No se pudo guardar», el motivo suele estar en los datos, no en la conexión. (1.4, 3.3)

**4. ¿Por qué los números de mis cotizaciones saltan?**
Porque la numeración es de la empresa (una serie EFAMEINSA y una OPEN por año), no de cada comercial. Entre sus números hay cotizaciones de otros compañeros y de postventa. Nunca se pierde nada: los huecos se anulan, no se rellenan. (3.3)

**5. ¿Puedo cambiar una cotización que ya mandé al cliente?**
Sí, con «Corregir esta cotización». Escriba el motivo (15 caracteres como mínimo) y pida el código a operaciones o gerencia. Se conserva el número y la fecha, y el PDF sale como «v2». Si ya tiene un cierre emitido, primero hay que anular el cierre. Si prefiere un número nuevo, use «Duplicar». (3.3)

**6. ¿Cómo anulo una cotización?**
Con el botón «Anular cotización», que existe desde el 10-10. Escriba el motivo y pida el código a operaciones o gerencia. No se puede si tiene un cierre o una venta vivos. La anulada queda tachada y no cuenta. (3.3)

**7. ¿Cotizo con OPEN o con EFAMEINSA?**
OPEN es la primera opción (gerencia, 23-09). Para elegir EFAMEINSA, el CRM le pedirá un motivo; por ejemplo, un cliente antiguo que insiste en facturar con EFAMEINSA. Toda la cadena de documentos seguirá con la empresa que elija. (3.3, 0)

**8. ¿Por qué no puedo emitir este cierre?**
Revise que tenga lugar de entrega, condición de pago (porcentaje antes del despacho y días de crédito), a quién se factura y los documentos (voucher u OC; la cotización enlazada ya cuenta). Si es a crédito, declárelo: no lleva voucher. Si el RUC no coincide con la ficha, el CRM lo avisa arriba. (1.6, 3.5)

**9. Me equivoqué en un cierre ya emitido. ¿Qué hago?**
Un cierre emitido está sellado. Para corregirlo o agregarle documentos hace falta motivo y el código de Central (desde el 15-10; el de Lesly ya no sirve para esto); se crea una versión nueva. Si la venta se cayó, pida la anulación desde la vista de su cierre. Anular lo hacen operaciones, Central, gerencia o usted mismo, con código de operaciones o gerencia. (3.5)

**10. Central me devolvió el cierre. ¿Lo perdí?**
No. Devolver no es anular: el número se conserva. Lo verá arriba en «Mis cierres» con el motivo. Corríjalo y responda «ya lo corregí» para que vuelva a Central. (3.5)

**11. ¿Qué pasa después de que Central marca los checks?**
Central registra o pide las series, genera el pedido PED-…, acepta la liquidación de Finanzas y marca «Pedido ejecutado». Desde ese momento el pedido aparece en postventa como «Nuevo pedido» y también lo ven almacén y Finanzas. Postventa lo aprueba (acuse), pide la prueba, verifica dirección y quién recibe, emite la apertura, y el almacén despacha cuando la guía está autorizada. (1.7–1.12)

**12. Soy de postventa: ¿por qué no veo el pedido que vendió el comercial?**
Porque Central todavía no lo liberó («Pedido ejecutado»). Postventa ve los pedidos solo después de ese check. Pregunte en Central en qué paso está: series, generar pedido o liquidación. (1.7) Ojo: que Central haya **generado el pedido (PED-…)** no es haberlo liberado; falta que Finanzas confirme el pago y suba la liquidación, que Central la acepte y marque «Pedido ejecutado». Si hay apuro, gerencia u operaciones pueden ejecutarlo sin liquidación con su código. Tampoco alcanza con que Central **acepte la liquidación**: «Pedido ejecutado» es otro check aparte. Y una liquidación que dice «cancelado» **no es el pago confirmado**: Finanzas tiene que pulsar «Confirmar pago» (con el voucher), si no el almacén no despacha una venta al contado.

**13. ¿Por qué no veo precios?**
Si es de postventa, almacén o Importaciones, es una política de gerencia: esas áreas no ven precios ni montos. Ve el estado del pago («Pagado completo», «Pago parcial») y los documentos con los montos tapados. Si es comercial y no ve una cotización, es porque es de otra cartera. (2.3, 2.5, 2.8)

**14. ¿Cómo pido un expediente que es de otro comercial?**
Si le toca atender a un cliente cuyo expediente es de otra persona, use «Pedir el expediente». Escriba el motivo y pida el código del supervisor. El expediente pasa a usted, el dueño anterior recibe aviso y la cartera del cliente no se mueve. Si el expediente ya tiene venta o cierre emitido, lo mueve gerencia. (3.1)

**15. ¿Y si quiero el cliente entero para mi cartera?**
Use «Pedir este cliente para su cartera», con motivo y el código que dicta gerencia. Pasa la ficha con sus expedientes, pero las ventas antiguas siguen siendo de quien las hizo. No aplica a instituciones con sedes, como ESSALUD, Marina o MINSA. (3.1)

**15 b. Mi expediente dice que la ficha está en la cartera de otro comercial. ¿Qué hago?**
El expediente es suyo, pero la ficha del cliente la tiene otra persona, y por eso no ve sus contactos ni su historial. Si el cliente es suyo, use «Es mi cliente — pedirlo para mi cartera» desde ese mismo recuadro (necesita motivo y el código de gerencia). Si la ficha no tiene RUC ni DNI, pídale el traspaso a gerencia. (3.1)

**16. ¿Cuándo se libera un cliente de otro comercial?**
Cuando pasa 3 meses sin venta (regla del 23-09; antes eran 6). Aun así no se mueve solo: gerencia revisa la cartera liberable y redistribuye cada 3 meses. (3.1)

**17. El cliente aparece dos veces. ¿Cómo uno las fichas?**
Desde el aviso «¿Es el mismo cliente?», con «Unir a esta ficha», que pide código de operaciones; o, si el CRM no sugirió la pareja, con «Unir con otra ficha» en la ficha o el expediente: se busca la otra ficha y se elige cuál queda como principal (sin código si las dos son de su cartera). Si las dos fichas son de carteras distintas, decide gerencia. Nunca se borra una ficha: se une. Si el cliente compra con otra razón social, no se une: va como empresa del grupo. (3.1)

**18. «No me aparece el seguimiento que hice.» ¿Dónde está?**
Casi siempre está en otra ficha o en otro expediente del mismo cliente: nombre comercial o razón social, o una ficha sin RUC de un anuncio. Busque por RUC y por parte del nombre. La ficha también le indica si el cliente fue atendido en otra ficha. (3.1)

**19. ¿Por qué mis gestiones de WhatsApp no suman a la meta?**
Desde el 30-09 la gestión por WhatsApp se cuenta aparte, porque inflaba el indicador. Para la meta cuentan las llamadas, correos, visitas y videollamadas con contacto real. (3.2)

**20. ¿Puedo atender a un cliente por mi WhatsApp personal?**
Por regla, no. La comunicación va por la bandeja del CRM. Solo como excepción, y siempre que el cliente le escriba primero con el enlace del CRM. Nunca escriba en frío desde su línea. (3.9)

**21. ¿Por qué me llegó un WhatsApp de un cliente que no es mío, o por qué no me llegó uno?**
Los chats llegan en este orden: al dueño de la cartera si el número ya es de un cliente; si no, al dueño de la campaña; si no, al comercial de turno. Si el anuncio no está enlazado en el CRM, el chat cae al turno. (3.9)

**22. Soy de Central: el cliente ya es de un comercial y volvió a escribir. ¿Lo derivo de nuevo?**
No. Use «Avisarle a C#»: le anota una nota en su expediente, le avisa y cierra el contacto como repetido. No use «Descartar», que significa que el contacto no procedía y afecta la medición de marketing. (3.10)

**23. Soy de Central: ¿por qué me pide código para derivar a postventa?**
Por orden de gerencia del 09-10: Central no deriva a postventa sin autorización. Pida el código a gerencia, administración u operaciones. El aviso a postventa sin derivar no pide código. (1.2)

**24. Me equivoqué al derivar. ¿Cómo lo corrijo?**
«Corregir la derivación» pide el código del supervisor. Si fue un aviso a otras áreas, use «Revertir» en «Lo que derivé», también con código. Si lo que está mal es el texto o el cliente de la solicitud, use el lápiz de «Inicio · lo que solicitó el cliente». (3.10)

**25. ¿Por qué el almacén no puede marcar «Probada y embalada»?**
Porque falta algo del protocolo de alguna máquina: una foto, la ficha con modelo, serie y técnico, o la hoja de chequeo sin ninguna casilla marcada. Una fila de servicio (embalaje, transporte, instalación) solo pide fotos y técnico (desde el 17-10), y un accesorio que acompaña a la máquina principal del mismo pedido solo pide fotos (desde el 21-10). El N.º de protocolo ya no se pide (desde el 14-10) y el PDF o Word tampoco (desde el 21-10). El botón lista lo que falta; para un pedido concreto, consulte qué le falta a cada máquina. (3.7)

**26. Ya marcamos «probada y embalada» pero hay que cambiar algo.**
Hace falta el código de operaciones (Lesly) y un motivo. Lo marcado como probado queda bloqueado a propósito. (3.7)

**27. ¿Por qué el almacén ve el despacho en rojo?**
Porque postventa lo programó sin cumplir todo: falta la apertura emitida, la guía autorizada, el visto bueno de Finanzas (en ventas a crédito) o la recepción de las letras. Sin apertura de despacho no sale nada. (1.11)

**28. ¿Por qué no se puede despachar una venta a crédito?**
Desde el 14-10, toda venta con menos del 100 % pagado antes del despacho, o con letras o crédito, necesita el visto bueno de Finanzas. Hasta que lo dé, se frenan la apertura, la guía y la salida. Si las letras «van con el equipo», el almacén debe marcar que las recibió. (3.6)

**29. Ya despachamos. ¿Por qué no puedo dar el «Despacho verificado»?**
Porque las letras que iban con el equipo no figuran como entregadas al cliente. Desde el 21-10 eso lo registra Finanzas, con fotos y con quién las recibió: avísele por un caso o desde el pedido. Ese paso no se salta con código. (3.6)

**30. ¿Por qué el pedido dice «cerrado» si el cliente no recibió nada?**
Porque «cerrado» no es «entregado». Un pedido se cierra solo cuando su informe de cierre se anula. Revise si el cierre fue anulado y si hay un pedido nuevo. (1.12)

**31. ¿Quién autoriza la guía?**
Contabilidad (la cuenta Facturación), desde el 12-10. Si no está, lo hace Finanzas. Al autorizar se indica el motivo de la guía (venta, traslado, consignación u otro, desde el 14-10) y el comprobante. Si postventa corrige la apertura después, la autorización se anula y hay que volver a aprobar. (1.10)

**32. ¿Desde cuándo corre la garantía?**
Desde la guía de remisión de venta, es decir, desde que la máquina sale de la empresa. Son 24 meses por defecto. Una guía de devolución después de un servicio no da garantía. (3.8)

**33. Soy de postventa: un cliente reclama la puesta en marcha. ¿Abro un caso?**
Si el pedido todavía tiene ese paso pendiente, no es un caso técnico: cierre la atención como «derivado → pedidos» y sígalo en el pedido. Si el pedido está completo, reclasifíquelo (por ejemplo, como refuerzo de capacitación). (3.8)

**34. ¿Por qué mi cotización de postventa siempre va a gerencia?**
Porque desde el 05-10 toda cotización hecha por postventa pide aprobación, a cualquier precio, mientras dure la capacitación del área. No es un error. (3.4)

**35. ¿Qué es un cierre REG y por qué no suma a mi venta?**
Es un cierre de Word anterior al CRM que se regulariza. Recibe el correlativo siguiente y pasa por el circuito para que postventa tenga la historia completa. No suma porque esa venta ya está registrada desde el Excel. Un Word hecho después del CRM no es REG: se carga como cierre normal. Si el equipo de esa venta antigua todavía está en el almacén, se carga como «REG por entregar» y sigue el circuito normal hasta la salida (desde el 14-10). (3.5)

**36. ¿Por qué la venta registrada no coincide con mi cotización?**
Porque la venta se registra por lo que dice el informe de cierre, sin IGV, no por lo cotizado. Si vendió parte de lo cotizado, la venta es esa parte. Revise las notas de la venta. (3.3, 3.5)

**37. ¿Puedo crear un rubro nuevo?**
No. Desde el 04-09 solo operaciones, gerencia y administración crean rubros. Usted puede cambiar el rubro de su cliente eligiendo uno de la lista. Si falta uno, pídalo por el buzón o a operaciones. (3.1)

**38. ¿Por qué no puedo entrar al CRM desde mi casa?**
Por regla de gerencia (23-09), el acceso es solo desde la oficina. La excepción son los perfiles de trabajo de campo autorizados. (2.1)

**39. ¿Cómo pido un archivador (file) del cliente?**
En «Files»: elija el cliente y la empresa (OPEN, EFAMEINSA o ambas) del inventario. Central lo entrega, usted firma «Recibí» y, al terminar, pulsa «Terminé» para que Central lo recoja. (3.10)

**39 b. El cliente está en los Excel antiguos (o tiene file), pero no figura en el CRM. ¿Qué hago?**
Pídale a Santos que lo cargue al CRM. Cuando ya esté, quien lo gestiona pide el file en «Files» y Central lo entrega desde ahí (regla del ingeniero Carlos, 15-10). Antes de pedirlo, busque también por el celular del contacto: a veces la persona ya está en otra ficha del mismo grupo. (3.10)

**40. Quiero que el CRM haga algo distinto. ¿A quién se lo digo?**
Por el Buzón de sugerencias (la bombilla de la barra), con captura si puede. Cuando se resuelva, verá un aviso al entrar. Las sugerencias suman puntos en Crece. Si lo que necesita es un producto, un precio, el stock o corregir una ficha técnica, no es del buzón: use «Pedir a Lesly» (pregunta 40 b). (0)

**40 b. Falta un producto en el catálogo, un precio está mal o necesito saber el stock. ¿A quién se lo pido?**
A Lesly, con el botón «Pedir a Lesly» de la barra (al lado de Sugerencias, desde el 17-10). Elija qué necesita (producto que no está, corregir un producto, precio, stock u otra cosa), escríbalo en una frase, ponga el código o el nombre del producto y, si quiere, para qué cliente es y una foto o la ficha del proveedor. Le llega a Lesly en la campana y su respuesta le llega a la suya. Si lo escribe en el buzón del CRM, el buzón le avisa que es para Lesly y le ofrece mandárselo. Los rubros no se piden: agréguelo usted desde «Cambiar rubro» en la ficha del cliente. (0)

**41. Corregí un cierre emitido con código. ¿Tengo que avisarle a Central o a postventa?**
No hace falta avisar a mano. Desde el 15-10, al guardar la corrección, Central recibe el aviso solo, con quién corrigió, el motivo y qué campos cambiaron; el mensaje de confirmación le dice a quién se avisó. Si el pedido ya existe, también se enteran Finanzas, postventa o el almacén cuando lo que cambió les toca (facturación, entrega, equipos). Lo que sí debe saber: el pedido no cambia solo. Si corrigió equipos, entrega o cliente, Central compara el pedido con la versión nueva y lo ajusta; si le urge, confírmelo con Central. (3.5)

**42. ¿Quién me da el código para corregir mi cierre?**
Solo Central, desde el 15-10. Escriba qué está mal y pídale el código a Central: ella lo coordina con Carlos. El código de Lesly ya no sirve para cierres. (3.5)

**45. Un cliente dice que en su cuenta de efameinsa.com no ve que su equipo salió. ¿Qué pasó?**
Mi cuenta muestra solo lo que está marcado en el CRM con fecha. Revise que el paso («Despacho concluido», agencia, puesta en marcha) esté marcado en el pedido; apenas se marca, aparece en su cuenta y, si está en la lista del piloto, le llega el aviso. El cliente entra con el correo o el celular que figura en su ficha o en «quién recibe». (1.15)

**46 b. En la ficha del cliente no veo todo; ¿tengo que apretar algo para que aparezca?**
No. Desde el 17-10 todo está en la misma ficha: lo vivo en «Resumen» (cada expediente con su cotización, próxima acción y última gestión) y el resto en las pestañas de arriba —Historial, Equipos, Pedidos y casos…—, que quedan fijas al bajar. Para anotar una llamada use «Anotar gestión»: se abre al costado, sin cambiar de pantalla. «Abrir expediente» es solo si quiere el detalle de un negocio. (3.1)

**48. Como postventa, ¿cómo sé si ya se facturó?**
En el pedido, en «Documentos del expediente · Contabilidad y Finanzas»: ahí están la guía, las facturas (las anuladas salen tachadas), las notas de crédito y las liquidaciones. Además, cuando Facturación registra la factura, quien dio la orden recibe el aviso. (1.8)

**49. ¿Por qué no me deja cerrar el pedido?**
Porque falta la puesta en marcha (o el informe del servicio). Llénela con «Llenar informe». Si de verdad no aplica (provincia, el cliente no pidió la visita), cierre con el código de gerencia u operaciones y el motivo. (1.12)

**50. ¿Cómo mando la guía y las fotos al cliente?**
En el pedido, «Enviar guía y fotos al cliente»: abre el WhatsApp con el mensaje armado; adjunte la guía y las fotos y marque «Ya lo envié». Queda registrado quién lo envió y cuándo. (1.12)

**51. El cliente volvió a llamar por el mismo problema. ¿Abro otro caso?**
No hace falta: si el caso sigue abierto, la llamada se suma a ese caso con su fecha. Busque el caso por su código (CASO-…). (1.13)

**52. Necesito que Finanzas o Facturación hagan algo por un cliente. ¿Les escribo por WhatsApp?**
No: Central abre un caso con «Derivar a un área», en la ficha del cliente o en «Sus pedidos». Si es para hoy mismo, márquelo urgente: le suena al área hasta que lo toque, y si en 2 horas nadie lo toma, se avisa también a gerencia. La respuesta vuelve al mismo caso, en «Casos a otras áreas». A RR. HH. todavía no se puede derivar porque no tiene cuenta en el CRM. (3.10)

**54. ¿Dónde veo en qué etapa está un caso o un pedido, y cómo apuro al área que lo tiene parado?**
En la sección «Mapa» (en el caso, en la ficha del pedido y, para el comercial, en su cierre o en «Pagos y facturas»). Ábrala con un clic: lo hecho está en verde, lo que falta en rojo y la etapa atascada palpita. En esa etapa toque «Apurar a <área>»: le llega un aviso con sirena. Una vez cada 15 minutos; desde el segundo apuro se entera gerencia. (3.8)

**55. ¿Cómo le pregunto algo al almacén (o a Finanzas) sobre un caso sin llamar ni escribir por WhatsApp?**
Abra «Chat del caso» en la sección Mapa del caso o del pedido y escriba: les llega a todos los involucrados, sin sacarlos de lo que hacen, y responden desde la misma ventanita. Si hace falta alguien que no está (gerencia, administración, Central…), súmelo con «Agregar a…». Cuando el caso se cierra, el canal queda guardado, de solo lectura. (3.8)

**53. Entró un contacto que es para Finanzas (un pago, una factura, unas letras). En «Asignar» no aparece Finanzas.**
Es correcto: «Asignar» es para comerciales y postventa. Use el botón «A Finanzas o Facturación» de ese contacto, en la bandeja. El caso le llega al área con el mensaje del cliente, y el contacto sale de la bandeja. (3.10)

**47. ¿Cómo llamo a un cliente desde el CRM?**
Toque el número en la ficha del cliente (o «Llamar» en el cotizador). En la app de Android la llamada sale con el plan de la empresa y queda anotada con su duración en la pestaña «Llamadas» de la ficha. Desde el navegador o el iPhone, el CRM abre el marcador y al volver le pregunta cómo le fue. Por ahora las llamadas no se graban. (3, llamadas)

**46. ¿Dónde contesto lo que el cliente escribió en su Mi cuenta?**
En la ficha del cliente o en el pedido o caso, sección «Mensajes de Mi cuenta». Responda ahí: el cliente lo ve en su chat y le llega un aviso. No le conteste por otro canal sin dejarlo anotado. (1.15)

**44. El pedido dice que Finanzas confirmó el pago, pero el cliente solo pagó un adelanto. ¿Puedo despachar?**
No. Finanzas confirma cada abono, no el total. Desde el 15-10 el pedido lo muestra en ámbar: el paso de pago dice «Pago parcial… falta el saldo» y arriba sale un anuncio con cuánto falta. El CRM no deja hacer la apertura hasta que Finanzas confirme lo que falta según la condición de pago, o hasta que gerencia u operaciones autoricen la salida con su código. Si la condición del cierre está mal (dice contado y la venta era con saldo a plazo), el comercial la corrige con el código de Central, o gerencia u operaciones definen la condición en el pedido. (3.6)

**43. ¿Este cierre necesita orden de servicio o de compra?**
Depende del cliente. Lea el cierre completo, revise en la ficha si sus compras anteriores llevaron orden y, si no está claro, pregúntele al comercial. Las empresas medianas y grandes suelen trabajar con orden, y sin ella no se puede facturar ni despachar. (2.2)

---

## 6. Puntos abiertos (no los afirme como reglas cerradas)

- **Garantía:** el registro de series pone 24 meses aunque el cierre diga otra cosa (por ejemplo, 36). Gerencia no ha decidido cuál manda.
- **Preventivo:** la alerta es a los 4 meses (aviso a los 3), pero la Ruta de mantenimiento marca «vencido» a los 6. La diferencia es deliberada, pero gerencia no la ha ratificado.
- **«Dueño del prospecto»** (15 días, 6 meses, permanente): está anunciado, no implementado.
- **Tipificación de WhatsApp en tres opciones:** pendiente de gerencia.
- **Numeración propia para las cotizaciones de postventa:** sin decidir. Hoy comparten serie con los comerciales.
- **Fin de la «postventa en capacitación»:** sin fecha.
- **Que el código de producto muestre siempre su descripción:** depende de los datos del catálogo (por confirmar).
- **Pasar un expediente a la ficha correcta sin código** («misma persona por otra puerta»): construido, pero no consta que esté en uso.
