# Bitácora del CRM Efameinsa: historia de las decisiones

Vigente al 19-10-2026. Complementa la «Base de conocimiento del CRM» (asistente-guia-del-crm.md). Esa guía dice **cómo funciona hoy** el CRM. Esta bitácora dice **cuándo se decidió cada cosa, quién la pidió, por qué y qué quedó pendiente**.

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

### 19-10 · Pagos: varios vouchers (pedido de una comercial)
- **Qué pidió:** en «Pagos» del pedido, «Avisar que el cliente canceló» solo permitía un voucher; pidió poder agregar más.
- **Qué se hizo:** los dos botones de «Consultar a Finanzas» («Avisar que el cliente canceló» y «Preguntar si hubo comisión») aceptan hasta 10 vouchers: se eligen varios a la vez o con «Agregar otro voucher», y cada uno se puede quitar antes de enviar. Finanzas los ve como «Voucher 1, 2…». Antes era: un solo voucher.

### 17-10 · Buzón: el aviso lleva al pedido, servicio sin Word y la ficha con pestañas para Central (Central, Lesly)
- **El aviso abre el pedido (Central):** desde el aviso nuevo de la campana no se podía ir directo al cliente para imprimir la factura o la liquidación que acababa de entrar. Desde el 17-10, los avisos de liquidación, factura, observación de Facturación, series listas y cierre corregido traen «Abrir el pedido», que abre Central > Cierres ya buscado por el número de pedido, con «Abrir / imprimir» de cada liquidación y factura. Los avisos que ya estaban en la campana también quedaron con el enlace.
- **Una fila de SERVICIO no pide Word (Lesly, ABACHI):** en la prueba y embalaje de un servicio (embalaje en madera), el CRM pedía subir el Word del informe aunque el informe lo genera el sistema. Desde el 17-10, si la fila del pedido es un servicio (embalaje, transporte, instalación…) y no una máquina, para «Probada y embalada» bastan las fotos y el técnico; el Word es opcional. Para las máquinas todo sigue igual (ver 13-10, COFACO).
- **Central abre la ficha con pestañas (Central):** pidió el formato de la ficha de gerencia «para hacer más rápido las búsquedas de información de cada cliente». Desde el 17-10, al abrir un cliente sale la ficha con pestañas (Resumen, Pedidos y casos, Equipos, Ventas, Historial, Correos de campaña, Documentos y sedes, Datos y contactos), solo de consulta. Cada expediente se abre con «Ver la derivación». La ficha anterior sigue en «Más acciones» → «Vista anterior de la ficha».

### 17-10 · La liquidación de Finanzas la arma el CRM (gerencia, Jhon, Santos)
- Finanzas ya no copia el pedido a una plantilla de Excel: el CRM genera la liquidación con los datos del pedido, los abonos y las facturas; Finanzas completa lo que falta (factura de cada abono, detracción o retención, letras) y la valida. Con eso Central sigue el pedido.
- Una liquidación nueva por cada pago o factura, siempre en el mismo formato.
- La comisión que descuenta el banco la cobra el comercial; postventa recibe el aviso solo para saberlo.
- Con detracción o retención la operación queda cancelada y postventa puede despachar aunque falte cobrarla.

### 17-10 · Grupo Turismo Costa del Sol: los hoteles se ven desde la empresa madre (Ariana, Santos)
- **Qué pasó:** Gabriela cotizó una garantía para Hotelera Cusco (Costa del Sol Wyndham Cusco). Ariana tomó el caso y quería verla dentro de Turismo Costa del Sol, la cadena; creía que esa empresa no estaba en el CRM. Sí estaba, pero el grupo nunca se había armado y había varias fichas sueltas con nombres parecidos.
- **Qué se decidió (Santos, 17-10):** la cotización se sigue facturando a Hotelera Cusco. Se colgaron del grupo Turismo Costa del Sol: Hotelera Cusco, Costa del Sol S A y sus sedes Chiclayo y Callao, y la sede Pucallpa. La cartera de cada ficha no cambió (quién se queda con el grupo sigue pendiente de gerencia).
- **Qué se hizo en el CRM:** la ficha de una empresa con grupo muestra también los expedientes vivos de las otras empresas, con el nombre de cada una.
- **Pendiente:** hay fichas «Turismo Costa del Sol» sin RUC que convendría unir a la que tiene RUC.

### 17-10 · Las casillas del protocolo se ven como botones (Ariana)
- **Qué pasó:** Ariana (almacén) no podía «poner checks» en la hoja de chequeo. Sí tenía permiso: las casillas ✓ y ✗ eran cuadritos blancos vacíos al lado del campo de Observaciones, y al pasar el mouse salía el cursor de escribir.
- **Qué se hizo:** las casillas vacías muestran su ✓ o ✗ tenue y se colorean al pasar el mouse; arriba de la hoja hay una línea que explica cómo marcar y que hay que «Guardar protocolo». En el papel impreso no cambia nada.
- **Después (mismo día):** Ariana completó la hoja con ✓ en «CANT.» de Programación y el CRM no la dejaba marcar «Probada y embalada» porque solo contaba las casillas de RESULTADOS; además el ✓ tenue de las casillas vacías parecía una marca. Santos decidió que **un ✓ en CANT. también cuenta**. Las casillas vacías pasaron a gris con borde punteado y las marcadas a color lleno.

### 17-10 · La ficha del cliente muestra todo y se anota sin salir de ella (Ariana, Santos)
- **Qué pasó:** Ariana (postventa) dijo que en la ficha del cliente «no veía toda la información» y que tenía que apretar «Registrar gestión» para que aparecieran más cosas. Con su propia sesión se vio por qué: la cabecera fija ocupaba media pantalla en las computadoras de la oficina, la cotización y la última gestión solo se veían dentro del expediente, y el botón la llevaba a otra pantalla sin decirlo.
- **Qué se hizo (Santos, 17-10):** la cabecera se achicó y solo las pestañas quedan fijas al bajar; «Anotar gestión» abre el formulario al costado de la ficha (reemplaza a «Registrar seguimiento»); cada expediente vivo muestra su cotización, próxima acción y última gestión; lo menos usado pasó a «Más acciones»; la pestaña Equipos permite registrar una máquina del cliente; el expediente tiene «← Ficha del cliente» y, si es de postventa, ya no muestra «Calificación».
- **Pendiente (para ver con gerencia):** un «Resumen» pensado para postventa (equipos y garantía primero) y un solo verbo para anotar en todas las pantallas.

### 17-10 · Mi cuenta del cliente en efameinsa.com y avisos por cada estado (Santos)
- **Qué pidió Santos:** que cada cliente tenga usuario y contraseña en efameinsa.com, entregados por correo y por un WhatsApp de atención al cliente; que vea desde su perfil su cotización, sus pedidos, repuestos, mantenimientos, documentos y fotos; que reciba un aviso en cada cambio de estado (embalado, salió, llegó a la agencia de su provincia, lo recibió, técnico enviado y llegó, puesta en marcha); y un chat. Objetivo: mejor experiencia del cliente y más opiniones en Google.
- **Qué se hizo:** Mi cuenta ya lee el historial del CRM; en el CRM hay botones «El técnico salió / llegó», el «Ya lo recibí» del cliente y «Mensajes de Mi cuenta» en la ficha, el pedido y el caso. El motor de avisos quedó en **piloto**: solo la lista de prueba recibe de verdad.
- **Pendiente:** el chip nuevo para el WhatsApp de atención al cliente (lo pide Santos), método de pago en Meta y aprobación de las plantillas; visto bueno de Santos a los textos; ilustraciones de los correos; ampliar la lista del piloto.

### 17-10 · Postventa: una carpeta por cliente (Ariana, Santos)
- **Qué pasó:** dos días seguidos Ariana no encontraba su trabajo. El 16-10 la cotización de ECOLAV estaba en un expediente a nombre de Rubí y no salía en su tablero; el 17-10 el kit de Choquehuanca estaba en otro expediente del mismo cliente y el pedido de Central le había abierto uno nuevo. Santos: «se abren muchos expedientes de la nada y al final no se concatenan, y luego se frustran porque no pueden hacer algo».
- **Lo que se midió:** había 385 expedientes de postventa abiertos para 277 clientes; 55 clientes tenían dos o más (ECOLAV 10, DUO Lavandería 8, NEWREST 6). En el último mes nacieron 248 y 73 lo hicieron cuando el cliente ya tenía otro abierto: la regla del 22-09 solo juntaba los del mismo tipo, y el registro propio de postventa y la ruta nunca buscaban el abierto.
- **Qué se decidió (Santos):** una carpeta de postventa por cliente; cada asunto es un caso dentro de ella con su responsable; ayudar no quita la carpeta; todas pueden trabajar todo y cada acción queda con su nombre; «Hoy cubro a…» para las ausencias; y en el reporte diario, las ayudas y el tiempo de respuesta de cada una. Se ajustó lo de esta mañana: una gestión suelta ya no le pasa el caso a quien la anota (sí lo pasan la derivación, la cotización, la confirmación y el botón «Me quedo»).
- **Qué se hizo el mismo día:** los 55 clientes quedaron con una sola carpeta (se unieron 108 expedientes; el respaldo quedó guardado). Hoy hay 277 carpetas para 277 clientes. Al verificar se corrigieron dos efectos de la unión: la próxima acción vencida que ganaba a la viva, y un aviso falso de «ya lo cerró en otra ficha suya». ECOLAV sigue con Ariana (seguimiento de la cotización el 19-10) y Choquehuanca también, como repuesto (cotizar las piezas por unidad).
- **Pendiente:** la unión de expedientes no se puede deshacer con un clic desde «Registro de acciones» para las cotizaciones (sí para lo demás); si hiciera falta, se pide a Santos con el respaldo.

### 17-10 · Pedir a Lesly, la versión nueva sin recargas sorpresa y la ficha que llega al pedido (Santos)
- **«Pedir a Lesly» (buzón del catálogo):** Santos: «crea un buzón para pedir productos o que Lesly actualice y que le llegue a Lesly, que eso no pidan en el buzón porque no tiene que ver con el CRM sino con operaciones». En el buzón del CRM llegaban pedidos de fichas técnicas, precios o stock que había que reenviarle. Desde el 17-10 hay un botón propio en la barra; Lesly los ve en «Pedidos al catálogo» y contesta («Lo estoy viendo», «Hecho» o «No procede»). Si alguien lo escribe en el buzón del CRM, el buzón le avisa y se lo pasa.
- **Versión nueva sin recargas sorpresa:** el 16-10 se había hecho que el CRM se recargara solo si la pantalla llevaba 2 minutos quieta. Santos recordó que una recarga sola ya había hecho perder trabajo y molestaba. Desde el 17-10 vuelve la regla de siempre: la pantalla en uso nunca se recarga sola; la actualización llega al pasar a otra pantalla.
- **La ficha corregida llega al pedido:** cuatro observaciones del buzón (06–16/10) eran nombres o RUC corregidos en la ficha que seguían viejos en el pedido o en la máquina. Desde el 17-10 se ponen al día solos en lo que sigue abierto.

### 16-10 (noche) · Cotizaciones: descuento al final del total y el aviso «falta confirmar» (Katerine, Ariana, Santos)
- **Descuento o paquete especial (Katerine, a pedido de gerencia):** gerencia quería poder dejar un paquete en una cifra cerrada sin tocar el precio de cada equipo. Desde el 16-10, debajo del total del cotizador está «+ Agregar descuento o paquete especial» («Descuento» o «Descuento por paquete especial», con o sin IGV). En el PDF sale debajo del SUB TOTAL. **Todo descuento pasa por gerencia** antes de confirmar.
- **Caso ECOLAV (Ariana):** Ariana armó una cotización en un expediente que estaba a nombre de Rubí; gerencia la aprobó y Ariana no la encontraba, aunque Rubí sí la veía. El aviso de aprobación solo le llegaba a la dueña del expediente y, al buscar al cliente, la lista escondía «Lo que pasó por gerencia».
- **Regla de Santos (16-10):** «todos deberían poder ver todo… no hay que estar supeditado a alguien en específico… pero la acción que cometa alguien debe quedar registrada con su nombre para rastrear».
- **Qué se hizo:** el aviso «gerencia aprobó» le llega a quien armó la cotización y también al dueño; dice «falta confirmarla» y lleva directo al botón Confirmar. El borrador aprobado dice «aprobada · falta confirmar», y cada cotización muestra quién la hizo y quién la confirmó.

### 16-10 (tarde) · Buzón: postventa, almacén y comerciales
- **Contactos en casos de otra compañera (Ariana, COR-PORACION 3C):** no podía guardar el contacto porque el caso estaba a nombre de Rubí. Desde el 16-10, cualquiera de postventa agrega y corrige contactos en los clientes con caso de postventa, a nombre de quien sea (igual que ya pasaba al cotizar). Es la misma regla: el caso es del área.
- **«SERVICIO E INSTALACIÓN DE:» (Rubí):** nueva opción en «¿Qué se va a hacer?» de la apertura, para cuando el técnico hace el servicio y la instalación que se vendió.
- **Puesta en marcha de dos equipos (Ariana, Beneficencia de Huancayo):** el informe solo dejaba registrar un equipo. Ahora sale primero «Los 2 equipos, cada uno con su ficha»: se llena una vez y se guarda un informe por serie, cada uno con sus ciclos.
- **«No corresponde» bien usado (Central, ABACHI):** el «servicio de transporte hacia la agencia» es un servicio, no una máquina, así que fue correcto quitarlo de la lista de equipos. El rodillo va por su propio pedido. La única fila que queda en un pedido no se puede quitar.
- **Cliente rechazado que vuelve a escribir (Moisés, SUITE GENERIS):** se rechazó el 15-10; cuando el cliente escribió de nuevo el 16-10, el CRM abrió un expediente nuevo y el cliente salía dos veces. Se unieron en uno solo, «Cotizada». **Desde el 16-10**, si el cliente que el mismo comercial rechazó en los últimos 30 días vuelve, se reabre su expediente; y si se envía una cotización desde un expediente rechazado, pasa a «Cotizada». Antes solo se juntaba con expedientes abiertos.
- **Las liquidaciones anteriores no se borran (Central):** la consulta fue que la liquidación anterior «se borró». No: cada liquidación queda guardada; solo se veía el enlace a la última. Ahora se ven todas, numeradas en orden y con «Vigente» o «Anterior».
- **Pendiente (por confirmar con Santos):** en los últimos 30 días hubo unos 25 casos de expediente nuevo junto a uno rechazado del mismo comercial y cliente; no se tocaron y se unen si alguien lo pide.

### 16-10 (17:57) · Reunión de gerencia con Ariana y Santos: la agenda y el reporte de postventa
- **Agenda de postventa:** todas ven el panorama completo del área (el «macro»), pero tiene que quedar a la vista **quién está gestionando qué**. Si Rubí ayuda en algo que tiene Ariana, se ve y queda registrada su acción. Las gestiones de cada una son las suyas; lo derivado a cada una, lo suyo.
- **Central deriva a cada persona de postventa** (PV1, PV2, PV3). Lo que no está derivado a nadie es del área. El reparto lo decide gerencia según cuánto avanza cada una («si eres rápida, te voy a dar más»).
- **El reporte de postventa tiene que contestar:** problemas técnicos abiertos y cerrados, cotizaciones, y repuestos pedidos con su estado (abiertos y cerrados, «simple, como manzanita»; el detalle, al entrar). Caso visto: Hotelera Turística Amazonas, que Ariana atendió y cerró (el cliente lo arregló con un técnico particular), no salía como problema técnico.
- **Procedimiento de repuestos:** requerimiento → stock y foto del almacén → cotizar (abierto); cerrado si se vende o si no corresponde (ya se le cotizó al mismo cliente).
- **Lino Espíritu:** Ariana tiene que hacer el seguimiento al técnico hasta el final; puede salir una venta adicional.
- **Vidawasi:** a Ariana solo le tocaba enviar el Word del cierre; la llamada del reporte era el lead derivado y lo atendió Rubí.
- **Hecho el mismo día:** hojas «Problemas técnicos y su estado» (con los casos «Otro» y los que tomó cada una) y «Solicitudes de repuesto · abiertas y cerradas» en el reporte diario de postventa.
- **Pendiente:** que la agenda muestre quién gestiona cada cosa; Santos lo evalúa el 17-10 y lo muestra a primera hora para recoger opiniones.

### 16-10 · El reporte diario ya no confunde los leads con gestiones, y suma los problemas técnicos (Ariana, Santos)
- **Qué pasó:** en el reporte de Ariana aparecía Vidawasi con «Llamada», y ella no había hecho ninguna gestión. Era un lead que Central le derivó (el cliente llamó para reclamar su repuesto); lo atendió y lo cerró Rubí, que ya llevaba ese repuesto. Vidawasi además tiene dos fichas con el mismo nombre.
- **Qué se hizo:** la sección «Leads recibidos de Central» dice ahora «Entró por» (cómo llegó el cliente) y «En qué quedó» (sin gestión, gestionado por usted, o quién lo atendió y cerró). Y el reporte de postventa trae una hoja nueva, «Problemas técnicos y su estado», con los casos técnicos de cada una, el paso, lo que falta y a quién le toca.
- **Pendiente:** unir las dos fichas de Vidawasi (por confirmar con Santos).

### 16-10 · El reporte diario de postventa: cada una solo lo suyo (Ariana, Rubí, Gabriela)
- **Qué dijeron:** en su reporte diario «salen las gestiones de todos»; a Ariana solo le debe aparecer lo de Ariana, a Rubí lo de Rubí y a Gabriela lo de Gabriela.
- **Qué se encontró:** las gestiones, presupuestos y pendientes ya eran de cada una, pero la hoja «Pedidos abiertos, paso por paso» traía todos los pedidos del área (unas 25 hojas iguales en los tres reportes).
- **Qué se hizo:** esa hoja ahora trae solo los pedidos en los que la persona firmó algún paso o gestionó al cliente en los últimos 90 días. La lista completa del área queda en la agenda y en Control.

### 16-10 · La consulta del pago a Finanzas ya no va por correo (Katerine)
- **Qué contó Katerine:** el comercial le pregunta a Contabilidad si el abono tuvo comisión interplaza y, al final, le avisa que el cliente ya canceló, las dos cosas por correo y con el voucher. Gerencia indicó que ahora se hace por el CRM. El comercial no termina la operación hasta que el cliente termina de pagar (antes lo veía postventa).
- **Qué se hizo:** en «Pagos» del pedido, el comercial adjunta el voucher y elige «Preguntar si hubo comisión» o «Avisar que el cliente canceló». Finanzas contesta en el mismo pedido (si hubo comisión, con el monto y el pantallazo del banco para el cliente) y la respuesta le llega al comercial a la campana.

### 16-10 · Almacén: el pedido de repuestos se protocoliza como kit completo (Ariana)
- **Qué pidió Ariana (buzón, «es con urgencia»):** que en el pedido de repuestos de LINO ESPIRITU (kit de instalación a gas de una secadora: 14 piezas entre válvulas, manómetro, manguera, niples, bush, codo y tee) el protocolo salga como **kit completo** y no con foto detallada de cada repuesto.
- **Qué se hizo:** en todo pedido de repuestos con más de una pieza, el almacén sube una sola vez las fotos del kit armado, el técnico y la fecha, y marca **«Kit completo probado y embalado»**. El informe sale en una sola hoja con la lista de piezas, códigos y cantidades, y todas las fotos juntas. Las fotos que ya se habían subido pieza por pieza siguen valiendo. La regla vive en el sistema, así que también vale si se entra por la copia de respaldo.

### 16-10 · Los procesos de postventa, dibujados y a la vista de todos (Santos)
- **Qué pidió Santos:** que los 12 procesos de postventa dibujados paso a paso se vean libremente desde el CRM, que Efamein los ofrezca entre sus consultas predeterminadas y que cada uno se abra en pestaña nueva con un botón de pantalla completa bien visible, «para motivar a que todos recuerden los procesos».
- **Qué se hizo:** menú **Procesos** para todo el personal, con una tarjeta por proceso; cada diagrama muestra un carril por área, las preguntas que deciden el camino y en ámbar lo que frena, con botones «Todos los procesos» y «Pantalla completa». La primera sugerencia de Efamein en todas las áreas es «¿Quiere repasar los procesos de la empresa?». Los diagramas se dibujan con el mismo estilo que el mapa de sistemas (Santos pidió no cambiarlo).

### 16-10 · Buzón: otros dos casos resueltos (Central, Moisés)
- **Devolver un prospecto a la bandeja cuando el comercial ya lo gestionó** (Central, PRO-11084). Se había derivado a C5 y Katerine confirmó por teléfono que era cliente de la cartera de C4. Volvió a la bandeja de Central como recién llegado; sus llamadas y el contacto nuevo pasaron a la ficha del cliente de C4 (nada se pierde), se quitó la ficha que se había creado en C5 y a Katerine le llegó el aviso de que la derivación se retiró. Al derivarlo de nuevo, el CRM muestra la coincidencia con la cartera de C4. Si el expediente ya tiene gestiones, el botón «Devolver a la bandeja» manda primero a «Mover las gestiones».
- **«No descarga la cotización»** (Moisés). El CRM entregaba bien el PDF; fallaba el guardado del visor de Chrome. Ahora «Descargar el PDF para el cliente» baja el archivo directo, con su nombre listo para adjuntar; para mirarlo antes está «Verlo antes en una pestaña aparte». Si vuelve a fallar: recargar (F5) y probar de nuevo.

### 15-10 (noche) y 16-10 · Postventa: un cliente con siete expedientes abiertos (Choquehuanca)
- **Qué pasó:** postventa no veía la queja del 13-10 por el listado del kit de Choquehuanca. La ficha era una sola, pero el cliente tenía 7 expedientes de postventa: 6 de garantía de septiembre (uno por cada mensaje: embalaje, factura, despacho, agencia, guía), nacidos antes de la regla de un expediente por cliente del 22-09, y el del 13-10, que quedó vacío porque la gestión y la cotización se registraron en uno de septiembre.
- **Qué se hizo (Santos, 15-10):** se juntó todo en el expediente del 16-09, los otros 6 quedaron archivados con una nota, y los casos de septiembre se cerraron como «derivado». Sigue abierto el caso del kit.
- **16-10, Ariana «no aparece»:** la nota de la unión hizo que el caso del kit figurara tomado por el administrador y salió de la bandeja «por tomar». Se devolvió a Ariana, que fue quien lo atendió.
- **Pendiente (Carlos):** una lista de 56 clientes con expedientes de postventa repetidos (166 expedientes): unos se pueden unir y archivar; en otros hay que revisar el tipo, porque la regla no junta expedientes de tipo distinto y aquí el tipo estaba mal puesto.

### 16-10 · Lo que más se reporta por el buzón, convertido en botones (Santos)
- **Análisis:** 149 observaciones del 06 al 16-10. 41 se resolvieron tocando la base a mano; en 60 respuestas se pidió recargar la página. Lo más repetido: fichas duplicadas o de otra cartera (13), equipos y series de pedidos que venían del Excel (10), gestiones o derivaciones en el lugar equivocado (7).
- **Qué se hizo:** «Devolver a la bandeja» para Central; «Mover las gestiones a otro expediente»; gerencia puede unir fichas que tienen RUC las dos; el CRM se actualiza solo cuando no hay nada que perder; unos 100 botones y avisos de postventa, Central, cierres y almacén ahora dicen qué falta.
- **Pendiente:** corregir equipos y series de pedidos heredados del Excel (partir un renglón, quitar una serie ajena) desde una pantalla de operaciones; corregir datos del cliente y arrastrarlos a pedidos e informes; pedir rubros o productos del catálogo directo a Lesly.

### 16-10 · Registro de acciones, «Deshacer este clic», unir fichas desde el aviso y fichas sueltas (Santos)
- **Por qué:** ese mismo día hubo que deshacer a mano en la base un clic de postventa (garantía verificada con la máquina de otra ficha). Santos: «los usuarios cometen errores… el administrador pueda deshacerlo… el CRM tiene que funcionar solo, sin necesitar de la IA».
- **Qué se hizo:** (1) «Registro de acciones» para administración, gerencia y operaciones: cada clic de cada persona, con lo que cambió, y el botón «Deshacer este clic» (pide motivo, avisa a quien lo hizo y explica cuándo no se puede). (2) En el aviso de la serie que está en otra ficha, el botón «Revisar y unir las dos fichas», con el código de operaciones. (3) «Fichas sueltas»: archivar fichas sin movimiento; vuelven solas si les entra trabajo.
- **Regla de pantalla que se fija:** todo lo que el CRM no deja hacer debe decir por qué y qué hacer, a la vista y no en un aviso que desaparece.

### 16-10 · Cierre: más de una persona puede recibir el despacho
- **Qué se pidió:** en «Quién recibe» del cierre solo cabía una persona; se pidió poder agregar más.
- **Qué se hizo:** botón «+ Agregar otra persona que puede recibir» (nombre, DNI/CE y teléfono). Salen como «También recibe» en el cierre, el PDF y la hoja del pedido, y quedan como contactos del cliente.

### 16-10 · Postventa: la serie que ya está en otra ficha frena y explica (Ariana)
- **Caso:** un problema técnico de un hotel derivado por Central. La ficha del caso (sin RUC, con el nombre mal escrito) no tenía máquinas; la lavadora estaba en la otra ficha del mismo cliente, con RUC. Al escribir la serie, el CRM usó en silencio la máquina de la otra ficha y el caso quedó «fuera de garantía» sin explicar por qué. Se deshizo ese clic y se unieron las fichas.
- **Qué se hizo (pedido de Santos: «que le aparezca un aviso… para que sepa y no se frustre»):** ahora el CRM no deja seguir y dice en qué ficha está la serie y qué hacer: avisar por el buzón para unir las fichas y después elegir la máquina con «Es esta».

### 16-10 · Visitas a planta: los acompañantes se editan después de anunciar (Katerine)
- **Qué se pidió:** Katerine tenía una visita a las 12:00 y el cliente avisó a última hora que venía con dos personas más. Solo se podía cambiar la fecha o la hora, no los acompañantes.
- **Qué se hizo:** en «Visitas a planta» cada visita tiene «Acompañantes», debajo de «Cambiar fecha u hora». Se suman, corrigen o quitan con nombre y DNI o C.E. Lo hace quien registró la visita, o Central, mientras el cliente no haya llegado. Central recibe el aviso y el correo de visitas sale con los nombres. Si vigilancia ya tenía la hoja, el check «Vigilancia avisada» se apaga para que Central la vuelva a imprimir.

### 16-10 · Crece: el tope de puntos por gestión comercial sube a 2.500 al mes (Santos)
- **Qué se pidió:** Katerine preguntó por qué desde el 15-10 sus actividades salían con +0. Había llegado al tope de 1.000 puntos del mes. Moisés y Brenda ya habían llegado el 13-10. Santos ordenó subir el tope a 2.500 para todos.
- **Qué se hizo:** los puntos que el CRM envía a Crece (gestiones, cotizaciones, cierres y leads) tienen un tope de **2.500 al mes por persona**. Antes era 1.000. Cada actividad vale lo mismo que antes: llamada, WhatsApp o correo 1; reunión virtual 3; filtro 2; showroom 5; visita 6; cotización 3, o 6 si es de monto alto; cierre 25, 40 o 60 según el monto; lead respondido 8 en menos de 5 minutos, 5 en 10, 2 en 30 y 1 si pasa de eso. Desde el cambio vuelven a sumar. Las actividades que salieron con +0 antes del cambio no se recalcularon. Las sugerencias siguen sin límite. El tope se reinicia el 1 de cada mes.

### 16-10 · Buzón: accesorios en la generación de código (Lesly)
- **Qué se pidió:** Lesly pidió que, en la generación de código, Central tenga la regla de indicar si los equipos incluyen algún accesorio, sobre todo los industriales como las lavadoras (caso: pedido de PRODECO DEL SUR con calandria, lavadora y secadora industriales).
- **Qué se hizo:** al pedir las series al almacén, Central responde «¿Los equipos incluyen accesorios?» (no incluye / sí incluye y cuáles, con qué máquina). Sin responder no se pide el código. El almacén lo ve en el pedido, en la hoja de la solicitud y en el aviso; Central puede corregirlo después.

### 16-10 · Buzón: lo que se hizo a cada máquina de un caso (Rubí)
- **Qué se pidió:** Rubí pidió que, cuando un caso tiene más de un equipo, «Qué se hizo en el cliente», «Repuestos usados» y «Ciclos» se puedan registrar por cada equipo (antes había un solo juego de campos y las otras máquinas quedaban sin nada escrito ni lectura del contador).
- **Qué se hizo:** el paso muestra un recuadro por máquina del caso, con su serie y tipo. Los ciclos de cada una van a su propia ficha y el registro de la etapa muestra lo de cada máquina.

### 16-10 · Buzón: orden de compra u orden de servicio en la apertura (Rubí)
- **Qué se pidió:** Rubí pidió que, después de «Servicio a realizar», la apertura tenga para elegir ORDEN DE COMPRA u ORDEN DE SERVICIO (caso: apertura de la secadora de Hortifrut).
- **Qué se hizo:** la apertura tiene ahora una fila 2 con la orden del cliente: de compra, de servicio o «el cliente no emitió orden», con su número. Se elige en «Datos que se coordinan». Si no se elige y el cierre trae orden de compra, sale esa. Las demás filas corrieron un número.

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
- Resumen: Open Investments es la primera opción de facturación (Efameinsa solo si el cliente antiguo insiste); cartera: 3 meses sin venta (antes 6) y redistribución cada 3 meses; Finanzas con cuenta propia; preventivo cada 4 meses con alerta a los 3 (antes 6); postventa ve la OC y el voucher sin montos; C4 vende solo lavadoras y nace «Seguimiento» en la cartera; la cotización corregida dice «v2»; acceso solo desde la oficina; aprobaciones firmadas «Gerencia Comercial»; cierre en bloque de oportunidades viejas del Excel; nace la apertura de llamada en el CRM (postventa → almacén → versión para el cliente); ficha con «Pendiente con este cliente»; botones «Es un caso» y «Lo atiende mi compañera»; mismo cliente con otra razón social = ficha aparte colgada como grupo (Crisolito); OPEN 028 y 029 fueron pruebas anuladas y el primer cierre real fue el 030.

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
- **Carteras en disputa:** la tercera ficha de Caravedo, el grupo Costa del Sol / Hotelera Cusco, la ficha con RUC de Operador Nacional de Hoteles (Decameron) y otros pares en carteras distintas.
- **Expedientes de postventa repetidos:** lista de 56 clientes (16-10) para decidir cuáles se unen y cuáles tienen el tipo mal puesto.
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
- Expedientes nuevos que quedaron junto a uno rechazado del mismo comercial y cliente (unos 25 en 30 días, visto el 16-10): se unen cuando alguien lo pida, como SUITE GENERIS.

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
- **PV2 Brenda Taboada** (desde el 19-10, además de su C1); lo anterior de PV2 figura como PV2-GP.
- **PV3 Ariana Flores.**

**Almacén**
- **ALM:** cuenta del almacén (Jeysson recibe sus avisos).
- **ALM2:** Ariana Flores (desde 06-10).

**Técnicos**
- Lista mantenida por operaciones en el Directorio; por ejemplo, Danny Solís (puestas en marcha).

**Otros nombres que aparecen en registros antiguos**
- **Hever:** postventa en agosto y septiembre.
