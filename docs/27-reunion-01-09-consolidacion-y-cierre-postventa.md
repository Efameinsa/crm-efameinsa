# Plan 27 · Reunión del 01-09 con el ing. Carlos: consolidar expedientes y el cierre de postventa

**Fuente:** dos grabaciones de la reunión del 01-09 (transcripciones en Descargas,
`01-09-2026 09.29.txt` y `01-09-2026 09.59.txt`), más las observaciones del PDF
«MEJORAS EN EL CRM 31.08.26» ya diagnosticadas. Relevado por Santos.

**Regla de esta tanda: NADA se despliega hasta que Santos lo diga.**
Se trabaja en local y se muestra desde ahí.

---

## A · Consolidar los expedientes gemelos — DECIDIDO por Carlos

El diagnóstico del 01-09 en la mañana (tres casos del PDF verificados contra
producción) se le presentó a Carlos y lo decidió en la reunión:

> «En la práctica, creo que va a tener que acumular. […] si es para el mismo
> comercial, yo diría que se tendría que consolidar. […] Mejor que lo acumule y
> ya si el mismo comercial le indicara que no es este tema, ya podríamos
> dividirlo.»
>
> «Debe de crearse automáticamente entonces. O que le avise para que se junte
> un expediente.»

La analogía que usó Carlos es la del historial clínico: «yo vengo por dolor de
cabeza y después llamo otra vez por resfrío» son expedientes distintos; la misma
consulta que entra dos veces por dos canales es UNO.

**Reglas acordadas:**
1. Al derivar, si el cliente ya tiene un expediente **abierto con el MISMO
   comercial**, el contacto **se acumula** en ese expediente (no nace gemelo), y
   a Central **se le avisa** que se juntó («este prospecto ya vino hace media
   hora / hace dos días por este caso»).
2. **Distinta área = expediente aparte, siempre.** «Si llama este mismo cliente
   media hora después, pero ya para postventa, ese es otro expediente
   totalmente independiente. Ahí sí no hay dificultad.»
3. Dividir un expediente acumulado por error (el comercial dice «no es este
   tema») queda para después: «pasa muy pocos casos».

**Trabajo técnico (diseñado el 01-09, pendiente de construir):**
- `leads.oportunidad_id`: el lead recuerda a qué expediente fue a parar
  (columna nueva + backfill desde `oportunidades.lead_id`).
- `asignar_lead`: antes del insert, buscar expediente abierto de la misma
  cuenta y mismo comercial (origen `crm`, etapa abierta, con movimiento en los
  últimos 30 días, `tipo_postventa` null ↔ null); si existe, acumular.
  Postventa queda FUERA de la acumulación (regla 2).
- «Lo que derivé» resuelve el expediente por `leads.oportunidad_id` (con lo de
  hoy en producción, lo acumulado se muestra sin el rótulo «otra ficha»).
- La solicitud del segundo canal se muestra en el expediente del comercial
  («El cliente también escribió por…»).
- **Normalizar los gemelos existentes**: 3 casos comerciales seguros
  (PRO-08939 Nataly, PRO-08962 Norabuena, PRO-08971 Alex Chávez: gemelo vacío →
  expediente trabajado, y se borra el vacío). Los 2 de PV (PRO-08942, PRO-09038
  Fredd) tienen `atenciones` colgadas — tratamiento aparte. PRO-09083 tiene
  TRES destinos posibles — no se toca a ciegas.

**Casos que la duplicidad ya explicó (para cerrar el PDF del 31-08):**
- Nataly Ludeña: 5 gestiones + USD 22.149 en la gemela. Duplicidad.
- Alex Chávez / Mi Casita Facilita: llamada + Presu_2200-26 en la gemela.
  Katerine lo confirmó en vivo: trabajó «con Casita», no unió nada.
- **Fredd (PRO-09038)** — lo que Carlos pidió rastrear: NO se borró nada.
  Cliente LOAIZA VELARDE FREDDY, entró dos veces el viernes 28-08; las 2
  gestiones de postventa de las 12:25 («se le llamó al cliente y envió sus
  fotos», «se envió a consultar el stock a Almacén») viven en la primera
  entrada; el PRO-09038 (formulario, derivado 14:01) es el gemelo vacío.
- Frutos Tropicales: era la ÚNICA alarma verdadera, y Katerine registró su
  llamada el 01-09 a las 10:02 tras la urgencia. El circuito de supervisión
  de Central funcionó completo.

---

## B · El cierre emitido se CIERRA — pedido de Carlos

> «Una vez que se hace el cierre ya no puede agregarse más cosas en el
> expediente. Ni el gestor, ni la central; la central lo único que puede hacer
> es descargar, pero no agregar.»

Hoy el informe emitido acepta AGREGAR documentos (decisión anterior). Cambia:

1. **Emitido = sellado.** Nadie agrega nada; Central solo mira y descarga.
2. **Corregirlo pide el código de Lesly (operaciones).** El flujo: Central
   observa el cierre («está mal el voucher») → se lo manda al gestor → el
   gestor pide autorización → Lesly dicta el código → corrige → se vuelve a
   aceptar → sigue el circuito.

## C · «Pedido ejecutado» → el cierre le llega a postventa

> «Le doy pedido ejecutado […] inmediatamente en postventa me debería
> aparecer, entiendo que acá en Mi día.»

El cierre liberado por Central aparece en **Mi día de postventa** como una
venta nueva por trabajar. Postventa abre el cierre y ve TODO el expediente:
equipos, condiciones de venta, adjuntos (el concepto del Excel de control que
Hever mostró).

## D · El circuito de postventa sobre esa venta (escenario provincia)

Relatado por Hever de punta a punta; es la especificación del flujo:

1. **¿Pagó o no pagó? — la regla de oro.** Y aunque el voucher esté en el
   expediente, **se confirma con Finanzas** antes de mover un dedo (estafas de
   voucher falso «tipo Yape» una o dos veces al año; o depósito con comisión
   descontada: faltan US$ 100 y coordina el comercial). Sin confirmación de
   Finanzas, el caso espera en cola.
2. **Probar el equipo**: alerta a almacén (Marcel) con la hora límite
   («despacho 4pm, probado a las 3pm») y almacén confirma «equipo probado».
3. **Plano de preinstalación** al cliente por correo.
4. **Despacho**: ⚠️ **la garantía corre desde la GUÍA DE REMISIÓN** — desde
   que el equipo sale de la empresa, NO desde que le llega al cliente («tú me
   dejaste en la agencia el día uno…»). Precisión que Carlos remarcó.
5. **Puesta en marcha** por videollamada (provincia) → informe con fotos y
   videos. Si falta algo (agua, desagüe, enchufe) → **cotizar repuestos** y
   repetir el ciclo.
6. Todo conforme → registrar **ciclos** («el kilometraje de la máquina», un
   ciclo ≈ una hora) → **caso cerrado** + correo final al cliente con el
   informe y el recordatorio del preventivo (cada 3 a 6 meses según uso).
7. **A los 3 meses, alerta**: «mantenimiento preventivo, ¿a quién le toca?» —
   la venta del preventivo arranca sola desde el cierre.

## E · Atenciones (= «problemas») — lo que les falta

1. **La ruta del contacto en la ficha de la atención** (recuadro derecho,
   como la vista del comercial): llegó a Central → se derivó → primer
   contacto. «En la parte derecha debe estar el historial de cómo llegó.»
2. **Verificar garantía desde la atención**: el cliente manda la foto de la
   placa; la ficha debe listar **las series de ese cliente** para contrastar
   y, con un clic, decir «en garantía / no en garantía». Estándar: **24
   meses desde la guía de remisión**. Las guías no están cargadas → se
   aproxima con las **cotizaciones de venta** (Carlos: «sí tienes todas las
   cotizaciones de ventas») mientras se enlazan las guías.
   - En garantía → deriva la llamada a logística/almacén y espera el informe.
   - Sin garantía → cambia el speech: cotizar mantenimiento preventivo.
   - Caso real citado: en garantía PERO preventivo vencido desde abril → se
     le cotizó el mantenimiento (viaje a Tumbes).
3. **Desde una atención se tiene que poder COTIZAR** (mantenimiento,
   repuestos): hoy solo venta de servicios cotiza. «Atención también debe
   haber la oportunidad para poder cotizar… porque viene de un problema.»
4. **Repuestos**: primer paso siempre es consultar stock y precios a
   importaciones/almacén (hoy lo hacen por correo a mano).

## F · Registro de postventa que reporta a Central (relevado por Santos)

Falta el formulario de REGISTRO en postventa para lo que le llega directo
(clientes que llaman al técnico sin pasar por Central): postventa lo registra
→ cae a la bandeja de Central → Central lo recibe y lo deriva a postventa o a
donde corresponda. Cierra la regla «TODO contacto entra por Central».
*(Interpretación a confirmar con Santos antes de construir.)*

---

## Orden propuesto (Carlos: «primero debemos amoldar esta parte… desde el cierre»)

1. **B + C** — el cierre sellado con autorización de Lesly, y el cierre
   llegando a Mi día de postventa. «Todo parte desde el cierre.»
2. **A** — consolidación de gemelos (migración + normalización + aviso).
3. **E1** — la ruta del contacto en la atención (reutiliza `RutaDerivacion`).
4. **E2–E4** — garantía por serie, cotizar desde la atención, repuestos.
5. **F** — registro de postventa → bandeja de Central (tras confirmar F).
6. **D** — el circuito completo del despacho (alertas a almacén, planos,
   puesta en marcha, ciclos, alerta de preventivo a los 3 meses): es la etapa
   grande; se diseña aparte cuando 1-4 estén andando.

**Nada de esto se despliega sin la orden de Santos.**
