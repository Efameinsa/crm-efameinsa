# Backlog consolidado — reunión del 31-08-2026 con el ing. Carlos

Todo lo que quedó pedido en una sola lista, para no perseguirlo por tres
audios, dos correos y un WhatsApp.

**Fuentes:** transcripción `31-08-2026 08.43` (macro), transcripción
`31-08-2026 09.09` (detalle pantalla por pantalla y postventa), la nota de
WhatsApp con el flujo de postventa, los dos correos de visita
(`ejemplo_correo`, `ejemplo_correo2`), el pantallazo `agendar` y la nota
`inge-lunes` sobre aprobaciones.

Regla de trabajo que él mismo recordó en la reunión y que ordena todo lo de
abajo: *«usted me dice cuál es la necesidad, lo que usted quisiera ver,
calcular; yo a partir de eso planteo una funcionalidad o una vista. Usted no
tiene por qué decirme yo quiero una vista así»*. Lo que sigue son
necesidades, no maquetas.

---

## A · Aprobaciones — lo último que llegó (WhatsApp, 31-08 10:42)

**A1. El historial de la gestión, desplegable, dentro de la tarjeta de
aprobación.** Textual: *«es indispensable que me permita verificar el detalle
de esta gestión del cliente… para entender el perfil por el cual se le
pretende ofertar un precio muy por debajo de lo establecido»*.

El caso que mandó: COINREFRI, LG TITAN MAX CWT29MDCRS, referencia USD 3.999
contra USD 3.347,46 pedidos — **−16,3 %, se ceden USD 652**. Hoy la pantalla
le muestra el número y el PDF, pero no el cliente: aprueba a ciegas.

**Ya está construido lo que hace falta.** `CompendioGestion`
(`src/components/crm/compendio-gestion.tsx`) es exactamente esto —«cómo se
hizo la venta», seis líneas: la primera gestión, las visitas y reuniones, y
las tres últimas—, y `cargarCompendio(oportunidadId)`
(`src/lib/compendio-cierre.ts:137`) ya recibe una oportunidad suelta. En
`gerencia/aprobaciones/page.tsx` la consulta trae la cotización pero no el
`oportunidad_id`; con eso y un `<details>` queda. **Es reutilizar, no
construir.**

---

## B · Bugs cortos — lo que él va a volver a mirar

**B1. En la agenda no se puede agregar nada.** Reportado por Hever de
postventa: quiso poner una tarea para hoy y no encontró dónde. Confirmado en
`agenda-mensual.tsx:670-680`: el único control es un «+ Agregar» dentro de la
casilla del día, con `opacity-0` y visible **solo al pasar el mouse por esa
casilla exacta**. No hay ningún botón visible en la cabecera. Y la pantalla que
él llama «Calendario» (`/postventa/agenda`) no deja crear nada en absoluto.
*Sin confirmar:* que además «lo registra en una fecha pasada» — en el código la
tarea se guarda con la fecha de la casilla. Sospecha: al no encontrar el
botón, entró por el chip «Vencidas (130)» y reprogramó una gestión vieja. Hay
que verlo con él.

**B2. «Stock S/D» y «sin stock» conviven en la cotización.** Averiguar la
diferencia y unificar; él no supo qué significaba S/D y lo anotó como tarea.

**B3. El PDF de cierre se desmaquetó.** *«Se desmaquetó la letra de los
cierres»*. Alinear.

**B4. El cierre no se puede mirar.** Desde «Mis cierres» el comercial entra y
le sale el cierre, pero no lo que adjuntó. Debe **ver todo en modo lectura** y
no poder modificar; para corregir, solicitar autorización al administrador
operativo (Lesly), que es quien la da. Caso real que él describió: se olvidó de
adjuntar el voucher o la orden de compra.

**B5. Cierres borrados.** Verificar quién los elimina y cómo se contabilizan —
vio «uno y dos» y no le cuadró.

**B6. Las gestiones no cuadran entre dos pantallas.** El mismo comercial, el
mismo día 29: la agenda diaria marca **14** y el cierre semanal **19**. Hay que
definir la regla —¿son solo llamadas efectivas, o suma el envío de
cotizaciones?— y que las dos pantallas den el mismo número. Su lectura:
*«gestiones entendería que acumula el todo»*. Dos totales distintos para el
mismo dato son peores que no mostrarlos.

**Numeración: verificada y correcta.** La revisó en vivo con las cuentas de
Katerine y Brenda y quedó conforme. Lo que sí pidió: que los **borradores sin
numerar los elimine el propio comercial** («toda la comercialidad debería
eliminarlo»).

---

## C · Cierre semanal y reporte diario del comercial

Su queja de fondo, mirando una cuenta real: abrió el 31 y estaba vacío.
*«¿Para qué te estamos dando la herramienta? Todo lo tienes acumulado acá, no
tiene sentido, ¿dónde están tus demás días?»*. Va a reunirse con los
comerciales a exigirlo, así que la pantalla tiene que sostener la conversación.

- **C1. La proyección de la próxima semana**, que hoy no aparece.
- **C2. Tres números, no dos.** Hoy están «proyectado» y «vendido». Faltan la
  **meta mínima semanal** para alcanzar la mensual (~35) y el **acumulado
  mensual**: *«cada semana cómo te vas acercando a tu meta»*.
- **C3. Las gestiones por día, en rojo o verde** contra la meta.
- **C4. Lo pendiente pasa a la semana siguiente** — hoy los potenciales se
  quedan en la semana que cerró.
- **C5. El calendario de la semana que viene**, dentro del cierre: *«¿para qué
  vas a venir el día lunes?»*. Con las **visitas presenciales y las
  videollamadas en colores distintos**, que son las dos que consumen
  instalaciones y tiempo.
- **C6. Lo mismo en el reporte diario:** si hoy es lunes, mostrar de martes a
  sábado, corriendo día a día como cualquier calendario.

---

## D · Gerencia

**D1. Auditar sin usar la cuenta ajena.** Hoy, para ver el detalle de un
comercial, entra con el usuario y la contraseña de esa persona — y eso ensucia
la medición de uso de la herramienta: *«no vamos a poder medirlo… está
tomándolo como que está navegando, en realidad no está, soy yo»*. Necesita que
**desde su cuenta de gerencia pueda seleccionar cualquier comercial y ver sus
vistas completas**, sin que cuente como actividad de esa persona.

---

## E · Central

**E1. Filtros en el listado de cotizaciones:** día, semana, mes y año. Central
ya puede verlas; lo que no puede es filtrarlas.

---

## F · Cierre y ficha del cliente

**F1. Los campos del expediente, etiquetados uno por uno** y marcados como
indispensables: cierre, cotización, voucher de transferencia, orden de compra,
orden de servicio. Hoy se pueden adjuntar archivos, pero nada dice cuál es
cuál.

**F2. La ficha del cliente y la factura.** La edición existe («Mis
oportunidades → corregir datos del cliente») y él la encontró. Lo que falta es
definir **cuáles de esos datos entran a la factura**, y que el cierre y el
informe los tomen automáticos: *«la idea es que no sea todo manual»*.

---

## G · Postventa — el grueso, y lo que cierra la primera etapa

Su nota de WhatsApp fijó el modelo, y calza con lo que dictó en el audio. Son
**dos ejes que hoy el CRM tiene mezclados en uno**.

**Eje 1 — tipo de atención**, que se decide apenas Central asigna:

| Tipo | Pista |
|---|---|
| Servicio de puesta en marcha | técnica |
| Problema técnico | técnica |
| Solicitud de repuesto | comercial |
| Solicitud de mantenimiento | comercial |

**Eje 2 — clasificación** (quién paga): garantía · mantenimiento preventivo ·
mantenimiento correctivo · servicio facturable.

**Y dos pistas de etapas:**

- **Técnica** (no existe): `Solicitud → Registro → Diagnóstico → Planificación
  → Atención → Pruebas → Conformidad → Cierre CRM → Seguimiento`.
- **Comercial** (ya existe, se usa tal cual): *«aquí se aplica el proceso
  regular de clasificación y etapas de un gestor comercial»*.

### Contra lo que hay hoy

| | Hoy | Falta |
|---|---|---|
| Clasificación | enum `tipo_postventa` = garantia / repuesto / mantenimiento (0075) | son 3 y mezclan los dos ejes: hay que separarlos en 4 tipos + 4 clasificaciones |
| Etapas técnicas | ninguna: el caso corre sobre `oportunidades` con etapas **comerciales** | las 9 etapas de la pista técnica |
| Cierre de la atención | no existe | *«tiene que haber un cierre, un estatus; es lo que falta»* |
| Cierre semanal del área | solo el bloque de ventas | el bloque de atención |

### El circuito que dictó, entero

Central deriva → postventa verifica **garantía** (24 o 36 meses según acuerdo
comercial) → condicional **¿hizo mantenimiento preventivo?** → se deriva la
llamada al técnico; si nunca lo hizo, se le recomienda → **postventa da la
orden con un clic y almacén recibe la alerta** con hora programada → almacén ve
la **ficha total y el histórico** (puesta en marcha, informes de incidencias
previas) → asigna técnico → sube su **informe con fotos** → indica los
**repuestos por vender** → eso vuelve a postventa como «hay algo por vender» →
cotiza preventivo + repuesto y sigue el ciclo comercial normal.

**G5. El cierre semanal de postventa, en dos bloques:**

1. **Atención** — cuántos problemas se recibieron, cuántos atendidos, cuántos
   en proceso, cuántos cerrados.
2. **Ventas** — repuestos y montos. Este ya está mapeado.

**G6. Crear la atención desde el calendario** (ver B1): hoy el calendario del
área es solo lectura, y es donde el área espera agendar.

### G7 · TODO PASA POR CENTRAL, SIEMPRE (reunión con Lesly, 31-08 11:45)

Esto corrige el modelo, no lo agrega. Textual: *«cualquier caso que venga, que
reciba postventa, tiene que ser derivado a Central. Lo que él va a registrar
tiene que llegar a la Central para que la Central también le vuelva a enviar,
si le corresponde atender la posventa o le corresponde atender a las
comerciales»*.

Hoy el formulario deja que **postventa se autogestione el caso** sin pasar por
Central, y sobre eso la reacción fue *«mal asunto… voy a arreglar este
formulario»*. La razón de fondo: **no es postventa quien decide si el caso es
suyo o de un comercial** — eso lo decide Central, que es la que reparte. Un
caso que postventa se queda directamente se saltea el reparto y desaparece de
la contabilidad de Central.

Consecuencia para el diseño: `/postventa/casos/nuevo` deja de crear una
atención propia y pasa a **registrar y derivar a Central**; la atención nace
recién cuando Central la devuelve al área.

**Lo que sí está bien y no se toca:** la vista de programar —día, hora y qué
técnico— *«me parece que está bien, pero más orientado a su información de él
como gestión, porque lo va a poner en el calendario»*. Es además la que después
alimenta la orden al almacén: *«le estás mandando una orden que vamos a derivar
al técnico tal, en tal hora»*.

**G8 · Y le falta el registro de llamada del comercial.** *«Lo que deberíamos
agregarle es esa opción que tienen las comerciales para su registro de llamada,
que de lo que ellas registran le envían a la Central»*. O sea: el
`RegistroRapido` que ya usa el comercial, en postventa, con el envío a Central.
Es reutilizar un componente que existe, no construir otro.

### G9 · Dos personas en postventa a la vez (reunión con Lesly, 31-08 11:47)

Hoy el área es una sola cuenta. Quieren que un asistente (Daisy) registre en
paralelo mientras el titular atiende: *«él tiene que avanzar pero como no tiene
apoyo se está demorando en registrar»*.

**Decisión tomada en la reunión: usuario nuevo, NO compartir el mismo** —
*«sería otro usuario para que no se pisen entre ellos»*— pero **viendo y
tocando la misma información**, y sabiendo quién hizo qué: *«lo que hace ese
usuario se modifica, lo vamos a poder ver»*.

⚠️ **Esto hoy no funciona, y no es un permiso: es una consulta.** Tres pantallas
del área filtran el trabajo por `comercial_id = perfil.id`
(`postventa/agenda/page.tsx:107`, `postventa/casos/page.tsx:99`,
`postventa/page.tsx:90`), así que la segunda cuenta abriría el área **vacía**:
no vería ni un caso del titular. Postventa no es una cartera personal como la de
un comercial — es un **área**, y sus pantallas tienen que mostrar el trabajo del
área con la marca de quién lo hizo, no «lo mío». La tabla `atenciones` (0131) ya
está preparada así: lectura para todo el que sea postventa, y `asignado_a` para
decir de quién es cada una.

### Lo que todavía falta preguntar (quedó fuera de la reunión)

Almacén completo — **postergado por decisión de Santos el 31-08**: *«el almacén
hablamos después porque todavía falta mucho para pensar en ese módulo»*. Cuando
se retome: ¿quién asigna el técnico, postventa o almacén? ¿Qué campos lleva el
informe del técnico? ¿Cómo se declara la conformidad?

---

## H · El cuadro de visitas

Hoy se redacta a mano en un correo. Debe generarlo el CRM y solo enviarse.
**Son dos formatos distintos** y los dos tienen que salir:

**Recojo** (lo manda postventa; el ejemplo lo firma Hever Gonzales de **Open
Investments S.A.C.**, a postventa1, Central y logística, con copia a gerencia):
fecha · hora · **persona de recojo** (nombre completo, DNI, celular) ·
**transporte** (empresa, RUC, placa, marca de vehículo, licencia de conducir) ·
cliente con RUC · observación.

**Showroom / prospecto** (lo manda Central; el ejemplo lo firma Katerine Tello
de **EFAMEINSA**, a logística, almacén y el comercial, con copia a Carlos):
fecha · hora · prospecto (DNI y nombre) · **Nº de cotización** · observación. Y
al pie, resaltados, los **preparativos**: «Prender TV», «Abrir lavandería».

**Lo que hay que agregarles:**

- **H1.** Acompañantes, **cada uno con su DNI**. No está en ninguno de los dos
  correos y es justo lo que le duele: *«llegan tres personas, pero en tu
  registro solamente hay una… con uno vamos a poder pelear, con seis, siete
  no»*. El vigilante no puede dejar entrar a quien no está en la lista.
- **H2.** El Nº de cotización enlazado a la cotización real (en el correo va a
  mano e incompleto: «Nº -502-26»).
- **H3.** Los preparativos del showroom como checklist, no como texto suelto.
- **H4.** La visita en el **calendario del comercial**, en color según sea
  presencial o videollamada — antes de cada visita se sientan a discutir la
  estrategia del prospecto, así que tiene que verse venir.
- **A confirmar:** un correo sale de Open Investments y el otro de EFAMEINSA.
  ¿El CRM emite con una u otra firma según quién lo genere?

---

## I · Infraestructura

**I1. Trabajar sin internet.** Ya hubo varias caídas este año. Que se pueda
seguir gestionando en **red local**. El problema abierto era la **numeración de
presupuestos**. Antes hay que averiguar cuántas redes hay en la oficina y si
están conectadas entre sí.

**I2. El archivo histórico del servidor** (planteado en `docs/21`). Decisiones
tomadas en la reunión:

- **No se sube nada de fotos ni videos.** Son la mayor parte de los ~3 TB.
- **Solo informes**, que son PDF y ya traen las fotos dentro.
- **Solo este año y el anterior.** Él estima menos de 2 GB; **hay que medirlo**.
- La alternativa que más le gustó: que el CRM **lea la ruta del servidor** y
  muestre solo lo del cliente buscado —previsualización primero, y recién al
  hacer clic se abre—, sin subir nada y sin sacar la información de la empresa:
  *«es como si el servidor fuera en la nube… y la seguridad todavía sigue
  ahí»*.

---

## J · Marketing y SEO — arranca en paralelo esta semana

Su plan es **50-50** entre CRM y marketing.

- **J1.** Enviarle el filtro de las **~50 URLs críticas con tráfico** para que
  el de la web nueva las considere. Lo pidió explícito para no quedar en *«me
  dijiste pero no me diste el detalle»*.
- **J2.** **Propuesta para mañana**: Facebook, Google y LinkedIn. Los
  comerciales piden más leads y de mejor calidad; su definición de calidad es
  que el lead pase antes por la web y el contenido: *«si viene por un anuncio
  nada más, la calidad baja»*.

---

## K · Bloqueos y pendientes de terceros

| Qué | De quién | Estado |
|---|---|---|
| Entrevista a fondo al chico de postventa | **hoy** — su periodo de prueba termina el 31-08 | urgente |
| Reunión de postventa | Lesly (y quizá Brenda) | **hoy 11:00–11:30** |
| Manuales de la parte comercial en digital | Lesly | los entrega hoy |
| Manual de postventa | ya subido | ✔ |
| 7 equipos sin código | Lesly | pendiente |
| Fichas de repuestos y mantenimiento | Lesly | bloquea postventa |
| 3 preguntas de pipeline | Carlos | pendiente |
| Hosting | sin respuesta — llamar por teléfono | pendiente |
| Cuenta de Claude | **urgente**, se paga con tarjeta, supervisa Lesly | hoy |
| Cuenta de ChatGPT | mañana | |

---

## Orden sugerido

1. **Hoy, antes de las 11:** nada de código — la entrevista y la reunión de
   postventa, que es lo único que caduca.
2. **Hoy, después:** A1 (aprobaciones, es reutilizar) y B1 (agendar). Son los
   dos que él va a volver a mirar primero, y los dos son cortos.
3. **Esta semana, CRM:** B2–B6, luego C completo (el cierre semanal es lo que
   sostiene su reunión con los comerciales), D1 y E1.
4. **Esta semana, marketing:** J1 hoy mismo, J2 para mañana.
5. **Diseño en paralelo:** G, que es lo que cierra la primera etapa y habilita
   el ERP. No arranca hasta tener lo de Lesly.
6. **Después:** H (visitas), I2 (medir los dos años del servidor), I1 (red
   local).
