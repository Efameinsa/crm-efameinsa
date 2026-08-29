# Plan de ejecución — Ajustes del CRM pedidos en la reunión del 21-08

> **Para quien ejecute este plan (Sonnet u otro): léelo entero antes de tocar
> nada, y lee también el `CLAUDE.md` del repo.** La sección 8 lista trampas
> reales de esta base de datos, cada una descubierta rompiendo algo en
> producción. No es documentación decorativa.

Versión 1.0 — 2026-08-21 · Elaborado por Santos Lenin Vilcachagua Ayala
Fuente: reunión con el ing. Carlos, transcripciones en
`Downloads/reunion 21 de agosto/1.txt, 2.txt, 3.txt`.

---

## 0. Estado del proyecto al arrancar

- **La última migración aplicada es la `0053`. La tuya es la `0054`.** Antes de
  escribirla corre `ls supabase/migrations/` y confirma.
- **Las unidades de red están accesibles** (`R:` `S:` `T:` `U:` `V:` `O:`).
  `R:` tiene los Excel de los comerciales — es la fuente del Bloque A.
- Cifras vigentes hoy: **14.137 cuentas**, **626 ventas** por US$ 4.200.024,
  **5.559 cotizaciones** en el archivo, **39.297 leads**.
- Comerciales activos: C1 Brenda Taboada (antes C8), C2, C3, C4, C5 Katerine
  Tello, C9, PV Post Venta. **PV no vende: cotiza repuestos y servicio.**
- **Plazo real: los comerciales deben poder trabajar en el CRM el lunes.** El
  Bloque A es lo que lo hace posible; el resto puede esperar.

---

## 1. Qué pidió Carlos (textual)

Carlos se puso en el rol de **comercial nuevo** y probó el CRM en vivo. Sus
palabras, que son el criterio de aceptación de este plan:

> «Me van a pasar esta cartera, ¿qué hago? ¿Cómo identifico las oportunidades?
> **Ahí no hay forma.**»

> «Mi cartera es todo los clientes anteriores, todo lo que han sido ventas.
> **Mis oportunidades, ¿cómo las veo?**»

Y describió exactamente cómo trabaja hoy con el Excel:

> «Yo filtro primero a **empresas** porque hay muchas personas naturales, y
> luego me voy a la **descripción del estado**... lo que tengo que ver es el
> estado, cuál es su estatus: esperar, negociar, venta, cotizado, no responde,
> dar de baja, **a futuro**. Los "a futuro" sí me interesan porque hice toda la
> gestión hace 3 meses y me dijo "llámame en agosto". Entonces filtro julio,
> agosto, y comienzo a presionar.»

---

## 2. El hallazgo que cambia la prioridad de todo

**Hoy el CRM no tiene ni una sola oportunidad en etapa intermedia.**
Comprobado contra la base:

```
etapa   | origen           | cantidad
--------|------------------|---------
venta   | historico_excel  | 1.297      ← todas
```

Las 1.297 oportunidades existentes son **ventas ya cerradas**. No hay ninguna
`asignada`, `filtrada`, `cotizada`, `seguimiento` ni `potencial`. Y las 1.297
tienen `intencion = 'sin_definir'`.

**Por eso Carlos no encontraba sus oportunidades: literalmente no están.** La
importación anterior extrajo de los Excel solo las filas con `ESTADO =
C4_VENTA` y descartó todo lo demás. El comercial que entre el lunes a «Mis
oportunidades» va a ver una pantalla vacía y va a volver a su Excel — que es
exactamente lo que Carlos teme:

> «Si no, ¿saben lo que le vamos a obligar? A estar mirando su Excel a cada
> rato. Te aseguro, van a estar así. ¿Pero por qué se perdió el tiempo?»

**No es un problema de UI. Es que faltan los datos.** Cualquier filtro que
construyas sobre la pantalla actual filtrará un conjunto vacío.

---

## 3. BLOQUE A — Importar las oportunidades históricas ⭐ *(lo primero)*

### 3.1 La fuente existe y está completa

Los Excel de `R:` tienen las hojas `PROSP.` y `COTIZ.` con **exactamente** las
columnas que Carlos describió:

| Columna del Excel | Para qué sirve |
|---|---|
| `ESTADO` | El estatus que él filtra (`C3_Esperar`, `P1_F_Realizado`…) |
| `E_FINAL` | Agrupador de estado |
| `ACCION_FUT` | Qué toca hacer (`Llamar`, `Filtrar`, `Enviar_PPTO`…) |
| **`F_ACCION`** | **Fecha de la próxima acción — el «llámame en agosto»** |
| `F_ESTADO` | Fecha del último cambio de estado |
| `DESCRIPCION ESTADO` | La nota del comercial |
| `INT_COMPRA` | Intención (`Alto_POTENCIAL`, `Medio_Alto`…) |
| `NOMBRE_RAZON SOCIAL`, `DNI_RUC`, `RUBRO`, `DEPART` | Identificación |
| `PROV_PROSP`, `BD_PROSP` | Procedencia y si es nuevo o repite |
| `Nro_PPTO`, `MONTO`, `EQUIPO` | Cotización asociada |

### 3.2 Volumen real, ya medido

Escaneé los 22 archivos de `R:` (no lo repitas, aquí están los números):

- **153.001 filas** en `PROSP.` + `COTIZ.`
- **El Excel agrega UNA FILA POR GESTIÓN, no por cliente.** `C3_Esperar`
  aparece 52.808 veces: no son 52 mil prospectos, es la misma gente con
  seguimientos repetidos.
- Deduplicando por **(comercial, cliente) y quedándote con la fila de
  `F_ESTADO` más alto** → **15.016 oportunidades reales**.

Reparto por comercial:

| Comercial | Clientes | | Comercial | Clientes |
|---|---:|---|---|---:|
| C5 | 9.712 | | C9 | 93 |
| C4 | 4.175 | | C2 | 90 |
| C8 → C1 | 935 | | C1 | 11 |

**8.818 de las 15.016 traen fecha de próxima acción** (`F_ACCION`). Ese es el
dato que hace funcionar el «filtro julio, agosto y comienzo a presionar».
Solo 2.807 traen documento — consistente con el problema de cuentas SIN_DOC.

### 3.3 Mapa de estados → etapa del CRM

**Cópialo tal cual. Está construido sobre `docs/08-taxonomia-oficial-efameinsa.md`
(el manual oficial EF-CRMAGE-COM-2020) y sobre los estados que realmente
aparecen en los archivos**, que incluyen variantes con espacios de más y
códigos que el manual no documenta.

| `ESTADO` del Excel | Últimos | → `etapa` | Nota |
|---|---:|---|---|
| `C3_Esperar` | 5.260 | `seguimiento` | Cotizado, esperando decisión |
| `P1_F_Realizado` | 3.653 | `filtrada` | Filtro hecho, sin cotizar |
| `C4_Rdo_ FUTURO` | 1.678 | `rechazada` | **Recuperable** (ver 3.6) |
| `P1_F_Realiz_Y_Cotizado` | 564 | `filtrada` | |
| `C3_No_Responde` | 546 | `seguimiento` | |
| `(vacío)` | 527 | `asignada` | Nunca se trabajó |
| `P2_Esperar` | 467 | `seguimiento` | |
| `P2_No_Responde` | 400 | `seguimiento` | |
| `C1_PTO_Conf` | 319 | `cotizada` | Presupuesto enviado y confirmado |
| `C4_Rdo_ DAR_BAJA` | 288 | `rechazada` | Sospecha de competencia |
| `P3_Rdo_DarBAJA` | 275 | `rechazada` | Ídem |
| `C4_VENTA` | 265 | `venta` | **Ya importadas — ver 3.5** |
| `P3_Rdo_FUTURO` | 199 | `rechazada` | Recuperable |
| `P1_F_Deriv_Actua` | 152 | `filtrada` | ⚠️ **preguntar a Carlos** (§9) |
| `P3_R_COTIZAR` | 87 | `cotizada` | Pasó a la hoja COTIZ. |
| `C3_Seg_Potencial` | 66 | `potencial` | Espera OC o depósito |
| `C1_PTO_Veces` | 61 | `cotizada` | Presupuesto enviado varias veces |
| `P1_F_Pendiente` | 50 | `asignada` | Filtro pendiente |
| `C2_Reu_ Showroom` | 40 | `seguimiento` | + actividad `showroom` |
| `C4_Rdo_ COMPET` | 32 | `rechazada` | + motivo «competencia» |
| `C4_Rdo_Derivado` | 25 | `derivada` | |
| `P1_F_Realiz_ Y_Cotizado` | 14 | `filtrada` | Variante con espacio |
| `P3_Rdo_Derivado` | 12 | `derivada` | |
| `H_Trasladar_CRM` | 11 | `asignada` | ⚠️ prefijo `H_` — §9 |
| `C2_Reu_Online` | 8 | `seguimiento` | + actividad `otro` |
| `C2_Reu_Exterior` | — | `seguimiento` | + actividad `visita` |
| `C1_GC_ xAprobar` | — | `cotizada` + `pendiente_gerencia` | |
| `C1_PTO_SIN_ Conf` | — | `cotizada` | Enviado, sin confirmar recepción |
| `C3_Negociar` | — | `seguimiento` | Pide mejor precio |
| `H_ESPERAR` / `H_Esperar` / `H_NoResp` | — | `seguimiento` | ⚠️ §9 |
| `H_Rdo_Futuro` / `H_Rdo_DarBaja` | — | `rechazada` | ⚠️ §9 |
| `P1_F_Realiza do` | 3 | `filtrada` | Typo evidente |
| `c` | 1 | descartar | Basura |

**Normaliza el estado antes de mapear**: `trim()`, colapsar espacios internos y
comparar en mayúsculas. Si no, `C4_Rdo_ FUTURO` (1.678 clientes) no casa con
`C4_Rdo_FUTURO` y se pierde el bloque más grande de recuperables.

**`INT_COMPRA` → `intencion`** es directo, el enum ya tiene los 5 niveles:
`Alto_POTENCIAL`→`alto_potencial`, `Medio_Alto`→`medio_alto`, `Medio`→`medio`,
`Medio_Bajo`→`medio_bajo`, `Bajo`→`bajo`, vacío→`sin_definir`.

### 3.4 Cómo hacerlo (tres fases, no lo hagas de una)

**Fase 1 — extraer a JSON, sin tocar la base.**
`scripts/extraer-oportunidades-historicas.mjs` → `scripts/data/oportunidades-historicas.json`.
Recorre `R:` (los 22 archivos), lee `PROSP.` y `COTIZ.`, dedupe por
(comercial, cliente normalizado) con `F_ESTADO` máximo, y **emite un reporte de
cobertura**: cuántos clientes por comercial, cuántos por etapa resultante,
cuántos con fecha de acción, cuántos sin estado reconocido. **Ese reporte se
revisa antes de seguir.** Si aparece un estado que no está en la tabla de 3.3,
páralo y anótalo: no inventes un mapeo.

**Fase 2 — dry-run del cruce contra las cuentas existentes.**
El cliente del Excel tiene que casar con una `cuenta` del CRM. Reglas:
- Casar por **documento** cuando lo haya (2.807 casos) — es la llave dura.
- Si no, por **razón social normalizada + comercial** (misma normalización que
  `scripts/lib-fusionar-cuentas.mjs`).
- **Reusa `esComodin()` de ese mismo módulo**: hay ~200 cuentas llamadas «SIN
  NOMBRE», «SIN DATOS», «ND». **Nunca cases contra un nombre comodín** — son
  clientes distintos, no el mismo.
- Si el nombre normalizado cae en dos cuentas, **no adivines**: déjalo en la
  lista de revisión.
- Lo que no case crea cuenta nueva, con su comercial como dueño.

El dry-run imprime: cuántas casan por documento, cuántas por nombre, cuántas
crean cuenta nueva, cuántas quedan ambiguas.

**Fase 3 — aplicar, en una transacción, con backup previo.**
`node --env-file=.env.local scripts/backup-datos.mjs` **antes**, siempre.
Crea las oportunidades con `origen = 'historico_excel'`, `etapa` del mapa,
`intencion`, `proxima_accion` (de `ACCION_FUT`), `proxima_accion_at` (de
`F_ACCION`), `procedencia` (de `PROV_PROSP`), y **una actividad `tipo='nota'`
con la `DESCRIPCION ESTADO`**, fechada con `F_ESTADO`.

### 3.5 Lo que NO debes duplicar

**Las 265 oportunidades con último estado `C4_VENTA` ya están importadas**
(son parte de las 1.297 existentes). Antes de crear una oportunidad, comprueba
si esa cuenta ya tiene una con `etapa='venta'` del mismo período. **Si
duplicas ventas, inflas la facturación** — ya pasó una vez en este proyecto:
268 filas duplicadas inflaron US$ 1.971.484 (ver `scripts/deduplicar-ventas-historicas.mjs`).

### 3.6 Lo que esto habilita en pantalla (después de importar)

Recién con los datos cargados tiene sentido tocar `/comercial/oportunidades`
(`src/components/crm/vista-oportunidades.tsx`). Lo que Carlos necesita poder
hacer, en su orden:

1. **Filtrar empresas vs personas naturales.** Él empieza por ahí siempre.
   Deriva de `cuentas.tipo_doc` (`RUC` = empresa, `DNI` = persona) y, para las
   `SIN_DOC`, de si la razón social tiene marca societaria (SAC, EIRL, SRL…) —
   hay lógica lista en `scripts/fusionar-cuentas-mismo-nombre.mjs`.
2. **Filtrar por etapa** — ya existe el filtro, pero hoy no filtra nada.
3. **«Para retomar»: oportunidades con `proxima_accion_at` en un rango.** Es el
   «filtro julio, agosto y comienzo a presionar». 8.818 tienen esa fecha.
4. **Filtro de tiempo** sobre la lista (pedido explícito, ver Bloque C).

**Ojo con el volumen:** C5 tendría 9.712 oportunidades. Esa pantalla **no
puede traerlas todas** — ver la trampa del tope de 1.000 en §8. Necesita
paginación del lado del servidor, como se hizo con `/comercial/cartera` en el
commit `37e1919`.

---

## 4. BLOQUE B — Arreglos del informe de cierre

Carlos los encontró probando con un cliente real. Son chicos y concretos.

### 4.1 Fecha y hora de entrega deben ser selectores

Hoy son `<Input>` de texto libre en
`src/components/crm/formulario-informe.tsx`. Palabras de Darwin en la reunión:
*«Ahí está mal. Eso es un error.»*

- **Fecha de entrega** → calendario. Ya existe `src/components/crm/selector-fecha.tsx`.
- **Hora de entrega** → selector de hora. Ya existe `src/components/crm/selector-hora.tsx`.
- **Pero conserva la posibilidad de texto libre**: el valor real más usado hoy
  es «INMEDIATA AL PAGO DEL 50%» y «Por confirmar», que no son fechas. La
  solución correcta es un selector **más** una opción «a convenir / por
  confirmar», no reemplazar el texto por un calendario y perder ese caso.

### 4.2 La modalidad de pago tiene que ser ampliable

Hoy es una lista fija de 4 en `MODALIDADES`. **Está incompleta y siempre lo va
a estar.** De la reunión:

- La política general de la empresa es **30 % adelanto + 70 % antes del
  despacho** — y esa combinación **no existe** en la lista actual.
- Esa misma semana aceptaron una nunca antes usada: **50 % adelanto + 35 %
  antes del despacho + 15 % a la puesta en marcha**.
- Carlos: *«Hay un abanico ahí… ¿cómo la ampliamos?»*

Diseño recomendado: las opciones frecuentes como casillas (contado, crédito,
30/70, 50/50, 50/35/15) **más un campo libre** para la combinación negociada,
que es lo que ocurre en la práctica. Guarda en `informes_cierre.modalidad_pago`
(ya es `text[]`, no hace falta migración) y refleja el texto libre en el PDF.

### 4.3 Confirmado que ya funciona bien — no lo toques

- La dirección de entrega se autocompleta con la del cliente **y es editable**
  (caso real: cliente de Arequipa que pide despacho a Moquegua).
- La validación bloquea emitir sin lugar de entrega.
- El borrador no gasta número de informe.

---

## 5. BLOQUE C — Vista «mis cotizaciones» con filtro de tiempo

Pedido explícito y textual de Carlos:

> «Yo he cotizado el mes pasado un equipo para este cliente. ¿Cómo puedo
> filtrar mis cotizaciones? ¿Dónde veo mis cotizaciones en general, las que he
> realizado? Por día, semana, mes, año.»

Hoy solo existe la columna «cotizada» dentro de Mis oportunidades, **sin filtro
de tiempo**. Lo que se necesita:

- Lista de las cotizaciones del comercial, **uniendo `cotizaciones` (del CRM) y
  `cotizaciones_historicas` (del archivo)** — el comercial no distingue entre
  las dos, y para él las del archivo son la mayoría (C5 tiene 953 solo en 2026).
- Filtro de período reutilizando `src/components/crm/filtro-periodo.tsx` y
  `src/lib/periodo.ts` (ya manejan hora de Lima).
- Cada fila con enlace a su PDF: las del archivo por
  `/api/cotizaciones-historicas/[id]/pdf`, las del CRM por `/api/cotizaciones/[id]/pdf`.
- **Paginación del lado del servidor** — mismo motivo que siempre (§8).

---

## 6. BLOQUE D — Las 825 cotizaciones sin cuenta

Durante la demo abrieron un cliente y **no tenía cotizaciones cargadas**,
mientras que el siguiente sí. Medido en la base:

```
cotizaciones_historicas : 5.559
  con cuenta enlazada   : 4.734  (2.897 cuentas distintas)
  SIN cuenta            :   825  ← el hueco que vio Carlos
```

El enlace se hizo por teléfono normalizado y razón social exacta. Tras las
fusiones de cuentas de esta semana, **muchas de esas 825 probablemente ya
casan**. Tarea:

1. Reintentar el cruce con las reglas actuales (documento primero, después
   nombre normalizado, nunca contra nombres comodín).
2. Reportar cuántas se recuperan y cuántas quedan.
3. **No forzar las que queden ambiguas** — mejor 700 enlazadas bien que 825 mal.

---

## 7. Qué NO hay que hacer

- **No** rehacer «Mi cartera»: ya se arregló (paginada, con total real de 8.775
  para C5, commit `37e1919`).
- **No** tocar el correlativo de cotizaciones ni el de informes.
- **No** crear una tabla nueva de «estados»: el `ESTADO` del Excel se traduce a
  `etapa` + `intencion` + `proxima_accion`, que ya existen.
- **No** aplicar nada del Excel de SUNAT (se genera con `scripts/lista-ruc-a-confirmar.mjs`; no se versiona) —
  Carlos pidió tiempo para revisarlo. Palabras suyas: *«esto es un poquito
  delicado, si cambio el RUC se le atribuye todo a este nuevo, todas las
  cotizaciones, todos los registros».*
- **No** borrar ni fusionar cuentas en este trabajo. Ese frente está a medias y
  con su propia lista de revisión (`scripts/data/cuentas-a-revisar.json`).

---

## 8. Trampas de esta base de datos (todas costaron un error real)

1. **Supabase corta en 1.000 filas por consulta, sin avisar.** Cualquier
   `select` sobre `cuentas`, `oportunidades`, `ventas` o `leads` sin
   paginación explícita es un bug latente. Ya pasó tres veces: el kanban de C5
   salía vacío, los reportes de gerencia contaban truncado, y «Mi cartera»
   mostraba 1.000 clientes de 8.775. **Si ves un número redondo, desconfía.**
2. **Al importar de un Excel donde una fila = un evento, agrupa siempre antes
   de crear registros.** 268 filas duplicadas inflaron US$ 1.971.484 porque el
   importador creó una venta por fila de equipo.
3. **Nunca filtres clientes por nombre con `test|demo|prueba`**: devuelve
   TESTIGOS DE JEHOVÁ, CIVILTESTING, TESTRUCTURA y dos NICODEMO — clientes
   reales.
4. **«SIN NOMBRE» no es un cliente: son ~200 clientes distintos.** Usa
   `esComodin()` de `scripts/lib-fusionar-cuentas.mjs`.
5. **Los archivos del repo están en CRLF.** Normaliza antes de buscar anclajes
   multilínea en scripts de parcheo.
6. **`"use server"` solo exporta funciones asíncronas.** Una constante
   exportada desde `src/lib/acciones/*.ts` rompe la compilación con «Failed to
   collect page data», que no dice nada de la causa real.
7. **Base UI imprime el `value` crudo si no le dices qué pintar** en
   `Select.Value` — así salía `alto_potencial` en pantalla.
8. **Las actividades `tipo='nota'` son el histórico importado.** El indicador
   de seguimientos efectivos las excluye a propósito. Si importas notas
   nuevas, no rompas eso.
9. **Verifica en producción con sesión real**, no con `curl` pelado: el proxy
   de auth manda a `/login` a cualquiera sin sesión. Usa
   `scripts/probar-ver-pdf-prod.mjs` como modelo (magic link → cookie
   `sb-<ref>-auth-token`); sirve para cualquier ruta.
10. **Para verificar textos en el HTML, quita antes los `<!-- -->`**: React los
    intercala entre expresiones JSX y arruinan cualquier regex ingenua.

---

## 9. Preguntas para Carlos — NO las decidas tú

Anótalas y pregúntalas; cada una cambia a qué etapa va un grupo de clientes:

1. **`P1_F_Deriv_Actua`** (3.705 filas, 152 como último estado): ¿es «derivado
   a otro comercial» o «datos actualizados»? El manual no lo documenta. Por
   defecto lo mapeo a `filtrada`, pero si es derivación va a `derivada`.
2. **Los estados con prefijo `H_`** (`H_ESPERAR`, `H_NoResp`,
   `H_Trasladar_CRM`, `H_Rdo_Futuro`, `H_Rdo_DarBaja`): ¿«H» es histórico?
   ¿Se trabajan o son archivo muerto?
3. **`C1_PTO_Veces`**: entiendo que es «presupuesto enviado varias veces».
   Confirmar.
4. **Los 1.678 clientes en `C4_Rdo_FUTURO`**: ¿entran como oportunidad
   `rechazada` visible y recuperable, o se esconden? Son el mayor stock de
   reactivación y se cruzan con el plan de marketing.
5. **Las 527 filas con estado vacío**: ¿se cargan como `asignada` o se
   descartan?
6. **Los informes de cierre históricos**: Carlos ofreció mandarlos. Si llegan,
   entran como histórico aparte, sin tocar el correlativo (que arranca en
   OPEN 005-2026 y EFAMEINSA 001-2026).

---

## 10. Orden de trabajo y criterios de aceptación

**Haz los bloques en este orden.** A es lo único que bloquea el lunes.

| # | Bloque | Criterio de aceptación |
|---|---|---|
| 1 | **A** — importar oportunidades | Katerine abre «Mis oportunidades» y ve miles, no cero. Puede filtrar por etapa y por «para retomar este mes». El total de ventas sigue siendo **626 / US$ 4.200.024** (no se duplicó nada) |
| 2 | **B** — informe de cierre | Fecha y hora son selectores con opción «por confirmar»; la modalidad 30/70 se puede registrar |
| 3 | **C** — mis cotizaciones | C5 filtra sus cotizaciones del mes pasado y abre el PDF de una |
| 4 | **D** — 825 huérfanas | Reporte de cuántas se recuperaron; ninguna enlazada por adivinanza |

**Antes de dar por terminado cualquier bloque:**

```bash
npx tsc --noEmit && npx eslint src scripts && npx vitest run && npm run build
```

Las 118 pruebas tienen que seguir pasando. Y **verifica en producción con una
sesión real** — no alcanza con que compile.

**Commits:** en español, explicando *por qué* además de *qué*, siguiendo el
estilo del repo. Y **nunca `git add -A` sobre `scripts/`**: hay dos archivos de
datos de Darwin que no son del proyecto
(`ventas-historicas-COTIZ.json`, `stock-inventario-…RAW-sin-verificar.json`).
Agrega archivo por archivo.
