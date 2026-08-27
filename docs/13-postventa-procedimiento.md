# Plan 13 — Postventa: procedimiento, modelo y pantallas

**Fuente:** reunión del 27-08 con el ing. Carlos (transcripción de audio). Es la primera vez que se explica el circuito completo **venta → central → finanzas → postventa → almacén**, del que hasta hoy el CRM solo tenía la punta (la agenda copiada del Excel `R:\COPIA CRM POST VENTA`, migración 0075).

**Estado de partida:** `/postventa` existe con tres pantallas (inicio, agenda, soporte) que son un espejo del Excel. Carlos las miró en vivo y su diagnóstico fue textual: *«todavía no entiendo el proceso, el flujo, cómo se le mide, qué actividad hace, dónde lo manda, cómo recibe»*. Este documento responde eso: primero el procedimiento tal como es, después el procedimiento propuesto, y recién después las pantallas.

**Encargo:** *«hay que modelarlo y ver cómo se optimiza»*. Carlos advirtió él mismo que el proceso de postventa *«puede ser que sea muy burocrático»* y pidió explícitamente cuestionarlo. Las mejoras propuestas están marcadas 🔧 y cada una dice qué elimina.

---

## 1. El circuito real, tal como es hoy

Cinco áreas se pasan un expediente **de papel**. Postventa es la última de la fila y no empieza a trabajar hasta que le baja el file.

```
COMERCIAL          CENTRAL             ALMACÉN           FINANZAS          POSTVENTA
    │                 │                   │                 │                 │
 1. Cierre de venta   │                   │                 │                 │
    (direcciones,     │                   │                 │                 │
     forma de pago) ──┼──► 2. Toma el cierre                │                 │
    │                 │    pide la serie ─┼──► 3. Devuelve  │                 │
    │                 │    ◄──────────────┼─── la serie     │                 │
    │                 │    4. Genera PEDIDO en el ERP       │                 │
    │                 │       (jala equipo + serie)         │                 │
    │                 │    5. Imprime y arma EXPEDIENTE     │                 │
    │                 │       pedido · cierre · cotización  │                 │
    │                 │       OC · voucher · CRM ───────────┼──► 6. Liquida   │
    │                 │                   │                 │    (50% pagado) │
    │                 │                   │                 │    archiva y ───┼──► 7. Recibe el file
    │                 │                   │                 │    baja el file │    y RECIÉN empieza
    │                 │                   │                 │                 │
    │                 │                   │  ◄──────────────┼─────────────────┤ 8. WhatsApp: «prueba
    │                 │                   │  9. «Probado y  │                 │    y embala la máquina»
    │                 │                   │      embalado» ─┼─────────────────┤► marca SÍ
    │                 │                   │                 │                 │
10. Cobra el saldo ───┼───────────────────┼─────────────────┼──► correo ──────┤ 11. Pide a Finanzas
    (correo + voucher, con copia a postventa)               │ «confirmar pago»│     que confirme
    │                 │                   │  12. Finanzas actualiza liquidación├──► «conforme»
    │                 │                   │                 │                 │
    │                 │                   │                 │                 │ 13. Llama al cliente:
    │                 │                   │                 │                 │     corrobora DIRECCIÓN
    │                 │                   │                 │                 │     y coordina despacho
    │                 │                   │                 │                 │ 14. Envía por correo el
    │                 │                   │                 │                 │     PLANO de preinstalación
    │                 │                   │                 │                 │ 15. DESPACHO
    │                 │                   │                 │                 │ 16. PUESTA EN MARCHA
    │                 │                   │                 │                 │     (in situ o videollamada)
    │                 │                   │                 │                 │     informe + fotos + ciclos
    │                 │                   │                 │                 │ 17. COMPLETADO
```

### Lo que hay que entender del paso 16
La puesta en marcha **es instalación + capacitación**, y produce un informe con fotos que sirve como prueba: *«el cliente a veces dice: usted vino la semana pasada y ahora mi máquina está fallando, y usted la dejó golpeada. Venga el informe, la foto. Una imagen vale más que mil palabras.»*

En ese informe se captura la **lectura de ciclos** del equipo. Es el kilometraje de la máquina: *«yo te lo entrego en cero, pero cuando lo probamos ya tiene 2 kilómetros. Normalmente lo dejamos con 5 ciclos.»* Sirve para dos cosas:
- **Defender la garantía:** *«señor, usted tiene 10.000 ciclos, quiere decir que ha usado 9 horas diarias — una hora es un ciclo»*.
- **Vender mantenimiento:** ese mismo dato es el que abre la conversación (*«ok, le voy a cotizar el mantenimiento»*).

### Y la trampa de la garantía en provincia
La garantía **corre desde el despacho** cuando va a provincia. La fecha de puesta en marcha no define la garantía: define **cuándo intervinimos nosotros el equipo**. Importa porque el cliente de provincia a veces lo instala solo (*«no, ya lo puse en marcha»*) y eso puede hacerle perder la garantía. Registrar la fecha real es lo que permite defenderlo o advertirlo a tiempo.

⚠️ **A confirmar con Carlos:** en Lima, ¿la garantía corre desde el despacho o desde la puesta en marcha? Y cuántos meses según tipo de equipo.

---

## 2. Diagnóstico: dónde se pierde el trabajo

| # | Problema | Costo real |
|---|---|---|
| D1 | El expediente es **papel** y viaja de escritorio en escritorio. Postventa no puede empezar hasta que le bajan el file. | Días muertos que no mide nadie. |
| D2 | La serie del equipo se pide **por WhatsApp** al almacén y se copia a mano al ERP. | Sin rastro de quién la dio ni cuándo. Serie mal tipeada = garantía sin dueño. |
| D3 | La prueba y embalaje también es WhatsApp. | Se pierde el pedido si nadie relee el chat. |
| D4 | El saldo se confirma con **dos correos** (comercial → postventa → Finanzas → postventa). | Postventa hace de cartero de algo que no controla: *«yo no cobro, ojo»*. |
| D5 | La dirección viene de oído del comercial y **siempre falla**: *«no, yo no le he dado eso a la señorita, se ha equivocado»*. | Flete perdido o entrega demorada. |
| D6 | Todo el seguimiento vive en un Excel de una sola persona. | Si Ariana no está, nadie sabe en qué va un despacho. Central no puede responderle al cliente que llama. |
| D7 | Los informes de puesta en marcha (fotos, ciclos) están sueltos fuera del sistema. | La prueba existe pero no se encuentra cuando hace falta. |
| D8 | **No existe la base instalada.** Nadie sabe qué equipos están en la calle, con qué serie, en garantía hasta cuándo. | Se pierde el mantenimiento preventivo, que es el ingreso recurrente del área. |
| D9 | Postventa no puede cotizar en el CRM: faltan las fichas de repuestos y de mantenimiento. | Cotizan en Word y queman correlativos a mano (el 2185 salió en esta reunión). |

Y el diagnóstico sobre las pantallas actuales, dicho por Carlos frente a ellas:
- La agenda **muestra primero lo del año pasado**: *«primero debería salir lo último que están gestionando»*.
- **No tiene filtros** ni buscador.
- **No se puede cliquear** ninguna fila.
- Los casos derivados por Central **no tienen cómo cerrarse**: *«no hay un clic donde diría que ya está atendido»*.
- Las etiquetas de etapa hablan de ventas (filtrada, potencial). Sobre esto se corrigió solo: *«no, pero los estados están bien, porque funcionan bastante similar — esperando el repuesto entra en seguimiento»*.

---

## 3. El procedimiento propuesto

Regla que ordena todo: **el CRM es el expediente**. El papel sobrevive en un solo punto —Finanzas, mientras no haya integración— y se imprime de un botón, no fotocopiando.

### Paso 1 · El comercial cierra la venta (se robustece el informe de cierre)

Hoy el informe de cierre es *«un compendio, un resumen»*. Le faltan los adjuntos. Se agrega un bloque de documentos con **tipo declarado**:

| Documento | Obligatorio | Nota de la reunión |
|---|---|---|
| Cotización | sí (o la del CRM, enlazada) | |
| Orden de compra o de servicio | si el cliente la emite | |
| Voucher de pago / cancelación | sí | Puede haber varios (adelanto y saldo). |
| Otros acuerdos | opcional | *«a veces vendemos sin cotización, pero el cliente firma una hoja membretada: lavadora 10 mil, dos secadoras 15 mil, descuento 5, queda 20»*. |
| Resumen CRM | automático | Ya no se imprime: *«el CRM va a estar guardado»*. Se genera solo con el historial de la oportunidad. |
| ~~Ficha RUC~~ | **eliminada** 🔧 | *«ya no sería necesaria»*. El control que sí importa —que la razón social del cierre sea la que se vendió, porque *«a veces las razones sociales son muy similares pero tienen otro rumbo»*— lo hace el sistema comparando el RUC del cierre contra el de la cuenta, y avisa si no coincide. |

🔧 **Elimina:** que el comercial imprima cierre + cotización + OC + voucher para mandárselos a Central.

### Paso 2 · Central ejecuta el pedido

Central sigue generando el pedido en el ERP (no hay integración: *«eso será cuando el ERP esté»*). Lo que cambia es que **vuelca dos datos al CRM y marca dos checks**:

1. **N.º de pedido del ERP** y **serie de cada equipo** → el CRM las guarda. La serie deja de ser un dato de un chat.
2. ☑ **Pedido ejecutado**
3. ☑ **Liquidación** (hoy la marca Central por Finanzas; cuando Finanzas tenga usuario, la marca Finanzas)

Al quedar los dos checks, **el pedido se libera a postventa automáticamente y suena la campana**. Textual de Carlos: *«cuando le haga check pedido ejecutado y liquidación, significa que ya le llegue inmediatamente a postventa, y acá me va a aparecer nuevo pedido»*.

Central conserva **un** botón de impresión: **«Expediente para Finanzas»**, un solo PDF con pedido + cierre + cotización + OC + vouchers en orden. 🔧 **Elimina:** armar el file a mano y la copia impresa que hoy baja a postventa (*«postventa ya no debería trabajar nada de esto»*, *«yo no lo necesito, ya lo tengo acá, en digital»*).

### Paso 3 · Postventa acusa recibo

En su bandeja aparece **Nuevo pedido**. Un botón: **Aprobar**. Con eso:
- Central ve *«ya está aprobado, ya está en ejecución»* — el acuse que Carlos pidió explícitamente.
- Se carga la ficha del pedido con todo lo que adjuntó el comercial.
- Arranca el reloj del área (desde acá se mide a postventa, no antes).

🔧 **Elimina:** el registro manual en el Excel (*«ya no tengo que registrar esto, porque va a jalar automáticamente»*).

### Paso 4 · Preparación del equipo (almacén)

Postventa dispara **«Solicitar prueba y embalaje»**. Propuesta: darle al almacén un usuario con **una sola pantalla y dos botones** (asignar serie / probado y embalado, con foto del embalaje). Es barato y cierra D2 y D3 de una vez.

Si el almacén no entra ahora, la versión mínima: el botón abre WhatsApp con el mensaje ya escrito y deja registrada la solicitud con fecha; postventa marca la respuesta. Se pierde el acuse del almacén, pero se gana el rastro.

### Paso 5 · Pago (carril paralelo, no lo maneja postventa)

Esto es lo más burocrático del circuito actual y se puede cortar entero:

- El comercial sube el voucher del saldo **al cierre** (no lo manda por correo).
- Finanzas —o Central mientras tanto— tiene una bandeja **«Pagos por confirmar»** y un botón **Confirmar pago**, que actualiza el saldo.
- Postventa **ve el semáforo** sin pedirle nada a nadie.

🔧 **Elimina:** el correo del comercial con copia, el correo de postventa a Finanzas y la espera de la respuesta. Dos correos y una espera por cada venta.

**Regla dura propuesta:** no se programa despacho sin cancelación total. Si hay que despachar igual, el sistema exige **motivo + quién lo autorizó**. Hoy esa regla vive en la cabeza de postventa; conviene que viva en el sistema.

### Paso 6 · Plano de preinstalación

El plano *«es un planito de dos, tres hojas, un resumen, porque el cliente no quiere leer nada»*. Depende del **modelo** del equipo → se carga una vez por modelo en el catálogo y el sistema ya sabe cuál corresponde. Se envía de un clic (correo + WhatsApp) y queda la fecha y hora de envío.

🔧 **Mejora de proceso:** hoy el plano sale **después de la cancelación**. Propongo que salga al **aprobar el pedido**, y se reenvíe al confirmar despacho. El plano existe para que el cliente prepare agua, desagüe, energía y vapor; si lo recibe mientras termina de pagar, la instalación no se atrasa. No cambia ningún costo y adelanta días de puesta en marcha.

🔧 **Check nuevo: preinstalación verificada.** Antes de despachar a provincia, el cliente manda foto de sus puntos y postventa lo marca. Evita el viaje en falso y la puesta en marcha fallida. (El tipo de servicio ya existe en `soporte_tecnico`: «verificación de preinstalación».)

### Paso 7 · Coordinación de despacho

Postventa llama al cliente y marca **«Dirección verificada»** con: quién confirmó, teléfono y fecha. Si la dirección cambió, se corrige ahí y **queda guardada en la cuenta** para las próximas entregas (ya existe `direcciones` por contacto, migración 0086).

🔧 **Elimina:** que el mismo error de dirección se repita en la siguiente venta al mismo cliente.

### Paso 8 · Despacho

Se registra fecha real, transportista/agencia, guía y —si hay— foto de la carga. Desde acá corre la garantía en provincia.

### Paso 9 · Puesta en marcha

Formulario **pensado para el celular**, porque se llena en sitio o durante la videollamada:

- Modalidad: in situ / videollamada
- Fecha y hora reales (las estampa el sistema, no se tipean)
- **Fotos obligatorias:** equipo instalado · placa de serie · contador de ciclos · entorno de instalación
- **Lectura de ciclos** (línea base, normalmente 5)
- **Checklist de capacitación:** uso · cuidado · mantenimiento diario
- Observaciones y estado en que se entrega (*«obtendré un rayón acá, está la foto, ahí está la hora y fecha»*)
- **Conformidad del cliente:** nombre, documento y firma en pantalla (o foto del acta)

Al guardar, el sistema **genera el PDF del informe** con la marca, lo envía al cliente y lo deja colgado del equipo para siempre.

### Paso 10 · Cierre y lo que se abre después

Al cerrar el pedido, el equipo entra a la **base instalada** y el sistema:
- calcula **hasta cuándo tiene garantía**;
- **agenda el primer mantenimiento preventivo** (3 o 6 meses según equipo y uso);
- avisa a los **11 meses**: *vence la garantía de X — momento de ofrecer mantenimiento*.

🔧 **Esta es la mejora con más retorno del módulo entero.** Hoy el mantenimiento preventivo solo ocurre si el cliente llama. Con la base instalada, postventa deja de ser un área que espera (*«postventa está esperando sin hacer nada, no tiene trabajo»*) y pasa a ser un área que genera cartera.

---

## 4. Los casos que deriva Central (garantía · repuesto · mantenimiento)

Son el otro flujo del área y ya existen (migración 0075). Lo que les falta:

1. **Botón «Atendido»** que cierre el caso con motivo. Es lo que Carlos no encontró.
2. **Vocabulario propio.** El enum `etapa_oportunidad` se queda como está —Carlos validó que los estados sirven— y **solo cambian las etiquetas** cuando el caso es de postventa. Cero migración, lenguaje correcto:

   | Dato (no cambia) | Etiqueta comercial | Etiqueta postventa |
   |---|---|---|
   | `asignada` | Asignada | Recibido |
   | `filtrada` | Filtrada | Diagnosticado |
   | `cotizada` | Cotizada | Cotizado al cliente |
   | `seguimiento` | Seguimiento | Esperando repuesto / respuesta |
   | `potencial` | Potencial | Programado |
   | `venta` | Venta | Ejecutado |
   | `rechazada` | Rechazada | No procede |

3. **SLA visible.** Garantía = primer contacto en 2 horas (equipo parado es cliente parado); repuesto y mantenimiento = 24 horas. Semáforo en la bandeja: verde / ámbar / rojo.
4. **Al abrir un caso, pedir la serie.** Con la serie el sistema trae el equipo, su garantía, sus ciclos y sus intervenciones anteriores. Es el argumento del *«señor, usted tiene 10.000 ciclos»* sin buscar en ningún lado.
5. **Cotización de servicio** 🔧: hasta que existan las fichas de repuestos y de mantenimiento preventivo, habilitar una cotización con líneas libres (descripción + precio) que use el correlativo del sistema y el PDF de marca. Resuelve hoy el problema del número duplicado sin esperar el catálogo.

---

## 5. Modelo de datos

**Criterio: no se crea una agenda paralela.** `servicios_postventa` (migración 0075) es la agenda que ya usan, con las filas del Excel adentro. Se **extiende**, no se reemplaza: las filas históricas siguen viviendo con sus columnas de texto (`confirmacion_abono`, `prueba_embalaje`, `planos_preinstalacion`…) y las nuevas usan los campos estructurados. Una sola pantalla, un solo lugar donde buscar.

### 5.1 Extender `informes_cierre`
```sql
alter table informes_cierre add column adjuntos jsonb not null default '[]'::jsonb;
-- [{tipo:'cotizacion'|'orden_compra'|'voucher'|'acuerdo'|'otro', path, nombre, tipo_mime, tamano, subido_por, subido_at}]
```
Mismo esquema y mismo bucket privado que los adjuntos de gestión (0029) y de leads (0082). Nada nuevo que inventar.

### 5.2 Extender `servicios_postventa` (el pedido)
```sql
alter table servicios_postventa
  add column informe_cierre_id  uuid references informes_cierre(id),
  add column numero_pedido_erp  text,
  -- Los dos checks de Central que liberan el pedido
  add column pedido_ejecutado_at   timestamptz,
  add column pedido_ejecutado_por  uuid references perfiles(id),
  add column liquidacion_at        timestamptz,
  add column liquidacion_por       uuid references perfiles(id),
  -- El acuse de postventa
  add column aprobado_at   timestamptz,
  add column aprobado_por  uuid references perfiles(id),
  -- Modalidad: cambia el circuito (in situ vs. videollamada, garantía)
  add column modalidad text check (modalidad in ('lima','provincia')),
  -- Pago, estructurado en vez de texto libre
  add column monto_pagado          numeric(12,2) not null default 0,
  add column pago_confirmado_at    timestamptz,
  add column pago_confirmado_por   uuid references perfiles(id),
  add column despacho_sin_cancelar_motivo text,
  add column despacho_autorizado_por uuid references perfiles(id),
  -- Almacén
  add column serie_solicitada_at   timestamptz,
  add column prueba_solicitada_at  timestamptz,
  add column prueba_lista_at       timestamptz,
  add column prueba_lista_por      uuid references perfiles(id),
  -- Plano y dirección
  add column plano_enviado_at        timestamptz,
  add column preinstalacion_ok_at    timestamptz,
  add column direccion_verificada_at  timestamptz,
  add column direccion_verificada_con text,
  -- Despacho real
  add column despachado_at timestamptz,
  add column transportista text,
  add column guia          text,
  add column cerrado_at    timestamptz;
```

### 5.3 Nueva: `equipos_instalados` (la base instalada)
La pieza que hoy no existe y de la que cuelga todo lo demás.
```sql
create table equipos_instalados (
  id uuid primary key default gen_random_uuid(),
  serie text not null unique,          -- la identidad de la máquina
  cuenta_id uuid not null references cuentas(id),
  producto_id uuid references productos(id),
  modelo_texto text,                   -- cuando no está en el catálogo
  servicio_id uuid references servicios_postventa(id),
  fecha_despacho date,
  fecha_puesta_marcha date,
  garantia_meses integer,
  garantia_hasta date,                 -- calculada: provincia = despacho + meses
  ciclos_inicial integer,
  ciclos_ultimo integer,
  ciclos_ultimo_at date,
  proximo_mantenimiento date,
  ubicacion text,
  created_at timestamptz not null default now()
);
```

### 5.4 Nueva: `informes_puesta_marcha`
```sql
create table informes_puesta_marcha (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios_postventa(id),
  equipo_id   uuid references equipos_instalados(id),
  modalidad text not null check (modalidad in ('in_situ','videollamada')),
  ejecutado_at timestamptz not null,
  ciclos integer,
  capacitacion jsonb not null default '{}'::jsonb,  -- {uso:true, cuidado:true, mantenimiento:true}
  observaciones text,
  fotos jsonb not null default '[]'::jsonb,         -- [{path, etiqueta, tomada_at}]
  cliente_conforme_nombre text,
  cliente_conforme_doc text,
  firma_path text,
  pdf_path text,
  responsable_id uuid references perfiles(id),
  created_at timestamptz not null default now()
);
```

### 5.5 Nueva: `solicitudes_almacen` (solo si el almacén entra al CRM)
```sql
create table solicitudes_almacen (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios_postventa(id),
  tipo text not null check (tipo in ('serie','prueba_embalaje')),
  solicitado_por uuid references perfiles(id),
  solicitado_at timestamptz not null default now(),
  respondido_por uuid references perfiles(id),
  respondido_at timestamptz,
  respuesta text,                       -- la serie, o la nota del embalaje
  foto_path text
);
```

### 5.6 Roles
- **Postventa** sigue como perfil `comercial` con `es_postventa` (decisión de Carlos del 25-08, no se toca ahora).
- **Almacén** y **Finanzas**: roles nuevos con una sola pantalla cada uno. Decisión pendiente de Carlos.

---

## 6. Pantallas

### 6.1 Postventa · Hoy (reemplaza el inicio actual)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Postventa · miércoles 27 de agosto                                       │
├───────────────────────────────────────────────────────────────────────────┤
│  ● NUEVOS PEDIDOS                                                  (2)    │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Nº 012-2026 · NATUCULTURA S.A.C.        Lavadora RX180 · S/N 214    │  │
│  │ US$ 10,000 · 50% adelanto · Provincia — Arequipa                    │  │
│  │ Liberado por Central hace 20 min          [ Ver ]  [ ✓ APROBAR ]    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────────────┤
│  ● PARA HOY                                                        (5)    │
│  09:00  Llamar a MARANATHA — verificar dirección de despacho              │
│  11:00  Puesta en marcha (videollamada) — LAVANDERÍA CRISTO REY           │
│  ‼ VENCIDO  Despacho de PERUFARMA programado para el 21-08                │
├───────────────────────────────────────────────────────────────────────────┤
│  ● CASOS DE CENTRAL                                    (3 · 1 en rojo)    │
│  🔴 Garantía  LAVANDERÍA CRISTO REY · hace 4 h sin contactar              │
│  🟡 Repuesto  TA EXPORT · esperando repuesto desde el 22-08               │
└───────────────────────────────────────────────────────────────────────────┘
```

**Lo que cambia respecto de hoy:** deja de ser una lista de todo lo pendiente ordenada por fecha vieja, y pasa a ser **lo que tengo que hacer ahora**. Lo demás vive en la agenda.

### 6.2 Ficha del pedido — la pantalla central

Carlos reaccionó a la cantidad de pasos: *«¿varias etapas? uf, son bastantes etapas»*. La respuesta de diseño es **agrupar en tres bloques**, no mostrar diez checks en fila. El usuario ve tres, abre el que le toca.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Pedidos      Nº 012-2026 · NATUCULTURA S.A.C.        [ WhatsApp ] [PDF] │
│ Lavadora PRIMUS RX180 · Serie 509KWSB0A214 · Arequipa (provincia)         │
│ US$ 10,000  ▓▓▓▓▓░░░░░ 50% pagado          ⛔ DETENIDO: falta el saldo     │
├───────────────────────────────────────────────────────────────────────────┤
│ ①  PREPARACIÓN                                              ✓ completo    │
│    ✓ Aprobado por Ariana · 27-08 09:12                                    │
│    ✓ Serie asignada por Almacén · 27-08 10:40                             │
│    ✓ Probado y embalado · 27-08 15:20  📷                                  │
│    ✓ Plano de preinstalación enviado · 27-08 09:20                        │
│                                                                           │
│ ②  DESPACHO                                             ● en curso        │
│    ⛔ Pago: falta el saldo (US$ 5,000)   → lo confirma Finanzas            │
│    ○ Dirección verificada con el cliente        [ Verificar ahora ]       │
│    ○ Preinstalación confirmada (foto del cliente)     [ Registrar ]       │
│    ○ Fecha de despacho: 28-08 (probable, del cierre)  [ Programar ]       │
│                                                                           │
│ ③  PUESTA EN MARCHA Y CIERRE                             ○ pendiente      │
│    ○ Coordinar con el cliente                                             │
│    ○ Informe de puesta en marcha (fotos + ciclos)     [ Llenar informe ]  │
│    ○ Cerrar el pedido                                                     │
├───────────────────────────────────────────────────────────────────────────┤
│ DOCUMENTOS   Cierre · Cotización 2178 · OC 4471 · Voucher 50% · Acuerdo   │
│ HISTORIAL    todo lo que pasó, con quién y cuándo                         │
└───────────────────────────────────────────────────────────────────────────┘
```

Tres decisiones de diseño que vale la pena explicar:

1. **El chip «DETENIDO POR…» en la cabecera.** Responde de un vistazo la pregunta que hoy exige leer la fila entera: *¿por qué esto no avanza?* — falta el saldo / falta la serie / dirección sin verificar / esperando al cliente. Es también lo que separa la responsabilidad: un despacho frenado por el saldo **no es demora de postventa**.
2. **Ningún check es solo un check.** Cada uno guarda quién, cuándo y con qué evidencia. Un ✓ sin autor no sirve para defender nada tres meses después.
3. **Una acción primaria por paso.** Nada de formularios con veinte campos: el botón hace lo obvio y pide lo mínimo.

### 6.3 Agenda — dos pestañas, no una

El reclamo fue *«de los despachos sale casi lo del año pasado; primero debería salir lo último que están gestionando»*, y sobre el Excel importado aceptó que *«acá no se puede tocar, es información histórica, pero le pongo un filtro»*. Entonces:

```
┌───────────────────────────────────────────────────────────────────────────┐
│  [ EN GESTIÓN (18) ]  [ Histórico del Excel (240) ]                       │
│  🔍 cliente, serie o equipo   Estado ▾  Tipo ▾  Ubicación ▾  Mes ▾  ↻     │
├───────────────────────────────────────────────────────────────────────────┤
│  ‼ ATRASADOS (3)                                                          │
│  21-08  PERUFARMA · Secadora SEC75E3     Despacho vencido   ⛔ falta saldo │
│  ─────────────────────────────────────────────────────────────────────────│
│  ESTA SEMANA (7)                                                          │
│  28-08  NATUCULTURA · Lavadora RX180     Despacho           ● dirección   │
│  29-08  MARANATHA · Secadora SECU553     Puesta en marcha   ✓ listo       │
│  ─────────────────────────────────────────────────────────────────────────│
│  MÁS ADELANTE (5)  ·  SIN FECHA / POR COORDINAR (3)                       │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Orden:** atrasados primero, después por proximidad; dentro de cada grupo, lo movido más recientemente arriba. Nunca por orden de captura.
- **Cada fila es un enlace** a la ficha del pedido (6.2). Ese era el otro reclamo.
- **«Sin fecha / por coordinar»** se queda como grupo propio: es donde el trabajo desaparece.
- La pestaña **Histórico** es el Excel importado, de solo lectura, con buscador y filtros. Deja de ensuciar la cola de trabajo y sigue estando cuando se la necesita.

### 6.4 Casos de Central

Igual que la bandeja del comercial, pero con **SLA**, con el **tipo** (garantía/repuesto/mantenimiento) como filtro y con dos botones que hoy no están: **Atendido** y **Cotizar servicio**. Al abrir un caso, el campo serie trae el historial del equipo.

### 6.5 Equipos (base instalada) — pantalla nueva

```
┌───────────────────────────────────────────────────────────────────────────┐
│  🔍 509KWSB0A214                                                          │
├───────────────────────────────────────────────────────────────────────────┤
│  LAVADORA PRIMUS RX180 · Serie 509KWSB0A214                               │
│  NATUCULTURA S.A.C. · Arequipa · vendido por C4 · 27-08-2026              │
│  🟢 EN GARANTÍA hasta el 27-08-2027    ·   Ciclos: 1,240 (últ. 12-08)     │
│  Próximo mantenimiento sugerido: 27-02-2027                               │
├───────────────────────────────────────────────────────────────────────────┤
│  HISTORIAL DEL EQUIPO                                                     │
│  27-08-2026  Despacho                                                     │
│  02-09-2026  Puesta en marcha (videollamada) · 5 ciclos      [ Informe ]  │
│  12-08-2027  Garantía · cambio de rodamiento                 [ Informe ]  │
└───────────────────────────────────────────────────────────────────────────┘
```

Es la pantalla que convierte a postventa de área reactiva en área con cartera propia.

### 6.6 Almacén (una pantalla, dos botones)

```
Pedidos que esperan al almacén                                         (2)
Nº 012-2026 · NATUCULTURA · Lavadora RX180
   Serie:  [_____________]  [ Asignar ]
   ○ Probado y embalado     [ Marcar listo + 📷 ]
```

### 6.7 Reglas de UX del módulo

1. **≤15 segundos por registro** — la regla del proyecto también acá.
2. **Móvil primero en puesta en marcha**: las fotos salen del celular, en sitio.
3. **Nada bloquea por un dato que todavía no existe.** Si falta, se marca pendiente y el sistema recuerda; no se traba la pantalla.
4. **Todo estado dice por qué está así**, no solo cómo está.
5. **Vocabulario del área**, tal como lo hablan: abono, prueba y embalaje, planos, puesta en marcha, ciclos.

---

## 7. Cómo se mide el área

Responde el *«cómo se le mide»* de Carlos. Postventa **no se mide en soles vendidos** (0075/0078 ya la sacaron del ranking comercial). Se mide en tiempo y en cumplimiento:

| Indicador | Qué dice |
|---|---|
| Días de **pedido aprobado → despacho**, separando lo detenido por pago | El tiempo propio del área, sin cargarle la demora del cobro. |
| Días de **despacho → puesta en marcha** | El indicador más honesto de postventa. |
| **% de puestas en marcha con informe cargado** | Sin informe no hay defensa: *«venga el informe, la foto»*. |
| **% de despachos con dirección verificada antes** | Ataca directo el flete perdido. |
| **Casos: primera respuesta y cierre**, y abiertos > 7 días | El SLA. |
| **Base instalada:** en garantía / fuera de garantía / mantenimientos vencidos | La cartera del área. |
| **Ingresos por repuestos y mantenimiento** | Cuando puedan cotizar en el sistema. |

---

## 8. Entrega por fases

**Fase 1 — lo que puede estar mañana** (todo es UI + campos, sin integraciones):
1. Adjuntos en el informe de cierre, con tipo. Y la validación de RUC del cierre contra la cuenta.
2. Los dos checks de Central (pedido ejecutado, liquidación) + N.º de pedido ERP y serie → liberan el pedido y notifican.
3. Bandeja «Nuevos pedidos» con botón **Aprobar** y el acuse visible para Central.
4. Ficha del pedido con los tres bloques y sus checks fechados.
5. Agenda: orden correcto, dos pestañas, filtros, buscador, filas clickables.
6. Casos: botón **Atendido**, etiquetas de postventa, SLA.

**Fase 2 — la semana:** pago estructurado + bandeja de confirmación · verificación de dirección · envío del plano desde el sistema · solicitudes al almacén · informe de puesta en marcha con fotos, ciclos y conformidad + su PDF.

**Fase 3:** base instalada por serie · garantías calculadas · mantenimientos programados y sus avisos · cotización de servicio con correlativo propio · indicadores del área.

**Fase 4:** integración con Finanzas y con el ERP. *«Eso será cuando el ERP esté… se conecta, ya está.»*

---

## 9. Lo que hay que preguntar antes de codear

**A Carlos (gerencia):**
1. **Garantía:** en Lima, ¿corre desde el despacho o desde la puesta en marcha? ¿Cuántos meses según tipo de equipo?
2. **¿Se puede despachar sin cancelación total?** Si sí, ¿quién lo autoriza?
3. **¿El almacén tendrá usuario en el CRM?** Sin él, la serie y el embalaje siguen viviendo en WhatsApp.
4. **¿Y Finanzas?** Mientras no, la liquidación y la confirmación de pago las marca Central.
5. **Postventa cotizando:** ¿rango de correlativo propio o el compartido? (en la reunión salió que van por el 2185 y que Ariana todavía no cotizó nada).
6. **Mantenimiento preventivo:** ¿cada cuántos meses según equipo, o según ciclos?

**A Santos:**
7. El **manual de procedimientos de postventa** en digital, que quedó en pasar. Tiene el detalle de los informes.
8. Los códigos y formatos de los **informes** que menciona el manual.

**A Lesly / Importaciones:**
9. Los **planos de preinstalación en PDF por modelo** (son los que hoy se mandan por correo).
10. Las **fichas de repuestos y de mantenimiento preventivo** — sin ellas postventa no puede cotizar en el sistema. Carlos fue explícito en que ese es el bloqueo.

---

## 10. Lo que este plan NO toca

- El ERP: sin integración, frontera limpia (regla 9 del proyecto).
- La numeración del pedido: la sigue generando el ERP; el CRM solo la guarda.
- Los informes técnicos del manual más allá del de puesta en marcha: *«esos informes luego los vamos a tener que enlazar, pero eso ya es la siguiente parte»*.
- El rol de postventa: se queda como perfil `comercial` marcado, hasta que haya razón para cambiarlo.

---

## Anexo · Nota de procedimiento ajena a postventa (misma reunión)

**Fichas técnicas:** ya no hay que reportarle nada a Importaciones. *«Solamente va a seguir siendo copiado por un tema procedimental, pero él no hace nada de esas fichas: lo hacemos nosotros.»* El procedimiento queda: se copia la ficha existente, se modifica, y **al terminar se le pasa a Santos**, que recién ahí hace lo suyo.
