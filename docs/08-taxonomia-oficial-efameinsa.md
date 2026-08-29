# Taxonomía oficial de Efameinsa → CRM

Fuente: **`EF-CRMAGE-COM-2020` "Manual de registro de información CRM – Comercial"**, 40 páginas, fotos de la inducción comercial (páginas 20, 21, 24, 26 y 28 relevadas el 2026-08-18).

Este documento reemplaza las suposiciones que veníamos usando. **Antes de tocar la migración de oportunidades/ventas, leer esto.**

## Corrección importante de un análisis previo

El proceso tiene **dos etapas con dos hojas de Excel distintas**, y yo solo había analizado la primera:

| Etapa | Hoja | Prefijo de estado |
|---|---|---|
| Prospecto | `PROSP.` | `P1`, `P2`, `P3` |
| Cotización | `COTIZ.` | `C1`, `C2`, `C3`, `C4` |

Por eso el informe anterior decía "solo 22 filas con monto, imposible derivar ventas". **Las ventas viven en la hoja `COTIZ.` con estado `C4_VENTA`**: son **1,559 registros, 848 con monto, ~USD 5.5 millones** acumulados.

## Etapa PROSPECTO — columna `ESTADO`

| Código | Definición oficial | → etapa CRM |
|---|---|---|
| `P1_F_Realizado` | Filtro realizado: **revisar SUNAT, FB, LinkedIn**. Objetivo: saber con quién vas a hablar | `filtrada` |
| `P1_F_Realiz_Y_Cotizado` | Filtro hecho **y** el prospecto dio toda la información para cotizar | `filtrada` |
| `P1_F_Pendiente` | Por la hora no se alcanzó; queda para el día siguiente, o lo ordenó GC | `asignada` |
| `P1_F_Proy_Pend` | Equipos solicitados **en evaluación por Gerencia**; por eso no se cotiza | `asignada` |
| `P2_No_Responde` | Sin respuesta, o responde otra persona. **Indicador: 1 mes insistiendo → Rechazado** | `seguimiento` |
| `P2_Esperar` | Respondió pero no sabe qué cotizar; pide contacto otro día. **1 mes sin responder → Rechazado** | `seguimiento` |
| `P3_R_COTIZAR` | Dio información suficiente para cotizar → **pasa a la hoja COTIZ.** | `cotizada` |
| `P3_Rdo_FUTURO` | Rechazado, **pero los datos sirven para publicidad futura**. No sospechoso de competencia | `rechazada` |
| `P3_Rdo_DarBAJA` | Rechazado y peligroso: **no se encontró su RUC o no es quien dice ser** → sospecha de competencia | `rechazada` |

**Columna `E_FINAL` (agrupador de prospecto):** `P_Por_CONTACTAR` (proceso) · `P.Rechazado_LlamarFUTURO` · `P.Rechazado_DAR-BAJA` · `Prospecto_COTIZAR` · `Prospecto_FALTA_INFORMACION`

**Columna `ACCION_FUT` (prospecto):** `Filtrar` · `Llamar` · `Validar GC` (para dar de baja) · `Derivar_otro` · `Proyecto_Pend` · `FIN_PROSPECTO` (obligatorio al pasar a cotizar)

## Etapa COTIZACIÓN — columna `ESTADO`

| Código | Definición oficial | → etapa CRM |
|---|---|---|
| `C1_GC_xAprobar` | **Presupuesto que necesita aprobación de Gerencia Comercial** por ajuste de precio o equipo sin lista | `cotizada` + `pendiente_gerencia` |
| `C1_PTO_SIN_Conf` | Cotización enviada; se llamó el mismo día pero **no se pudo confirmar recepción** | `cotizada` |
| `C1_PTO_Conf` | Cotización enviada y **confirmada su recepción** (no necesariamente leída) | `cotizada` |
| `C2_Reu_Showroom` | Reunión coordinada en el showroom de la planta de Huachipa | `seguimiento` + actividad `showroom` |
| `C2_Reu_Exterior` | Reunión en la futura lavandería del cliente, fuera de Efameinsa | `seguimiento` + actividad `visita` |
| `C2_Reu_Online` | Videoconferencia | `seguimiento` + actividad `otro` |
| `C3_No_Responde` | No responde. **Indicador: 3 meses sin respuesta → Rechazado** | `seguimiento` |
| `C3_Esperar` | Respondió, sin decisión final; pide otra fecha. **3 meses sin responder → Rechazado** | `seguimiento` |
| `C3_Negociar` | Quiere mejor precio o un beneficio adicional para decidir | `seguimiento` |
| `C3_Seg_Potencial` | **Pidió esperar para depositar el adelanto, o está emitiendo la OC** | `seguimiento` (ver nota ↓) |
| **`C4_VENTA`** | **Aceptó la cotización y se convierte en CLIENTE** | **`venta`** |
| `C4_Rdo_FUTURO` | Rechazado; no sospechoso → va a hoja "rechazado futuro" | `rechazada` |
| `C4_Rdo_DAR_BAJA` | Rechazado; vendedor lo notó nervioso, se considera **peligroso** | `rechazada` |
| `C4_Rdo_COMPET` | Rechazado por competencia (aparece en los datos, no en el manual relevado) | `rechazada` + motivo competencia |

**Columna `ESTADO_FINAL` (agrupador de cotización):** `C_SEGUIMIENTO` · `C_REUNION` · `C_POTENCIAL` · `C_R.LlamarFUTURO` · `C_R.DAR-BAJA` · `C_VENTA`

**Columna `ACCION_FUT` (cotización):** `Llamar` · `Validar_GC` · `Enviar_PPTO` · `Coord_Reunion` · `Derivar_otro` · `FIN_Cotizar` (la cotización fue aceptada y el cliente **ya desembolsó el adelanto**)

## Intención de compra — 5 niveles, no 3

Nuestro enum `intencion_compra` tiene `alta/media/baja/sin_definir`. **El manual define 5 niveles con criterios de comportamiento**, mucho más útiles porque el vendedor sabe exactamente cuál marcar:

| Nivel oficial | Criterio textual | → nuestro enum |
|---|---|---|
| `Alto_POTENCIAL` | Solo en cotización. Espera OC, depósito, o elaborando planos de instalación | `alta` |
| `Medio_Alto` | Tiene local o da fecha exacta; tiene otras cotizaciones | `alta` |
| `Medio` | Está buscando ubicación | `media` |
| `Medio_Bajo` | Está buscando dinero, financiamiento | `media` |
| `Bajo` | "Quiero saber", "me dijeron", "puede ser" | `baja` |

**Decisión pendiente:** ¿extendemos el enum a los 5 niveles para hablar su idioma exacto, o mantenemos 3 y perdemos granularidad? Recomiendo extenderlo — el criterio "está buscando dinero" vs "está buscando ubicación" es información comercial valiosa que hoy se colapsa.

## Notación de montos y equipos (sección 3.1.7)

Cuando una fila tiene varias cotizaciones o equipos, el manual define:

- **`//`** separa cotizaciones distintas
- **`*`** separa equipos dentro de una misma cotización
- **`S/`** antepuesto = monto en soles; sin prefijo = dólares
- **`S`** = equipo semi-industrial · **`IND`** = industrial
- Los equipos se enumeran y la numeración se antepone al tipo

Ejemplo real del manual: `2,435 * 4390 // 1982 * 3980 // 8950 * 9658 * S/ 1950`

**Verificado contra los datos:** de las 848 ventas con monto, **831 son un número simple** — la notación compleja casi no se usa en la práctica. 17 casos raros (algunos tienen el número de presupuesto pegado en la columna de monto por error).

## Reglas de negocio que NO teníamos

1. **Prospecto: 1 mes sin respuesta → Rechazado** (automatizable)
2. **Cotización: 3 meses sin respuesta → Rechazado** (automatizable)
3. **El filtro SUNAT es obligatorio y formal**, no opcional: `P1_F_Realizado` lo define como "revisar SUNAT, FB, LI". Ocurrió **14,414 veces** en el histórico (7,218 + 7,196). Es el mejor candidato a automatización.
4. **Detección de competencia disfrazada de cliente**: `P3_Rdo_DarBAJA` se usa cuando "no se encuentra RUC o no es quien dice ser". El filtro SUNAT cumple una función de seguridad comercial, no solo de datos.
5. **Los rechazados "futuro" son un activo de marketing**: el manual dice explícitamente que sus datos "son importantes para PUBLICIDAD EN FUTURO" → lista de remarketing.

## Lo que esto valida de nuestro diseño

- `C1_GC_xAprobar` **es exactamente la regla R5** que construimos (bajo lista → aprueba gerencia). No la inventamos; ya existía en su manual desde 2020.
- Nuestro enum `etapa_oportunidad` (`asignada, filtrada, cotizada, seguimiento, potencial, venta, rechazada, derivada`) mapea casi 1:1.

### La excepción: `potencial` NO es `C3_Seg_Potencial` (corregido el 29-08)

Aquí decía que las dos coincidían, y por eso la importación tradujo
`C3_Seg_Potencial` → `etapa='potencial'`. Era cierto en agosto, cuando esto se
escribió, y dejó de serlo el **25-08**: con el cuadro semanal del ing. Carlos,
`potencial` pasó a significar **«lo que voy a cerrar esta semana»** y es lo que
alimenta «3. LO QUE QUEDÓ PENDIENTE» del reporte semanal.

En el Excel, en cambio, `C3_Seg_Potencial` es una etiqueta **congelada el día
que el comercial tocó la fila por última vez**. Hay filas de 2021.

El resultado se vio el 29-08: a Brenda le salían 9 clientes «pendientes» y a
Katerine 25, ninguno en negociación. *«No sabemos por qué nos sale como
potenciales»* — y no era culpa de ellas, nunca los marcaron.

Desde ahora:

- `C3_Seg_Potencial` importa como **`seguimiento`**, igual que sus hermanos
  `C3_Esperar`, `C3_No_Responde` y `C3_Negociar`. Sigue en cartera, con todo su
  historial, pero no reclama una semana que no le toca.
- **A `potencial` se llega SOLO trabajando dentro del CRM.** Es una promesa que
  hace el comercial, no una etiqueta que hereda de un archivo.
- Saneo de lo ya importado: `scripts/sanear-potenciales-fosiles.mjs` (63
  oportunidades, reversible con `--revertir`). Respetó las negociaciones vivas
  —las que tienen gestión o cotización hecha dentro del CRM—, que sí deben
  seguir apareciendo en «Por ubicar» hasta que se les ponga fecha de cierre.
- La separación `canal` (cómo llegó) vs `fuente/utm` (qué campaña lo trajo) es correcta: su sistema nunca capturó la fuente real (ver `docs/09` sobre nomenclatura de Central).
