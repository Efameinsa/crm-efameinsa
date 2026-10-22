# Bitácora del CRM Efameinsa: historia de las decisiones

Vigente al 22-10-2026. Complementa la «Base de conocimiento del CRM» (asistente-guia-del-crm.md). Esa guía dice **cómo funciona hoy** el CRM. Esta bitácora dice **cuándo se decidió cada cosa, quién la pidió, por qué y qué quedó pendiente**.

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

### 22-10 (10:29) · El almacén por serie es la punta de partida y sigue al pedido (Carlos, Santos, Lesly)
- **Serie de facturación (Open / Efameinsa).** Carlos explicó que la pauta comercial de este mes (vender con Efameinsa, probablemente solo hasta fin de mes, solo para algunas comerciales) la coordina él con cada persona y **no es un tema del CRM**: el sistema es para elegir y «ellos solamente harán el clic». Pidió que todo se mantenga como estaba: Open en comercial y Open en postventa por defecto. Santos no cambia nada por ahora. (Por confirmar: desde el 21-10 el CRM propone Efameinsa para equipos por indicación de gerencia; Santos lo verá con el ingeniero.)
- **Postventa puede pedir, no cambiar la estructura.** Carlos (lo repite desde hace semanas): las áreas pueden solicitar lo que consideren, pero no cambian la estructura ni el procedimiento, y Santos no debe responder «ya te lo cambio»: se escucha, se anota y se ve en una reunión. «Si no, cada rato vamos a estar cambiando.»
- **Qué revisó Carlos en «Stock y códigos».** Que todo se numere; que las LG salgan totalizadas por modelo (ya estaba); las mesas Bimap vienen con 1, 2, 3… como serie porque en la caja no se ve la placa: hay que abrirlas y tomar la serie real; las UCT060 siguen sin código en el Excel de Lesly (ella lo revisa); confirmaron que de Sailstar WET solo hay dos máquinas (WET17 y WET23).
- **La regla que fijó Carlos.** El listado por serie del almacén es «la punta de partida»: el catálogo tiene una ficha por código y muestra la **suma** de las series que hay (50 Titan Max = 50 en la ficha); los industriales con distinta configuración (UCT060 de 100G y de 200G, M9 y M30) son fichas distintas. **Cuando se vende, se descuenta solo:** Central pide la serie para el pedido, Lesly ya no corta y pega en su Excel, «solamente le da un check» y la máquina queda para ese pedido; si el cliente cambia de equipo, se libera y vuelve al stock; cuando sale, queda despachada. «Esto tiene que estar bien fino.» Cada máquina debe decir si es de Open o de Efameinsa, y la fecha de ingreso debe estar (el costo no; la vista del comercial, con columnas ocultas, se ve después). Las fichas de los códigos nuevos hay que hacerlas sí o sí (duplicar la parecida y corregir), con las medidas del catálogo de Estados Unidos, no las de Internet.
- **Hecho el mismo día (ver la guía, «Almacén por serie», «El almacén sigue al pedido», «Elegir del almacén», «Lo que está por llegar», «Cotejo con el catálogo» y «El inventario que ve el comercial»):** el almacén por serie numerado con totales en pantalla y filtros por proveedor, marca y empresa; la reserva y la salida automáticas desde el pedido; la proyección de lo que viene de Importaciones (se ve, no suma); el cotejo con el catálogo al subir el Excel; el inventario para el comercial con columnas ocultas y marca de agua; y gerencia ve «Stock y códigos» en su menú (Carlos: «ese módulo todavía no lo puedo ver yo»). Tu Excel «ya debería estar en la historia» (Carlos a Lesly).
- **Pendientes.** (1) Lesly: terminar la revisión y pulsar «Subir al almacén» (hasta entonces el catálogo sigue con la cifra vieja), poner los códigos que faltan (UCT060), abrir las Bimap para la serie real, hacer las fichas de los códigos nuevos (medidas del catálogo de EE. UU., no de Internet) y anotar lo que Importaciones tiene en camino. (2) Santos: aclarar con Carlos la serie por defecto (Open en todo, o Efameinsa para equipos como está desde el 21-10); el correo W0 de visita a la web nueva sale primero; los demás correos y los artículos, después y con doble revisión. (3) Brenda: el ingreso de una máquina a planta y pedir stock a Importaciones o al almacén al cotizar quedaron como «siguiente etapa».

### 22-10 (10:08) · El «Resumen general de stock» de los lunes lo arma el CRM (Santos, Lesly)
- **Qué se habló.** Lesly imprimió el informe que Importaciones entrega todos los lunes a las comerciales: separado por proveedor («primero Primus, luego Unimac; todo lo que es lavadora, luego secadoras; luego GMP y así sucesivamente»), con el total de equipos por proveedor; y el de LG consolidado por modelo con totales («me dijeron que se tiene que consolidar o mostrar los totales por modelo»). Pidió que «todo lo que hemos subido debe salir así», en **dos documentos** (industriales y LG), y que salga del sistema: «yo solamente cargo mi Excel actualizado y generan el reporte». Supone que Importaciones ya no tendrá que armarlo. Dejó su Excel de trabajo como modelo para que el CRM reconozca sus campos (lo reconoce tal cual, hojas de stock industriales y LG; reserva, vendidos y costos no entran).
- **Qué se hizo (el mismo día).** En «Stock y códigos» y en «Stock» del comercial hay dos botones: **Industriales (PDF)** y **LG (PDF)**, armados con lo disponible en el almacén y con el formato del informe impreso (ver la guía, «Resumen general de stock»). Para que el informe tenga lo que Importaciones escribe de cada máquina, al subir el Excel el almacén guarda ahora el código de Importaciones, la descripción, el modelo, la capacidad y el proveedor. Mientras la carga está en revisión, Lesly ve una vista previa con lo que va a subir. Probado con su Excel real: 141 equipos industriales en 7 proveedores y 135 LG en 6 modelos.
- **Detalle que salió al leer su Excel:** en dos filas de Unimac la celda UBICACIÓN traía un número (un costo corrido de columna); el CRM lo descarta y las trata como PLANTA. Y la serie 604KWUC5K750 (Titan Max) quedó a la vez en STOCK LG y en VENDIDO; el CRM ya la tenía con un cliente, así que viene como «No subir» hasta que Lesly la saque del stock.
- **Pendiente:** que Lesly termine de revisar su carga y pulse «Subir al almacén»; hasta entonces el PDF del almacén sale vacío y solo sirve la vista previa.

### 22-10 · «Cuenta sin nombre» ahora dice de quién es la ficha (Santos, Katerine)
- **El caso:** a Katerine no le aparecía la Clínica Jesús del Norte. Su ficha con RUC estaba en la cartera de otra comercial desde los Excel antiguos, y Katerine solo tenía dos fichas sin RUC del mismo cliente. Al abrir un expediente suyo de ese cliente, la pantalla decía «Cuenta sin nombre» y eso frustraba al equipo.
- **Se resolvió el caso:** por pedido de Santos se unieron las tres fichas en la del RUC y el cliente pasó a la cartera de Katerine. Las ventas antiguas siguen contadas a quien las hizo.
- **Se cambió la pantalla (Santos 22-10: «salir el nombre y decir de quién es la cartera»):** el expediente muestra el nombre y el RUC, dice en qué cartera está la ficha y ofrece «pedirlo para mi cartera». Lo mismo en Hoy, la agenda y los cierres. Ver la guía.
- **Pendiente (gerencia):** hay alrededor de 220 expedientes vivos en esta situación. Se propuso una lista para que gerencia decida en bloque a quién queda cada cliente (por confirmar).

### 21-10 (noche) · La serie de facturación sale sola y lo que resolvió el buzón (gerencia, Lesly, almacén, Diana, Jhon)
- **La serie sale sola (gerencia, 21-10):** el gerente pidió que deje de salir la pregunta «¿por qué Efameinsa y no Open?». Desde el 21-10 todo equipo va con la serie EFAMEINSA y todo repuesto o servicio con OPEN, sin escribir motivo, en el cotizador y en el cierre (el cierre hereda la serie de la cotización). Si alguien la cambia a mano, se respeta. **Antes era:** «Open primero» (23-09) y había que justificar cuando se elegía Efameinsa.
- **La serie de la secadora de la torre también se corrige con código (Lesly):** Lesly avisó que había cambiado una serie que dio el almacén sin que le pidieran código y sin que nadie se enterara. La serie principal ya lo pedía, pero la de la secadora de la torre se podía quitar con «Quitar». Ahora, junto a ella, está «¿Equivocada? Corregir o quitar con código»: se elige cuál serie (lavadora o secadora), se escribe la correcta o se quita, con motivo y código de operaciones o gerencia. Queda escrito en el pedido (serie anterior, nueva, motivo y quién autorizó) y avisa en la campana a Central, postventa y almacén. El cambio de ese día en la torre LG Titan fue antes del arreglo y no quedó registrado.
- **Un accesorio del pedido solo pide fotos (almacén, caso VITALIAN):** el almacén no podía marcar «Probada y embalada» la plancha vaporizante que acompaña al calderín porque le pedía protocolo. Primero se creó la hoja «Protocolo de plancha vaporizante»; luego, a pedido del almacén, un accesorio que acompaña a la máquina principal del mismo pedido (la plancha del calderín, un kit de mangueras, una base) solo pide sus fotos; la hoja queda opcional. Si el producto va solo en un pedido, se prueba como una máquina.
- **«Todo N/A» por energía (Diana, calderín eléctrico de VITALIAN):** en las hojas del calderín, la prensa y el rodillo cada columna (gas, eléctrico, vapor) tiene «Todo N/A», para no marcar ✗ en lo que no aplica.
- **El pedido sigue al cierre corregido (Jhon):** el comercial corrigió un cierre (los precios pasaron a ser sin IGV) y el pedido se quedó con el total anterior, por eso la liquidación salía sin IGV. Se corrigió ese pedido, y desde el 21-10, cuando se corrige un cierre y cambia el total, el pedido abierto toma el nuevo total solo (si Central no lo había ajustado a mano) y queda anotado en sus observaciones. Detalle en la bitácora de Finanzas.

### 21-10 · El stock de Importaciones se sube codificado al CRM (Lesly, el ingeniero, Santos)
- **Pedido (audios del 21-10):** Lesly codificaba a mano el Excel de stock de Importaciones guiándose por el catálogo, y se le duplicaban códigos. Pidió subir el Excel y que el CRM diga a qué máquina le pertenece qué código, cuál falta codificar y que proponga un código tentativo que ella acepta; y tener a la vista todos los códigos ya creados, con la opción de pegar la descripción de un equipo nuevo y que salga el código.
- **Reglas del ingeniero:** se suben solo las hojas de stock (industriales y LG); la reserva y lo vendido no. **Los costos no van al CRM:** «nos va a cargar el precio y las comerciales van a decir: ya puedo vender sobre esto»; el precio de venta lo da el ingeniero aparte. El Excel de Importaciones está verificado: cada máquina que recibe código pasa a reserva y de ahí a vendido.
- **Hecho ese mismo día:** pantalla «Stock y códigos» en el menú de operaciones (ver la guía). Lesly ya no necesita revisar un Excel aparte: la propuesta la ve y la decide en el CRM.
- **Lo que encontró la primera comparación (282 máquinas):** 166 con el código bien puesto, 48 sin código pero con un código igual en el CRM, 10 que necesitan código nuevo y 58 por revisar. Entre ellas: las lavadoras LG Giant C Max estaban con códigos de secadora (SECGIA…; las lavadoras son LAVGIA132 no apilable y LAVGIA13 apilable); LAV080 no existe (la UCT080 es LAVT080); 8 series que el Excel tiene en planta ya figuran en el CRM con clientes; y en el catálogo, SECU55 y SECU502 parecen tener las fichas cruzadas y la descripción de LAVW105 es la de una UWT130.
- **Reunión Santos–Lesly 21-10 13:05 (revisión de la propuesta):** Lesly confirmó que las lavadoras Giant C Max con código SEC fueron un error suyo al copiar; que las series «ya en un pedido» (ECOLAV, VIDAWASI…) son máquinas que Importaciones liquidó después de vendidas y van a vendido o reserva; que las Sailstar nuevas llegaron con aire FRL y dosificador externo y por eso llevan código nuevo; que el mismo modelo lleva un código por panel (M9 / M30); y pidió ver junto al código si es lavadora, secadora o rodillo y cuántas máquinas son. Todo quedó aplicado el mismo día en «Stock y códigos» y en el Excel de revisión. El objetivo del ingeniero: con todo codificado, Importaciones maneja el código y las comerciales buscan por modelo o por código.
- **Pendiente (Lesly):** corregir su Excel después del almuerzo y subirlo; decidir los grupos «Revisar» y «Código nuevo» y subir al almacén; pasar a vendido o reserva las 8 series con clientes; pedir a Importaciones las series de placa de las 5 mesas BIMAP; poner ficha y activar los códigos nuevos y reactivar SECNSEN.

### 20-10 (tarde y noche) · Brenda corrige los datos de cualquier cliente, antecedentes del equipo y fichas unidas (Santos, Brenda, almacén)
- **Brenda corrige los datos de cualquier cliente (Santos, 20-10).** Santos: «Brenda, desde su cuenta de postventa o de comercial, debe poder editar la dirección, el RUC, el número y el nombre de cada empresa cliente, así sea de otra cartera». Desde ese día, desde PV2 y desde C1, busca cualquier cliente y corrige nombre o razón social, RUC o DNI, rubro, la **dirección de la empresa** y los contactos. El dueño de la cartera recibe un aviso cuando ella corrige algo de su cliente. Caso que lo motivó: la dirección de Family Farms, que en la cabecera de la ficha no se podía cambiar en ninguna pantalla (ahora el enlace dice «Corregir nombre, RUC o dirección»).
- **Ese poder es sobre los DATOS del cliente, no sobre lo comercial.** Ese mismo día se le abrió por un rato a PV2 la vista de cotizaciones y cierres de otras carteras, y Santos lo revirtió: «comercial solo puede ver su comercial y postventa puede ver postventa; ella tiene su cuenta de comercial y desde ahí busca lo que necesite». No cambia carteras ni ve cotizaciones ajenas desde postventa.
- **«Antecedentes del equipo» (pedido de Brenda por el buzón).** Para trabajos en planta (revisión, preventivo o correctivo), sobre todo de equipos que no vendimos, la ficha del equipo y el caso tienen el recuadro «Antecedentes del equipo»: compra (fecha, proveedor, guía, factura u orden de compra, garantía vigente/vencida/por verificar), mantenimientos, repuestos y fallas anteriores (Sí / No / Por verificar, con el detalle) y documentos (guía, acta de entrega, informes anteriores, comprobantes, fotos). Queda quién lo actualizó y cuándo. En el caso aparece solo cuando ya tiene la máquina identificada.
- **Fichas unidas por el buzón (Brenda, 20-10):** LAVIPRONTO (tres fichas con los mismos contactos, ahora una sola con RUC, cada expediente con su comercial); Operador Nacional de Hoteles del Perú (Decameron), unida a la ficha con RUC con aprobación de gerencia y en la cartera de Brenda; y la ficha de Family Farms que tenía por error el RUC de un banco, también unida a FAMILY FARMS PERÚ, con ese RUC equivocado quitado.
- **«Salieron, sin guía» cuenta igual en el Panorama y en la lista (almacén).** El Panorama decía 5 y la lista 3: el número sumaba revisiones técnicas (que no llevan guía) y se le escapaba un pedido que salió sin fotos de la carga. Ahora los dos usan la misma regla.

### 21-10 · Imágenes que completan una gestión, sin registrar otra (Santos)
- Santos pidió que en el historial del expediente del comercial cada gestión tenga un «+» para pegar o subir una imagen que enriquezca lo ya anotado, sin tener que registrar una «gestión» nueva solo para colgar la foto.
- Por qué: inventar una gestión para adjuntar una captura ensuciaba la historia y contaba un contacto que no hubo.
- Lo agregado después queda con el nombre de quien lo agregó y la hora; la nota y el resultado de la gestión no se tocan.

### 21-10 (tarde) · Letras, fichas unidas, una cartera que se movió por error y fotos en la gestión (Santos)
- **Las letras entregadas las confirma Finanzas (Santos):** «subir las letras le corresponde a Finanzas… luego postventa pulsa verificar despacho». Antes podían registrarlo también el almacén y postventa; ahora ellos ven «Falta que Finanzas confirme…».
- **Fichas parecidas al 100 % unidas (Santos):** «todas las que tienen 100 % los puedes juntar, a excepción de los WhatsApps (solo un nombre)». Se unieron unas 640 parejas; se quedó la ficha con documento, si no la de cartera, si no la de más movimiento. Las demás siguen en «Parecidas» para revisarlas a mano.
- **Caso SERVICIOS ALIMENTICIOS Y AFINES (21-10):** el cliente desapareció de la cartera de Katerine. No fue por las fichas unidas: Central derivó el reclamo de la calandria a la cuenta comercial C1 (que también es de Brenda) en vez de a postventa, y con el código de gerencia la cartera pasó a C1. Se deshizo desde el registro de acciones y el contacto volvió a Central para derivarlo a postventa. **Lección:** un reclamo de postventa se deriva a la cuenta de postventa, no a la comercial de la misma persona; ante «el cliente desapareció de mi cartera», mirar primero quién lo derivó.
- **Comunicado interno con imagen:** el afiche del almuerzo corporativo del 22-10 se publicó para todos en el CRM y aparece incluso a quien ya lo tenía abierto.

### 21-10 · Agenda del almacén y su cierre del día (Santos)
- Santos pidió definir la agenda del almacén en el CRM «como lo que tiene postventa y comercial, pero enfocado a sus actividades propias del área»: qué debe figurar y qué acciones hizo en el día. Decisiones: las tareas son del área (hoy las trabaja Diana); «otras gestiones» en texto libre hasta mapearlas; la meta es cero colgados (ninguna prueba esperando más de 2 días, ningún despacho atrasado, ninguna salida sin cerrar), no una cantidad; y gerencia ve el cierre del día del almacén en el mismo «Cierre del día».
- Antes de hacerla se midió: en 3 semanas el almacén probó 66 máquinas, registró 90 series, sacó 25 pedidos y atendió 23 llamadas, pero no tenía reporte del día y en 18 de las 25 salidas no quedó grabado quién las hizo; las pruebas, los protocolos y las series tampoco quedaban en el registro de acciones. Eso se arregló primero: ahora todo deja rastro.
- Hecho y en uso: la pantalla «Agenda del almacén» (indicadores, «Hoy, en orden», «Lo que hizo el almacén hoy», otras gestiones, todos los números plegados), el «Reporte del día» del almacén, la lista «Equipos que llegan a planta» (antes daba error) y el rastro completo.
- Pendiente: mapear las «otras gestiones» recurrentes como pasos cuando Lesly y Diana las enumeren.

### 21-10 · El protocolo ya no pide Word (Lesly)
- Lesly reclamó que en la cuenta de Almacén, después de subir las fotos y llenar la ficha, el CRM seguía pidiendo subir el Word del protocolo en las máquinas sin hoja de chequeo (centrífuga, ablandador…). Eso era del proceso antiguo: hoy todo el protocolo se hace en el CRM.
- Desde hoy ninguna máquina exige PDF ni Word para «Probada y embalada» ni para terminar un protocolo de stock; adjuntarlo es opcional. Se pide: fotos, modelo de la placa, serie, técnico y, si hay plantilla, una casilla de la hoja.
- Santos: lo que se cambie en almacén para Lesly debe valer igual en las cuentas de almacén; esta regla vale para todas.

### 21-10 · Central deriva casos a Finanzas y Facturación (Santos)
- **Pedido de Santos:** «Central debería poder derivar casos a Finanzas, Facturación y RR. HH.». Primero se mostraron las pantallas y, aprobadas, se hizo: «Derivar a un área» en la ficha del cliente y en «Sus pedidos», «Casos de Central» para cada área y «Casos a otras áreas» para Central.
- **Por qué:** antes Central solo tenía la «Urgencia a Finanzas» (sin respuesta, solo sobre un pedido liberado) y los avisos de Central (solo informan). Lo demás iba por WhatsApp o correo, sin saber quién lo tenía.
- **Urgente = 2 horas.** Si nadie lo toma, vuelve a sonar en el área y se enteran Central y gerencia.
- **RR. HH. queda para después:** el área ya tiene responsable, pero todavía no tiene cuenta en el CRM.

### 21-10 · El pedido de servicio no pasa por el almacén (Santos)
- Santos: el código se le pide al almacén solo cuando es **producto** (equipo, repuesto o accesorio): «en servicio no se pide código, es solo escrito, entonces no tiene que enterarse almacén». Pidió una opción de servicio, que el detalle se redacte o se jale de la cotización, con el nombre de los servicios y la cantidad «sin monto necesariamente», y que Central lo edite de manera amigable.
- Desde el 21-10, en el paso 1 del pedido Central elige **Producto** (pide el código al almacén, como siempre) o **Servicio** (viene marcado cuando el cierre son servicios). Con «Armar el detalle del servicio» el pedido nace sin avisar al almacén y aparece el cuadro «Detalle del servicio»: N.º, descripción, cantidad, serie del equipo y precio opcional, editable en cada casilla, con «Agregar línea», quitar y «Guardar cambios».

### 21-10 · Central edita «Equipos y series» del pedido (Santos, por Central)
- Central avisó que el pedido de FAMILY FARMS (PED-0037-2026) «no jaló el detalle del trabajo, equipos y series». El cierre eran dos mantenimientos preventivos; desde el 06-10 una línea de servicio no arma fila en la lista del pedido (para no pedir series que no existen), así que el pedido salía sin nada. Santos: «aun así dale para que edite».
- Desde el 21-10, en «Cierres de venta», Central tiene en «Equipos de este pedido»: **«Traer las líneas del cierre»** (con la serie que venga escrita en el texto, enganchada a la máquina del cliente), **«+ Agregar equipo o trabajo»**, y en cada fila **«Corregir el texto»** y **«Quitar del pedido»**. Se puede hasta que el pedido salga; cada cambio queda en las observaciones del pedido. La hoja impresa del pedido ya muestra el trabajo del cierre aunque no esté en la tabla.

### 21-10 · Fichas parecidas para revisar a mano (Santos)
- Santos: «no creaste algo para poder contrastarlo manualmente… juntar fichas de clientes que sean lo mismo pero los han registrado diferente». Desde el 21-10, «Fichas repetidas» tiene la pestaña «Parecidas»: cada pareja con su porcentaje, lado a lado, para unir o descartar. Es lo que en la reunión del 20-10 se llamó «los de poca coincidencia, que tienen que ver ustedes».

### 21-10 · «El macro» del almacén y operaciones (Lesly, por Santos)
- Lesly pedía una «foto macro»: Santos aclaró que es el panorama de almacén y operaciones. Desde el 21-10 está «El macro», como el de postventa, con cada número enlazado a su pantalla.

### 20-10 (tarde, 15:45) · Casos que se terminan, fichas gemelas, torre y stock (gerencia con Lesly, Brenda y Santos)
- Se recorrieron Pepas de Oro y Lino Espíritu. Diagnóstico de gerencia: «nunca se termina un caso porque están superponiendo los casos uno encima del otro».
- Decidido y hecho: cada gestión se anota en un caso (se elige al anotar y Central al derivar); un color por caso en el historial; reclasificar y cerrar se ven en la línea de tiempo; «No se solucionó en la visita» reprograma o trae el equipo a planta.
- Fichas: «eliminemos los duplicados ahorita». El CRM reconoce el DNI dentro del RUC 10 de la misma persona (Lino tenía dos fichas así). Se unieron las fichas de la misma persona cuyo nombre también coincidía; las dudosas quedaron en «Fichas repetidas». A postventa ya no se deriva un cliente sin RUC o DNI sin decir por qué. Santos manda un comunicado a comerciales: los clientes se registran con RUC.
- Apertura de servicio: externa (sale el técnico, no se tocó) o interna (el equipo viene a planta). La interna crea la recepción del almacén; Lesly: «almacén no le interesa si va a pagar, solo ejecuta la orden y sube el informe».
- «Regla: nada de repuestos, solamente equipos» en la lista de máquinas del caso. La torre se ve como lavadora + secadora, cada una con su serie, y el almacén ve que es torre.
- Regularizar los pedidos antiguos: lista de trabajo en Control, empezando por los que están en garantía.
- Stock: «el comercial necesita el stock». Hay una vista de stock para el comercial; falta que el inventario del almacén se codifique y cargue. Mañana Santos revisa con Lesly su Excel de codificación (caso SS23 con aire y sin aire: mismo modelo, código distinto).
- Brenda: los dos nombres del manual son «apertura de servicio» y «derivación de llamada»; el CRM ya usa esos. La solicitud de stock de repuesto se conversa con Santos en una entrevista.
- Pendientes: Excel de Lesly para conciliar el inventario; manual de postventa de Brenda; qué pantalla le pide a Lesly «foto macro» y dónde ve la dirección repetida (por confirmar); comunicado de RUC a comerciales.

### 20-10 (noche) · Apertura de servicio interna o externa (Santos)
- **Qué se decidió:** al emitir la «Apertura de servicio» desde el caso se indica si es **externa** (el técnico va al local del cliente: el circuito clásico, sin cambios) o **interna** (el equipo se atiende en nuestra planta).
- **La interna lleva los antecedentes del equipo:** para qué es (qué se ejecuta), fecha de compra, N.º de guía, garantía, problemas anteriores, repuesto o mantenimiento vendido (preventivo o correctivo) y repuesto cambiado. Salen en la hoja de la apertura y en el pedido, y quedan en «Antecedentes del equipo» de la máquina.
- **Por qué:** el técnico que atiende en planta necesitaba esa historia antes de abrir la máquina (lo mismo que pidió Brenda con «Antecedentes del equipo»).

### 20-10 (noche) · Fotos del pedido y el historial del caso (Santos, revisando el caso de Lino Espíritu)
- **Fotos del pedido con enlace:** en la vista del pedido las fotos de la carga (frente, laterales, posterior, arriba) salían abiertas y tapaban el resto. Ahora dicen «Ver fotos (N)» y se abren en su propia página.
- **Todo el historial del caso en «El circuito»:** Santos pidió que en el circuito se vean todas las gestiones del caso. El historial sale ahí: cambios del caso, llamadas y notas del expediente, derivaciones al almacén y la visita del técnico, con fecha y nombre. Hasta hoy esa sección salía vacía por un permiso que faltaba; ya está corregido.
- **Caso que lo motivó:** Lino Espíritu tiene la misma falla (la secadora no calienta) en dos casos y en dos fichas repetidas (CASO-00129 y CASO-00140). Pendiente: unir las fichas y confirmar si la visita del técnico del 19-10 se hizo.

### 20-10 (noche) · Lo que resolvió el buzón: protocolos, búsquedas del almacén y Family Farms (Lesly, almacén, Brenda)
- **N.º de protocolo correlativo (Lesly: «que se genere en automático, que siga un correlativo»).** Ya no se escribe a mano: el CRM lo pone al marcar «Probada y embalada» (o «Protocolo terminado» en un equipo en stock), con el formato 0003-2026, 0004-2026… y vuelve a 0001 cada año. Arrancó en 0003 porque los últimos anotados a mano fueron el 1 y el 2; a mano se escribía cualquier cosa («APROBADO», «LISTO PARA DESPACHO»). La secadora de una torre lleva el número de su lavadora, un kit de repuestos lleva uno solo y el equipo con protocolo de stock conserva el suyo. Los ya marcados no cambian. Antes era: casilla opcional (Santos, 14-10).
- **Protocolos a la mano (Lesly, «protocolos en general»).** La vista ya existía en Almacén → pestaña «Protocolos» (de pedidos y de stock). Para no buscarla, «Mi día» tiene arriba «Protocolos» y «Subir protocolo de equipo en stock».
- **«Salieron, falta la guía» sin revisiones técnicas (almacén).** Al entrar a «Subir guía» no había dónde adjuntarla porque en esa lista salían revisiones técnicas (Mercedarias, Comercial Lecarnaque, Lino Espíritu): ahí sale el técnico, no una máquina, y las cierra postventa con el informe. Se sacaron de esa lista y de «Mi día».
- **El buscador de Pedidos encuentra también los cerrados (almacén).** Caso: buscaban «Beneficiencia» y no salía porque postventa había cerrado el pedido de Beneficencia de Huancayo esa mañana (y el nombre tenía una «i» de más). Ahora busca palabra por palabra, sugiere los parecidos si algo está mal escrito y avisa si el filtro de fechas lo esconde.
- **«Aperturas de postventa» con su propio buscador (almacén).** Antes la búsqueda saltaba a Pedidos y solo mostraba las abiertas. Ahora busca ahí mismo, por cliente, equipo o N.º de pedido, incluidas las de pedidos cerrados (caso: Hospital Chanka, cerrado el 16-10).
- **Family Farms quedó en una sola ficha (Brenda).** FAMILY FARMS PERÚ S.R.L., con RUC (cartera de C5), juntó las tres fichas sin RUC repetidas (la del caso de garantía, la que solo tenía a Rodrigo Vigil y la de «FAMILY FARMS» con sus 2 cotizaciones antiguas). Agroinversiones Valle y Pampa sigue aparte: tiene su propio RUC, es otra empresa del mismo grupo. Las próximas repetidas las puede unir postventa desde la ficha con «Unir con otra ficha».

### 20-10 (tarde) · «Unir con otra ficha» para los comerciales (Katerine, por Santos)
Dennis Gallardo Correa escribió por WhatsApp pidiendo una lavadora de 25 kg. Ya era contacto, con ese mismo celular, de la ficha SALVADOR CARRION ANA EUGENIA - LAVANDERIAS GLUP (cartera de Katerine, con un expediente vivo desde el 17-10). Central lo derivó y el CRM abrió una ficha nueva a su nombre. Katerine lo vio al toque y pidió unirlas, pero el comercial no tenía cómo: «¿Es el mismo cliente?» solo aparece cuando el CRM adivina la pareja y «Fichas repetidas» solo junta fichas que se llaman igual. Santos: «supongo que aparecería un buscador y podría unir las fichas y preguntar quién es el principal». Lo que quedó hecho el mismo día:
- **Por qué pasó:** al cruzar el teléfono, el CRM descartaba la ficha porque el nombre del que escribía («Dennis Gallardo») no se parecía a la razón social («Salvador Carrión…»), aunque Dennis fuera contacto de esa ficha. Central sí veía «coincide el teléfono» en su pantalla, pero la base abría otra ficha. Desde hoy, si el celular y el nombre de la persona coinciden con un contacto de la ficha, se une a esa ficha.
- **«Unir con otra ficha»**, en la ficha del cliente y en el expediente: el comercial busca la otra ficha (nombre, RUC, celular o contacto), elige cuál queda como principal (el CRM propone la que tiene RUC) y escribe el motivo. Sin código si las dos fichas son de su cartera (no mueve el cliente de nadie); con código de operaciones si alguna es de otra cartera. Al unir, el expediente comercial abierto y sin papeles de la ficha que se une pasa solo al expediente vivo del mismo comercial, y un contacto con el mismo celular no se duplica. Quien tenía la ficha que queda recibe el aviso. Se puede deshacer desde el registro de acciones.
- **El caso de Katerine quedó unido** por administración: el WhatsApp de Dennis está en el expediente vivo de Lavanderías GLUP del 17-10 y ella recibió el aviso.
- Pendiente: Central tiene además la pantalla «Fichas repetidas» (misma mañana) para las que se llaman igual; las que se llaman distinto se unen desde la ficha con este botón.

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
- Resumen: el reporte diario de postventa trae solo lo de cada persona y separa los leads de Central («Entró por», «En qué quedó») con la hoja nueva «Problemas técnicos y su estado» (caso Vidawasi); la consulta del pago a Finanzas va por el pedido con el voucher, ya no por correo (Katerine); pedido de repuestos con varias piezas = un kit con un solo protocolo (Ariana, LINO ESPIRITU); menú «Procesos» con los 12 procesos de postventa dibujados (Santos); «Devolver a la bandeja» cuando el prospecto era de otra cartera (Central, PRO-11084) y «Descargar el PDF para el cliente» baja directo (Moisés); Choquehuanca tenía 7 expedientes de postventa y se juntaron en uno (pendiente de Carlos: 56 clientes con expedientes repetidos); lo más reportado del buzón se volvió botones (devolver, mover gestiones, avisos que dicen qué falta); «Registro de acciones» con «Deshacer este clic» y «Fichas sueltas» (regla: todo lo que el CRM no deja hacer dice por qué y qué hacer); el cierre admite más de una persona que recibe; la serie que está en otra ficha frena y explica (Ariana); acompañantes de una visita a planta se editan después de anunciar (Katerine); en Crece el tope de puntos por gestión sube a 2.500 al mes (antes 1.000); Central indica si los equipos llevan accesorios al pedir el código (Lesly, PRODECO DEL SUR); lo hecho en el cliente, repuestos y ciclos se registran por máquina (Rubí); la apertura lleva orden de compra u orden de servicio del cliente (Rubí, Hortifrut). (resumido; el detalle está en la guía).

### 15-10 (noche) · Buzón: seis pedidos resueltos (Rubí, Moisés y Central)
- Resumen: visita a la planta con los equipos del cliente, DNI o C.E. y «Recogió equipo» (Rubí); «Capacitación · no se cobra» en la clasificación del caso (Rubí); los equipos regalados también piden serie (VITALIAN; antes solo lo vendido); aviso ámbar «Archivar esta ficha» cuando el cliente ya se atendió en otro expediente (Moisés); derivación por error devuelta a la bandeja (G.M. TRAMAS; un repuesto va a postventa aunque el cliente sea de un comercial); TERRANOVA como empresa del grupo de MANDARA.

### 15-10 (tarde) · TERRANOVA y MANDARA: grupo empresarial; regla para clientes que no figuran en el CRM
- Resumen: TERRANOVA REPRESENTACIONES sí compró antes y es del grupo de MANDARA (lo confirmó Brenda; la primera respuesta, «no es cliente», fue un error). Tiene ficha propia en la cartera de Brenda (C1), con sus llamadas de 2019 y su file. **Regla (Carlos):** cliente que está en los Excel o en los files pero no en el CRM, se le pide a Santos que lo cargue; si ya está, se pide el file en «Files». **Pendiente:** cargar la venta anterior de TERRANOVA desde su file (Brenda/Central con Santos). El buscador ahora explica por qué un contacto no tiene expediente.

### 15-10 (tarde) · Almacén, postventa y buzón
- Resumen: horario de atención de la agencia obligatorio en la apertura cuando la entrega es por agencia (Lesly); barrita de carga por archivo y aviso de archivos sin guardar (almacén); ✕ para quitar fotos subidas por error, con el código de Lesly si ya está «Probada y embalada» (OPEN 060-2026); quien recibe el equipo puede ser una empresa con razón social y RUC (Rubí, Portal del Marqués); el pedido llega a postventa recién cuando Central marca «Pedido ejecutado», y la liquidación «cancelada» no reemplaza el «Confirmar pago» de Finanzas (Portal del Marqués); el equipo que no salió en el despacho tiene su propio circuito (Rubí, secadora de ECOLAV; pendiente su serie y verificar la dirección); el cierre trae el correo del cliente y el N.º de operación (Gabriela); AQUASEC unida a su ficha con RUC (un cliente, una ficha).

### 15-10 12:51 · Carlos con Ariana y Santos: pedidos por despachar con pago parcial
- Resumen: seis pedidos con solo un adelanto se veían en verde «Finanzas confirmó» (Abachi y Wong Lu Vega, entre otros). Desde ese día el pago parcial se ve en **ámbar**, con un anuncio de cuánto falta, también para el almacén, y el cierre avisa si la forma de pago se contradice. **Regla (Carlos):** sin el 100 % (o el adelanto acordado) confirmado por Finanzas no se despacha; si hay que despachar igual, autoriza gerencia u operaciones con su código. Pendientes: Carlos decide Wong Lu Vega; Ariana manda fotos del embalaje a PRODECO.

### 15-10 09:53 · Reunión de Carlos con Santos (y Central, postventa)
- **El código para corregir un cierre lo da Central** (Carlos, caso OPEN 057-2026 de NEWREST), solo para editar cierres y coordinándolo con él. El de Lesly sigue para lo demás. Antes era (desde el 02-09): código de Lesly o gerencia.
- Central lee todo antes de pasar un cierre (orden de servicio o de compra: cierre, histórico del cliente y comercial). GMP es nuestra marca de calandrias. Sin pago confirmado no hay apertura (COFACO). Todo se vende en dólares, salvo que la venta empiece en soles. Al cliente que dice que cotiza con la competencia se le llama antes de la fecha. Quien deja la empresa: aviso a Santos el mismo día y su usuario se desactiva. Efamein para todos, cada uno con el alcance de su área. Postventa pregunta, reporta e informa.
- Pendientes: Santos diagrama los procedimientos (hecho el 16-10); Santos con Lesly, las series; revisar por qué tantos contactos de Facebook quedan en «no contesta».

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
- Resumen: kit con cantidades editables en el cotizador (el precio nuevo va a gerencia; idea de Lesly); correos automáticos según la empresa del pedido (OPEN o EFAMEINSA) y los avisos también por correo; directorio y técnicos con DNI en la apertura; postventa ve el check verde cuando Finanzas autoriza la guía, y corregir una apertura emitida avisa a Finanzas y al almacén (Ninamango); apertura de servicio sin pedido desde el caso; WhatsApp de comerciales solo por la bandeja del CRM; los mantenimientos siguen el procedimiento de pedido y las líneas de servicio no piden serie; los cierres Word posteriores al CRM no son REG (San Fernando, Panaservice OPEN 037) y REG lleva series; garantía de las 2 secadoras de AGROCASAGRANDE a 36 meses; buscador de files; cuenta ALM2 de Ariana; perfil de Importaciones con «Por importar»; directorio del personal.

### 05-10 · Presentación al personal y reunión de cierres «REG»
- Resumen: presentación a todo el personal (CRM, Crece, marketing y cultura); los cierres antiguos que nunca entraron al CRM se suben como «REG» con el correlativo que sigue, sin sumar a la venta y pasando por todo el circuito desde Central (origen: AGROCASAGRANDE); toda cotización de postventa pasa por gerencia mientras postventa esté en capacitación; buzón de sugerencias (la bombilla); el cierre hereda la moneda de la cotización; postventa edita el nombre impreso del renglón y la «Nota del PDF»; Aprobaciones muestra gestiones del cliente en otros expedientes (ANTUAN SERVICES); apertura «Puesta en marcha de:» sin equipo; alerta de WhatsApp sin responder; 41 chats retenidos en Central pasados a sus dueños; el PDF de cotización ya no pierde la hoja del TOTAL.

### 02-10 · Dos reuniones de Carlos con postventa
- Resumen: «Ventas de la empresa» con filtros por mes y última gestión, y la campaña «Vender» con «Sin mantenimiento hace…» (no se unen todavía las dos pantallas); criterio de Carlos: si una queja es lo pendiente de un pedido (Agrícola Huarmey), la atención se cierra «derivado a pedidos»; la atención cerrada muestra su historial (Santa Lucila) y cerrar exige elegir el resultado; columna «Informe técnico enviado»; el almacén marca «sin stock» con motivo; los pedidos históricos de Rubí no se cierran en automático; Lesly: la apertura avisa a Finanzas (Tomy Jiro), la guía lleva comprobante, procedencia de cada equipo y visitas de proveedor; una sola dirección del CRM para todos; 7 fichas de NEWREST unidas; nunca «parque», se dice «registro de máquinas»; la cotización avisa si la forma de pago se contradice.

### 01-10 · Reunión con comerciales (Abel, Desiré) y arquitectura
- Resumen: filtro «Origen» en oportunidades (Central, campaña o web, propia); panel «Visitas del equipo» para supervisión; piloto de campo de Brenda; Files con entrega directa a postventa; inducción por etapas (Crece, producto, práctica en showroom); dueño del prospecto anunciado y NO implementado (ver Pendientes); apertura según el modelo de Lesly (11 filas, primer destino y destino final); destino Lima o provincia verificable (Ninamango); motivo de rechazo «Busca lavadora doméstica» en vez de «spam»; Hortifrut cargado como OPEN 050.

### 30-09 · Tres reuniones (correos de postventa, Carlos y el CRM, WhatsApp)
- Resumen: códigos de postventa PV1 Rubí, PV2 Gabriela, PV3 Ariana (PV es la cuenta del área); Files con «Terminé»; visitas y videollamadas como indicador propio; devolver un cierre ya avanzado pide código de gerencia; WhatsApp se trabaja dentro del CRM (caso: un comercial bloqueado por spam al pasar leads a su línea personal) y tipificar ya no cuenta como gestión; «Interesado» o «Cotizado» piden el nivel de interés; la apertura toma nombre y RUC del cierre, separa primer destino y destino final (Andinas Service) y el código solo se pide si cambia algo impreso; «Apurar al almacén» y «Apurar a Finanzas» (Ninamango); «No se le envió» el plano; mover una solicitud mal colgada (Vidawasi); torres LG con dos series; aviso si el largo de la serie no cuadra (Hortifrut); fichas de SENATI unidas; lo archivado se ve en gris y no cuenta como trabajo.

### 29-09 · Gerencia con marketing (Karen, Carlos, Santos)
- Resumen: se convocó la presentación al personal del 05-10; reseñas de Google en revisión (ver Pendientes); etapa 2 con informes y firma en tablet; postventa sin cartera propia («PV es el área»); corregir o anular con código lo mandado a Central (caso Hotel El Alto / Amazonas Grandez) y no registrar el mismo teléfono dos veces en 24 h; el registro de un caso engancha la máquina por su serie (AGROCASAGRANDE); el CRM pasó al servidor de la oficina.

### 28-09 · Reuniones de gerencia con postventa (mañana y tarde)
- Resumen: expediente con historia propia y «ver todo el cliente»; postventa ve los PDF con montos tapados; circuito por tipo de atención («Diagnóstico» pasó a «Antecedentes»; repuesto sin pruebas ni conformidad); fecha de despacho de la guía y formatos de repuesto y mantenimiento; el pedido de Julca (OPEN 024) se reinició por la serie; caída de 15 minutos por la base en la nube; pendiente la numeración propia de cotizaciones de postventa.

### 26-09 · Navegación y celular
- Resumen: vista moderna obligatoria (menú de 80 a 44 opciones); el CRM se adapta a pantallas HD y al iPhone del gerente; para Rubí: pestaña «Cerrados», cerrar pedidos del Excel ya entregados, tipo «accesorio» sin instalación y una atención cerrada ya no pasa sola a seguimiento.

### 25-09 · Reunión de postventa y reunión con Central y Finanzas
- Resumen: preinstalación con videollamada antes del despacho en Lima y confirmación después en provincia; tipos de pedido (equipo, repuesto, mantenimiento o revisión, embalaje con 3 fotos); «Derivación de llamadas» y «Aperturas urgentes» (para el almacén, apertura es despacho); en el caso técnico «Derivar llamada al almacén», «Registrar otra máquina del caso» y «¿La vendimos nosotros?»; rol Facturación (Finanzas en solo lectura, vouchers solo Finanzas y gerencia); cotizar a nombre de otra empresa del grupo en la misma ficha (INY); servicios de mantenimiento en el catálogo, los edita Lesly; C9 es Desiree Salinas.

### 24-09 · Prueba en vivo del pedido desde Central (Santos y Carlos)
- Resumen: Central convierte el cierre en pedido (numera el CRM, sin el ERP), acepta o rechaza la liquidación con el PDF de Finanzas y pide las series desde el sistema (antes por WhatsApp); salir del almacén con saldo pendiente pide autorización; cada documento sigue la empresa de su cadena (OPEN o EFAMEINSA); alerta «Urgencia a Finanzas», cuyo segundo aviso llega a gerencia; se limpiaron 4 pedidos que no abrían por máquinas probadas sin fotos.

### 23-09 · Decisiones de gerencia y reunión de postventa (aperturas)
- Resumen: Open Investments es la primera opción de facturación (Efameinsa solo si el cliente antiguo insiste; desde el 21-10 ya no: la serie sale sola según sea equipo o repuesto/servicio); cartera: 3 meses sin venta (antes 6) y redistribución cada 3 meses; Finanzas con cuenta propia; preventivo cada 4 meses con alerta a los 3 (antes 6); postventa ve la OC y el voucher sin montos; C4 vende solo lavadoras y nace «Seguimiento» en la cartera; la cotización corregida dice «v2»; acceso solo desde la oficina; aprobaciones firmadas «Gerencia Comercial»; cierre en bloque de oportunidades viejas del Excel; nace la apertura de llamada en el CRM (postventa → almacén → versión para el cliente); ficha con «Pendiente con este cliente»; botones «Es un caso» y «Lo atiende mi compañera»; mismo cliente con otra razón social = ficha aparte colgada como grupo (Crisolito); OPEN 028 y 029 fueron pruebas anuladas y el primer cierre real fue el 030.

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
