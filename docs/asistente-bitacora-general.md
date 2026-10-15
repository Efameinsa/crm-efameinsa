# Bitácora del CRM Efameinsa: historia de las decisiones

Vigente al 15-10-2026. Complementa la «Base de conocimiento del CRM» (asistente-guia-del-crm.md). Esa guía dice **cómo funciona hoy** el CRM. Esta bitácora dice **cuándo se decidió cada cosa, quién la pidió, por qué y qué quedó pendiente**.

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

### 15-10 09:53 · Reunión de Carlos con Santos (y Central, postventa)
- **El código para corregir un cierre lo da Central, no Lesly.**
  - Caso: el cierre OPEN 057-2026 (NEWREST) pasó a Finanzas sin la orden de servicio; después se corrigió con el código de operaciones y Central se enteró por un correo. Postventa ya tenía el pedido y el cliente llamaba sin parar.
  - Carlos: «tú [Central] vas a dar el código sí y solo sí para modificar el cierre… coordinándolo conmigo… solamente para edición de cierres, nada más».
  - Desde ese día: corregir un cierre emitido o agregarle documentos pide el código de **Central**, y en pantalla solo se indica Central (Santos, 15-10). El de Lesly sigue valiendo para lo demás (anular, derivar a postventa, aperturas, protocolos, fichas). Central no se autoriza a sí misma una corrección.
  - Antes era (desde el 02-09): código de Lesly o gerencia.
- **Central lee todo antes de pasar un cierre.** «Tú no recibes nada, o recibes todo pero lo lees.» Para saber si un cliente trabaja con orden de servicio o de compra: leer el cierre, mirar el histórico del cliente en su ficha y preguntar al comercial, en cualquier orden. Depende del cliente: suelen llevarla las empresas medianas y grandes.
  - Caso del día anterior (cliente con plataforma de proveedores): sin orden de servicio no se podía facturar. Contabilidad ya lo sabía por experiencia y lo hizo notar.
- **GMP es nuestra marca de calandrias.** Si GMP remite a una persona, es un cliente al que le vendimos: se identifica por la serie de la placa (ERP antiguo, correos o buscador por serie), se registra y se atiende como oportunidad de venta.
- **Sin pago confirmado no hay apertura.** Carlos: la apertura de servicio es la orden de despacho; el almacén despacha lo que dice la apertura. Postventa coordina antes con Finanzas («¿ya tienes las letras?») y con el almacén («no despachas hasta que te diga»). El almacén coordina con postventa, no con Finanzas. Caso: COFACO, que salió sin letras el 14-10. El CRM ya lo frena desde el 14-10.
- **Todo se vende en dólares,** salvo que la venta haya empezado en soles. Si el cliente pagó en soles con nuestro tipo de cambio, el cierre sigue en dólares (consorcio del Portal Marqués).
- **Seguimiento comercial:** si el cliente dice que cotiza con la competencia y pide que lo llamen en cinco días, se le llama antes. «Si no eres agresivo en la parte comercial, vamos a tener un problema.» Caso: una venta perdida con la competencia por esperar la fecha.
- **Cuando alguien deja la empresa,** se avisa a Santos por correo el mismo día y su usuario se desactiva enseguida. Su cartera se entrega a quien se decida; no se trabaja con el usuario de quien se fue.
- **El asistente Efamein ya está para todos** y cada persona tiene el alcance de su área. Carlos: «ahí está tu asistente: pregúntale qué tengo por hacer». Si algo no está mapeado, Efamein lo dice y se reporta por el buzón. Desde el 15-10, gerencia puede leer las consultas que se le hacen («Auditoría del asistente»).
- **Postventa: pregunta, reporta, informa.** Carlos pidió que, si alguien no entiende un paso, pregunte, y que se reporten las incidencias por el buzón. Las personas tienen que poder resolver sin depender de que alguien esté al lado.
- **Pendientes que salieron:**
  - Santos: documentar y diagramar el flujo de todos los procedimientos, para que cualquiera sepa con quién coordinar cada paso.
  - Santos con Lesly: las series (lo único pendiente del almacén).
  - Santos: revisar por qué tantos contactos de Facebook quedan en «no contesta».

### 15-10 · Aviso cuando se corrige un cierre emitido (Brenda, Santos)
- **Qué pasó:** Brenda corrigió con código el cierre OPEN 057-2026 (NEWREST, servicio de mantenimiento) para anotar la orden de servicio. El pedido PED-0024-2026 ya estaba liberado y en postventa desde el 13-10. Preguntó: «una vez que se corrige, ¿cuál es el proceso para que se informe a postventa? ¿A Central le llega un mensaje?». Le preguntó al asistente y no estaba mapeado, porque no existía: la corrección archivaba la versión y recalculaba la venta, pero no avisaba a nadie.
- **Decisión de Santos:** Central debe recibir el aviso. Se armó entero:
  - **Central siempre** (salvo que haya corregido Central), con quién corrigió, el código de quién, el motivo y qué campos cambiaron.
  - **Quien emitió el cierre**, si lo corrigió otro.
  - **Si el pedido ya existe,** Finanzas y Facturación (si cambió algo de facturación o pago), postventa (si el pedido ya está liberado y cambió cliente, equipos o entrega) y almacén (si ya se pidieron las series y cambiaron los equipos). Nadie recibe un aviso por un dato que no le toca.
  - El aviso se queda en pantalla hasta que lo toquen, como el de pedido nuevo. En «Cierres de venta» el cierre corregido lleva la marca «v2 · corregido el…».
  - Quien corrige ve en la confirmación a quién se avisó.
- **Regla que lo acompaña:** el pedido no cambia solo. Los equipos del pedido se copian del cierre al generarlo; después de una corrección, Central compara y ajusta.
- **Antes era:** solo había aviso cuando Central devolvía el cierre y el comercial respondía «ya lo corregí».
- **Dato del mismo caso:** en una corrección, si el cierre es de repuesto o servicio, la lista «Incluye» por defecto (manuales, planos, puesta en marcha) se vacía sola, porque es de venta de equipo (regla del 14-10, caso Yawar Inka). Lo escrito a mano no se toca. En el 057-2026 pasó eso y el aviso lo dice («cambió: lo que incluye»).

### 14-10 (tarde) · Lo que resolvió el buzón y otros ajustes (Central, Jhon, Rubí, Brenda, Santos)
- **Anular un cierre: ahora también puede quien lo emitió, con código** (Santos, a raíz de un cierre de Ariana).
  - El código es el de operaciones o gerencia y se usa una sola vez. «Pedir la anulación» sigue existiendo.
  - Antes era (Carlos, 04-09): «el comercial no anula, pide». Ahora el código es la autorización.
- **Aviso cuando se anula un cierre** (buzón de Central: «el CRM se actualizó y se borró el cierre de hoy»).
  - Caso: el cierre EFAMEINSA 010-2026 de AGROCASAGRANDE (servicio de puesta en marcha) no lo borró ninguna actualización. Lo anuló Ariana a las 17:47, con código, motivo «mala coordinación». Está en la pestaña «Anulados» con su motivo y su pedido se cerró solo. El cierre de agosto (005-2026) sigue igual.
  - Lo que falló fue el aviso. Ahora, si anula alguien que no es Central, Central recibe en la campana quién lo anuló y el motivo; Finanzas también, si ya tenía el pedido.
  - **Pendiente:** si la venta del servicio sigue en pie, Central coordina con Ariana para emitir un cierre nuevo.
- **Un segundo anticipo vuelve a «Por facturar»** (buzón de Jhon, caso PRODECO). Si un pedido ya facturado recibe otro pago a cuenta y Finanzas sube una liquidación nueva con «factura pendiente», el pedido vuelve a la lista de Facturación con el aviso «Nuevo anticipo por facturar». Antes era: «Por facturar» solo mostraba pedidos sin ninguna factura, y el 2.º adelanto de PRODECO no le aparecía a Facturación.
- **Visitas a la planta: mensaje grande en pantalla** (buzón de Central: la notificación no sonó).
  - Antes salía una ventanita chica que se iba sola. Ahora sale un mensaje grande al centro, con campanada triple, que se queda hasta pulsar «Entendido» o «Imprimir para vigilancia».
  - El almacén también lo ve, con el botón «Ver las visitas». Antes tenía un aviso de pocos segundos y las visitas de COFACO y MANDARA nunca se abrieron.
  - Si el CRM estaba cerrado, el mensaje aparece al entrar (visitas de las últimas 12 horas sin leer).
  - Sobre la lentitud que se reportó: ese día hubo varias publicaciones del CRM. Si se repite, avisar por el buzón con la hora y la pantalla.
- **Informe de puesta en marcha por partes** (buzón de Rubí): cuadros separados y en este orden: detalle del trabajo realizado, puesta en marcha, contador de ciclos, observaciones, solución y recomendaciones. Lo que se deja vacío no sale en la hoja impresa. Los informes ya guardados no cambian.
- **Hojas de chequeo para las demás máquinas** (Santos pasó las fotos de los papeles): secadora, desmanchadora, prensa de planchado, rodillo (calandria) y calderín. Prensa, rodillo y calderín se marcan por tipo de energía (gas, eléctrico, vapor). Con hoja en el sistema ya no se pide el Word. Siguen sin hoja la centrífuga, el ablandador y otras. Esto resuelve el pendiente de los protocolos que iba a compartir Ariana.
- **Fichas unidas:**
  - **PERUBAR** (pedido de Brenda): sus cuatro fichas sin RUC se unieron a la que tiene RUC. Los expedientes siguen con quien los atiende.
  - **Abzul** (Santos): Rubí no veía la cotización Presu_1153-26 que hizo Ariana. No era un permiso: el cliente tenía dos fichas y la cotización estaba en la otra. Se unieron en una sola, por decisión de Santos. Lección: cuando alguien «no ve» algo de un cliente, buscar primero fichas partidas.
  - **Operador Nacional de Hoteles del Perú (Decameron)** (lo detectó Brenda): sus tres fichas sin RUC se unieron. La ficha con RUC está en otra cartera y espera decisión de gerencia; mientras tanto, la cotización sale sin RUC.
- **Regularizar con fotos:** las fotos de documentos que llegan por WhatsApp sirven para leer los datos. Al expediente de un cierre van solo los PDF correctos (presupuesto e informe). Caso: Seventh Heaven, al que se adjuntaron fotos por error. Santos: «te di las fotos para que las regularices, obviamente no para que lo almacenes».
- **Asistente Efamein más cómodo** (Santos; los usuarios decían que la X borraba todo):
  - La bolita se arrastra a cualquier parte y recuerda el lugar de cada persona.
  - La ventana se minimiza con «—», con la bolita o con Escape, sin perder la conversación. Solo la X la termina.

### 14-10 15:05 · Llamada con el ingeniero: cierre del servicio de AGROCASAGRANDE (Santos, Ariana)
- **Qué se decidió:** la puesta en marcha de las 2 secadoras UNIMAC UT075 de AGROCASAGRANDE (series 2505034118 y 2505050812) se vendió como **servicio aparte**. Se cotizó (Presu_2345-26, aprobada por gerencia el 14-10) y **postventa hace el cierre de ese servicio** para que Finanzas facture y el cliente pague.
- **Por qué:** el cliente ya aprobó esos equipos desde su cierre inicial. El informe de servicio no se hizo entonces porque no se sabía si haría falta. No se espera otra aprobación del cliente: solo falta el cierre. Sea crédito o contado, a estos clientes **primero se les factura y después pagan**.
- **Tropiezo:** Ariana decía que el cierre no la dejaba seguir sin voucher (comprobante de pago), aunque la venta es a crédito 30 días. Se había hablado con Katerine. El ingeniero pidió verificarlo: un cierre a crédito no debe exigir voucher.
- **Resultado:** Ariana emitió el cierre **EFAMEINSA 010-2026** el 14-10 a las 15:12 (crédito 30 días, factura, garantía 36 meses, sin voucher). Sigue el procedimiento regular: Central genera el pedido y Finanzas factura.
- Antes era: la puesta en marcha iba dentro del cierre de venta (EFAMEINSA 005-2026 REG). Este servicio es una venta nueva.
- **Después:** ese mismo día, a las 17:47, Ariana anuló el cierre 010-2026 con código (motivo «mala coordinación»). Ver la entrada de la tarde.

### 14-10 · Ajustes de almacén, Finanzas y cotizaciones (Santos con Lesly, Ariana, Katerine y Jhon)
- **Crédito con letras: sin visto bueno de Finanzas no sale nada** (orden de Santos, a raíz de COFACO).
  - Toda venta a crédito o con letras necesita el visto bueno de Finanzas para la apertura, la guía y la salida.
  - Santos: «pueden salir con venta a crédito pero tienen que llevar sus letras».
  - El almacén confirma que recibió las letras y luego se registra su entrega al cliente.
  - Sin eso no hay doble check, ni siquiera con código de gerencia.
- **Queda registrado quién hizo cada etapa del pedido y a qué hora.**
- **Salida con saldo pendiente:** postventa ahora necesita código. Antes bastaba escribir un motivo. Casos: Cristo Rey y V y P ICE.
- **Crédito sin adelanto:** basta el visto bueno de Finanzas (decisión de Santos). Antes el pedido quedaba trabado para siempre. Caso: Beneficencia de Huancayo.
- **Hoja de chequeo del protocolo:**
  - Ya no hay que marcar las 37 casillas; basta una (pedido de Ariana con la Beneficencia de Huancayo).
  - Se agregó «Video de la prueba», opcional.
  - El número de protocolo dejó de ser obligatorio. Santos: «en ese documento no va».
- **Protocolos de equipos en stock** (pedido de Lesly):
  - Hay una pestaña «Protocolos» en Almacén.
  - El protocolo hecho a una máquina en stock pasa al pedido cuando esa serie se vende.
  - Ojo: no marca la máquina como «probada». Falta el clic de embalaje.
- **Cotizaciones de EFAMEINSA con cuentas bancarias** (aviso de Katerine). Antes solo las de OPEN las traían.
- **Postventa puede corregir nombre, RUC y rubro de clientes sin dueño.** Caso: Hospital Chanka, de Rubí. Si el cliente tiene comercial, lo corrige su comercial.
- **Asistente Efamein abierto a todo el personal** (Santos). Antes era solo para gerencia. Solo consulta, con permisos por área.
- **Nuevo «REG por entregar»** (caso de Rubí, transmitido por Santos).
  - Caso: Seventh Heaven (Cusco), venta de una calandria de noviembre de 2025 con cierre en Word, sin pedido en el CRM. El equipo sigue embalado en almacén y se entrega cuando el cliente termine de pagar.
  - El REG normal (del 05-10) da el pedido por entregado y se habría saltado el visto bueno de Finanzas. Por eso el REG «por entregar» sigue el circuito normal: series del almacén, Finanzas, apertura, guía y salida.
  - Regla práctica: si el equipo ya salió, REG normal; si sigue en almacén, REG por entregar.
  - Se cargó como cierre EFAMEINSA 009-2026, con el informe, la cotización y el comprobante del adelanto. Las dos fichas del cliente se unieron en una (Central no veía nada porque miraba la ficha sin RUC).
- **Pendientes:**
  - Seventh Heaven: Central genera el pedido; Finanzas confirma lo pagado; después, apertura y salida.
  - Jhon da el visto bueno tardío de COFACO.
  - Carlos decide si el visto bueno de Finanzas aplica a todo crédito o solo a letras.
  - Hay 58 pedidos por regularizar.
  - ~~Faltan los protocolos de calandria, secadora y prensa~~: resuelto el mismo 14-10 (ver arriba).

### 13-10 · Reunión de postventa (Carlos, Santos, Rubí, Ariana, Lesly)
- **Agenda de postventa: solo lo abierto.**
  - El «paso a paso» de pedidos muestra por defecto solo los pedidos abiertos, con enlace a cada pendiente.
  - El botón «Abiertos / Todos» es grande y visible.
  - Lo traído del Excel histórico ya no suma. Las cifras estaban infladas: se veían unos 144 pedidos «en curso» y los abiertos reales son unos 81.
  - La agenda de postventa y su reporte diario en PDF traen la hoja «Pedidos abiertos: lo que falta, paso por paso».
- **Primero el tipo de caso, después el texto** (Carlos: «¿y si no está mapeado? Otro, libre»).
  - Al registrar la llamada se elige el tipo: revisión por garantía, capacitación, «Otro» con texto libre, etc.
  - El tipo pasa al título de la apertura y se puede corregir ahí.
  - «Servicio técnico» no es un tipo aparte.
- **Gerencia devuelve renglones, no borra la cotización.**
  - Gerencia puede devolver ítems puntuales con un comentario por ítem, y el borrador se conserva.
  - Antes era así (desde el 15-09): rechazar mandaba todo a histórico y había que rehacer la cotización.
  - Rechazar la cotización entera sigue existiendo, pero no viene marcado por defecto.
- **Repuesto aprobado → orden «Preparar y embalar» al almacén.** Un repuesto no se prueba. Caso: el variador de Peruvian Nature, que había entrado como «equipo».
- **Pedidos a crédito o con saldo cierran con «Orden a Finanzas para facturar y cobrar».** Lleva aviso y correo a Finanzas. Caso: Beneficencia de Huancayo. No aplica si ya está pagado completo.
- **Apertura desde un caso con los equipos del cliente.**
  - Caso: AGROCASAGRANDE, puesta en marcha de 2 secadoras que salía con una sola serie.
  - Ahora se marcan los equipos de la ficha y la hoja agrupa cantidad y series.
  - El informe de puesta en marcha pregunta «¿De qué equipo es?», hay botón «Otro informe» y se aceptan hasta 100 fotos.
- **Hoja de chequeo del protocolo de lavadora** (pedido de Ariana, con la foto del papel).
  - Está en el CRM con casillas, para usarla en tablet. Santos: «tiene que ser idéntico».
  - Lesly pidió la opción «N/A» por COFACO (máquina de muestra sin quemador).
- **«Probada y embalada» exige el protocolo completo** (Santos, caso COFACO).
  - Por máquina se exige protocolo, foto, documento, ficha, serie, técnico y hoja de chequeo.
  - Modificar después pide código.
  - Ya no se pide subir el Word cuando el CRM genera la hoja.
- **Botones «Sin stock» y «Ya llegó · hay stock»** (Lesly y Santos, caso Vidawasi). Antes se escribía «NO HAY STOCK» en el campo de la serie (pasó también con Prodeco del Sur y Peruvian Nature).
- **Reportes de postventa por autor:** cada usuaria ve solo lo suyo, con un panel del día por línea de trabajo. Antes Rubí veía lo de toda el área.
- **Lo que empieza en OPEN termina en OPEN** (Santos). Caso: la puesta en marcha de Choquehuanca salió con membrete EFAMEINSA siendo venta OPEN, porque el pedido venía del Excel sin cierre.
- **Los cambios al CRM se piden por el buzón o directo a Santos, no a Lesly.**
- **Ese día se regularizó:**
  - El cierre Word de Vidawasi se subió como OPEN 058; falta que Central genere el pedido.
  - En el pedido OPEN 057 (U.M. Raura), cada máquina quedó con su propia serie.
- **Pendientes:**
  - Lesly entrega la lista de stock y sin stock.
  - Faltan los pedidos y cierres en físico con fotos (Vidawasi, primera visita de AGROCASAGRANDE).
  - Faltan las fotos de Herrera y la depuración de «sin stock» de Ariana.
  - Juan Carlos debe dar las cuentas de correo (para la casilla «informe enviado» con correo automático).
  - Se piden: el reporte por rango de fechas, los rangos vacíos de numeración y una columna de empresa más ancha.
  - Estas tareas dependen de esas entregas; no deben darse por atrasadas en el CRM mientras no lleguen.

### 12-10 · Reunión del lunes con el equipo (gerencia con Lesly, Central, postventa, almacén, Finanzas, marketing y comerciales)
- **Acuerdo general: los errores del CRM se reportan por los canales oficiales** (buzón), para ajustar productos e inventario. Postventa y almacén deben darse retroalimentación sobre los despachos.
- **«Punto uno» de almacén: el código debe traer la descripción.**
  - Hace unas semanas se despachó una lavadora no apilable en vez de una apilable (Callao). Se puso el código y el CRM no mostró la descripción, así que nadie vio la diferencia con el cierre.
  - Carlos pidió que el código traiga la descripción, que salte el error y que Central pueda comparar.
  - Pendiente: depende de que Lesly o Importaciones indiquen de dónde sale el dato.
- **Camión esperando unos 40 minutos por una apertura** (RUC o DNI autollenado).
  - Falta aclarar si fue el CRM o el registro.
  - Carlos pidió que Santos vaya con laptop a preguntar en el sitio, porque el almacén no da retroalimentación.
- **Línea a mano con precio → pasa por gerencia** (Santos, caso NEWREST de Brenda).
  - Toda línea escrita a mano con precio, hecha por un comercial, pide aprobación de gerencia. Las líneas a mano en cero no piden nada.
  - Antes esas líneas no llegaban a gerencia.
- **Contabilidad confirma la guía de la apertura**, y Finanzas si Contabilidad no está (pedido de Jhon por el buzón).
- **La nota del destino final de la apertura es editable** (pedido de Rubí por el buzón).
- **Caravedo:** se unieron las fichas de Brenda. Queda una tercera ficha en otra cartera, que decide gerencia.
- **Corrección de una cotización a la Beneficencia de Huancayo:** se hizo por orden de Santos, como excepción. La pantalla frenaba un precio bajo lista que gerencia ya había aprobado. El error de pantalla sigue pendiente. En la reunión se autorizó cambiar la condición de pago a crédito; Katerine quedó en enviar la cotización corregida.

### 10-10 y 09-10 · Ajustes del buzón y de Central
- **Cotizaciones: botón «Anular»** (pedido de Rubí; lo ordenó Santos).
  - Pide motivo y código de operaciones o de gerencia.
  - No deja anular si ya hay venta o cierre.
  - La regla viene del 03-09: las cotizaciones no se eliminan, se anulan.
- **Derivar a postventa también pide código** (Carlos, transmitido por Santos el 09-10): «que no derive unilateralmente, nos está metiendo en problemas».
- **Central: botón «Ver la historia de la empresa»** (Santos). Caso: llegó un contacto de Centrum PUCP con correo personal y no salió aviso, aunque la PUCP es cliente de un comercial. El buscador reconoce siglas.
- **Corrección de lo pasado a Central incluye la vía y adjuntos.** Caso: Brenda registró una llamada como WhatsApp. Ahora «Pasar contacto a Central» exige elegir la vía.
- **Formularios de Meta llegan al CRM** al comercial dueño de la campaña; si no tiene dueño, a Central. Cada formulario se conecta a mano.
- **Plazo del viernes 09-10 para regularizar leads** (orden de Carlos del 07-10). Se envió un correo a los comerciales: regularizar informes y tipificaciones de los leads en el CRM. Es «mandatorio» y sirve para devolver a Google y Meta qué contactos sí cotizaron o compraron.

### 07-10 · Reunión de gerencia (Carlos y Santos)
- **Todo pedido de cambio va por el Buzón de sugerencias, sin excepciones.** Carlos: si no, «mejor no lo usamos». Pidió que el sistema tenga claras las reglas duras de negocio y que no haga cambios solo porque alguien los pida.
- **Todas las sugerencias suman puntos en Crece, sin límite** (Santos). Antes eran hasta 3 por día, con tope mensual.
- **Correos del CRM con marca de la empresa** y botón «Enviar por correo» en la apertura.
- **Open se presenta como «Efameinsa Open»** (Carlos): «Open no se entiende», no mezclar logos.
- **Postventa debe decir qué necesita de su agenda**, como la del comercial.
- **Llamadas de la más reciente a la más antigua** (pedido de Lesly; hecho ese día).

### 06-10 · Reunión de postventa y correos (gerencia, Lesly, Central)
- **Kit con cantidades en el cotizador.**
  - Un kit (por ejemplo, instalación de secadora) varía en una cantidad según el cliente: el ducto puede ser de 3 m o de 10 m.
  - Postventa o el comercial editan solo las cantidades de los componentes. El precio nuevo va a aprobación de gerencia.
  - Origen: sugerencia de Lesly, porque el kit salía desalineado en el PDF.
- **Correos automáticos según la empresa del pedido.**
  - Cada persona tiene dos correos (OPEN y EFAMEINSA). Si el pedido nació en OPEN, salen correos de OPEN.
  - Los avisos también van por correo, para que no haya «mi campana no sonó».
  - Lesly entregó el directorio y la lista de técnicos, que ahora salen con DNI en la apertura.
- **Apertura → Finanzas → almacén.**
  - Postventa ve un check verde cuando Finanzas autoriza la guía.
  - Si postventa corrige una apertura ya emitida (por ejemplo, dirección mal escrita), se avisa a Finanzas y al almacén para volver a aprobar.
  - El almacén tiene la tarjeta «Guías autorizadas por Finanzas». Caso: Ninamango, que Lesly no encontraba.
- **Apertura de servicio sin pedido** (garantía o servicio a un cliente antiguo, por ejemplo Jaén): ahora sale desde el caso.
- **WhatsApp de comerciales:** la comunicación con clientes es por la bandeja del CRM. «Se cierra la ventanilla» del WhatsApp personal.
- **Mantenimientos como San Fernando y Buenos Aires:** gerencia dijo «hay que seguir el procedimiento», es un pedido. Las líneas de servicio no piden serie.
- **Cierres Word hechos después del CRM no son REG** (Lesly, con visto bueno de gerencia). REG es solo para cierres anteriores al CRM. Un Word posterior se carga como cierre normal, con su venta. Se cargaron San Fernando y Panaservice (este con su número reservado, OPEN 037).
- **REG debe llevar series:** se cerró el hueco del piloto de AGROCASAGRANDE. Central generó el pedido REG sin series porque creía que se generaban solas.
- **Garantía de las 2 secadoras de AGROCASAGRANDE: 36 meses**, como dice su cierre (OK de Santos). La regla general sigue abierta (ver Pendientes).
- **Buscador de files** por empresa, RUC, día y mes (pedido de Central).
- **Segunda cuenta de Almacén para Ariana** (ALM2), aparte de su cuenta de postventa.
- **Importaciones tiene perfil propio** (ingresó Marco Antonio Velásquez). Su pantalla «Por importar» muestra las máquinas sin serie de pedidos abiertos, con fecha estimada de llegada.
- **Directorio del personal** en el CRM (lo mantiene operaciones).

### 05-10 · Presentación al personal y reunión de cierres «REG»
- **Presentación a todo el personal a las 9:00** (decidida el 29-09): el CRM y Crece como productos, la estrategia de marketing y las pautas de comunicación y cultura.
- **Cierres antiguos que nunca entraron al CRM: se suben como «REG»** (reunión de las 16:38).
  - Origen: Rubí no podía abrir la puesta en marcha de AGROCASAGRANDE porque su cierre estaba solo en Word y no había pedido.
  - Se sube con el correlativo que sigue en la serie del CRM, no con su número de Word.
  - No suma a la venta, porque la venta ya estaba en el CRM desde el Excel.
  - Lleva la marca «REG» y Central lo filtra aparte.
  - Pasa por todo el circuito desde Central. Central copia ella misma las series; no se le piden al almacén.
  - Primero se probó con un solo caso (el de Katerine) y luego se pasa a «todos los demás».
- **Toda cotización de postventa pasa por gerencia** mientras postventa esté en capacitación, a cualquier precio (orden de gerencia). Aplica a Gabriela, Rubí y Ariana; no a Lesly ni a comerciales.
- **Buzón de sugerencias** (botón de la bombilla), pedido por Santos. Cada uno ve las suyas; admin y gerencia ven todas. El 06-10 se agregó el aviso «Ya se solucionó lo que reportó».
- **El cierre hereda la moneda de la cotización.** Caso: Katerine cotizó en soles y el cierre salió en dólares.
- **Postventa:**
  - Puede editar el nombre impreso del renglón y la «Nota del PDF». Gabriela: «no en todos incluye el examen médico ocupacional».
  - Gerencia ve los borradores de postventa en Aprobaciones.
- **Aprobaciones muestra gestiones del cliente en otros expedientes** (últimos 90 días). Caso: gerencia rechazó una cotización de Gabriela a ANTUAN SERVICES por «no hay gestión», pero su llamada estaba en otro expediente.
- **Nuevo tipo de apertura «Puesta en marcha de:»**, para cuando el técnico va sin equipo (pedido de Rubí).
- **Alerta de WhatsApp sin responder** a los comerciales (pedido de Central): máximo un aviso por hora, de lunes a sábado de 8 a 19. No avisa si hubo gestión fuera del chat (pedido de Katerine).
- **WhatsApp retenidos en Central:** unos 41 chats retenidos desde el 22-09 se pasaron a quien tenía el contacto. Desde entonces el chat va directo al dueño de la cartera si está activo.
- **PDF de cotización sin la fila del TOTAL** (reclamo de Brenda): el sistema borraba como «hoja en blanco» una hoja que solo tenía el total. Se corrigió el mismo día.

### 02-10 · Dos reuniones de Carlos con postventa
- **10:25, preventivos:**
  - «Ventas de la empresa» tiene filtro por mes y por última gestión (nadie lo llamó / llamado sin oportunidad / en proceso).
  - La campaña «Vender» tiene filtro «Sin mantenimiento hace» 3, 6, 12 o 24 meses. Antes salían como «nunca le hicimos mantenimiento» ventas de hace 21 días.
  - Santos decidió **no unir todavía** las dos pantallas: «es más delicado», se retoma en otra reunión.
- **12:25, criterio de Carlos:** si una queja es en realidad lo pendiente de un pedido (caso Agrícola Huarmey, faltaba la puesta en marcha), la atención se cierra como «derivado a pedidos» y se sigue en el pedido. Si el pedido está completo, se reclasifica (por ejemplo, refuerzo de capacitación).
- **Pedidos de esa reunión:**
  - La atención cerrada muestra su historial (quién y cuándo), y esas gestiones se ven en la ficha del cliente. Caso: Hotel Santa Lucila, cuyo cierre no aparecía.
  - Cerrar una atención exige elegir el resultado; ya no viene «resuelto» por defecto.
  - El paso a paso tiene encabezado fijo, buscador por cliente y el pago parcial visible.
  - Columna «Informe técnico enviado», con constancia adjunta.
  - Filtro por cliente en el calendario de postventa.
  - El almacén marca «sin stock» con motivo (importación, compra local o fabricación).
  - Finanzas filtra por el día en que confirmó.
  - Los pedidos históricos de Rubí **no se cierran en automático**: Lesly pasa la lista y Ariana se capacita con unos 10.
- **Mejoras de almacén pedidas por Lesly:**
  - Al emitir la apertura también se avisa a Finanzas. Caso: Tomy Jiro.
  - La guía lleva tipo y número de comprobante.
  - Se marca la procedencia de cada equipo.
  - Se registran las visitas de proveedor.
- **Una sola dirección del CRM para todos** (Santos). A cada persona se le da solo esa dirección.
- **NEWREST:** se unieron 7 fichas en NEWREST PERÚ S.A.C. (pedido de Brenda, orden de Santos).
- **Textos del CRM: nunca «parque»** (Santos: en Perú un parque es un lugar con jardín). Se dice «registro de máquinas».
- **Cotización con forma de pago:** al elegirla se trae su saldo, y un aviso ámbar marca las contradicciones. Caso: Gabriela marcó «al contado» y salió 30/70.

### 01-10 · Reunión con comerciales (Abel, Desiré) y arquitectura
- **Oportunidades con filtro «Origen»:** Central, campaña o web, o propia. Lo pidió Desiré (C9), que no distinguía lo derivado por Central de lo que llegaba por campaña.
- **Panel «Visitas del equipo» en supervisión.** Carlos: «dame visibilidad en las visitas».
- **Piloto de trabajo de campo de Brenda:** 15 días, martes y viernes, con ubicación lo más precisa posible. Después vendrá un «vendedor de campo» con menos pantallas.
- **Files: entrega directa a postventa** registrada en el CRM. Antes Central entregaba el expediente en mano y no quedaba constancia.
- **Inducción por etapas para comerciales nuevos** (Carlos):
  1. Corporativa, en Crece.
  2. Técnica de producto (primero LG, luego industrial), de no más de una hora.
  3. Práctica con la máquina en el showroom.
  - Se graba en audio para Crece.
- **Reglas anunciadas, aún NO implementadas: dueño del prospecto.**
  - Contactos nuevos de campaña: 15 días.
  - Cliente de compra continua: 6 meses.
  - Cliente que trae el comercial: permanente.
- **Apertura según el modelo de Lesly** (Santos). Reemplazó al formato anterior de 9 filas. El 02-10 se ajustó:
  - Son 11 filas, con primer destino y destino final.
  - La guía tiene campo propio.
  - Contabilidad es editable (Lesly: «es Jhon»).
- **Destino Lima o provincia verificable y corregible** (Rubí, caso Ninamango, Huancayo). Hay empresas con dirección en Lima que piden el equipo para provincia.
- **Motivo de rechazo nuevo: «Busca lavadora doméstica (no industrial)»** (pedido de los comerciales). No se usa «spam» porque le dice a Google y Meta que el lead era basura.
- **Hortifrut:** el pedido real de Brenda nunca se había registrado como cierre. Se cargó como OPEN 050. Carlos: «coordina con Santos, nadie está informado».

### 30-09 · Tres reuniones (correos de postventa, Carlos y el CRM, WhatsApp)
- **Códigos de postventa definitivos:** Rubí PV1, Gabriela PV2, Ariana PV3. PV es la cuenta del área y nadie entra con ella. Cada usuario del CRM tiene su correo del mismo número. Solo el PDF de Rubí muestra el correo general de postventa, que es el que conocen los clientes.
- **Pedidos de Carlos sobre el CRM:**
  - Files: botón «Terminé», para que Central suba a recogerlo.
  - La gestión de WhatsApp sale de la meta de gestiones.
  - Visitas y videollamadas son un indicador propio en «Hoy» y en los reportes. «Reunión online» pasó a llamarse «Videollamada».
  - Si el proceso ya avanzó (serie pedida o pedido en Finanzas), Central necesita código de gerencia para devolver un cierre.
  - El contacto escrito a mano en la apertura se suma a la ficha como contacto «operativo». Carlos: «¿contacto de tercera categoría?».
  - Respaldo del CRM fuera de la máquina.
- **WhatsApp: trabajar dentro del CRM** (Carlos).
  - Caso: un comercial pasó unos 100 leads a su WhatsApp personal con el mismo texto repetido, y WhatsApp lo bloqueó como spam por un día.
  - Pauta: trabajar lo máximo dentro del CRM (número oficial, ventana de 72 h desde el anuncio) y tipificar todo. La línea personal es solo una excepción. Llamar sigue permitido.
  - Se descartaron Telegram y los bots por QR, porque violan los términos de WhatsApp.
- **«Interesado» o «Cotizado» en WhatsApp pide el nivel de interés en el mismo clic** (Santos). Nunca se califica solo.
- **Desde el 30-09, tipificar en WhatsApp no cuenta como gestión.**
- **Apertura:**
  - El nombre y el RUC salen del cierre, no de la ficha. Caso: Inversiones URGA.
  - En envíos por agencia, el primer destino se separa del destino final. Caso: Andinas Service, Ica.
  - «Emitir apertura» pide confirmación.
  - Código solo si cambia algo impreso.
  - «A quién llama el almacén» es obligatorio y empieza vacío. Caso: Hostal La Arboleda.
- **Botones «Apurar al almacén» y «Apurar a Finanzas»** (pedido de Central, caso Ninamango). Desde la segunda vez avisan a gerencia.
- **«No se le envió» el plano** (Rubí). Caso: el equipo llegó antes que el plano a Inversiones Nacionales de Turismo.
- **Corregir o mover una solicitud mal colgada** (Rubí, caso Vidawasi). La solicitud cayó en Inversiones Cristo Vive por un teléfono ajeno.
- **Torres LG: dos series por unidad** (Lesly, caso Ninamango).
- **Almacén:**
  - Lo más reciente arriba.
  - Aviso si el largo de la serie no cuadra con la marca. Caso: la Unimac de Hortifrut, con un dígito de menos.
- **SENATI:** se unieron las fichas en la cartera de Katerine (orden de Santos).
- **«Así se quedó»:** arriba del expediente se ve lo archivado, en gris. Lo histórico se consulta pero no cuenta como trabajo (Santos). Origen: Katerine reclamó por Pyramid Metals y Grupo Safe.

### 29-09 · Gerencia con marketing (Karen, Carlos, Santos)
- Se convocó la **presentación al personal** del 05-10, para que se entienda el trabajo del CRM y de Crece.
- **Reseñas de Google:** se habló de un piloto con personal antiguo y de una directiva para que el comercial o técnico pida la reseña al cliente al entregar, con QR. Ver Pendientes.
- **CRM, etapa 2:** los técnicos llenan informes y firman en tablet dentro del CRM.
- **Postventa sin cartera propia** (Santos, 28 y 29-09). Gerencia: «PV es el área; PV1, PV2 y PV3 son de las personas; cuando alguien lo gestiona es suyo». Cualquiera del área cotiza en expedientes de postventa.
- **Corregir o anular con código lo que uno mandó a Central** (Carlos). Caso: el almacén registró dos veces «Hotel El Alto Recepción», que era Amazonas Grandez Inversiones. También se frena registrar el mismo teléfono dos veces en 24 h.
- **El registro de un caso engancha la máquina por su serie** y verifica la garantía (Santos, «hazlo ahora»). Origen: Rubí no podía registrar la puesta en marcha de AGROCASAGRANDE.
- **El CRM pasó a correr en el servidor de la oficina** (decisión de Santos del 26-09, encendido el 29-09). En la red de la oficina es varias veces más rápido; la nube queda como copia.

### 28-09 · Reuniones de gerencia con postventa (mañana y tarde)
- **Expediente con historia propia** y botón «ver todo el cliente». La solicitud de Central aparece como «Inicio», con quién la registró.
- **Postventa ve los PDF con los montos tapados** (cierre y cotización).
- **Circuito por tipo de atención:**
  - «Diagnóstico» pasó a llamarse «Antecedentes».
  - Puesta en marcha y repuesto: antecedentes opcional.
  - Repuesto: sin pruebas ni conformidad.
  - Soporte técnico: circuito completo.
- **Nuevas opciones:** fecha de despacho de la guía, «Factura también con otra empresa», autoderivado y formatos PDF de repuestos y mantenimiento con firma de postventa.
- **Postventa da su retroalimentación del CRM hasta el 29-09.** Les preocupaban las variantes del mundo real («¿qué pasa si no compré? ¿se rompe el circuito?»).
- **El pedido de Julca (OPEN 024)** se reinició para que Central lo vuelva a generar con la serie correcta. La factura la corrige Finanzas aparte.
- **El CRM se cayó unos 15 minutos a las 17:30**, porque la base de datos gratuita en la nube se saturó. Esto aceleró el paso al servidor de la oficina.
- **Comerciales:** catalogar bien la campaña de origen en el CRM.
- **Pendiente:** la numeración propia de las cotizaciones de postventa (hoy comparten serie con los comerciales).

### 26-09 · Navegación y celular
- **Vista moderna obligatoria** para todas las cuentas oficiales (Santos). Antes era optativa. Gerencia había aprobado el 23-09 el mapa nuevo, que pasó de 80 a 44 opciones de menú.
- **El CRM se adapta a pantallas HD y al iPhone del gerente** (Santos): menú móvil y agenda en lista.
- **Pedidos de Rubí desplegados el mismo día:**
  - Pestaña «Cerrados».
  - Los pedidos del Excel ya entregados se cierran desde su ficha.
  - Tipo «accesorio» (coches) sin instalación.
  - Una atención cerrada ya no pasa sola a seguimiento.
  - Enter ya no envía en «Pasar contacto a Central».

### 25-09 · Reunión de postventa y reunión con Central y Finanzas
- **Preinstalación:**
  - Lima: videollamada **antes** del despacho.
  - Provincia: confirmación del cliente **después**.
- **Tipos de pedido:** equipo, repuesto, mantenimiento o revisión, y **embalaje** (nuevo; cierra con al menos 3 fotos de salida). Si un pedido pide pasos que no le tocan, casi siempre tiene el tipo mal puesto.
- **Nombres nuevos:**
  - «Aperturas al almacén» pasó a llamarse «Derivación de llamadas».
  - Hay una pestaña aparte de «Aperturas urgentes».
  - Para el almacén, «apertura» significa despacho.
- **Caso técnico:**
  - Botón «Derivar llamada al almacén».
  - «Registrar otra máquina del caso».
  - «¿La vendimos nosotros?»: si no, queda sin garantía y anotado.
- **Rol Facturación** (con Central y Jhon).
  - Finanzas ve el expediente en solo lectura.
  - Los vouchers solo los ven Finanzas y gerencia.
  - Contabilidad marca «Enviada al cliente».
- **Cotizar a nombre de otra empresa del grupo** (caso de Katerine: Congelados y Frescos y Refrigerados INY). Misma ficha y misma cartera. Antes se abría otra ficha y la historia se partía.
- **Servicios de mantenimiento en el catálogo,** con la ficha del trabajo del técnico. Lesly los edita.
- **C9 es Desiree Salinas** (se reutilizó el perfil de reserva).

### 24-09 · Prueba en vivo del pedido desde Central (Santos y Carlos)
- **Central convierte el cierre en pedido.**
  - El CRM numera los pedidos. Se retiró el paso por el ERP.
  - Central acepta o rechaza la liquidación viendo el PDF de Finanzas.
  - Central pide las series al almacén desde el sistema. Antes las pedía por WhatsApp.
- **Salida del almacén con saldo pendiente** solo con autorización. El técnico de la apertura lo pone postventa.
- **Cada documento sigue la empresa con la que empezó su cadena:** OPEN sin nada de Efameinsa; EFAMEINSA con su logo.
- **Alerta «Urgencia a Finanzas»** para Central. El segundo aviso por el mismo pedido llega a gerencia.
- **Pedidos que no abrían:** el almacén había probado máquinas sin fotos y la pantalla fallaba. Se limpiaron 4 pedidos: Ecolav, Bungarena, Herrera y Rivera.

### 23-09 · Decisiones de gerencia y reunión de postventa (aperturas)
- **Open Investments es la primera opción de facturación.**
  - Clientes nuevos van a Open.
  - Si un cliente antiguo pide Efameinsa, se intenta mantener Open y se le explica. Si insiste, se factura con Efameinsa.
- **Cartera: 3 meses sin venta** y se redistribuye cada 3 meses. Antes eran 6 meses.
- **Finanzas tiene cuenta propia** (Jhon confirma los pagos él mismo).
- **Preventivo cada 4 meses**, con alerta a los 3 para enviar propuestas y cerrar antes de los 4. Aplica a máquinas nuevas. Antes la referencia era de 6 meses.
- **Postventa ve la OC y el voucher.** Los montos siguen fuera de sus pantallas.
- **A C4 (Ariana como comercial) se le quita vender mantenimiento:** vende solo lavadoras. Se creó «Seguimiento» en la cartera para todos los comerciales.
- **Cotización corregida:** el PDF dice «v2». Toda corrección se sustenta y debe quedar claro cuál es la final.
- **Acceso solo desde la oficina.** Por ahora no hay acceso remoto.
- **Las aprobaciones siguen firmadas como «Gerencia Comercial».**
- **Oportunidades viejas del Excel:** gerencia autorizó cerrarlas en bloque. No se archivaron las que tenían gestión en los últimos 30 días.
- **Apertura de llamada en el CRM.**
  - Postventa la envía desde el pedido o desde la ficha.
  - El almacén da el check y sube su informe (con faltantes para cotizar y fotos).
  - Postventa arma la versión para el cliente.
- **Ficha del cliente:** «Pendiente con este cliente», equipos y los 2 últimos cierres arriba.
- **Botones en el expediente de postventa:** «Es un caso» y «Lo atiende mi compañera».
- **Mismo cliente con otra razón social** (caso de Katerine: Inversiones Crisolito y otra empresa de la misma dueña). No se fusiona: se hace una ficha aparte colgada de la principal como grupo económico.
- **Pruebas de series:** OPEN 028 y 029 fueron cierres de prueba y quedaron anulados. El siguiente cierre real de Open fue el 030.

### 22-09 · Reuniones de Carlos (caso Huamán Ruiz, postventa y comerciales)
- **Postventa también acumula en un mismo expediente:** mismo cliente, mismo tipo, abierto y con movimiento reciente. Antes postventa siempre abría uno nuevo. Carlos: «ese es un error». Caso: Inversiones Huamán Ruiz, que pidió el mismo repuesto dos veces y quedó dos días sin respuesta.
- **La alerta de derivado sin atender bajó de 24 a 4 horas.** Carlos: «no días, horas… nuestro trabajo como Central es supervisar».
- **«Lo que mandé a Central» muestra una semana.** Antes, 24 horas.
- **Pedidos:**
  - El comercial ve el estado del pedido, sin montos. Se había pedido en varias reuniones.
  - El despacho lleva hora.
  - Cada gestión dice quién la registró.
  - Central ingresa las series antes de dar el visto bueno. Carlos: «ese es nuestro punto de partida».
  - Equipo sin serie significa sin stock.
- **Doble filtro del despacho:** postventa programa, pero el almacén lo ve en rojo hasta que estén todos los pasos.
- **Postventa clasifica lo que llega** (triaje). Una llamada sobre un pedido en curso no abre un caso suelto. Caso: Titan.
- **En Lima, antes de la puesta en marcha, hay videollamada de preinstalación.** Caso: Titan, 7 días sin contacto.
- **Los contactos se eligen, no se reescriben.** Si dos personas comparten teléfono, no se cambia el nombre en automático.
- **Se descartó un chat entre comercial y postventa.** Carlos: «se van a jalar los pelos».
- **WhatsApp con los comerciales:**
  - Ventana de 72 h si el cliente vino de un anuncio.
  - Se ve el anuncio que vio el cliente.
  - «Sin respuesta» pasó a llamarse «No contesta».
  - Reparto por dueño de campaña.
  - Pendiente: la tipificación en 3 opciones. Carlos: «déjame pensarlo».

### 21-09 · Carlos revisa el CRM en vivo con postventa
- **Un repuesto o accesorio puede ir sin plano**, con motivo. Caso: el calderín de Malvich.
- **La apertura indica entrega a domicilio o en agencia, y cuál** (Cusco tiene seis). El DNI de quien recibe es obligatorio porque la agencia lo pide.
- **Con la apertura emitida, cambiar entrega o fecha pide código** de operaciones o gerencia.
- **Postventa programa el despacho.** El almacén solo confirma. Carlos y Rubí: «todo lo programamos unilateralmente».
- **Postventa abre el PDF del cierre** («están ciegos»), pero las cifras siguen ocultas.
- **Equipos del pedido:** una fila por unidad vendida y despacho parcial por equipo. Caso: Ecolav, con la lavadora en stock y la secadora sin stock.
- Carlos: «no quiero que trabajemos con el Word». El reporte de postventa se hace en el CRM.

### 18-09 y 19-09 · Carlos (casos con varias máquinas)
- **Un caso lleva varias máquinas.** Carlos: «tengo que relacionar la serie con el problema». Caso: Gary Group, con 4 máquinas. Nadie había registrado las series en el despacho.
- **Informes técnicos del almacén ordenados por cliente y luego por máquina.**
- **Vigilancia no se flexibiliza:** sin DNI no entra.
- **19-09:** cualquiera de postventa puede cerrar un caso del área. Caso: Gabriela no podía cerrar la garantía rechazada de Beso de Sal.

### 16-09 y 17-09 · Carlos y Lesly (módulo de almacén)
- **Postventa entra directo a «El macro».**
- **Nace el módulo de almacén** (se llama «almacén», no «logística»).
  - Prueba y protocolo.
  - Confirmación de «listo para el despacho».
  - Salida con fotos y video.
  - Foto de la guía en la agencia.
  - Postventa da el doble visto bueno.
- La cuenta de almacén pasó a uso real el 18-09.
- **Formatos de Lesly en el CRM** (16-09): «Viene a la planta» manda el correo de visita, la orden de trabajo sale al programar y los informes de servicio salen con su formato.

### 15-09 · Carlos (siete audios)
- **Si Central anula un cierre, se avisa al comercial con el motivo.**
- **Rechazo de gerencia:** se indica qué cotización y el motivo queda en el historial. La rechazada no se edita; se hace otra. Esto cambió el 13-10 con el rechazo por ítem.
- **Ejecutar un pedido sin liquidación pide código.** Postventa no ve el pedido hasta el check de Central.
- **Postventa puede registrar un seguimiento sin abrir caso** ni pasar por Central. Caso: Lavipronto.
- **Visitas a planta:** se avisa a Central (RUC, empresa, persona, DNI, motivo, fecha) y Central imprime la lista para vigilancia.
- **El circuito del pedido depende de lo vendido:** equipo, repuesto, mantenimiento o revisión.
- **Plataforma de inducción aprobada y obligatoria** (Crece). Las tareas se quedan en el CRM.

### 14-09 · Precio con IGV y condición de pago
- **Check «incluye IGV» por renglón** (Carlos, audio). Un comercial dividió a mano entre 1,18 y salió un centavo de menos. Uso: cotizar neto como siempre y usar el check solo cuando la venta se cerró en cifra redonda.
- **«Quién autorizó» solo se pide si entró menos de lo acordado antes del despacho.** Carlos aclaró que vender a crédito es lo normal de la casa. Caso: V y P ICE. Antes se comparaba lo pagado con el total.
- **El correo del lead llega a la ficha aunque no deje teléfono** (calculadora web).

### 10-09 · Reunión de gerencia con Ariana y reglas de catálogo
- **El catálogo lo gestiona Lesly desde el CRM** (Santos). El maestro de Excel deja de ser la referencia. El precio válido es el que Lesly carga en el CRM. Ante una discrepancia se pregunta a Lesly o a Carlos.
- **Postventa ve «Las ventas de la empresa»**, sin montos. La lista arranca de las ventas, no solo de las máquinas registradas.
- **Central tiene su vista de Clientes:** la cartera entera y la ficha en solo lectura, para saber de quién es cada cliente.
- **«Lo que mandé a Central»:** postventa ve lo que registró y aún espera. Caso: Hostal La Arboleda, registrado dos veces porque no lo veía.
- **Botón «Avisarle al comercial»** cuando vuelve a escribir un cliente ya cotizado. «Descartar» solo significa que el contacto no procedía.
- **Formularios de Google Ads sin RUC creaban fichas «cascarón».** Ahora teléfono y correo exactos cuentan como la misma persona.
- **Cotizaciones históricas:** en el archivo manda el PDF.

### 09-09 · Reunión de postventa y Central
- **Las guías de remisión fijan el inicio de la garantía.** Las máquinas registradas pasaron de unas 300 a unas 550.
- **Un teléfono mal tipeado ya no abre una ficha nueva.** Casos: Grupo Santa Elena y NEWREST.
- **«Es un cliente que ya tenemos»:** Central une el contacto a la ficha existente. Si elige «cliente nuevo» habiendo coincidencias, debe escribir la razón (11-09, caso Gate Gourmet).
- **Pedir la cartera con código del supervisor** (Santos, caso Rivera Trigoso). Se traspasa la ficha con todos sus expedientes y se avisa a quien la pierde. No aplica a instituciones con sedes (ESSALUD, Marina, MINSA).
- **Pedir un expediente con código para trabajarlo**, sin mover la cartera.
- **No marcar «sin gestión» a quien atendió en otra ficha del mismo cliente.** Casos de Ariana: Joel Ortega, Eli Farfán y Vilma García. Las notas automáticas no cuentan como gestión.

### 07-09 · Postventa
- **Forma de pago desplegable en el cotizador.**
- **En la clasificación que elige Central, «Garantía» pasó a llamarse «Soporte técnico».**

### 03-09 y 04-09 · Correlativos (Carlos)
- **Los huecos de numeración se anulan, no se rellenan.** Carlos: «todo lo vacío queda anulado».
  - El hueco se originó porque se indicó cotizar a mano «desde el 2186» sin saber que el CRM ya iba más adelante.
  - Carlos: «hemos cometido un error nosotros». El CRM es la verdad.
- **Los cierres Word de agosto quedan como referencia** en el servidor; sus ventas ya están en el CRM.
- **Cierres de postventa en Word, numerados desde el 30** de la serie OPEN, sin prefijo PV (decisión del 04-09; antes se había dicho desde el 34).
- **Al derivar a postventa no se lleva el histórico de gestión ni de ventas del comercial**, ni se ven precios. Sí se ven los datos generales y las máquinas instaladas.
- **Los comerciales pueden agregar rubros** (03-09). Según la regla de «la última reunión manda», Carlos revirtió esa apertura al día siguiente. Por confirmar.
- **Borradores editables sin código.** El código solo se pide cuando ya hay numeración.

### 02-09 · Observaciones de gerencia
- **«Mi día» muestra solo lo real** (lo nacido o trabajado en el CRM). Las oportunidades fósiles del Excel quedan plegadas con un botón «Retomar».
- **Editar un cierre pide motivo y código** y guarda la versión anterior.
- **Anular un cierre duplicado pasa la venta al cierre que lo reemplaza.** Caso: Brenda emitió dos veces el cierre de Inversiones Nacionales de Turismo y de Grupo Alimenticio San José.
- **ESSALUD, la Marina de Guerra y MINSA:** una ficha madre con sedes hijas. Central elige la sede al derivar.
- **Primer cierre con repuestos y servicios:** Fancavel, de Ariana. Trajo el renglón por tipo y el «Se le factura a» editable.

### 01-09 · Carlos: expedientes y cierre de postventa
- **Un expediente por cliente y comercial.** Si hay uno abierto, se acumula ahí. Analogía de Carlos: el historial clínico.
- **Cierre emitido = sellado.** Para corregirlo, Central observa y el gestor pide autorización.
- **La aprobación de precio queda pegada al equipo y al precio**, y sobrevive a la edición del borrador. Caso: Gavina.
- **Circuito de provincia** (lo relató postventa):
  1. Confirmar el pago con Finanzas (ha habido vouchers falsos).
  2. Prueba en el almacén.
  3. Plano de preinstalación.
  4. Despacho. La garantía corre desde la guía.
  5. Puesta en marcha por videollamada.
  6. Alerta de preventivo.
- **La venta se registra por lo que dice el informe de cierre.** Caso: Sierra Travel, donde se cotizaron dos lavadoras y se vendió una.
- **Cuentas de práctica con numeración aparte (PRUEBA).** Causa: Katerine reclamó un salto en sus presupuestos provocado por pruebas internas.
- **Pendiente:** decidir el plazo de garantía y cuánto vale una aprobación de precio.

### 31-08 · Carlos (mañana y tarde) y Lesly
- **Todo lo que registra postventa pasa por Central,** que decide a quién va. Esto se matizó el 15-09 con los seguimientos.
- **Nuevo destino «Finanzas» al derivar.** Caso: un cliente pidió su factura a un comercial; eso no es gestión comercial.
- **El RUC manda:** no se registra un cliente con un RUC que ya existe.
- **Al redirigir un cliente, el comercial que lo pierde conserva su historial** hasta la fecha del corte.
- **Postventa tiene dos ejes:** tipo de atención (puesta en marcha, problema técnico, repuesto, mantenimiento) y clasificación (garantía, preventivo, correctivo, facturable).
- **Gerencia ve a cualquier comercial desde su propia cuenta**, sin entrar con la clave ajena.
- **Cuadro de visitas generado por el CRM.** Cada acompañante va con su DNI. Carlos: «llegan tres, en tu registro hay uno».

### 27-08 al 29-08 · Postventa y códigos de supervisor
- **Carlos explicó el circuito:** comercial → Central → Finanzas → postventa → almacén. Antes eran Excel personal, papel y WhatsApp.
- **Ni postventa ni almacén ven precios** (Carlos, 27-08). Se reafirmó el 21-09, el 23-09 y el 28-09.
- **La serie es el eje de la trazabilidad** (Carlos).
- **Código del supervisor para correcciones de Central.** Analogía de Carlos con la caja de Plaza Vea: nada se corrige en silencio, «si no, no vamos a poder medir». El código dura 10 minutos.
- **Lesly tiene el rol de operaciones** (Santos: «ella no es comercial»). Autoriza con código, mantiene el catálogo y no traspasa cartera.
- **Ruta de mantenimiento por tandas**, con tres filtros. «Nunca se le hizo» y «no registrado» no son lo mismo.
- **Reporte diario grabado.** Gerencia ve quién no cerró el día.
- **El cierre semanal y la proyección usan la misma fuente.** Desde el 12-09 el cierre semanal se guarda como histórico.

### 24-08 · Lunes de arranque
- **Capacitación a los comerciales.** Desde el 22-08 ya no tocan el Excel y trabajan solo en el CRM.
- **El número de cotización se asigna al confirmar.** Un borrador no gasta número.
- **Aprobación por ítem.**
- **Regla de Carlos: a un comercial no se le muestran datos de otro.**

### 14-08 al 22-08 · Primeras reuniones con gerencia
- **14-08 (demo):**
  - El cliente es de quien lo atendió.
  - Un precio bajo lista lo aprueba gerencia, y el rechazo exige nota.
  - Las cotizaciones no se modifican: se duplican con número nuevo. Caso real: un mismo número enviado con dos precios.
  - Cada comercial ve solo lo suyo.
  - Las metas entran al CRM.
  - La migración histórica se adelanta.
- **17-08:** la ficha técnica tiene formato fijo. Los comerciales se nombran por código («Comercial Cx»).
- **18-08:** postventa es «la línea siguiente y la fortaleza competitiva». El filtro SUNAT es obligatorio. El interés se califica en 5 niveles.
- **19-08:**
  - Nuevos resultados de gestión en lenguaje del comercial (No contestó, Pidió cotización, Compra a futuro…).
  - Antes de derivar se busca a quién pertenece el cliente.
  - Brenda pasó de C8 a C1.
- **20-08:**
  - Reporte diario en PDF («vital»).
  - La meta son seguimientos efectivos, no llamadas sin respuesta.
  - Estadísticas separadas Efameinsa y Open.
  - Los comerciales se nombran por código porque las carteras se traspasan.
  - La numeración reinicia cada enero.
- **21-08:**
  - Se importaron las oportunidades vivas de los Excel, porque Carlos, probando como «comercial nuevo», no encontraba las suyas.
  - Informe de cierre en el CRM, con fecha por calendario o «por confirmar».
  - Un RUC equivocado es peor que ninguno: los cambios de RUC esperan la confirmación de Carlos.
- **22-08:** última entrega de Excel de los comerciales. Primera cotización real en el CRM.

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
- **Carteras en disputa:** la tercera ficha de Caravedo, el grupo Costa del Sol / Hotelera Cusco, la ficha con RUC de Operador Nacional de Hoteles (Decameron) y otros pares en carteras distintas.
- **Unir las dos pantallas de preventivos** (Ventas de la empresa y campaña): se retoma en otra reunión.
- **Ventana de validez de una aprobación de precio** (propuesta desde el 01-09).
- **Reseñas de Google por parte del personal:** en revisión. Google prohíbe reseñas de empleados con incentivo; se recomendó premiar que el personal pida reseñas a clientes. Consulte a gerencia antes de dejar o pedir reseñas.

**Depende de Santos (CRM)**
- El código de producto debe mostrar su descripción («punto uno» de almacén). Depende de los datos del catálogo.
- El camión que esperó por una apertura: falta aclarar si fue el CRM o el registro.
- Error de pantalla que frena corregir una cotización con precio bajo lista ya aprobado.
- Reporte de postventa por rango de fechas, rangos vacíos de numeración y casilla «informe enviado» con correo automático (esta última espera las cuentas de correo de Juan Carlos).
- Aviso «misma persona por otra puerta»: construido, sin confirmar que esté en uso.
- Recordatorios automáticos de compromisos («te quedan 2 días»).

**Depende de otras áreas**
- **Lesly:** lista de stock y sin stock, códigos propios que faltan (por ejemplo FX180 y UY240), y pedidos y cierres en físico con fotos para regularizar.
- **Ariana:** depuración de «sin stock»; fotos de Herrera.
- **Central:** generar el pedido de Vidawasi (OPEN 058) y pulsar «Pedir al almacén»; coordinar con Ariana si se rehace el cierre del servicio de AGROCASAGRANDE (anulado el 14-10).
- **Jhon (Finanzas):** visto bueno tardío de COFACO; 58 pedidos por regularizar.
- **Postventa:** cargar los cierres Word reservados (OPEN 030-036 y 038-040, de Rubí); Rubí envía las etapas que propone para su bandeja.
- **Fichas por unir:** AGROCASAGRANDE (3), Cristo Vive (4), Grupo Santa Elena, Lavipronto y Malvich.

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
- **PV2 Gabriela Palacios.**
- **PV3 Ariana Flores.**

**Almacén**
- **ALM:** cuenta del almacén (Jeysson recibe sus avisos).
- **ALM2:** Ariana Flores (desde 06-10).

**Técnicos**
- Lista mantenida por operaciones en el Directorio; por ejemplo, Danny Solís (puestas en marcha).

**Otros nombres que aparecen en registros antiguos**
- **Hever:** postventa en agosto y septiembre.
