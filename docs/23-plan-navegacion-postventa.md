# Plan 23 · La navegación de postventa, de 9 puertas a 6

**Para la sesión que lo ejecute (Sonnet):** este documento es tu pauta completa.
Antes de tocar nada, leé `CLAUDE.md`, `docs/19-estado-y-continuidad.md` (las
trampas conocidas) y `docs/22-backlog-reunion-31-08.md` (las necesidades del
negocio dictadas por el ing. Carlos y por Lesly el 31-08). Reglas duras:
**commitear por archivo explícito, jamás `git add -A`** (hay sesiones
concurrentes), y **no hacer push fuera de las ventanas de la 1 pm y las 6 pm**
— acá el push despliega.

**Quién lo pidió:** Santos, el 31-08, con el ing. Carlos y Lesly de acuerdo:
*«lo vemos confuso, no entendemos cómo fluye todo… siento que es un poco
redundante»*. Tienen razón, y este documento primero demuestra por qué y
después dice exactamente qué construir.

---

## 1 · El diagnóstico: por qué se siente confuso

### 1.1 El menú actual tiene 9 entradas para 5 ideas

Lo que ve hoy la cuenta de postventa (`ENLACES_POSTVENTA` en
`src/components/crm/nav-lateral.tsx`):

| # | Entrada | Ruta | Qué muestra de verdad |
|---|---|---|---|
| 1 | Mi día | `/postventa` | Tres paneles: «Nuevos pedidos» (despachos), «Para esta semana» (calendario resumido), «Casos derivados por Central» (oportunidades) |
| 2 | Mi agenda | `/comercial/agenda` | La agenda mensual del comercial: tareas personales + reporte diario + cierre semanal |
| 3 | Calendario | `/postventa/agenda` | Cuatro pestañas: Calendario, Lista (despachos), Histórico del Excel, Completados |
| 4 | Atenciones | `/postventa/atenciones` | La pista técnica nueva (9 etapas, 31-08) |
| 5 | Casos | `/postventa/casos` | «Casos abiertos» (las MISMAS oportunidades del panel 3 de Mi día) + «Historial de atenciones» (informes) |
| 6 | Equipos instalados | `/postventa/equipos` | El parque de 314 máquinas |
| 7 | Ruta de mantenimiento | `/comercial/ruta` | Campaña de llamadas sobre… las mismas oportunidades |
| 8 | Mis ventas de servicio | `/comercial/oportunidades` | Kanban de… las mismas oportunidades |
| 9 | Clientes | `/comercial/cartera` | La cartera |

### 1.2 Las tres redundancias objetivas

**a) Tres pantallas de tiempo.** «Mi día», «Mi agenda» y «Calendario» responden
la misma pregunta —¿qué tengo que hacer y cuándo?— en tres lugares con reglas
distintas. Y «Mi día» además incrusta un resumen del calendario («Para esta
semana»), o sea que la misma información está en cuatro sitios.

**b) Cuatro puertas al mismo objeto.** Un «caso» ES una oportunidad con
`tipo_postventa`. Esa misma fila de la base aparece en: el panel «Casos
derivados» de Mi día, la lista de «Casos», el kanban de «Mis ventas de
servicio» y la «Ruta de mantenimiento». Cuatro entradas del menú que abren lo
mismo con nombre distinto. Nadie puede formarse un modelo mental así.

**c) Los despachos viven repartidos.** Los pedidos (`servicios_postventa`)
salen en «Mi día» («Nuevos pedidos») y otra vez en la pestaña «Lista» del
Calendario.

### 1.3 La causa raíz, para no repetirla

La pantalla expone **la historia de los modelos de datos**, no el modelo mental
del usuario. Hay tres generaciones conviviendo:

1. `servicios_postventa` — el pipeline de despachos heredado del Excel.
2. `oportunidades` con `tipo_postventa` — la época «reusemos las etapas
   comerciales» (27-08), que parió «Casos» y «Mis ventas de servicio».
3. `atenciones` — la pista técnica de 9 etapas que dictó el ing. Carlos
   (31-08, migraciones 0131/0132).

Cada generación sumó su entrada al menú sin retirar la anterior. El usuario no
tiene por qué saber esa historia.

### 1.4 El modelo mental correcto, en palabras del propio Carlos

Del audio del 31-08: llega algo por Central → se decide si es **atención
técnica** (puesta en marcha / problema) o **venta de servicio** (repuesto /
mantenimiento) → la técnica recorre sus 9 etapas y puede *parir* una venta → la
venta se gestiona como comercial. Aparte: **cuándo** se hace cada cosa
(calendario) y **consulta** (equipos, clientes). Son **cinco ideas**: lo que
llega, la pista técnica, la pista comercial, el tiempo, y la referencia.

---

## 2 · La propuesta: 6 entradas, una puerta por idea

```
┌────────────────────────────┐
│ POSTVENTA                  │
│ ─ Mi día            (3)    │  ← lo que espera MI acuse ahora
│ ─ Atenciones        (12)   │  ← LA cola técnica, única
│ ─ Calendario               │  ← LA vista de tiempo, única
│ ─ Ventas de servicio (5)   │  ← LA pista comercial, única
│ ─ Equipos                  │  ← referencia: el parque
│ ─ Clientes                 │  ← referencia: la cartera
└────────────────────────────┘
```

### 2.1 «Mi día» — bandeja, no tablero

Se queda con UNA sola pregunta: **¿qué llegó y espera que yo lo tome?**

- Los derivados nuevos de Central (atenciones y ventas), con su reloj de SLA
  (garantía 2 h, resto 24 h) — es lo único que apremia por definición.
- Lo programado PARA HOY (no «para esta semana»: eso es del Calendario).
- Los botones de **Reporte del día** y **Cierre semanal**, que hoy viven en
  «Mi agenda» y son la razón por la que esa entrada existe para el área.
- Fuera: «Para esta semana» (duplica el Calendario) y la lista de atrasados
  del Excel (vive en Atenciones → Histórico).

### 2.2 «Atenciones» — la cola técnica única, con pestañas

Absorbe «Casos» entero. Pestañas:

| Pestaña | Contenido | Fuente |
|---|---|---|
| Abiertas | La pista de 9 etapas (lo de hoy) | `atenciones` |
| Casos anteriores | Los casos abiertos viejos (oportunidades `tipo_postventa` técnicas creadas ANTES de la 0132) | `oportunidades` |
| Despachos | La cola de pedidos (lo que hoy es la pestaña «Lista» del calendario) | `servicios_postventa` |
| Cerradas | Atenciones cerradas | `atenciones` |
| Histórico | La hoja del Excel y los informes viejos (lo que hoy es «Historial de atenciones» en Casos + «Histórico del Excel» en Calendario) | mixto |

**Decisión deliberada: NO migrar datos en este plan.** Los casos viejos se
muestran en su pestaña, no se convierten en `atenciones`. Convertirlos mueve
filas de producción y ya sabemos cómo terminan las conversiones apuradas
(fichas partidas, fósiles). Si gerencia lo pide, es un plan aparte con ensayo y
respaldo.

### 2.3 «Calendario» — la única vista de tiempo

Ya existe (`/postventa/agenda`, vistas semana/mes/día, con «Agendar» por día
desde el 31-08). Cambios:

- Pierde las pestañas «Lista», «Histórico del Excel» y «Completados» (se van a
  Atenciones). Queda SOLO el calendario. La entrada de menú «Mi agenda»
  desaparece del área; las **tareas personales** se muestran como eventos acá
  (la tabla `tareas_agenda` ya existe y el diálogo «Agendar» ya las crea).
- Ojo: el comercial que `hace_postventa` (Ariana) NO pierde su «Mi agenda»
  — ella es comercial y su menú es otro (`nav-lateral.tsx` ya los separa).

### 2.4 «Ventas de servicio» — la pista comercial, con la Ruta adentro

El kanban actual, más una pestaña o filtro **«Ruta de mantenimiento»**: la ruta
es una campaña sobre este mismo pipeline, no otro objeto. La entrada 7 del menú
desaparece. (La ruta como URL se conserva — ver transición.)

### 2.5 «Equipos» y «Clientes» — referencia, sin cambios de fondo

Equipos gana lo que le corresponde: el historial de informes de cada máquina ya
enlaza ahí. Clientes queda igual (la ficha ya muestra parque + oportunidades).

### 2.6 Reglas de UX que este rediseño debe cumplir (y las que ya se pagaron caro)

1. **Una puerta por concepto.** Si dos entradas del menú abren el mismo objeto,
   sobra una.
2. **Todo control visible.** Nada de `opacity-0` con hover: ya pasó dos veces
   hoy (el «+ Agregar» de la agenda y el buscador que no decía que buscaba por
   RUC). Una función que no se anuncia no existe.
3. **Contadores en el menú** para las dos colas (Mi día y Atenciones): el
   número es el llamado a la acción.
4. **La pregunta de cada pantalla es «¿qué hago ahora?»**, no «¿en qué estado
   está?» — el patrón `queLeFalta()`/«quién lo tiene frenado» ya existe en
   `lib/atenciones.ts` y `lib/postventa.ts`; usarlo en todas las filas.
5. **Estados vacíos que enseñan** («Las atenciones llegan cuando Central
   deriva; para registrar una llamada use “Registrar atención”»), nunca un
   panel en blanco.
6. **El vocabulario es el de Carlos**: atención, caso, despacho, garantía,
   derivar. Ya hubo tres renombres por nombres que «le mintieron mirando la
   pantalla» — están documentados en `nav-lateral.tsx` y `lib/postventa.ts`.
7. **Sin plata a la vista del área** (`puedeVerPrecios`, decisión del 27-08).
8. **Ancho móvil**: el área usa la PWA instalada; toda tabla ancha con su
   `overflow-x-auto`.

---

## 3 · El plan de trabajo, por etapas

Cada etapa compila, pasa `npx tsc --noEmit`, `npm run build` y `npm test`, y
deja el CRM usable. No empezar una etapa con la anterior a medias.

### Etapa 0 · Leer y confirmar (sin escribir código)
Leé los archivos que vas a tocar ANTES de tocarlos:
`src/components/crm/nav-lateral.tsx` (⚠️ compone el menú de TRES perfiles:
postventa, la cuenta de soporte y operaciones/Lesly — cambiar `ENLACES_POSTVENTA`
los afecta a los tres), `src/app/(app)/postventa/*` completo,
`src/lib/postventa.ts`, `src/lib/atenciones.ts`,
`src/lib/calendario-postventa.ts`.

### Etapa 1 · Atenciones absorbe Casos y los despachos
- Pestañas en `/postventa/atenciones` según §2.2. El embudo de 9 etapas y los
  4 contadores de la cabecera se conservan tal cual (el ing. los validó).
- Las pestañas nuevas REUTILIZAN los componentes existentes de
  `/postventa/casos/page.tsx` y de la pestaña Lista de
  `/postventa/agenda/page.tsx` — extraerlos a componentes compartidos, no
  copiarlos (regla del repo: copiar revivió reglas revertidas tres veces).
- `/postventa/casos` pasa a redirigir a `/postventa/atenciones?ver=casos`
  (mismo patrón que `/postventa/soporte/page.tsx`, que ya es un redirect y
  explica por qué).
- «Registrar atención» sigue derivando a Central (0132) — NO tocar ese flujo:
  Lesly lo definió y gerencia lo aprobó.

### Etapa 2 · Calendario puro y adiós «Mi agenda» del área
- `/postventa/agenda` queda solo con el calendario; sus pestañas viejas
  redirigen a las de Atenciones (`?ver=lista` → atenciones?ver=despachos, etc.
  — hay favoritos guardados, está documentado en el propio archivo).
- Las tareas personales (`tareas_agenda`) se pintan como eventos en el
  calendario del área (hoy solo se crean desde ahí pero se ven en otra
  pantalla, lo cual es absurdo).
- Los botones Reporte diario y Cierre semanal se montan en «Mi día»
  (`BotonReporteDiario`, `BotonCierreSemanal` — ya son componentes sueltos).
- Quitar «Mi agenda» de `ENLACES_POSTVENTA`. Verificar el menú resultante de
  los TRES perfiles (postventa, soporte, operaciones).

### Etapa 3 · Mi día como bandeja
- Según §2.1. Los derivados nuevos unifican atenciones + pedidos + casos en una
  sola lista «Llegó y espera su acuse», ordenada por SLA.
- Quitar «Para esta semana» (enlace al Calendario en su lugar).

### Etapa 4 · Ventas de servicio + Ruta
- Pestaña/filtro «Ruta» dentro de `/comercial/oportunidades` SOLO cuando el
  perfil es de postventa (para el comercial normal el kanban no cambia).
- Quitar «Ruta de mantenimiento» de `ENLACES_POSTVENTA` (⚠️ NO de
  `ENLACE_RUTA` del comercial `hace_postventa`: Ariana la usa como comercial).
- `/comercial/ruta` sigue funcionando como URL.

### Etapa 5 · Contadores y remates
- Contadores en el menú para Mi día y Atenciones (server component; cuidado con
  el costo: una consulta `head: true` por contador).
- Estados vacíos según §2.6.5. Revisar breadcrumbs/«volver» de todas las fichas.

### Qué NO hacer
- No migrar casos viejos a `atenciones` (ver §2.2).
- No tocar `registro-caso.tsx` (flujo por Central, recién validado), ni el
  panel de garantía `equipos-del-cliente.tsx`, ni `linea-atencion.tsx`.
- No renombrar rutas existentes: solo redirigir.
- No tocar nada de `/central`, `/gerencia` ni del comercial puro.
- No desplegar fuera de la 1 pm / 6 pm.

### Verificación final (con las cuentas reales, transacción + rollback donde escriba)
1. Menú de postventa = 6 entradas; el de Lesly y el de soporte siguen coherentes.
2. Todas las URLs viejas redirigen (curl con `redirect=manual`).
3. La cuenta Post Venta ve: sus atenciones, sus casos viejos, sus despachos,
   su histórico — nada desapareció (contar filas antes y después por pestaña).
4. Crear tarea desde el calendario → se ve en el calendario.
5. `tsc`, `build`, `test` y `eslint` limpios (hay 2 errores de lint
   preexistentes en archivos ajenos: no los toques ni los cuentes de más).

---

## 4 · Fuera de alcance de este plan (queda en docs/22)

El cierre semanal del área en dos bloques (M/G5), el registro de llamada G8, el
módulo de almacén (postergado por Santos) y la segunda cuenta del área (Daisy).
Las vistas de los documentos del servidor —informes, fotos y videos— tienen su
propio plan completo en `docs/24-vistas-documentos-del-servidor.md`, que se
puede ejecutar antes, después o intercalado con este sin pisarse.
