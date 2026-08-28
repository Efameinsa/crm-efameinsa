# Plan 16 — Postventa: el flujo de la interfaz

**Fuente:** reunión del 27-08 por la tarde con el ing. Carlos, Lesly y Ariana; al final entra
John por el ERP (transcripciones `27-08-2026 14.28 / 14.58 / 15.29.txt` de Descargas).
Complementa el plan 13: aquel modeló el procedimiento; este diseña **cómo se ve y se navega**,
con las decisiones que Carlos tomó mirando las pantallas en vivo.

**Cómo leer este documento:** los §1–§2 son las decisiones y el principio rector; los §3–§7
son las pantallas, cada una con su porqué; el §8 es lo técnico transversal; el §9 es el orden
de ejecución con criterios de aceptación — eso es lo que se ejecuta, en ese orden.

---

## 1. Las decisiones de la reunión que mandan sobre el diseño

Cada una salió de la boca de Carlos mirando el CRM proyectado. No son propuestas: son encargos.

| # | Decisión | Cita |
|---|---|---|
| D1 | **Ariana no ejecuta: vende.** Su usuario no lleva agenda de despachos, ni equipos instalados, ni soporte técnico. | «Ella termina de vender, sigue su cierre y acabó. Yo no tengo nada que ver con cuándo lo vas a ejecutar.» |
| D2 | **Hever ve todo postventa; el gestor comercial solo lo suyo.** | «Yo como postventa sí tengo que ver el todo… pero tú como Ariana no puedes ver la información.» |
| D3 | **Ni postventa ni almacén ven precios.** Sí el estado del pago (completo/parcial), porque sin eso no se decide un despacho. | «Como política, ni almacén ni postventa deberían tener acceso a los precios… que puedas mirar la forma de pago sí, pero que no te muestre el detalle.» |
| D4 | **El comercial ve su línea de tiempo desde la asignación**, no desde su primera gestión. Es la base de la medición y de la reasignación. | «Te lo entregué a la 1:56, lo derivé a las 2:05 y no has hecho absolutamente nada… si tú no quieres comisionar, comisiona el siguiente.» |
| D5 | **La agenda de despachos se vuelve calendario** de atenciones técnicas in situ. | «El lunes vamos a atender dos clientes, uno en La Victoria, otro en el Centro… igual que ¿qué voy a hacer mañana, qué voy a hacer en la semana?» |
| D6 | **La serie es el eje de la trazabilidad.** Se pide primero, siempre. | «Ojo, el número de serie acá es vital… trabajamos con el número de serie siendo el patrón para toda la trazabilidad.» |
| D7 | **Correlativo único** para todas las cotizaciones. Ariana manda las 4 pendientes desde la 286 a mano y luego se regularizan en el CRM. | «¿Vamos a independizar que postventa tenga otra numeración? No, no tiene sentido. Todo uno solo.» |
| D8 | **Postventa va con calma y en paralelo**; la prioridad ahora es marketing. Nada de almacén/finanzas hasta después de la reunión del ERP (viernes 28, 4 pm). | «No queremos duplicidad… vamos con calma con postventa, no al 100%.» |
| D9 | Los **informes reales** son menos que los 5 del manual: informe de llamada · revisión (recepción) · mantenimiento · final · informe técnico de servicio. Con fotos; los videos todavía no se suben. | §3 de la transcripción de las 15.29. |

---

## 2. El principio que ordena todo: dos oficios, dos interfaces

El error que Carlos corrigió en vivo es que hoy el CRM trata «postventa» como **un** mundo.
Son **dos oficios distintos** que comparten datos pero no pantalla:

```
        EL OFICIO DE HEVER                    EL OFICIO DE ARIANA
        (operar el servicio)                  (vender mantenimiento)

  El trabajo LE LLEGA:                   El trabajo SE LO BUSCA:
  pedidos que libera Central,            llama a la base instalada,
  casos que deriva Central.              cotiza, cierra. Punto.

  Ve TODO el histórico del área          Ve SOLO su cartera y sus
  (¿quién lo atendió antes?).            oportunidades (RLS 0095).

  Mide tiempos de servicio.              Se mide como cualquier comercial.

  Interfaz: bandeja → ficha →            Interfaz: la de un comercial
  checks fechados + calendario.          + una vista de campaña (§7).
```

Toda pantalla nueva se diseña preguntando primero **de qué oficio es**. Cuando algo parece
de los dos (p. ej. «cotizar un mantenimiento»), es de los dos y se comparte el componente,
no la navegación.

**Regla de UX heredada y no negociable:** registrar una gestión ≤ 15 segundos (regla 11 del
proyecto). En este módulo se traduce así: ninguna acción frecuente (marcar un check, registrar
una llamada de caso, anotar una gestión de campaña) puede exigir salir de la pantalla en la
que ocurre el trabajo.

---

## 3. Navegación por rol (lo primero a corregir: hoy está al revés)

Hoy `nav-lateral.tsx` le **suma** a Ariana (`hace_postventa`, 0093) las cuatro pantallas del
área (`ENLACES_AREA_POSTVENTA`, línea 109). La decisión D1 lo invierte:

| Quién | Ve en el menú |
|---|---|
| **Hever** (`es_postventa`) | Mi día · **Calendario** (antes «Agenda de despachos») · Equipos instalados · Casos (antes «Soporte técnico») · Clientes · Cotizar |
| **Ariana** (`hace_postventa`) | Lo de un comercial normal + **Ruta de mantenimiento** (§7). **Nada de `/postventa`.** |
| **Central** | Sin cambio (cierres con los dos checks, derivaciones). |
| **Gerencia/admin** | Todo, como siempre. |

El guard de `postventa/layout.tsx` cambia igual: `hace_postventa` deja de abrir `/postventa`.
Las gestiones de mantenimiento de Ariana viven en su pipeline; lo que la 0095 le garantiza es
poder **abrir la ficha de la cuenta ajena** donde tiene la oportunidad — eso no cambia.

Renombres (el nombre le mintió a Carlos en vivo): «Agenda de despachos» → **«Calendario»**
(él mismo lo rebautizó: «calendario de servicio técnico»); «Soporte técnico» → **«Casos»**
(coincide con el lenguaje de Central, que ya «deriva casos»).

---

## 4. Mi día de postventa (`/postventa`) — la bandeja del oficio de Hever

La pantalla existente está bien encaminada (Carlos: «está excelente»). Se reordena con una
jerarquía de urgencia real, de arriba hacia abajo, y cada bloque desaparece si está vacío:

```
┌─────────────────────────────────────────────────────────┐
│ Hoy, jueves 27          [3 atenciones hoy] [2 sin resp.]│
│                                                         │
│ ① NUEVOS PEDIDOS (acuse pendiente)              ── rojo │
│    ▸ Restaurante La Parada · lavadora · [Aprobar]       │
│                                                         │
│ ② CASOS SIN PRIMERA RESPUESTA                  ── ámbar │
│    ▸ Lavandería Pre Andina · «máquina no lava» · 2 h    │
│                                                         │
│ ③ HOY EN CALENDARIO                                     │
│    ▸ 10:00 Puesta en marcha · Clínica X · La Victoria   │
│    ▸ 15:00 Preventivo en planta · serie 8834-C          │
│                                                         │
│ ④ PEDIDOS DETENIDOS (chip «qué lo frena»)               │
│    ▸ Hotel San Andrés · esperando pago (parcial)        │
│                                                         │
│ ⑤ ESTA SEMANA (lo agendado del Excel importado)         │
└─────────────────────────────────────────────────────────┘
```

Por qué en este orden: ① es el acuse que Central está esperando ver («ya está aprobado, ya
está en ejecución»); ② es el SLA del área; ③ es el día físico (técnicos en la calle); ④ es
lo que Carlos quiere vigilar sin abrir fichas; ⑤ es la cola heredada del Excel (origen=excel,
sin exigirle acuse — cuidado ya tomado en 0087, se conserva).

---

## 5. El calendario (`/postventa/agenda` → vista calendario)

Lo que Carlos pidió con sus palabras: la semana como unidad de planificación de **movilizar
un técnico** — instalación, puesta en marcha, capacitación, firma de acta, preventivo,
verificación de preinstalación. Los tipos ya existen en el enum `tipo_servicio_pv` (0087).

```
┌──────────────────────────────────────────────────────────────┐
│  ◂ Semana del 24 al 29 de agosto ▸        [Semana] Mes  Día  │
│─────────┬─────────┬─────────┬─────────┬─────────┬────────────│
│ LUN 24  │ MAR 25  │ MIÉ 26  │ JUE 27  │ VIE 28  │ SÁB 29     │
│─────────┼─────────┼─────────┼─────────┼─────────┼────────────│
│ █ 10:00 │ █ 09:30 │         │ █ 10:00 │         │            │
│ Puesta  │ Prevent.│         │ Puesta  │         │            │
│ en mar. │ planta  │         │ en mar. │         │            │
│ La Vict.│ s. 8834 │         │ Clínica │         │            │
│         │         │         │ █ 15:00 │         │            │
│         │         │         │ Prevent.│         │            │
└─────────┴─────────┴─────────┴─────────┴─────────┴────────────┘
  █ color por tipo de servicio · clic → ficha del pedido o caso
  Filtros: [Lima | Provincia] [Tipo] · sin hora asignada → franja
  «por programar» arriba del día, no invisible
```

- **Semana es la vista por defecto** (la conversación entera fue en semanas). Mes ya existe
  (`agenda-mensual.tsx` del área comercial): se reutiliza el componente, no se copia — misma
  lección de `crm-no-copiar-funciones-cotizacion`.
- Cada entrada nace de un pedido (sus pasos con fecha programada) o de un caso (atención
  programada con almacén/técnico). No hay «eventos sueltos»: si no está atado a un pedido o
  caso, no existe — es lo que evita las seis agendas paralelas del manual.
- La lista actual (ordenada por urgencia, tres pestañas) **no se tira**: queda como pestaña
  «Lista» dentro de la misma pantalla. El calendario responde «¿cuándo?»; la lista responde
  «¿qué me falta?». Son preguntas distintas y el área hace las dos.

---

## 6. El caso técnico (`/postventa/soporte` → `/postventa/casos`)

El flujo que Carlos narró completo (lavadora que no lava, E5, caño cerrado) dicta el
formulario. La regla de oro es D6: **la serie primero**, porque la serie trae todo lo demás.

**Registro guiado (una sola pantalla, tres momentos):**

```
1· ¿QUÉ EQUIPO?      [serie ______] ─── al tipearla:
                     ┌──────────────────────────────────┐
                     │ Titan Max 17 kg · Lavandería X   │
                     │ Puesta en marcha: hace 2 meses   │
                     │ Garantía: VIGENTE (22 m restan)  │
                     │ Último preventivo: NUNCA  ⚠      │
                     └──────────────────────────────────┘
                     (sin serie → busca por cliente, y el caso
                      queda marcado «equipo sin identificar»)

2· ¿QUÉ PASA?        [problema ________________________]
                     [código de error ___] [fotos] [videos]

3· ¿QUÉ HACEMOS?     (Resuelto por teléfono)  → registra y cierra
                     (Derivar a taller/técnico) → programa fecha+hora
                                                  → entra al calendario
                     (Cotizar repuesto/mant.)  → abre el cotizador
                                                  con el cliente cargado
```

- El panel de la serie es la maniobra de venta que Carlos describió sin llamarla así: «verifico
  que nunca le hemos hecho el preventivo → le cotizo el repuesto **y también** el preventivo».
  El ⚠ de «último preventivo: NUNCA» es la interfaz de esa venta cruzada.
- «Derivar a almacén» todavía **no crea una orden de almacén** (D8: frontera ERP pendiente).
  En esta fase registra la derivación en el caso, la agenda en el calendario y deja el texto
  listo para mandarlo por WhatsApp — el circuito real de hoy, sin inventar el de mañana.
- Los **informes** que vuelven de una atención (D9) se cargan sobre el caso o el pedido con la
  tabla única `informes_servicio` + `tipo` (llamada · revisión · mantenimiento · final ·
  técnico · puesta_en_marcha) — el diseño del plan 13 §5.4 aguanta los cinco sin cambios.
- La lista de casos conserva SLA y «Atendido» (fase 1), agrega columna de serie/equipo.

---

## 7. La ruta de mantenimiento (nueva, para Ariana) — `/comercial/ruta`

La corrección del 27-08 (plan 13, cierre) ya lo anticipó: Ariana ve su campaña como
oportunidades sueltas en el pipeline, «que funciona pero no está pensado para una campaña».
Esta es la vista de campaña. Es la **única** pantalla nueva del oficio comercial:

```
┌───────────────────────────────────────────────────────────────┐
│ Ruta de mantenimiento          [Por llamar] Llamados  Cotizados│
│───────────────────────────────────────────────────────────────│
│ Cliente          Compró    Últ. mant.  Últ. llamada  Respuesta │
│ Hotel Andino     2024-03   nunca ⚠     hace 12 d    «en oct.» │
│ Clínica Sur      2024-07   2025-01     hace 3 d     sin resp. │
│   ▸ clic en la fila = registrar gestión ahí mismo (≤15 s):    │
│     (Llamé, no contesta) (Interesado→cotizar) (No por ahora)  │
└───────────────────────────────────────────────────────────────┘
```

- Ordenada por «hace cuánto compró sin mantenimiento» — la prioridad natural de la campaña.
- Los tres botones de gestión rápida escriben la gestión con su taxonomía oficial (doc 08),
  sin abrir la ficha. «Interesado» salta al cotizador con el cliente cargado (correlativo
  único, D7 — nada especial que construir: el cotizador ya lo hace).
- Se alimenta de las 220 oportunidades de mantenimiento importadas (script
  `importar-crm-mantenimiento.mjs`) y de las que nazcan. Hever también la puede ver (D2 le
  da el todo); Ariana solo la suya (RLS 0095, ya en producción — la vista no inventa permisos).

---

## 8. Lo transversal técnico

### 8.1 Precios tapados (D3) — en el servidor, no en el CSS

- La consulta que arma la ficha del pedido y las listas de postventa **no selecciona** los
  montos de venta cuando el perfil es `es_postventa` (gerencia/admin siguen viendo todo).
  Nada de ocultar con clases: lo que no debe verse no viaja al navegador.
- Lo que postventa **sí** ve del dinero, porque sin eso no despacha: forma de pago y estado
  — `Pagado completo` / `Pago parcial` / `Pago sin registrar` (este último ya existe para el
  legado del Excel y se conserva). Sin montos, sin precios unitarios, sin totales.
- El buscador de equipos y el catálogo que postventa usa para identificar modelos tampoco
  muestran precio de lista.
- `hace_postventa` (Ariana) no entra en esta política: ella es comercial y cotiza — ve los
  precios de lo que vende, como cualquier comercial.

### 8.2 Línea de tiempo desde la asignación (D4)

La ficha de oportunidad del comercial hoy arranca el timeline en su primera gestión. Se le
anteponen los eventos que Central ya registra (la «ruta del contacto»): **recibido** (fecha/hora
de Central) → **derivado** → **asignado a ti** → primera gestión → … Visualmente separados
(gris, antes de una línea «tu gestión empieza aquí») para que el comercial vea el reloj que
gerencia va a mirar. No se crea dato nuevo: es exponer al comercial lo que Central ya tiene.

### 8.3 Almacenamiento de evidencias (acordado en la reunión)

- Fotos de informes: se optimizan antes de subir (ya es el hábito con las cotizaciones);
  los **videos no se suben** por ahora — se registra la ruta de la carpeta del servidor de
  planta en el informe (campo texto), que es donde viven hoy.
- Al llegar a 7–8 GB se respalda al servidor y se enlaza la ruta. Nota para entonces: R2 ya
  está operativo para el archivo de PDFs y es el candidato natural — decisión económica de
  Carlos, no técnica; no adelantarse.

### 8.4 Lo que NO se construye todavía (D8 — frontera ERP)

Hasta después de la reunión del viernes 28 con el proveedor del EJB, **no se toca**: pantalla
de almacén, órdenes de almacén como entidad, bandeja de Finanzas, solicitudes de inventario.
El módulo comercial del ERP declara traer logística, pedidos, facturación y cobranzas — todo
eso puede resultar duplicado. El diseño de arriba está cortado a propósito para que ninguna
pieza dependa de esas cuatro cosas.

---

## 9. Orden de ejecución

Cada paquete es desplegable por sí solo. El criterio de aceptación va con cada punto:
si no se cumple mirando la pantalla con el usuario real, el punto no está terminado.

**Paquete A — permisos y verdades (una sesión, sin modelado nuevo):**
1. Navegación por rol del §3 + guard del layout. ✓ Ariana entra y no ve `/postventa` ni sus
   enlaces; Hever ve el menú completo; un comercial raso no ve nada de esto.
2. Precios tapados (§8.1). ✓ En la ficha del pedido como Hever no aparece ningún monto de
   venta y sí el estado del pago; como gerencia se ve todo; el HTML servido a Hever no
   contiene los montos (verificar en la respuesta, no en la pantalla).
3. Renombres «Calendario» y «Casos». ✓ En menú, títulos y migas.
4. Timeline desde la asignación (§8.2). ✓ Una oportunidad derivada por Central muestra
   recibido/derivado/asignado antes de la primera gestión del comercial.

**Paquete B — el calendario (§5):**
5. Vista semana/mes/día alimentada de pedidos y casos, reutilizando `agenda-mensual`.
   ✓ La puesta en marcha programada de un pedido aparece en su día; clic abre la ficha;
   lo sin hora cae en «por programar»; la pestaña «Lista» conserva lo de hoy.

**Paquete C — casos guiados por serie (§6) + informes (D9):**
6. Registro guiado con panel de serie. ✓ Tipear una serie existente pinta equipo, garantía
   y último preventivo; «nunca» sale con ⚠; sin serie el caso queda «equipo sin identificar».
7. `informes_servicio` con los seis tipos y fotos optimizadas. ✓ Un informe de llamada con
   dos fotos queda en el caso y se abre desde el historial del equipo.
8. Derivación sin almacén: registro + calendario + texto de WhatsApp listo. ✓ Derivar
   programa la atención y la deja visible en el calendario del §5.

**Paquete D — la ruta de mantenimiento (§7):**
9. `/comercial/ruta` con las 220 oportunidades importadas y gestión en ≤15 s. ✓ Ariana
   registra «llamé, no contesta» sin abrir la ficha y la gestión aparece en el historial
   oficial de la oportunidad con su taxonomía.

**Después del viernes 28 (ERP mediante):** almacén, Finanzas, órdenes — se rediseñan sabiendo
qué trae el EJB. No antes.

**Preguntas aún abiertas** (siguen del plan 13 §9, no las resolvió esta reunión): desde cuándo
corre la garantía en Lima · si se puede despachar sin cancelación total y quién lo autoriza ·
fichas de repuestos y mantenimiento (Lesly quedó en mandarlas hoy junto con formatos de
informes, planos de preinstalación y la carpeta de evidencias).
