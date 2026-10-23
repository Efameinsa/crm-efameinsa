# Bitácora del CRM Efameinsa: historia de las decisiones

Vigente al 23-10-2026. Complementa la «Base de conocimiento del CRM» (asistente-guia-del-crm.md). Esa guía dice **cómo funciona hoy** el CRM. Esta bitácora dice **cuándo se decidió cada cosa, quién la pidió, por qué y qué quedó pendiente**.

Sirve para preguntas como «¿por qué ahora piden el protocolo?», «¿quién decidió que postventa no vea precios?», «¿esto siempre fue así?» o «¿qué pasó con el caso X?».

**Cómo leerla**
- **La última reunión manda.** Cada reunión de gerencia deroga lo que contradiga a las anteriores. Cuando una regla cambió, se indica «antes era…».
- Fechas en formato dd-mm, todas de 2026.
- **Quién es quién en las decisiones:**
  - «Carlos» es el gerente.
  - «Santos» es el responsable del CRM y de marketing. Ordena lo que se construye y despliega.
  - «Gerencia» es Carlos (a veces junto a Karen).
- Esta bitácora no trae precios, montos, códigos de autorización ni datos de contacto. Los datos vivos (quién tiene qué cliente, en qué paso va un pedido) se consultan en el CRM.
- Si alguien pregunta por algo que no está aquí, recomiende consultar con Santos (CRM) o con Lesly (operaciones).

---

## Cronología de reuniones y decisiones

### 23-10 · Central deriva solo a Postventa (área) y el aviso al comercial dice quién escribió (Santos, Central, Katerine)
- **Postventa es un área, no una persona (Santos, 23-10; ya lo había dicho gerencia el 29-09):** «Central solo debe derivar a postventa y postventa es un área; cada integrante solito toma el caso como si fuera suyo, pero entre comillas suyo porque es del área; si lo asigna a un personal ya sería un problema». Se midió que en 30 días Central mandó 153 de 158 casos a una persona con nombre. Desde el 23-10 la bandeja de Central ofrece de postventa solo «Postventa (área)»; si por otra vía se elige a una persona de postventa, el CRM lo manda igual al área. El caso queda a nombre de la primera persona de postventa que lo gestiona. Una carpeta que ya tiene quién la lleva no se mueve al derivar al área.
- **El aviso de Central al comercial dice quién escribió (Central por el buzón, caso de Katerine):** un formulario de la web de un cliente de Katerine (HILMOT) entró como prospecto; Central pulsó «Avisarle a C5» y a Katerine le llegó solo la ciudad y la campaña, sin el nombre ni el número de quien escribió. Desde el 23-10 la nota empieza con «Escribió: nombre · teléfono · correo» y así llega al historial del cliente y a la campana del comercial; si Central cambia el texto, esos datos se agregan solos. Se completaron los 4 avisos de ese día. Lo mismo vale al derivar un aviso.

### 23-10 · Stock por empresa, costo visible para gerencia y operaciones, observación del almacén (Santos, gerencia)
- Santos: «tampoco dice de qué empresa; en un rato vamos a subir Efameinsa, que no se vaya a unir». Pidió además quitar del PDF de la subida las columnas de estado y decisión («es un reporte de cómo está todo»), agregar la fecha de ingreso, el costo y un espacio de observación que se llena desde el CRM. «Gerencia dijo que sí deben figurar los costos»: cambia lo decidido el 21-10.
- Hecho y desplegado el mismo 23-10: cada Excel se sube con su empresa y no toca las máquinas de la otra; las 267 máquinas ya cargadas quedaron como OPEN. El costo vive aparte y solo lo leen operaciones y gerencia (probado: comercial y postventa no lo ven). Para que el stock de Open muestre sus costos, Lesly vuelve a subir su Excel de Open.

### 23-10 · Las mesas BIMAP con su número de serie y el PDF de stock que se desarmaba (Santos)
- Lesly subió su Excel nuevo (262 máquinas) después de vaciar el almacén. Santos vio dos fallas: las mesas BIMAP salían «sin serie» aunque el Excel les pone 1, 2, 3…, como se acordó; y en el PDF de industriales los modelos largos sin espacios se salían de su columna.
- Hecho y desplegado el mismo 23-10: el número de la caja queda como serie, único dentro de su código, y las 5 mesas de la carga de Lesly entraron con 1, 2, 3, 4 y 6. El modelo largo se parte dentro de su columna.

### 23-10 (11:01) · Lo que gerencia decidió al revisar los correos automáticos a clientes (Carlos, Santos)
- **Repuestos:** cuando se vende solo el repuesto, Efameinsa no coordina la instalación ni entrega guías de instalación; el cliente la hace con su personal. La instalación se coordina solo cuando se vendió con instalación (en provincia, normalmente el cliente envía la máquina o viaja el técnico). Por eso el correo «Repuesto enviado» ya no ofrece coordinar ni guía.
- **Mantenimiento preventivo:** no se promete «gratuito». El correo de suscripción dice «mantenimiento preventivo para clientes, cuando lo programemos».
- **Avisos que por ahora no salen:** garantía registrada (gerencia va a definir desde cuándo corre la garantía), equipo en camino, salida de planta con fotos, visita reprogramada (ese aviso tiene que ser personal, no automático) y «el técnico salió».
- **Los artículos y cambios de la web** se revisan en mkt.efameinsa.com, pestaña «Contenidos web», con los botones Aprobado / Observación / No va, igual que los correos.

### 23-10 (tarde) · Rediseño de las pantallas de postventa (Santos, con el caso de Brenda)
- **Qué se pidió.** Santos: «haz una reingeniería de las vistas de postventa para quitar redundancias y darle todo más amigable porque son muchas opciones y se pierde la señorita». Antes pidió un análisis completo y verlo en una copia local; dio el visto bueno y se desplegó el mismo día.
- **Qué se encontró.** Postventa era el perfil con más pantallas del CRM: once opciones de menú, diecisiete pestañas y tiras de navegación dentro de otras. El mismo caso aparecía en cuatro lugares, el mismo pedido en cinco y la misma llamada al almacén en seis. La ficha del cliente decía lo mismo tres veces («Pendiente con este cliente», «Expedientes vivos», «Lo que sigue»). «Hoy» abría con 193 filas atrasadas, casi todas «Caso nuevo sin tomar», una por cliente. Cuatro palabras para lo mismo (atención, caso, expediente, carpeta) y «apertura» para cuatro cosas distintas.
- **Dos casos que lo motivaron.** (1) Inversiones Turísticas Centenario: Brenda derivó una videollamada desde la ficha y no salía en el caso ni en Casos, porque el botón de la ficha no sabía de qué caso era; 31 de las 48 llamadas vivas del área estaban sueltas. (2) Elvis Choquehuanca: el paso «Guía y fotos enviadas al cliente» decía «le toca a postventa» sin ofrecer botón; el botón estaba en otra parte de la pantalla. Son dos problemas distintos: uno de enlace entre objetos, otro de pantalla.
- **Qué se decidió y se hizo.** Menú de seis opciones de trabajo (Hoy, Casos, Pedidos, Clientes, Agenda, Vender) más Panorama y «Apoyo». «Atenciones» pasa a «Casos» con una sola tira (Por tomar · En curso · Llamadas al almacén · Cerrados · Reportes y archivo). Pedidos con sus seis vistas como pestañas. Hoy agrupa lo repetido y avisa «Caso sin avance». La ficha tiene un solo panel «Abierto con este cliente» con la carpeta y lo que cuelga de ella. Toda llamada al almacén cuelga de un caso, y el caso avanza con lo que se ejecuta (derivar o emitir apertura → Planificación; informe del almacén → Atención). El paso de guía y fotos tiene su botón. Una palabra por cosa: caso, carpeta, llamada al almacén; «Derivar llamada al almacén» y «Registrar caso» en todos lados. Detalle en la guía, 2.3.
- **Datos corregidos ese día.** 14 llamadas sueltas se unieron a su único caso abierto (entre ellas la de Centenario al CASO-00019) y 8 de esos casos pasaron de Registro a la etapa que su llamada implica. Todo con respaldo y reversible.
- **Lo que pidió Brenda el mismo día, hecho y desplegado.** (1) En «Registrar gestión», tres resultados para postventa: Atendido, Llamada derivada al almacén e Informe enviado al cliente (mandó la captura del formulario: «aquí agrega… atendido… llamada derivada… informe enviado»). (2) Unir fichas repetidas desde la lista de Clientes marcándolas: buscó «logisminsa» y salían tres fichas del mismo cliente («unir, uno solo, es lo mismo»).
- **Brenda preguntó cómo ve postventa sus cotizaciones pendientes de gerencia** («no es como comercial, que tiene su pestaña al costado»). Estaban en Vender › Cotizaciones, en «Lo que pasó por gerencia», mezcladas con las aprobadas y sin contador, y ese día no había ninguna pendiente del área. Se hizo: tarea en Hoy por cada una, número en rojo en la pestaña Cotizaciones y chips con conteo en el bloque de gerencia.
- **Pendiente.** Quedan 17 llamadas sueltas de clientes con varios casos abiertos: se unen a mano desde el caso. Santos verá con gerencia si «Casos anteriores» (que son carpetas) se archiva del todo.

### 23-10 · Los avisos pequeños de abajo a la derecha se cierran con la «×» (Santos)
- Santos pidió que las notificaciones pequeñas que salen abajo a la derecha tuvieran botón de cerrar: llegaban sin forma de quitarlas y había que esperar a que se fueran solas.
- Hecho y desplegado el mismo 23-10: cada aviso trae una «×» arriba a la derecha. De paso, en el celular ya no tapan el menú inferior y en la computadora salen por encima de Efamein.

### 23-10 · La celebración al cerrar un pedido o un caso y al pasar de un estado a otro (Santos)
- **Qué pidió Santos.** Como en Asana, donde al terminar una tarea sale un unicornio o confeti, que el CRM celebre el avance, pero con la marca y en tono corporativo: «al cerrar un caso o un pedido debe salir Efamein celebrando, y cuando se termina un estadio o se pasa de un estado a otro, la animación del sello».
- **Cómo quedó (ver la guía, «La celebración»).** Dos animaciones cortas, hechas con el isotipo y con Efamein: al **cerrar un pedido o una atención (o dar por cerrado un caso de Central)**, Efamein sale al centro de la pantalla con confeti granate y carbón (dos segundos); al **pasar de un estado a otro** (aprobar el pedido, marcar un paso, despachar, confirmar un abono, dar el visto bueno, ordenar facturar, cerrar una etapa de la atención, marcar una tarea como hecha…), la «e» del isotipo cruza por arriba de la pantalla y estampa un sello. No bloquea nada ni hay que cerrarla; quien tiene «reducir movimiento» en su equipo no la ve.
- **Por qué.** Es la misma idea de Asana: que el avance del trabajo se note y se celebre, para que cerrar y avanzar se sienta como un logro y no solo como un clic.

### 23-10 · El «Mapa» del recorrido con «Apurar» (Santos)
- **Qué pidió Santos.** Que en el caso de postventa haya una sección «Mapa» donde se vea en qué etapa está: lo avanzado en verde suave, lo que falta en rojo, la etapa atascada palpitando y un botón para apurar al área que lo tiene parado. Que lo vean también el comercial (si nace de una venta suya), Finanzas, Facturación / Contabilidad, el almacén y Lesly (operaciones).
- **Cómo quedó (ver la guía, «El mapa del recorrido y Apurar»).** El mapa lee los pasos que ya existen (los mismos que «qué sigue» en el pedido y la tira del circuito en el caso); no guarda nada aparte. «Apurar» manda un aviso con sirena al área; uno cada 15 minutos por área y, desde el segundo, también a gerencia.
- **Más tarde, el mismo día (Santos):** el mapa se abre en pantalla completa con un carril por área, como mapa.efameinsa.com; el «Apurar» llega con zumbido (pantalla que tiembla y «bzzz», solo las dos primeras veces); el aviso dice quién apura, qué paso y desde cuándo, y abre el mapa encima sin sacar a nadie de su pantalla («no debe sacar al usuario de lo que ya estaba haciendo»). Y **cada caso y cada pedido tiene su chat** entre las áreas involucradas hasta que se cierra («para que cada caso tenga su propio canal de chat con los involucrados»).
- **El mismo día:** el mapa de procesos de postventa pasó de 12 a 15 diagramas: carpeta de postventa y casos del cliente, servicio en planta (apertura interna y recepción) y casos de Central a Finanzas o Facturación; y se pusieron al día el pedido liberado, el despacho, la puesta en marcha y el caso técnico.

### 22-10 (10:29) · El almacén por serie es la punta de partida y sigue al pedido (Carlos, Santos, Lesly)
- **Serie de facturación (Open / Efameinsa).** Carlos explicó que la pauta comercial de este mes (vender con Efameinsa, probablemente solo hasta fin de mes, solo para algunas comerciales) la coordina él con cada persona y **no es un tema del CRM**: el sistema es para elegir y «ellos solamente harán el clic». Pidió que todo se mantenga como estaba: Open en comercial y Open en postventa por defecto. Santos no cambia nada por ahora. (Por confirmar: desde el 21-10 el CRM propone Efameinsa para equipos por indicación de gerencia; Santos lo verá con el ingeniero.)
- **Postventa puede pedir, no cambiar la estructura.** Carlos (lo repite desde hace semanas): las áreas pueden solicitar lo que consideren, pero no cambian la estructura ni el procedimiento, y Santos no debe responder «ya te lo cambio»: se escucha, se anota y se ve en una reunión. «Si no, cada rato vamos a estar cambiando.»
- **Qué revisó Carlos en «Stock y códigos».** Que todo se numere; que las LG salgan totalizadas por modelo (ya estaba); las mesas Bimap vienen con 1, 2, 3… como serie porque en la caja no se ve la placa: hay que abrirlas y tomar la serie real; las UCT060 siguen sin código en el Excel de Lesly (ella lo revisa); confirmaron que de Sailstar WET solo hay dos máquinas (WET17 y WET23).
- **La regla que fijó Carlos.** El listado por serie del almacén es «la punta de partida»: el catálogo tiene una ficha por código y muestra la **suma** de las series que hay (50 Titan Max = 50 en la ficha); los industriales con distinta configuración (UCT060 de 100G y de 200G, M9 y M30) son fichas distintas. **Cuando se vende, se descuenta solo:** Central pide la serie para el pedido, Lesly ya no corta y pega en su Excel, «solamente le da un check» y la máquina queda para ese pedido; si el cliente cambia de equipo, se libera y vuelve al stock; cuando sale, queda despachada. «Esto tiene que estar bien fino.» Cada máquina debe decir si es de Open o de Efameinsa, y la fecha de ingreso debe estar (el costo no; la vista del comercial, con columnas ocultas, se ve después). Las fichas de los códigos nuevos hay que hacerlas sí o sí (duplicar la parecida y corregir), con las medidas del catálogo de Estados Unidos, no las de Internet.
- **Hecho el mismo día (ver la guía, «Almacén por serie», «El almacén sigue al pedido», «Elegir del almacén», «Lo que está por llegar», «Cotejo con el catálogo» y «El inventario que ve el comercial»):** el almacén por serie numerado con totales en pantalla y filtros por proveedor, marca y empresa; la reserva y la salida automáticas desde el pedido; la proyección de lo que viene de Importaciones (se ve, no suma); el cotejo con el catálogo al subir el Excel; el inventario para el comercial con columnas ocultas y marca de agua; y gerencia ve «Stock y códigos» en su menú (Carlos: «ese módulo todavía no lo puedo ver yo»). Tu Excel «ya debería estar en la historia» (Carlos a Lesly).
- **Pendientes.** (1) Lesly: terminar la revisión y pulsar «Subir al almacén» (hasta entonces el catálogo sigue con la cifra vieja), poner los códigos que faltan (UCT060), abrir las Bimap para la serie real, hacer las fichas de los códigos nuevos (medidas del catálogo de EE. UU., no de Internet) y anotar lo que Importaciones tiene en camino. (2) Santos: aclarar con Carlos la serie por defecto (Open en todo, o Efameinsa para equipos como está desde el 21-10); el correo W0 de visita a la web nueva sale primero; los demás correos y los artículos, después y con doble revisión. (3) Brenda: el ingreso de una máquina a planta y pedir stock a Importaciones o al almacén al cotizar quedaron como «siguiente etapa».

### 22-10 (10:08) · El «Resumen general de stock» de los lunes lo arma el CRM (Santos, Lesly) (resumido)
- Resumen: Lesly pidió que el «Resumen general de stock» que Importaciones entrega los lunes a las comerciales salga del CRM en dos documentos (industriales por proveedor y tipo; LG consolidado por modelo, con totales). Ese mismo día quedaron los botones «Industriales (PDF)» y «LG (PDF)» en «Stock y códigos» y en «Stock» del comercial; al subir el Excel el almacén guarda código de Importaciones, descripción, modelo, capacidad y proveedor. Una celda UBICACIÓN con un número (costo corrido) se lee como PLANTA; una serie que estaba a la vez en stock y vendida viene como «No subir».

### 22-10 · Lo que llegó de postventa, Central y Katerine (Brenda, Central, Katerine, Santos) (resumido)
- Resumen: **El historial del caso no se edita** (Brenda, CASO-00026): cada línea dice de dónde viene y «Ver ›» lleva a ese lugar; para corregir se registra una gestión nueva (permitir editar sería decisión de gerencia). **Venta registrada por error** (Brenda, Granja Rinconada del Sur): Santos la anuló (queda en gris como «Venta anulada»); si le pasa, avise de inmediato a Santos o a gerencia y no registre otra encima; el botón «Anular venta» está por confirmar. **Cotizaciones de los clientes de su cartera** (Katerine, Clínica Jesús del Norte): desde el 22-10 el comercial ve también las del archivo hechas por otra persona («hecha por Cx»). **«Fichas repetidas»** (Central): si es el mismo cliente, «Unir a la primera» con una frase de por qué; si no, «No son el mismo cliente»; comparar teléfonos, contactos, dirección y RUC en SUNAT, y **ante la duda, no unir**. **Más clientes movidos a C1** (Katerine): VITALIAN y otros cuatro, todos soporte técnico derivado por Central a la cuenta comercial C1; se deshicieron los seis.

### 22-10 · «Cuenta sin nombre» ahora dice de quién es la ficha (Santos, Katerine) (resumido)
- Resumen: a Katerine no le aparecía la Clínica Jesús del Norte porque la ficha con RUC era de otra cartera y ella solo tenía fichas sin RUC; su expediente decía «Cuenta sin nombre». Se unieron las tres fichas y el cliente pasó a Katerine (las ventas antiguas siguen contadas a quien las hizo). Desde el 22-10 el expediente muestra nombre, RUC, en qué cartera está la ficha y «pedirlo para mi cartera» (también en Hoy, agenda y cierres). Pendiente (gerencia, por confirmar): una lista para decidir en bloque unos 220 expedientes en esta situación.

### 21-10 (noche) · La serie de facturación sale sola y lo que resolvió el buzón (gerencia, Lesly, almacén, Diana, Jhon) (resumido)
- Resumen: desde el 21-10 la serie sale sola: equipos con EFAMEINSA, repuestos y servicios con OPEN, sin motivo, en cotizador y cierre (antes «Open primero» con justificación; ver la entrada del 22-10 10:29, por confirmar con Carlos). La serie de la secadora de la torre se corrige o quita con código y queda escrita en el pedido con aviso a Central, postventa y almacén (Lesly). Un accesorio que acompaña a la máquina principal del pedido solo pide fotos (almacén, VITALIAN). «Todo N/A» por energía en las hojas de calderín, prensa y rodillo (Diana). Cuando se corrige un cierre y cambia el total, el pedido abierto toma el nuevo total solo (Jhon; detalle en Finanzas).

### 21-10 · El stock de Importaciones se sube codificado al CRM (Lesly, el ingeniero, Santos) (resumido)
- Resumen: Lesly codificaba a mano el Excel de stock de Importaciones y se le duplicaban códigos; desde el 21-10 lo sube a «Stock y códigos» y el CRM propone el código de cada máquina. Reglas del ingeniero ese día: solo hojas de stock (industriales y LG), sin reserva ni vendidos, y sin costos (antes era; desde el 23-10 gerencia decidió que el costo sí figure, visible solo para operaciones y gerencia). La primera comparación (282 máquinas) encontró lavadoras Giant C Max con código de secadora, códigos inexistentes, series en planta que ya tenían cliente y fichas cruzadas en el catálogo; Lesly las revisó con Santos el mismo día (código por panel M9/M30, código nuevo para las Sailstar con aire FRL).

### 20-10 (tarde y noche) · Brenda corrige los datos de cualquier cliente, antecedentes del equipo y fichas unidas (Santos, Brenda, almacén) (resumido)
- Resumen: Brenda corrige desde PV2 y C1 nombre, RUC o DNI, rubro, dirección de la empresa y contactos de cualquier cliente (el dueño recibe aviso; caso Family Farms); ese poder es sobre los datos, no sobre lo comercial (Santos revirtió que PV2 viera cotizaciones de otras carteras); «Antecedentes del equipo» en la ficha del equipo y el caso; se unieron LAVIPRONTO, Operador Nacional de Hoteles y Family Farms; «Salieron, sin guía» cuenta igual en el Panorama y en la lista.

### 21-10 · Imágenes que completan una gestión, sin registrar otra (Santos) (resumido)
- Resumen: en el historial del expediente cada gestión tiene un «+» para agregar imágenes sin registrar una gestión nueva (Santos: inventar una gestión para colgar una foto ensuciaba la historia). Lo agregado queda con nombre y hora; la nota no se toca.

### 21-10 (tarde) · Letras, fichas unidas, una cartera que se movió por error y fotos en la gestión (Santos) (resumido)
- Resumen: las letras entregadas las confirma Finanzas (antes también almacén y postventa). Se unieron unas 640 parejas de fichas parecidas al 100 % (menos las de WhatsApp con solo un nombre). Caso Servicios Alimenticios y Afines: el cliente «desapareció» de la cartera de Katerine porque Central derivó un reclamo a la cuenta comercial C1 en vez de a postventa; se deshizo. **Lección:** un reclamo de postventa va a Postventa (área); ante «el cliente desapareció de mi cartera», mirar primero quién lo derivó. El afiche del almuerzo del 22-10 se publicó como comunicado interno.

### 21-10 · Agenda del almacén y su cierre del día (Santos) (resumido)
- Resumen: Santos pidió la agenda del almacén enfocada en sus actividades. Las tareas son del área; la meta es cero colgados (ninguna prueba esperando más de 2 días, ningún despacho atrasado, ninguna salida sin cerrar); gerencia ve su cierre del día. Antes se midió que en 18 de 25 salidas no quedaba quién las hizo: ahora todo deja rastro. Pendiente: mapear las «otras gestiones» recurrentes cuando Lesly y Diana las enumeren.

### 21-10 · El protocolo ya no pide Word (Lesly) (resumido)
- Resumen: ninguna máquina exige PDF ni Word para «Probada y embalada» ni para terminar un protocolo de stock (Lesly); se piden fotos, modelo de la placa, serie, técnico y, si hay hoja, una casilla. Lo que se cambia en almacén para Lesly vale para todas las cuentas de almacén.

### 21-10 · Central deriva casos a Finanzas y Facturación (Santos) (resumido)
- Resumen: a pedido de Santos, Central deriva casos a Finanzas y Facturación («Derivar a un área»; cada área tiene «Casos de Central»), porque antes solo tenía la urgencia sobre un pedido liberado y lo demás iba por WhatsApp. Urgente = 2 horas; si nadie lo toma vuelve a sonar y se enteran Central y gerencia. RR. HH. queda para cuando tenga cuenta.

### 21-10 · El pedido de servicio no pasa por el almacén (Santos) (resumido)
- Resumen: Santos: al almacén se le pide código solo cuando es producto. En el paso 1 del pedido Central elige Producto o Servicio; con servicio el pedido nace sin avisar al almacén y trae un «Detalle del servicio» editable (descripción, cantidad, serie, precio opcional).

### 21-10 · Central edita «Equipos y series» del pedido (Santos, por Central) (resumido)
- Resumen: el pedido de FAMILY FARMS (dos preventivos) salió sin detalle porque las líneas de servicio no arman fila. Desde el 21-10 Central puede traer las líneas del cierre, agregar equipo o trabajo, corregir el texto y quitar filas hasta que el pedido salga; cada cambio queda en las observaciones.

### 21-10 · Fichas parecidas para revisar a mano (Santos) (resumido)
- Resumen: «Fichas repetidas» tiene la pestaña «Parecidas» con cada pareja lado a lado y su porcentaje para unir o descartar a mano (Santos).

### 21-10 · «El macro» del almacén y operaciones (Lesly, por Santos) (resumido)
- Resumen: «El macro» de almacén y operaciones, como el de postventa, con cada número enlazado (Lesly).

### 20-10 (tarde, 15:45) · Casos que se terminan, fichas gemelas, torre y stock (gerencia con Lesly, Brenda y Santos) (resumido)
- Resumen: gerencia («nunca se termina un caso porque están superponiendo los casos») decidió que cada gestión se anota en un caso, con un color por caso, reclasificar y cerrar en la línea de tiempo y «No se solucionó en la visita»; el CRM reconoce el DNI dentro del RUC 10 y se unieron las fichas de la misma persona; la apertura interna crea la recepción del almacén; en la lista de máquinas del caso, solo equipos (no repuestos), la torre como lavadora + secadora; regularizar pedidos antiguos empezando por los de garantía; el comercial necesita el stock (de ahí el trabajo con el Excel de Lesly del 21-10).

### 20-10 (noche) · Apertura de servicio interna o externa (Santos) (resumido)
- Resumen: la apertura se emite como externa (el técnico va al cliente) o interna (el equipo viene a planta); la interna lleva los antecedentes del equipo (compra, guía, garantía, problemas y repuestos anteriores) para el técnico de planta.

### 20-10 (noche) · Fotos del pedido y el historial del caso (Santos, revisando el caso de Lino Espíritu) (resumido)
- Resumen: las fotos de la carga del pedido se abren con «Ver fotos (N)»; «El circuito» muestra todo el historial del caso (caso Lino Espíritu, dos casos de la misma falla en dos fichas). Desde el 22-10 ese historial dice de dónde viene cada línea y no se edita.

### 20-10 (noche) · Lo que resolvió el buzón: protocolos, búsquedas del almacén y Family Farms (Lesly, almacén, Brenda) (resumido)
- Resumen: el N.º de protocolo lo pone el CRM en correlativo (0003-2026…; antes era a mano); «Protocolos» a la mano en «Mi día»; las revisiones técnicas salieron de «Salieron, falta la guía»; los buscadores de Pedidos y de «Aperturas de postventa» encuentran también los cerrados y sugieren parecidos; Family Farms quedó en una sola ficha con RUC (Agroinversiones Valle y Pampa sigue aparte, es otra empresa).

### 20-10 (tarde) · «Unir con otra ficha» para los comerciales (Katerine, por Santos) (resumido)
- Resumen: caso Lavanderías GLUP (un contacto conocido escribió por WhatsApp y el CRM abrió otra ficha). Si el celular y el nombre coinciden con un contacto de la ficha, se une a esa; y el comercial tiene «Unir con otra ficha» (busca, elige la principal, motivo; sin código si las dos son de su cartera, con código de operaciones si alguna es de otra). Se deshace desde el registro de acciones.

### 20-10 · Prueba de usuario de postventa y finanzas (gerencia con Brenda, Jhon, Lesly y Santos) (resumido)
- Resumen: Carlos recorrió el CRM con Brenda usando Beneficencia de Huancayo, Family Farm y Comercial Lernake. Quedó hecho el mismo día: nada por correo entre postventa, Finanzas y Facturación (orden de facturar, factura y nota de crédito por el CRM); la gestión de postventa se llena entera (qué se habló y próxima acción, o se cierra) y ya no quedan expedientes vacíos; el expediente dice quién lo abrió; cerrar el pedido marca las series del pedido, elige el inicio de la garantía y sin puesta en marcha pide código y motivo; en la ficha, para postventa, primero pedidos y casos abiertos; el pedido muestra los documentos de Comercial y de Contabilidad y Finanzas; fotos del pedido con título y «Pedir al almacén»; «Enviar guía y fotos al cliente» deja registro (Carlos: «con 30 clientes no hay forma de controlarlo a mano»); cada caso técnico con código CASO-00001 y la nueva llamada se suma al caso abierto (Lernake); sin RUC ni DNI no se emite el cierre y nace «Fichas repetidas»; postventa quita un contacto mal puesto con aviso al dueño; «Ampliar» en «Anotar gestión»; orden de recepción y revisión de equipo desde el caso. Segunda tanda: la apertura no se manda por correo sin emitirla (ANDEX); la orden de facturar sin puesta en marcha pide código; fotos del protocolo en orden y reordenables; el comercial ve la factura; un pedido cerrado sin fotos sigue pendiente para el almacén. Viáticos y stock de repuesto: diseñados, después. Pendientes: nota de crédito de Beneficencia (Jhon) y enviar la guía por la API de WhatsApp.

### 19-10 (tarde) · Lo que resolvió el buzón: abono en la liquidación y corrección de la guía (Jhon, almacén) (resumido)
- Resumen: Finanzas confirma un abono ya acreditado desde «Generar liquidación»; el almacén corrige la guía o las fotos de una entrega ya registrada con «Corregir la guía o las fotos» (sin cambiar la fecha; postventa recibe aviso; caso ABACHI).

### 19-10 · Validación de los avisos al cliente: gerencia opina y prueba del recorrido (Santos)
- Resumen: los gerentes opinan (Aprobado, Observación o No va) sobre cada correo, WhatsApp y secuencia de avisos al cliente en la herramienta de marketing, sin editar; el recorrido se prueba con las cuentas de práctica de Central, comercial, almacén, finanzas, operaciones y postventa, y los avisos solo le llegan a Santos. Etapa de validación: nada se envía a clientes.

### 19-10 · Brenda ve la agenda de las tres postventas (Santos) (resumido)
- Resumen: Brenda (postventa 2 desde ese día) ve también las tareas y pendientes de Rubí y Ariana, con el nombre de quien los anotó, solo para consultarlos; ellas siguen viendo solo los suyos.

### 19-10 · Apertura que «no llegaba» y constancias de pago para Central (Santos; buzón de Jhon) (resumido)
- Resumen: la apertura de VIDAWASI (PED-0035-2026) «no llegaba» porque al programar el despacho se pulsó también «Registrar la salida» por error; Santos lo deshizo. Regla: «Registrar la salida» solo cuando el equipo salió de verdad; si una apertura avisada no aparece, revisar si figura como salida. Central ve las constancias de pago para el expediente físico, y la liquidación de Finanzas muestra el expediente del cierre y lo gratuito aparte.

### 19-10 · Cierres: el cliente de un expediente antiguo sale como «cliente antiguo» (pedido de una comercial, Santos) (resumido)
- Resumen: el CRM propone «Antiguo» también cuando el cliente viene de un expediente antiguo de los Excel; las pastillas «Antiguo / Nuevo» están a la vista en «Se le factura a» y en la corrección del cierre emitido.

### 19-10 · Pagos: varios vouchers (pedido de una comercial) (resumido)
- Resumen: «Avisar que el cliente canceló» y «Preguntar si hubo comisión» aceptan hasta 10 vouchers (antes uno).

### 17-10 · Buzón: el aviso lleva al pedido, servicio sin Word y la ficha con pestañas para Central (Central, Lesly)
- **El aviso abre el pedido (Central):** desde el aviso nuevo de la campana no se podía ir directo al cliente para imprimir la factura o la liquidación que acababa de entrar. Desde el 17-10, los avisos de liquidación, factura, observación de Facturación, series listas y cierre corregido traen «Abrir el pedido», que abre Central > Cierres ya buscado por el número de pedido, con «Abrir / imprimir» de cada liquidación y factura. Los avisos que ya estaban en la campana también quedaron con el enlace. (resumido; el detalle está en la guía).

### 17-10 · La liquidación de Finanzas la arma el CRM (gerencia, Jhon, Santos) (resumido)
- Resumen: el CRM genera la liquidación con el pedido, los abonos y las facturas y Finanzas la completa y valida; una por cada pago o factura, mismo formato; la comisión del banco la cobra el comercial; con detracción o retención postventa puede despachar.

### 17-10 · Grupo Turismo Costa del Sol: los hoteles se ven desde la empresa madre (Ariana, Santos) (resumido)
- Hotelera Cusco y las demás empresas de Costa del Sol se colgaron del grupo Turismo Costa del Sol (la cotización se sigue facturando a Hotelera Cusco y la cartera no cambió); la ficha de una empresa con grupo muestra los expedientes de las otras. Pendiente: unir las fichas «Turismo Costa del Sol» sin RUC.

### 17-10 · Las casillas del protocolo se ven como botones (Ariana) (resumido)
- Las casillas ✓/✗ del protocolo ahora se ven como botones y la hoja explica cómo marcar y guardar (Ariana no veía dónde marcar).

### 17-10 · La ficha del cliente muestra todo y se anota sin salir de ella (Ariana, Santos) (resumido)
- Cabecera más chica en la ficha del cliente y «Anotar gestión» al costado, sin salir de la ficha (Ariana no veía toda la información). Pendiente con gerencia: un «Resumen» para postventa.

### 17-10 · Mi cuenta del cliente en efameinsa.com y avisos por cada estado (Santos) (resumido)
- «Mi cuenta» del cliente en efameinsa.com lee el historial del CRM y los avisos por cada estado quedaron en piloto. Pendiente: chip del WhatsApp de atención al cliente, plantillas de Meta y visto bueno de Santos a los textos.

### 17-10 · Postventa: una carpeta por cliente (Ariana, Santos)
- Resumen: Ariana no encontraba su trabajo (ECOLAV, Choquehuanca) porque había 385 expedientes de postventa abiertos para 277 clientes. Santos decidió una carpeta por cliente, con cada asunto como caso con su responsable; ayudar no quita la carpeta, cada acción queda con su nombre y existe «Hoy cubro a…». Ese día se unieron 108 expedientes (277 carpetas para 277 clientes). La unión de cotizaciones no se deshace con un clic: se pide a Santos.

### 17-10 · Pedir a Lesly, la versión nueva sin recargas sorpresa y la ficha que llega al pedido (Santos) (resumido)
- «Pedir a Lesly» para productos y catálogo (ya no por el buzón del CRM); la versión nueva ya no recarga sola la pantalla; la ficha corregida se pone al día en el pedido y la máquina abiertos.

### 16-10 (noche) · Cotizaciones: descuento al final del total y el aviso «falta confirmar» (Katerine, Ariana, Santos) (resumido)
- Descuento o paquete especial debajo del total del cotizador, con gerencia (Katerine). Caso ECOLAV: Ariana no encontraba la cotización que gerencia aprobó en un expediente de Rubí. Regla de Santos: «todos deberían poder ver todo… pero la acción que cometa alguien debe quedar registrada con su nombre»; el aviso llega a quien la armó y al dueño, y dice «aprobada · falta confirmar».

### 16-10 (tarde) · Buzón: postventa, almacén y comerciales
- **Contactos en casos de otra compañera (Ariana, COR-PORACION 3C):** no podía guardar el contacto porque el caso estaba a nombre de Rubí. Desde el 16-10, cualquiera de postventa agrega y corrige contactos en los clientes con caso de postventa, a nombre de quien sea (igual que ya pasaba al cotizar). Es la misma regla: el caso es del área. (resumido; el detalle está en la guía).

### 16-10 (17:57) · Reunión de gerencia con Ariana y Santos: la agenda y el reporte de postventa
- Resumen: todas en postventa ven el panorama del área, pero debe verse quién gestiona qué; Central deriva a cada una y lo no derivado es del área; el reporte de postventa muestra problemas técnicos, cotizaciones y repuestos abiertos y cerrados (caso Hotelera Turística Amazonas); procedimiento de repuestos: requerimiento → stock y foto → cotizar; cerrado si se vende o no corresponde.

### 16-10 · Buzón y ajustes del día (Ariana, Rubí, Gabriela, Katerine, Lesly, Central, Moisés, Santos)
- Resumen: reporte diario de postventa por persona con «Problemas técnicos y su estado»; consulta de pago a Finanzas por el pedido con voucher (Katerine); varios repuestos = un kit con un protocolo; menú «Procesos» con los 12 procesos de postventa; «Devolver a la bandeja» (Central); Choquehuanca en un solo expediente; «Registro de acciones» con deshacer y la regla «todo lo que el CRM no deja hacer dice por qué y qué hacer»; la serie en otra ficha frena y explica. (resumido; el detalle está en la guía).

### 15-10 (noche) · Buzón: seis pedidos resueltos (Rubí, Moisés y Central)
- Resumen: visita a la planta con los equipos del cliente, DNI o C.E. y «Recogió equipo» (Rubí); «Capacitación · no se cobra» en la clasificación del caso (Rubí); los equipos regalados también piden serie (VITALIAN; antes solo lo vendido); aviso ámbar «Archivar esta ficha» cuando el cliente ya se atendió en otro expediente (Moisés); derivación por error devuelta a la bandeja (G.M. TRAMAS; un repuesto va a postventa aunque el cliente sea de un comercial); TERRANOVA como empresa del grupo de MANDARA.

### 15-10 (tarde) · TERRANOVA y MANDARA: grupo empresarial; regla para clientes que no figuran en el CRM
- Resumen: TERRANOVA REPRESENTACIONES sí compró antes y es del grupo de MANDARA (lo confirmó Brenda; la primera respuesta, «no es cliente», fue un error). Tiene ficha propia en la cartera de Brenda (C1), con sus llamadas de 2019 y su file. **Regla (Carlos):** cliente que está en los Excel o en los files pero no en el CRM, se le pide a Santos que lo cargue; si ya está, se pide el file en «Files». **Pendiente:** cargar la venta anterior de TERRANOVA desde su file (Brenda/Central con Santos). El buscador ahora explica por qué un contacto no tiene expediente.

### 15-10 (tarde) · Almacén, postventa y buzón
- Resumen: horario de atención de la agencia obligatorio en la apertura cuando la entrega es por agencia (Lesly); barrita de carga por archivo y aviso de archivos sin guardar (almacén); ✕ para quitar fotos subidas por error, con el código de Lesly si ya está «Probada y embalada» (OPEN 060-2026); quien recibe el equipo puede ser una empresa con razón social y RUC (Rubí, Portal del Marqués); el pedido llega a postventa recién cuando Central marca «Pedido ejecutado», y la liquidación «cancelada» no reemplaza el «Confirmar pago» de Finanzas (Portal del Marqués); el equipo que no salió en el despacho tiene su propio circuito (Rubí, secadora de ECOLAV; pendiente su serie y verificar la dirección); el cierre trae el correo del cliente y el N.º de operación (Gabriela); AQUASEC unida a su ficha con RUC (un cliente, una ficha).

### 15-10 12:51 · Carlos con Ariana y Santos: pedidos por despachar con pago parcial
- Resumen: seis pedidos con solo un adelanto se veían en verde «Finanzas confirmó» (Abachi y Wong Lu Vega, entre otros). Desde ese día el pago parcial se ve en **ámbar**, con un anuncio de cuánto falta, también para el almacén, y el cierre avisa si la forma de pago se contradice. **Regla (Carlos):** sin el 100 % (o el adelanto acordado) confirmado por Finanzas no se despacha; si hay que despachar igual, autoriza gerencia u operaciones con su código. Pendientes: Carlos decide Wong Lu Vega; Ariana manda fotos del embalaje a PRODECO.

### 15-10 09:53 · Reunión de Carlos con Santos (y Central, postventa) (resumido)
- Resumen: el código para corregir un cierre lo da Central (Carlos, caso NEWREST; antes, desde el 02-09, Lesly o gerencia); Central lee todo antes de pasar un cierre; sin pago confirmado no hay apertura (COFACO); todo se vende en dólares salvo que la venta empiece en soles; al cliente que cotiza con la competencia se le llama antes de la fecha; quien deja la empresa se avisa a Santos el mismo día.

### 15-10 · Aviso cuando se corrige un cierre emitido (Brenda, Santos)
- Resumen: la corrección de un cierre no avisaba a nadie (Brenda, NEWREST). Desde el 15-10 avisa siempre a Central y a quien lo emitió; si el pedido ya existe, a Finanzas, postventa o almacén, solo según lo que cambió. El cierre queda marcado «v2 · corregido el…». El pedido no cambia solo: Central compara y ajusta. En un cierre de repuesto o servicio, la lista «Incluye» por defecto se vacía sola (Yawar Inka).

### 14-10 (tarde) · Lo que resolvió el buzón y otros ajustes (Central, Jhon, Rubí, Brenda, Santos)
- Resumen: también puede anular un cierre quien lo emitió, con código (antes, Carlos 04-09: «el comercial no anula, pide»), y Central recibe el aviso (AGROCASAGRANDE 010-2026, anulado por Ariana); un segundo anticipo vuelve a «Por facturar» (PRODECO); visitas a la planta con mensaje grande y campanada, también para el almacén; informe de puesta en marcha por partes (Rubí); hojas de chequeo para secadora, desmanchadora, prensa, rodillo y calderín (con hoja ya no se pide el Word); fichas unidas de PERUBAR, Abzul (cuando alguien «no ve» algo, buscar fichas partidas) y Operador Nacional de Hoteles (Decameron); al expediente de un cierre van solo los PDF correctos, no fotos (Seventh Heaven); la bolita de Efamein se arrastra y se minimiza sin perder la conversación.

### 14-10 15:05 · Llamada con el ingeniero: cierre del servicio de AGROCASAGRANDE (Santos, Ariana)
- Resumen: la puesta en marcha de las 2 secadoras se vendió como servicio aparte y postventa hizo su cierre (EFAMEINSA 010-2026, crédito a 30 días, sin voucher: un cierre a crédito no exige voucher). A estos clientes primero se les factura y después pagan. Antes era: la puesta en marcha iba dentro del cierre de venta.

### 14-10 · Ajustes de almacén, Finanzas y cotizaciones (Santos con Lesly, Ariana, Katerine y Jhon)
- Resumen: crédito o letras sin visto bueno de Finanzas no sale nada, ni con código (Santos, caso COFACO); queda quién hizo cada etapa del pedido y a qué hora; salida con saldo pendiente pide código (antes bastaba un motivo; Cristo Rey, V y P ICE); crédito sin adelanto basta con el visto bueno de Finanzas (Beneficencia de Huancayo); la hoja de chequeo basta con una casilla, video opcional y sin número de protocolo obligatorio; protocolos de equipos en stock que pasan al pedido al venderse la serie (Lesly); cuentas bancarias también en las cotizaciones de EFAMEINSA (Katerine); postventa corrige nombre, RUC y rubro de clientes sin dueño (Hospital Chanka); Efamein abierto a todo el personal; nace el «REG por entregar» para equipos que siguen en almacén (Seventh Heaven, EFAMEINSA 009-2026).

### 13-10 · Reunión de postventa (Carlos, Santos, Rubí, Ariana, Lesly)
- Resumen: la agenda de postventa muestra por defecto solo lo abierto (lo del Excel histórico ya no suma); primero el tipo de caso y después el texto, con «Otro» libre (Carlos); gerencia devuelve renglones con comentario en lugar de borrar la cotización (antes, desde el 15-09, todo iba a histórico); repuesto aprobado → orden «Preparar y embalar» (no se prueba; Peruvian Nature); pedidos a crédito o con saldo cierran con «Orden a Finanzas para facturar y cobrar»; apertura desde un caso con los equipos del cliente e informe de puesta en marcha por equipo (AGROCASAGRANDE); hoja de chequeo de lavadora en el CRM, con «N/A» (Ariana, Lesly); «Probada y embalada» exige protocolo completo (COFACO); botones «Sin stock» / «Ya llegó · hay stock» (Vidawasi); reportes de postventa por autor; lo que empieza en OPEN termina en OPEN (Choquehuanca); los cambios se piden por el buzón o a Santos, no a Lesly. Sus pendientes están en «Pendientes».

### 12-10 · Reunión del lunes con el equipo (gerencia con Lesly, Central, postventa, almacén, Finanzas, marketing y comerciales)
- Resumen: los errores del CRM se reportan por el buzón; el código de almacén debe traer la descripción (lavadora no apilable despachada por error; pendiente de datos); camión que esperó por una apertura (por aclarar); línea a mano con precio pasa por gerencia (NEWREST); Contabilidad confirma la guía, y Finanzas si Contabilidad no está; nota del destino final editable (Rubí); Caravedo unida, queda una tercera ficha; corrección excepcional de una cotización de la Beneficencia de Huancayo por un error de pantalla que sigue pendiente.

### 10-10 y 09-10 · Ajustes del buzón y de Central
- Resumen: botón «Anular» cotización con motivo y código (las cotizaciones no se eliminan, desde el 03-09); derivar a postventa pide código (Carlos); Central tiene «Ver la historia de la empresa» (Centrum PUCP); «Pasar contacto a Central» exige la vía; formularios de Meta llegan al comercial dueño de la campaña o a Central; plazo del 09-10 para regularizar leads (orden de Carlos).

### 07-10 · Reunión de gerencia (Carlos y Santos)
- Resumen: todo pedido de cambio va por el buzón, sin excepciones (Carlos); las sugerencias suman puntos en Crece; correos del CRM con marca y «Enviar por correo» en la apertura; Open se presenta como «Efameinsa Open»; postventa dice qué necesita de su agenda; llamadas de la más reciente a la más antigua (Lesly).

### 06-10 · Reunión de postventa y correos (gerencia, Lesly, Central)
- Resumen (resumido): kit con cantidades editables (precio nuevo a gerencia); correos y avisos según la empresa del pedido; técnicos con DNI en la apertura; postventa ve cuándo Finanzas autoriza la guía y corregir una apertura emitida avisa a Finanzas y al almacén; mantenimientos siguen el procedimiento de pedido sin serie; cierres Word posteriores al CRM no son REG y REG lleva series; garantía de 36 meses de las 2 secadoras de AGROCASAGRANDE; cuenta ALM2 de Ariana y perfil de Importaciones.

### 05-10 · Presentación al personal y reunión de cierres «REG»
- Resumen (resumido): presentación al personal; los cierres antiguos que nunca entraron al CRM se suben como «REG» con el correlativo que sigue, sin sumar a la venta y por todo el circuito (origen: AGROCASAGRANDE); toda cotización de postventa pasa por gerencia mientras esté en capacitación; nace el buzón de sugerencias; el cierre hereda la moneda de la cotización; 41 chats retenidos en Central pasados a sus dueños.

### 02-10 · Dos reuniones de Carlos con postventa
- Resumen (resumido): «Ventas de la empresa» y campaña «Vender» por tiempo sin mantenimiento; si una queja es lo pendiente de un pedido, la atención se cierra «derivado a pedidos» (Agrícola Huarmey) y cerrar exige elegir el resultado; el almacén marca «sin stock» con motivo; la apertura avisa a Finanzas y la guía lleva comprobante (Lesly); nunca «parque», se dice «registro de máquinas»; aviso si la forma de pago se contradice.

### 01-10 · Reunión con comerciales (Abel, Desiré) y arquitectura
- Resumen: filtro «Origen» en oportunidades (Central, campaña o web, propia); panel «Visitas del equipo» para supervisión; piloto de campo de Brenda; Files con entrega directa a postventa; inducción por etapas (Crece, producto, práctica en showroom); dueño del prospecto anunciado y NO implementado (ver Pendientes); apertura según el modelo de Lesly (11 filas, primer destino y destino final); destino Lima o provincia verificable (Ninamango); motivo de rechazo «Busca lavadora doméstica» en vez de «spam»; Hortifrut cargado como OPEN 050.

### 30-09 · Tres reuniones (correos de postventa, Carlos y el CRM, WhatsApp)
- Resumen (resumido): códigos PV1 Rubí, PV2 Gabriela, PV3 Ariana (PV es la cuenta del área); devolver un cierre avanzado pide código de gerencia; WhatsApp se trabaja dentro del CRM (caso: comercial bloqueado por spam) y tipificar ya no cuenta como gestión; la apertura toma nombre y RUC del cierre y separa primer destino y destino final (Andinas Service); nacen «Apurar al almacén» y «Apurar a Finanzas» (Ninamango); aviso si el largo de la serie no cuadra (Hortifrut); lo archivado no cuenta como trabajo.

### 29-09 · Gerencia con marketing (Karen, Carlos, Santos)
- Resumen: se convocó la presentación al personal del 05-10; reseñas de Google en revisión (ver Pendientes); etapa 2 con informes y firma en tablet; postventa sin cartera propia («PV es el área»); corregir o anular con código lo mandado a Central (caso Hotel El Alto / Amazonas Grandez) y no registrar el mismo teléfono dos veces en 24 h; el registro de un caso engancha la máquina por su serie (AGROCASAGRANDE); el CRM pasó al servidor de la oficina.

### 28-09 · Reuniones de gerencia con postventa (mañana y tarde)
- Resumen (resumido): expediente con historia propia; postventa ve los PDF con montos tapados; circuito por tipo de atención (repuesto sin pruebas ni conformidad); el pedido de Julca (OPEN 024) se reinició por la serie.

### 26-09 · Navegación y celular
- Resumen: vista moderna obligatoria (menú de 80 a 44 opciones); el CRM se adapta a pantallas HD y al iPhone del gerente; para Rubí: pestaña «Cerrados», cerrar pedidos del Excel ya entregados, tipo «accesorio» sin instalación y una atención cerrada ya no pasa sola a seguimiento.

### 25-09 · Reunión de postventa y reunión con Central y Finanzas
- Resumen (resumido): preinstalación con videollamada antes del despacho; tipos de pedido (equipo, repuesto, mantenimiento o revisión, embalaje con 3 fotos); «Aperturas urgentes» (para el almacén, apertura es despacho); rol Facturación (vouchers solo Finanzas y gerencia); cotizar a nombre de otra empresa del grupo en la misma ficha (INY); servicios de mantenimiento en el catálogo, los edita Lesly.

### 24-09 · Prueba en vivo del pedido desde Central (Santos y Carlos)
- Resumen: Central convierte el cierre en pedido (numera el CRM, sin el ERP), acepta o rechaza la liquidación con el PDF de Finanzas y pide las series desde el sistema (antes por WhatsApp); salir del almacén con saldo pendiente pide autorización; cada documento sigue la empresa de su cadena (OPEN o EFAMEINSA); alerta «Urgencia a Finanzas», cuyo segundo aviso llega a gerencia; se limpiaron 4 pedidos que no abrían por máquinas probadas sin fotos.

### 23-09 · Decisiones de gerencia y reunión de postventa (aperturas)
- Resumen (resumido): Open primera opción de facturación (desde el 21-10 la serie sale sola según equipo o repuesto/servicio); cartera: 3 meses sin venta (antes 6) y redistribución cada 3 meses; preventivo cada 4 meses con alerta a los 3; postventa ve OC y voucher sin montos; cotización corregida dice «v2»; acceso solo desde la oficina; nace la apertura de llamada (postventa → almacén → versión para el cliente) y los botones «Es un caso» y «Lo atiende mi compañera»; otra razón social del mismo cliente = ficha aparte en grupo (Crisolito); el primer cierre real fue OPEN 030.

### 22-09 · Reuniones de Carlos (caso Huamán Ruiz, postventa y comerciales)
- Resumen: postventa también acumula en un mismo expediente (caso Huamán Ruiz); la alerta de derivado sin atender bajó de 24 a 4 horas; «Lo que mandé a Central» muestra una semana; el comercial ve el estado del pedido sin montos; Central ingresa las series antes del visto bueno (sin serie = sin stock); doble filtro del despacho; postventa hace el triaje y en Lima hay videollamada de preinstalación (caso Titan); los contactos se eligen, no se reescriben; se descartó un chat comercial–postventa; WhatsApp: ventana de 72 h por anuncio, «No contesta» y reparto por dueño de campaña.

### 21-09 · Carlos revisa el CRM en vivo con postventa
- Resumen: un repuesto o accesorio puede ir sin plano, con motivo (Malvich); la apertura indica domicilio o agencia y cuál, con DNI de quien recibe; con la apertura emitida, cambiar entrega o fecha pide código; postventa programa el despacho y el almacén confirma; postventa abre el PDF del cierre sin cifras; una fila por unidad y despacho parcial por equipo (Ecolav); el reporte de postventa se hace en el CRM, no en Word.

### 18-09 y 19-09 · Carlos (casos con varias máquinas)
- Resumen: un caso lleva varias máquinas, relacionadas por serie (Gary Group); informes técnicos ordenados por cliente y máquina; vigilancia no se flexibiliza, sin DNI no entra; cualquiera de postventa cierra un caso del área (Beso de Sal).

### 16-09 y 17-09 · Carlos y Lesly (módulo de almacén)
- Resumen: nace el módulo de almacén (prueba y protocolo, «listo para el despacho», salida con fotos y video, foto de la guía, doble visto bueno de postventa), en uso real desde el 18-09; los formatos de Lesly (correo de visita, orden de trabajo, informes de servicio) pasan al CRM.

### 15-09 · Carlos (siete audios)
- Resumen: si Central anula un cierre se avisa al comercial con motivo; la cotización rechazada no se edita, se hace otra (cambió el 13-10 con el rechazo por ítem); ejecutar sin liquidación pide código; postventa registra seguimientos sin abrir caso (Lavipronto); visitas a planta avisadas a Central con lista para vigilancia; el circuito depende de lo vendido; inducción en Crece obligatoria.

### 14-09 · Precio con IGV y condición de pago
- Resumen: check «incluye IGV» por renglón, solo para ventas cerradas en cifra redonda; «Quién autorizó» solo si entró menos de lo acordado antes del despacho, porque vender a crédito es lo normal (V y P ICE); el correo del lead llega a la ficha aunque no deje teléfono.

### 10-09 · Reunión de gerencia con Ariana y reglas de catálogo
- Resumen: el catálogo lo gestiona Lesly en el CRM y ese es el precio válido; postventa ve «Las ventas de la empresa» sin montos; Central tiene su vista de Clientes en solo lectura; «Lo que mandé a Central» (Hostal La Arboleda); botón «Avisarle al comercial»; teléfono y correo exactos cuentan como la misma persona (fichas «cascarón» de Ads); en las cotizaciones históricas manda el PDF.

### 09-09 · Reunión de postventa y Central
- Resumen: las guías de remisión fijan el inicio de la garantía; un teléfono mal tipeado ya no abre ficha nueva (Santa Elena, NEWREST); Central une el contacto a la ficha existente y debe justificar un «cliente nuevo» con coincidencias (Gate Gourmet); pedir la cartera o un expediente con código del supervisor (Rivera Trigoso), salvo instituciones con sedes; no marcar «sin gestión» a quien atendió en otra ficha del mismo cliente.

### 07-09 · Postventa
- Resumen: forma de pago desplegable en el cotizador; en la clasificación de Central, «Garantía» pasó a llamarse «Soporte técnico».

### 03-09 y 04-09 · Correlativos (Carlos)
- Resumen: los huecos de numeración se anulan, no se rellenan, y el CRM es la verdad; los cierres Word de agosto quedan como referencia; cierres de postventa en Word desde el 30 de la serie OPEN; al derivar a postventa no viaja el histórico comercial ni los precios; los rubros los agregan los comerciales (por confirmar, Carlos lo revirtió al día siguiente); borradores editables sin código.

### 02-09 · Observaciones de gerencia
- Resumen: «Mi día» muestra solo lo real; editar un cierre pide motivo y código; anular un cierre duplicado pasa la venta al que lo reemplaza; ESSALUD, Marina y MINSA con ficha madre y sedes; primer cierre con repuestos y servicios (Fancavel).

### 01-09 · Carlos: expedientes y cierre de postventa
- Resumen: un expediente por cliente y comercial («el historial clínico»); cierre emitido = sellado; la aprobación de precio queda pegada al equipo (Gavina); circuito de provincia (pago, prueba, plano, despacho, videollamada, preventivo); la venta se registra por el informe de cierre (Sierra Travel); cuentas de práctica con numeración PRUEBA. Quedó pendiente el plazo de garantía y la vigencia de una aprobación.

### 31-08 · Carlos (mañana y tarde) y Lesly
- Resumen: lo que registra postventa pasa por Central (matizado el 15-09); destino «Finanzas» al derivar; el RUC manda; quien pierde un cliente conserva su historial hasta el corte; postventa con dos ejes (tipo y clasificación); gerencia ve a cualquier comercial desde su cuenta; cuadro de visitas con DNI de cada acompañante.

### 27-08 al 29-08 · Postventa y códigos de supervisor
- Resumen: circuito comercial → Central → Finanzas → postventa → almacén; ni postventa ni almacén ven precios; la serie es el eje; código del supervisor para correcciones de Central («si no, no vamos a poder medir»); Lesly en el rol de operaciones; Ruta de mantenimiento por tandas; reporte diario grabado; el cierre semanal y la proyección usan la misma fuente.

### 24-08 · Lunes de arranque
- Capacitación; los comerciales trabajan solo en el CRM desde el 22-08. El número de cotización se asigna al confirmar, aprobación por ítem, y a un comercial no se le muestran datos de otro.

### 14-08 al 22-08 · Primeras reuniones con gerencia
- Se fijaron las bases: el cliente es de quien lo atendió; precio bajo lista lo aprueba gerencia (rechazo con nota); las cotizaciones no se modifican, se duplican; cada comercial ve solo lo suyo y se nombra por código (Cx); filtro SUNAT obligatorio; un RUC equivocado es peor que ninguno; reporte diario en PDF; numeración que reinicia cada enero. El 22-08 salió la primera cotización real en el CRM.

---

## Casos que explican reglas

**COFACO (13 y 14-10): protocolo completo y letras.**
- Una lavadora teñidora se marcó «Probada y embalada» sin fotos ni documento. Santos: «tiene que estar todo».
- Desde entonces «Probada y embalada» exige protocolo, foto, ficha, serie, técnico y hoja de chequeo.
- Al día siguiente, el mismo pedido salió sin letras porque el CRM leyó «pagado».
- Nació la regla: venta a crédito o con letras = visto bueno de Finanzas, letras recibidas por el almacén y entrega registrada.

**Beneficencia de Huancayo (12 al 14-10): varios ajustes en un mismo pedido.**
- La corrección de su cotización se frenaba aunque gerencia ya había aprobado el precio (error de pantalla, pendiente).
- La apertura «no llegaba» porque se marcó enviada sin emitirla.
- Al ser venta a crédito sin adelanto, quedaba trabada para siempre. Ahora basta el visto bueno de Finanzas.
- El protocolo exigía las 37 casillas; ahora basta una.
- Se dejó de pedir el número de protocolo.
- El cierre del pedido pasa por «Orden a Finanzas para facturar y cobrar».

**AGROCASAGRANDE (29-09 al 14-10): el cierre que solo existía en Word.**
- Rubí no podía registrar la puesta en marcha porque no había cierre ni pedido en el CRM.
- Nacieron los cierres «REG» (05-10) y el registro que engancha la máquina por su serie (29-09).
- En el piloto, Central generó el pedido sin series, y por eso un REG ya no se genera sin series.
- La apertura salía con una sola de las 2 secadoras, y por eso se marcan los equipos del cliente (13-10).
- La garantía de sus secadoras quedó en 36 meses, como dice su cierre.
- El 14-10 se vendió aparte el servicio de puesta en marcha: cierre EFAMEINSA 010-2026 (Ariana), para facturar y que paguen.
- Pendiente: tiene 3 fichas sin unir.

**Lavadora no apilable (12-10): el código sin descripción.**
- Se despachó una lavadora no apilable en vez de una apilable (Callao). En el CRM se escribió el código, pero no se vio la descripción, y nadie la comparó con el cierre.
- Carlos lo llamó el «punto uno» de almacén. Pendiente de los datos del catálogo.

**NEWREST (02-10 y 12-10): fichas partidas y líneas a mano.**
- Había 7 fichas del mismo cliente; se unieron con su RUC.
- Después, unas cotizaciones de mantenimiento con líneas escritas a mano nunca pasaron por gerencia. Desde el 12-10, toda línea a mano con precio de un comercial va a aprobación.

**Vidawasi (30-09 y 13-10).**
- Su solicitud cayó en otro cliente (Inversiones Cristo Vive) por un teléfono ajeno. Nació el lápiz para mover una solicitud mal colgada.
- En octubre, su equipo tenía código pero venía de importación. Nacieron los botones «Sin stock» y «Ya llegó».
- Su cierre Word se cargó como OPEN 058.

**Hostal La Arboleda (10-09 y 30-09).**
- Postventa registró dos veces el mismo mantenimiento porque no veía lo que había mandado a Central. Nació «Lo que mandé a Central».
- Después, la orden de despacho salía con el contacto equivocado. Nació «A quién llama el almacén», obligatorio.

**Inversiones Huamán Ruiz (22-09).** Pidió el mismo repuesto dos veces y quedó dos días sin respuesta. Por eso postventa también acumula en un expediente abierto del mismo tipo, y la alerta de Central bajó a 4 horas.

**Gary Group (18-09).** Un caso con 4 máquinas en el que nadie había registrado las series al despachar. Por eso un caso lleva varias máquinas y se exige la serie en el despacho.

**Ecolav (21-09).** Una lavadora con stock y una secadora sin stock en el mismo pedido. Nació el despacho parcial por equipo.

**Titan (22-09).** Una llamada sobre un pedido en curso se abrió como caso suelto, y pasaron 7 días sin contacto. Nació el triaje de postventa y la videollamada de preinstalación en Lima.

**Agrícola Huarmey (02-10).** Una «queja» era en realidad la puesta en marcha que faltaba. Criterio de Carlos: se cierra como «derivado a pedidos». También motivó que la forma de pago traiga su saldo («al contado» salía 30/70).

**Hotel Santa Lucila (02-10).** El cierre de una atención no aparecía en la ficha del cliente. Desde entonces las gestiones de postventa se ven en la ficha.

**ANTUAN SERVICES (05-10).** Gerencia rechazó una cotización «por falta de gestión», pero la llamada estaba en otro expediente. Desde entonces Aprobaciones muestra las gestiones de otros expedientes del cliente.

**Centrum PUCP (09-10).** Llegó con correo personal y nadie vio que la PUCP ya era cliente. Nació «Ver la historia de la empresa» en Central.

**Hortifrut (30-09 y 01-10).**
- Una Unimac se registró con un dígito de menos. Nació el aviso por largo de serie.
- Además, el pedido real nunca se había registrado como cierre y se cargó como OPEN 050.

**Ninamango, Huancayo (30-09 al 06-10).**
- Empresa con dirección en Lima que pidió el equipo para provincia. Nació el destino verificable.
- Central pidió apurar al almacén. Nacieron los botones «Apurar».
- La torre tenía dos series.
- Lesly no encontraba la guía autorizada. Nació la tarjeta de guías autorizadas.

**Choquehuanca (13-10).** Venta OPEN cuyo informe salió con membrete EFAMEINSA. Regla de Santos: lo que empieza en OPEN termina en OPEN.

**Inversiones URGA (30-09).** La apertura salía a nombre de la persona de la ficha y no de la empresa del cierre. Desde entonces manda el cierre.

**Andinas Service, Ica (30-09).** Envío por agencia. Nació la separación entre primer destino y destino final.

**Inversiones Nacionales de Turismo (02-09 y 30-09).**
- Su cierre emitido dos veces llevó a que, al anular un duplicado, la venta pase al cierre que lo reemplaza.
- Después, el equipo llegó antes que el plano. Nació «No se le envió».

**Amazonas Grandez / «Hotel El Alto» (29-09).** El almacén registró dos veces el mismo contacto con otro nombre. Ahora quien pasa un contacto a Central puede corregirlo o anularlo con código.

**Miguel Pérez / Agrícola Pampa Baja (30-09).** La misma persona entró por Google Ads con Gmail y sin RUC, en otra cartera. Nació el aviso «misma persona por otra puerta» (construido; por confirmar su uso).

**COINREFRI (31-08).** Una comercial veía el seguimiento en cero porque estaba en otra ficha con la razón social, y gerencia evaluó mirando la ficha pobre. Desde entonces gerencia ve el historial en la tarjeta de aprobación, y se atacan las fichas partidas.

**Joel Ortega, Eli Farfán, Vilma García (09-09).** Figuraban «sin gestión» aunque se habían atendido en otra ficha. Ahora se mira al cliente entero.

**Pyramid Metals y Grupo Safe (30-09).** Las gestiones «no figuraban» porque estaban en expedientes archivados. Nació «Así se quedó».

**Congelados y Frescos / Refrigerados INY (25-09) e Inversiones Crisolito (23-09).** Clientes que piden cotizar a otra empresa del grupo. Desde entonces es la misma ficha con «A nombre de», o una ficha colgada como grupo económico.

**Hospital de Pampas de Tayacaja (06-10).** Llegó por la web sin RUC. Era de una cartera sin gestión desde 2022 y se pasó a C2. Gerencia aún debe decidir cuánto tiempo sin gestión hace perder el cliente.

**Sierra Travel (01-09).** Se cotizaron dos lavadoras y se vendió una. Regla: la venta se registra por lo que dice el informe de cierre.

**Correlativos 2186 (03-09).** Se indicó cotizar a mano desde un número sin saber que el CRM iba más adelante. Regla: el CRM es la verdad, y los huecos se anulan.

**Bloqueo de WhatsApp de un comercial (30-09).** Pasó unos 100 leads a su línea personal con mensajes repetidos y WhatsApp lo marcó como spam. Regla: trabajar dentro del CRM y nunca enviar en frío desde la línea personal.

**Cotización sin TOTAL (05-10).** El PDF borraba una hoja que solo tenía el total. Se corrigió y se revisaron todas las cotizaciones afectadas.

**Instalación que pedía serie (16-10).** En un pedido de repuestos, el servicio de instalación de la secadora que el cliente ya tenía entró a la lista como una máquina más y el almacén no podía darle código ni serie; Central le puso un código de relleno para salir del paso. Lesly pidió una opción «no corresponde». Desde entonces cada fila trae «No corresponde: es un servicio» y sale de la lista con constancia en el pedido.

**Pedidos que no abrían (24-09).** El almacén probó máquinas sin fotos y la pantalla del pedido fallaba (Bungarena, Rivera, Ecolav, Herrera). Se corrigió y se limpiaron.

---

## Pendientes y temas sin decidir

**Decide gerencia (Carlos)**
- **A quién va la cartera de las personas que dejaron la empresa** (C6 y C9, desde el 15-10). Mientras tanto, lo que escriban sus clientes queda en la bandeja de Central para que lo derive.
- **Garantía:** el registro de máquinas pone 24 meses aunque el cierre diga 36. Solo AGROCASAGRANDE se ajustó a 36. Falta la regla general.
- **Preventivo:** la alerta es a los 4 meses (aviso a los 3), pero la Ruta de mantenimiento marca «vencido» a los 6. Gerencia no lo ha ratificado.
- **Dueño del prospecto** (15 días, 6 meses o permanente): anunciado el 01-10, no implementado.
- **Cuánto tiempo sin gestión hace que un cliente deje de ser del comercial** (caso Hospital de Pampas).
- **Tipificación de WhatsApp en 3 opciones** (Carlos: «déjame pensarlo», desde el 22-09).
- **Numeración propia para las cotizaciones de postventa** (hoy comparten serie con los comerciales).
- **Fin de la «postventa en capacitación»**, que es cuando las cotizaciones de postventa dejan de ir todas a gerencia.
- **Visto bueno de Finanzas:** si aplica a todo crédito o solo a letras.
- **Carteras en disputa:** la tercera ficha de Caravedo, el grupo Costa del Sol / Hotelera Cusco y otros pares (Operador Nacional de Hoteles quedó resuelto el 20-10) en carteras distintas.
- **Expedientes de postventa repetidos:** lista de 56 clientes (16-10) para decidir cuáles se unen y cuáles tienen el tipo mal puesto.
- **Unir las dos pantallas de preventivos** (Ventas de la empresa y campaña): se retoma en otra reunión.
- **Ventana de validez de una aprobación de precio** (propuesta desde el 01-09).
- **Reseñas de Google por parte del personal:** en revisión. Google prohíbe reseñas de empleados con incentivo; se recomendó premiar que el personal pida reseñas a clientes. Consulte a gerencia antes de dejar o pedir reseñas.

**Depende de Santos (CRM)**
- **Cierres emitidos como «cliente nuevo» con expediente antiguo** (19-10): quedan 17 por decidir si se pasan a «antiguo»; ese mismo día solo se corrigió el que motivó la regla.
- **Frenar «Registrar la salida» desde postventa** mientras la guía no esté confirmada (propuesta del 19-10, caso VIDAWASI, sin respuesta).
- El código de producto debe mostrar su descripción («punto uno» de almacén). Depende de los datos del catálogo.
- El camión que esperó por una apertura: falta aclarar si fue el CRM o el registro.
- Error de pantalla que frena corregir una cotización con precio bajo lista ya aprobado.
- Reporte de postventa por rango de fechas, rangos vacíos de numeración y casilla «informe enviado» con correo automático (esta última espera las cuentas de correo de Juan Carlos).
- Aviso «misma persona por otra puerta»: construido, sin confirmar que esté en uso.
- Recordatorios automáticos de compromisos («te quedan 2 días»).
- **Botón «Anular venta»** para una venta registrada por error (22-10, caso Brenda); hoy se anula a mano.
- **Freno a la derivación de soporte técnico** que mueve la cartera del comercial (21-10, seis clientes de Katerine). Avance del 23-10: Central ya solo ve «Postventa (área)» al derivar a postventa; falta el freno si se elige una cuenta comercial.
- Expedientes nuevos que quedaron junto a uno rechazado del mismo comercial y cliente (unos 25 en 30 días, visto el 16-10): se unen cuando alguien lo pida, como SUITE GENERIS.

**Depende de otras áreas**
- **Lesly:** lista de stock y sin stock, códigos propios que faltan (por ejemplo FX180 y UY240), y pedidos y cierres en físico con fotos para regularizar.
- **Ariana:** depuración de «sin stock»; fotos de Herrera.
- **Central:** generar el pedido de Vidawasi (OPEN 058) y pulsar «Pedir al almacén»; coordinar con Ariana si se rehace el cierre del servicio de AGROCASAGRANDE (anulado el 14-10).
- **Jhon (Finanzas):** visto bueno tardío de COFACO; 58 pedidos por regularizar.
- **Postventa:** cargar los cierres Word reservados (OPEN 030-036 y 038-040, de Rubí); Rubí envía las etapas que propone para su bandeja.
- **Fichas por unir:** AGROCASAGRANDE (3), Cristo Vive (4), Grupo Santa Elena y Malvich (Lavipronto se unió el 20-10).

---

## Quién es quién

**Gerencia y administración**
- **Carlos:** gerente. Decide cartera, precios, aprobaciones y reglas. «La última reunión manda» se refiere a sus reuniones.
- **Karen:** gerencia, a cargo de marketing.
- **Santos Vilcachagua:** Gestión, Marketing y CRM. Es el administrador del sistema: ordena qué se construye y atiende el buzón.

**Operaciones, finanzas y apoyo**
- **Lesly:** operaciones. Mantiene el catálogo, coordina el almacén y da códigos de operaciones.
- **Jhon Calsin:** Contabilidad y Finanzas. Confirma pagos y autoriza guías.
- **Alondra:** Central (triaje, derivación, cierres a pedido, files).
- **Marco Antonio Velásquez:** Importaciones (desde 06-10).
- **Richard:** supervisión de importaciones.
- **Yasmin Cuéllar:** Recursos Humanos.
- **Juan Carlos:** Sistemas (cuentas de correo).

**Comerciales**
- **C1 Brenda Taboada** (antes C8).
- **C2 Moisés Baldeón.**
- **C4 Ariana Flores:** vende solo lavadoras desde el 23-09.
- **C5 Katerine Tello.**
- **C6:** perfil asignado a Abel Abad el 30-09.
- **C9 Desiree Salinas.**

**Postventa**
- **PV:** cuenta del área; nadie entra con ella.
- **PV1 Rubí Simeon.**
- **PV2 Brenda Taboada** (desde el 19-10, además de su C1); lo anterior de PV2 figura como PV2-GP.
- **PV3 Ariana Flores.**

**Almacén**
- **ALM:** cuenta del almacén (desde el 21-10 la usa Diana, que reemplaza a Jeysson).
- **ALM2:** Ariana Flores (desde 06-10).

**Técnicos**
- Lista mantenida por operaciones en el Directorio; por ejemplo, Danny Solís (puestas en marcha).

**Otros nombres que aparecen en registros antiguos**
- **Hever:** postventa en agosto y septiembre.
