# Bitácora de Finanzas y Contabilidad: lo que se decidió alrededor del dinero

Vigente al 15-10-2026. Para Finanzas (Jhon) y Contabilidad/Facturación. Complementa la «Base de conocimiento del CRM» (asistente-guia-del-crm.md, en especial 1.7 a 1.12, 2.6, 2.7 y 3.6) y la «Bitácora del CRM» (asistente-bitacora-general.md). Aquí no se repite cómo se usa cada pantalla: se cuenta **qué se decidió, cuándo, quién lo pidió y qué quedó en el aire**, para que pueda retomar el trabajo sin depender de la memoria de una reunión.

## Cómo leer esto

- **La última decisión manda.** Si dos entradas se contradicen, vale la más reciente. Cuando una regla cambió, se dice «antes era…».
- Fechas en formato dd-mm, todas de 2026. «Santos» es el responsable del CRM; «Carlos» es el gerente. Lo que no está verificado se marca **(por confirmar)**.
- Aquí no hay códigos de autorización, números de cuenta, correos ni teléfonos. Los datos vivos (cuánto pagó un cliente, en qué paso va un pedido) se consultan en el CRM.

---

## Cronología de decisiones que tocan su trabajo

### 14-10 (tarde) · Nuevo anticipo por facturar y cierre anulado de AGROCASAGRANDE
- **Un pedido puede facturarse una vez por anticipo** (buzón de Jhon). Caso: PRODECO (PED-0010-2026) pagó un primer adelanto el 30-09, se liquidó y se facturó (E001-826). Luego hizo dos pagos a cuenta más, para facturar como 2.º adelanto, pero la liquidación nueva no le aparecía a Facturación.
  - Ahora, si Finanzas sube una liquidación con «factura pendiente» **después** de la última factura del pedido, el pedido vuelve a «Por facturar» con el aviso «Nuevo anticipo por facturar» y la nota de Finanzas. A Facturación también le llega a la campana.
  - Mientras tanto, ese pedido no sale como «liquidación por actualizar»: le toca a Facturación. Cuando registren la factura nueva, Finanzas actualiza la liquidación con el número, como siempre.
  - Antes era: «Por facturar» solo mostraba pedidos sin ninguna factura.
- **El cierre del servicio de AGROCASAGRANDE (EFAMEINSA 010-2026) se anuló** a las 17:47: lo anuló Ariana con código, motivo «mala coordinación». Su pedido (PED-0028-2026) se cerró solo. **No hay que facturarlo** mientras no se emita un cierre nuevo. A Jhon se le avisó.
  - Desde ese día, quien emitió un cierre también puede anularlo con código. Si lo anula alguien que no es Central, le llega aviso a Central y también a Finanzas si ya tenía el pedido.

### 14-10 15:05 · AGROCASAGRANDE: facturar el servicio de puesta en marcha (llamada con el ingeniero)
- Se vendió aparte el servicio de instalación, puesta en marcha y capacitación de sus 2 secadoras: cotización Presu_2345-26, US$ 450 + IGV (US$ 531), crédito 30 días, aprobada por gerencia.
- Postventa (Ariana) emitió el cierre **EFAMEINSA 010-2026** a las 15:12, con factura y transferencia a 30 días. El cliente necesita la factura para poder pagar: **primero se factura, después cobra** (vale igual si fuera contado).
- Un cierre a crédito no debe pedir voucher. Ariana reportó que se lo pedía; el ingeniero pidió verificarlo.
- ~~Pendiente: Central genera el pedido y Finanzas emite la factura.~~ El cierre se anuló esa misma tarde (ver arriba).

### 14-10 · Crédito con letras, visto bueno de Finanzas y motivo de la guía
- **Ninguna venta a crédito o con letras sale sin el visto bueno de Finanzas.**
  - Lo ordenó Santos a raíz de COFACO (ver «Casos»). Su frase: «pueden salir con venta a crédito pero tienen que llevar sus letras».
  - Aplica a toda **venta** (no a servicios ni a aperturas desde un caso) cuando lo pagado antes del despacho es menor al 100 %, cuando la forma de pago dice letras, crédito, financiamiento o «factura a 30 días», o cuando el abono figura como crédito o sin confirmar.
  - Sin ese visto bueno se frenan tres cosas: la emisión de la apertura, la autorización de la guía y la salida del almacén.
  - Al dar el visto bueno, Finanzas indica el estado de las letras (no lleva, van con el equipo, el cliente las tiene sin firmar, firmadas), su cantidad, la comisión interplaza o bancaria si la hubo, y una nota.
  - Salida de emergencia: código de gerencia u operaciones. Queda escrito «salida autorizada con código, sin visto bueno de Finanzas».
  - Al activarse la regla, unas 24 ventas abiertas pasaron a pedir visto bueno; al ampliar la regla a «factura a 30 días» y a los abonos a crédito, la cifra subió a unas 60.
- **Las letras viajan con el equipo** (Santos, mismo día). El almacén marca que recibió las letras; sin eso no sale. Al entregarlas, almacén, postventa o Finanzas registran a quién se entregaron, con fotos, y se avisa a Finanzas y a postventa. Sin letras entregadas no hay «Despacho verificado», y el código de gerencia no lo salta. Finanzas marca «firmadas» cuando vuelven.
- **Crédito sin adelanto: basta el visto bueno de Finanzas** (Santos). Antes, un pedido con 0 % antes del despacho quedaba trabado para siempre, porque nunca «entraba» lo acordado. Caso: Beneficencia de Huancayo.
- **Pantallas pedidas por Jhon ese día.** «Dar el visto bueno para la salida» abre una ventana de confirmación con forma de pago, letras, comisión y nota. El recuadro aclara que **no es la apertura**: el visto bueno destraba; la guía se autoriza aparte.
  - En la apertura a crédito hay un botón «Validar el crédito» que abre el expediente con el visto bueno ahí mismo. Ya validado, «Ver la validación del crédito» muestra quién, cuándo, letras, comisión y nota.
  - En «Por confirmar» aparece «Créditos ya validados», para una segunda revisión.
  - «Aperturas por confirmar» ahora también muestra la apertura que postventa mandó al almacén pero que el sistema no dejó emitir por falta del visto bueno. Antes el aviso llevaba a una lista donde la apertura no estaba.
- **El motivo de la guía lo pone Contabilidad** (audio de Contabilidad, transmitido por Jhon).
  - La apertura decía «se solicita guía para el traslado del equipo», y eso está mal en una venta. Desde ahora la apertura dice «guía de salida» y Contabilidad elige el motivo al autorizar: **venta**, **traslado** (servicios: se recoge o devuelve un equipo), **consignación** u **«Otro»** con el detalle escrito (por ejemplo, devolución).
  - El CRM propone «venta» si hay cierre y no es servicio, y «traslado» en lo demás; decide Contabilidad. El almacén ve el motivo.
  - Solo rige de aquí en adelante. Lo ya autorizado (Beneficencia de Huancayo) no se tocó.
- **A crédito se factura cuando el cliente está conforme** (Contabilidad). Los días de crédito corren desde la factura; un cliente reclamó porque su equipo seguía en tránsito a provincia y la factura ya corría. Por eso, en ventas a crédito o con saldo, el aviso a postventa le recuerda dar la «Orden a Finanzas para facturar y cobrar» cuando el cliente confirme.
- **«Guías sin comprobante»** es una vista nueva para Finanzas: guías autorizadas sin factura ni boleta anotada. Deja fuera las garantías y los servicios abiertos desde un caso, porque ahí no hay venta que facturar. Ese día había 6, y 3 ya habían salido.
- **Salir con saldo pendiente pide código también a postventa.** Antes bastaba que postventa escribiera un motivo. Casos: Cristo Rey y V y P ICE.
- **Cada etapa del pedido muestra quién la hizo y a qué hora.** Lo marcado antes del 14-10 queda sin nombre.
- **Las cotizaciones de EFAMEINSA traen sus cuentas bancarias** (aviso de Katerine). Antes solo las de OPEN las traían. Son cuatro cuentas (dos bancos, soles y dólares) y salen en el PDF de equipos y en el de postventa.
- **«REG por entregar»: la venta antigua con equipo en almacén pasa por Finanzas.** Caso: Seventh Heaven (Cusco), calandria vendida en noviembre de 2025 con cierre en Word, adelanto y pagos por partes en 2026; se entrega cuando termine de pagar. El REG normal da el pedido por entregado y se habría saltado el visto bueno de Finanzas; el REG «por entregar» sigue el circuito normal. Se cargó como cierre EFAMEINSA 009-2026 con el comprobante del adelanto. **Pendiente de Finanzas:** confirmar cuánto se ha pagado, una vez que Central genere el pedido.
- **Pendientes que quedaron:** visto bueno tardío de COFACO; pagos de Seventh Heaven; Excel de 58 pedidos por regularizar; decisión de Carlos sobre el alcance del visto bueno (ver «Pendientes»).

### 13-10 · Reunión de postventa (Carlos, Santos, Rubí, Ariana, Lesly)
- **«Orden a Finanzas para facturar y cobrar»** como último paso antes de «Pedido cerrado», en todo pedido ejecutado sin cobrar el 100 % antes del despacho (crédito o saldo). La da postventa; a Finanzas y a Facturación les llega campana y correo del área con el cierre, lo pagado, el saldo y la condición. Finanzas la marca «atendida» y se avisa a quien la dio.
  - Carlos lo explicó así: «el 99 % me paga primero; el 1 % voy, viajo, invierto y luego te cobro».
  - Caso: Beneficencia de Huancayo («con esa conformidad se emite factura»).
  - Ese mismo día se ajustó: si el pedido ya está pagado completo, la orden no aparece (AGROCASAGRANDE, crédito ya cancelado). No es retroactiva con lo ya cerrado.
  - «Lo que falta» de postventa también lista los pedidos a los que falta esa orden.
- **Lo que empieza en OPEN termina en OPEN** (Santos). La hoja y la orden de la apertura toman la empresa anotada en el pedido. Caso: Choquehuanca.
- **Pago parcial a la vista** (buzón de Ariana): filtro «Pago parcial» en Pedidos por paso, y un «Informe para Gerencia (PDF)» con cliente, RUC, equipo, forma de pago, qué hizo Finanzas, despacho y qué lo frena. Los montos solo los ve quien tiene permiso. Incluye los pedidos «con saldo por cobrar» aunque aún no tengan abono registrado.

### 12-10 · Contabilidad autoriza la guía; Infocorp por el CRM
- **La guía la autoriza Contabilidad** (la cuenta de Facturación) y, si no está, Finanzas. Lo pidió Jhon por el buzón. Facturación tiene su «Aperturas por confirmar» y recibe aviso al emitirse o corregirse una apertura. El aviso de «guía autorizada» dice quién la autorizó.
- **Pedido sin cobro** (entrega de repuestos por garantía o servicio desde un caso): ya no espera confirmación de Finanzas. El paso de pago dice «Sin cobro: entrega por garantía» (buzón, Rubí).
- **Infocorp se pide por el CRM** (buzón, Brenda): el comercial lo pide desde el expediente, Central lo obtiene y lo sube, y el reporte solo lo ven quien lo pidió, Central y gerencia. Finanzas no figura entre quienes lo ven **(por confirmar si debería)**.

### 10-10 · De qué empresa es la operación (buzón de Jhon)
- El detalle del pedido para Finanzas muestra si la operación es **OPEN o EFAMEINSA**, para buscar el abono en la carpeta y el banco correctos.
- Orden de búsqueda: la empresa del cierre; si no hay cierre, la anotada en la apertura; si no hay nada, Finanzas la marca.

### 06-10 · Apertura → Finanzas → almacén (reunión de postventa y correos)
- Postventa ve un check verde cuando se autoriza la guía y recibe aviso.
- **Si postventa corrige una apertura emitida** (dirección mal escrita, fecha, guía), la autorización de la guía se anula y Finanzas y el almacén deben volver a aprobar.
- El almacén tiene la tarjeta «Guías autorizadas por Finanzas». Caso: Ninamango, que Lesly no encontraba.
- **Correos automáticos según la empresa del pedido:** si nació en OPEN, salen correos de OPEN. Las cuentas del CRM para Finanzas y Facturación no son los correos que el área usa a diario; los avisos por correo van al correo del área que figura en el Directorio.

### 02-10 y 03-10 · Comprobante en la guía y aviso al emitir (Lesly)
- **Al emitir la apertura también se avisa a Finanzas.** Antes solo avisaba al «enviar al almacén»; el pedido de Tomy Jiro quedó sin aviso.
- **La guía lleva tipo y número de comprobante:** factura, boleta o sin comprobante. El número es obligatorio si hay factura o boleta.
- **Abonos confirmados se filtran por el día en que se confirmaron en el CRM**, con atajos hoy y ayer.
- **La forma de pago de una cotización trae su saldo** y avisa en ámbar si se contradice (caso: Gabriela marcó «al contado» y salió 30/70, Agrícola Huarmey).

### 30-09 · Apurar a Finanzas, cobranza y devoluciones
- **«Apurar a Finanzas»** desde la tarjeta del cierre (pedido de Central, caso Ninamango): cuando falta la liquidación. Un aviso cada 10 minutos; desde el segundo, se entera gerencia. Solo funciona si el pedido ya tiene número; sin número, Finanzas no lo ve en «Liquidar».
- **Devolver un cierre que ya está en Finanzas pide código** de gerencia: Finanzas ya trabaja sobre él.
- **«Gestión de cobranza»** como resultado posible de una gestión del comercial («¿En qué quedó?»), con acción sugerida a dos días.
- Caso Cristo Rey: salió con saldo y bastó un motivo escrito. Desde el 14-10 eso ya no basta.

### 29-09 · Facturación
- Contabilidad es la cuenta de Facturación (decisión de Santos). Marca «Enviada al cliente» en cada factura (se puede deshacer).
- En «Por facturar» cada fila muestra la liquidación vigente y las anteriores con su PDF.
- El pedido de Julca (OPEN 024) se reinició para que Central lo genere con la serie correcta; **la factura con la serie errada la corrige Finanzas aparte** (por confirmar si ya se hizo).

### 25-09 · Reunión con Central y Finanzas (rol Facturación)
- Nace la cuenta de **Facturación** con «Por facturar», «Observados» (revisión automática de empresa, RUC, moneda, monto con IGV y orden de compra) y «Facturados».
- **Finanzas ve el expediente completo en solo lectura** (cotización enlazada, orden de compra, cierre, pedido). **Los vouchers que sube Finanzas solo los ven Finanzas y gerencia.**
- Finanzas sube liquidaciones con estado de pago (pendiente, a cuenta, cancelado) y la factura o «factura pendiente». Queda el historial de liquidaciones.
- **Salida con saldo pendiente solo con autorización.** Cada documento sigue la empresa con la que empezó su cadena.
- Central puede imprimir liquidaciones y facturas también en pedidos liberados y levanta las observaciones de Facturación.

### 24-09 · Urgencia a Finanzas
- Central pidió una alerta para «pedidos urgentes porque el cliente requiere factura o quieren despachar». Nace **«Urgencia a Finanzas»**: ventana que no se cierra sola, el pedido sale primero y en rojo en «Pagos por confirmar». Desde el segundo aviso por el mismo pedido, gerencia se entera.

### 23-09 · Finanzas con cuenta propia y liquidación con PDF (gerencia)
- **Finanzas tiene cuenta propia** (Carlos): Jhon confirma los pagos él mismo, con «Por confirmar», «Confirmados», «Cuentas por cobrar» y la opción de **observar** un pago.
- **Central acepta o rechaza la liquidación viendo el PDF de Finanzas**; «Aceptar» exige el PDF. Ejecutar un pedido sin liquidación pide código.
- **El descuento del banco se anota y se avisa al comercial**, con evidencia.
- Postventa ya no registra pagos a mano: pulsa «Solicitar confirmación a Finanzas».
- **Open Investments es la primera opción de facturación** (gerencia): clientes nuevos van a OPEN; si un cliente antiguo pide EFAMEINSA, se intenta mantener OPEN y, si insiste, se factura con EFAMEINSA.

### 14-09 · La condición de pago manda en el despacho (Carlos)
- **Se compara lo pagado con lo acordado antes del despacho, no con el total.** Carlos: la venta a crédito es lo normal de la casa («30 % al contado y lo que falta a crédito, o a todo crédito; siempre ha sido así»).
- El cierre exige porcentaje antes del despacho y días de crédito. Finanzas tiene la opción «entró el adelanto acordado».
- Cuentas por cobrar calcula el vencimiento como fecha de despacho más días de crédito.
- **Check «incluye IGV» por renglón:** se cotiza neto; el check solo se usa cuando la venta se cerró en una cifra redonda con IGV (un comercial dividió a mano entre 1,18 y salió un centavo de menos).

### Agosto y septiembre · Política base
- Política general de pago: **30 % de adelanto y 70 % antes del despacho**; se aceptó al menos un caso 50/35/15. La venta a crédito es normal.
- Desde fines de agosto: **el pago se confirma con Finanzas aunque haya voucher**, porque ha habido vouchers falsos y depósitos con comisión descontada.
- 09-09: **la garantía corre desde la guía de remisión.** Solo las guías de venta fechan la garantía; una guía de un servicio no.

---

## Cómo fluye el dinero en un pedido, paso a paso

Esto es el recorrido visto desde el dinero. El detalle de cada pantalla está en la guía (1.6 a 1.12).

1. **Cotización (comercial o postventa).** Ya lleva la forma de pago y el saldo, y desde el 14-10 las cuentas bancarias de la empresa que cotiza (OPEN o EFAMEINSA). La empresa con la que se cotiza define toda la cadena.
2. **Cierre de venta (comercial).** Fija el porcentaje antes del despacho y los días de crédito, a quién se factura (puede ser otra empresa del grupo del cliente) y adjunta voucher u orden de compra. Una venta a crédito se declara sin voucher. Al emitirse, el cierre queda sellado; corregirlo pide código.
3. **Central verifica.** Pide series, genera el pedido (PED) y, si falta la liquidación, usa «Apurar a Finanzas». Si el cliente necesita factura ya, usa «Urgencia a Finanzas».
4. **Finanzas liquida.** Sube la liquidación en PDF con su estado de pago y la factura o «factura pendiente». Central la acepta o la rechaza con motivo. Con eso Central da «Pedido ejecutado» y el pedido llega a postventa.
5. **Finanzas confirma abonos.** Postventa pide la confirmación; Finanzas confirma u observa (voucher dudoso, comisión descontada). La empresa de la operación indica en qué carpeta y banco buscar. Lo que importa para despachar es haber cubierto **el porcentaje acordado antes del despacho**.
6. **Visto bueno de Finanzas (si es crédito o letras).** Sin él no se emite la apertura, no se autoriza la guía y no sale nada. Aquí Finanzas dice qué pasa con las letras.
7. **Postventa emite la apertura de despacho.** Le llega a Contabilidad y a Finanzas («Aperturas por confirmar») y al almacén.
8. **Contabilidad autoriza la guía** (o Finanzas si Contabilidad no está): motivo de la guía y comprobante (factura, boleta o sin comprobante, con número si corresponde). Si postventa corrige algo impreso de la apertura, la autorización se cae y hay que volver a darla.
9. **Almacén despacha.** Si hay saldo por encima de lo acordado, la salida queda trabada hasta que alguien autorice con código. Si las letras van con el equipo, el almacén debe marcar que las recibió.
10. **Entrega.** Se registra la entrega de letras (si iban) y postventa da el «Despacho verificado».
11. **Conformidad y orden de facturar.** En crédito o con saldo, cuando el cliente está conforme, postventa da la «Orden a Finanzas para facturar y cobrar». Contabilidad factura entonces, porque desde la factura corren los días de crédito. Finanzas marca la orden «atendida» y luego las letras «firmadas» cuando vuelven.
12. **Contabilidad marca la factura «Enviada al cliente»**, y postventa cierra el pedido.

Dos excepciones: los pedidos **sin cobro** (garantía, servicio desde un caso) no pasan por confirmación de pago, y en ellos la guía suele ser de traslado y no aparece en «guías sin comprobante».

---

## Casos que explican reglas

**COFACO Industries (13 y 14-10): el «SI» que no era pago completo.**
- Condición: 50 % de adelanto y 50 % de saldo en 3 letras. En el Excel histórico el abono decía «SI», y era solo el adelanto; el CRM lo leyó como pagado completo.
- Se emitió la apertura, la guía se autorizó «sin comprobante» (la apertura pedía guía de traslado, cuando era una venta) y el equipo salió por recojo en planta sin que la salida quedara registrada en el CRM. Las letras se enviaron después.
- Nacieron: el visto bueno de Finanzas obligatorio, las letras que viajan con el equipo y el motivo de la guía.
- Para que el almacén pudiera registrar la salida que ya había ocurrido, el pedido se marcó «salida autorizada» como regularización del 14-10, hecha por el sistema y no por una persona.
- **Pendiente:** Jhon da el visto bueno «tardío» y marca las letras firmadas; Contabilidad anota la factura; el almacén registra el recojo con guía y fotos.

**Beneficencia de Huancayo (12 al 14-10): crédito sin adelanto.**
- La corrección de su cotización se frenó aunque gerencia ya había aprobado el precio (error de pantalla, pendiente).
- Postventa pulsó «enviar al almacén y a Finanzas» cuando la apertura todavía estaba trabada por falta del visto bueno; el botón quedó como «enviado» sin estar emitida y el almacén no la veía. Se corrigió: ya no se marca «enviada» sin emitir, y «Aperturas por confirmar» muestra ese caso.
- Al ser crédito sin adelanto, quedaba trabada para siempre. Desde el 14-10 basta el visto bueno.
- Cierra con «Orden a Finanzas para facturar y cobrar», porque la factura sale con la conformidad del cliente.

**V y P ICE (14-09): comparar con lo acordado, no con el total.**
- Postventa quiso registrar la salida y el CRM pidió «quién autorizó» por un saldo igual al total de la venta. La condición era 50 % de adelanto y 50 % a 30 días.
- Nació la regla de comparar con el porcentaje acordado antes del despacho y la opción de Finanzas «entró el adelanto acordado».
- Visto en los datos el 14-10: figura un pago «confirmado» con monto cero **(por confirmar con Finanzas)**.

**Cristo Rey (30-09): salida con saldo justificada con texto.**
- Salió con saldo y bastó el motivo que escribió postventa. Junto con V y P ICE, motivó que desde el 14-10 postventa necesite código.

**Choquehuanca (13-10): OPEN que salió como EFAMEINSA.**
- Venta OPEN cuyo informe salió con membrete EFAMEINSA, porque el pedido venía del Excel sin cierre. Regla: lo que empieza en OPEN termina en OPEN. Si un documento sale con la empresa equivocada, revise si el pedido tiene cierre o empresa anotada.

**Ninamango, Huancayo (30-09 al 06-10).** Central necesitaba apurar la liquidación (nacieron los botones «Apurar») y Lesly no encontraba la guía autorizada (nació la tarjeta de guías autorizadas).

**Julca (OPEN 024, 28 al 30-09).** Se facturó con una serie equivocada. El pedido se reinició para generarlo de nuevo; la factura la corrige Finanzas aparte.

---

## Pendientes que les tocan o esperan a gerencia

**Les tocan a Finanzas y Contabilidad**
- **COFACO:** visto bueno tardío, letras firmadas y factura anotada.
- **Excel de 58 pedidos por regularizar** (14-10), que Santos compartió: 6 con letras, 15 a crédito, 33 con pago sin confirmar y 4 por revisar en el CRM; 11 ya estaban embalados. Si el archivo no le llegó, pídaselo a Santos: los mensajes de WhatsApp lo anunciaban, pero el adjunto se manda a mano.
- **Guías sin comprobante:** revisar las que ya salieron y anotar su factura o boleta.
- **Guías autorizadas sin salida registrada** (vistas en los datos el 14-10): Lecarnaque (13-10) y Mercedarias (10-10). Confirmar con el almacén si salieron.
- **V y P ICE:** revisar el pago confirmado en cero.
- **Julca:** confirmar que la factura con la serie errada se corrigió.

**Esperan a gerencia (Carlos)**
- **Alcance del visto bueno:** ¿todo crédito o solo ventas con letras? Hoy aplica a todo crédito. Si Carlos decide «solo letras», la regla se afloja.
- **Facturación como primera opción OPEN:** vigente desde el 23-09; no hay cambios anunciados.
- **Acceso de Finanzas a Infocorp** (por confirmar si se quiere).

**Esperan al CRM (Santos)**
- Error de pantalla que frena corregir una cotización con un precio bajo lista ya aprobado (Beneficencia de Huancayo).
- Las cuentas bancarias de OPEN se copiaron de un modelo antiguo y no se han verificado contra el banco **(por confirmar)**. Si cambian las cuentas de una empresa, avise a Santos para actualizar el PDF de la cotización.
- La empresa del documento cuando el cliente no tiene ningún cierre todavía cae en EFAMEINSA por defecto; falta usar la empresa de la venta histórica.

---

## A quién acudir

- **Jhon (Finanzas):** confirmación de abonos, liquidaciones, visto bueno de crédito y letras, órdenes de facturar, cuentas por cobrar. Autoriza guías si Contabilidad no está.
- **Contabilidad (cuenta de Facturación):** autorización de guías con su motivo y comprobante, facturación y «Enviada al cliente». Al 14-10 no está claro quién de Contabilidad usa la cuenta de Facturación **(por confirmar)**; los avisos de ese día se mandaron a dos personas del área.
- **Santos (CRM):** errores, pantallas que frenan algo que no deberían y pedidos de cambio. **Todo cambio se pide por el Buzón de sugerencias** (botón de la bombilla), no de palabra.
- **Lesly (operaciones):** coordinación con el almacén, códigos de operaciones para salidas excepcionales y correcciones de la apertura.
- **Central (Alondra):** liquidaciones aceptadas o rechazadas, urgencias, Infocorp y observaciones de Facturación.
- **Postventa (Rubí, Gabriela, Ariana):** dirección y conformidad del cliente, apertura, entrega de letras y orden de facturar.
- **Carlos (gerencia):** condiciones de pago fuera de política, salidas con saldo, código de gerencia y decisiones pendientes.
