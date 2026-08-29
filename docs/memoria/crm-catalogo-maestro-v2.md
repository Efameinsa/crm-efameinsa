---
name: crm-catalogo-maestro-v2
description: "Las tres decisiones con las que se carga el catálogo del CRM desde el maestro de fichas (coches por color, el maestro manda al pie de la letra, los precios sí se tocan)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 92b201da-a811-487b-a407-c109b8754f4d
  modified: 2026-08-28T15:03:04.092Z
---

Al cargar el catálogo del CRM desde `V:\Fichas tecnicas por codigo v2.xlsx` (28-08-2026, 132 códigos / 120 con ficha), Darwin decidió cuatro cosas que rigen para las próximas cargas:

- **Los coches se cotizan POR COLOR.** Lesly codificó cada color con su propio Word y su foto (CO401A, CO402A/B/G, CO408A/B), así que cada color es un producto y los códigos por modelo (CO401/CO402/CO408) se retiran, aunque el maestro los siga listando. El color va en el `nombre` del producto: sin eso, el comercial ve tres filas idénticas. Reemplazó al selector de color dentro de un solo producto que se había hecho el 27-08.
- **Solo suben los ENCONTRADOS: los que tienen su Word.** Los códigos que el maestro lista sin ficha quedan FUERA del catálogo —«un producto sin descripción ni foto no se puede cotizar»—, aunque el maestro los nombre. Son casi todos el mismo equipo codificado dos veces (SEC75E ≡ SECU75E, CALM23 ≡ CALMI23, LAV135S ≡ LAV1355, 1SECU1701 ≡ SECU1701, SECU754 ≡ SECU752, LAVA060 ≡ LAV060) y entran recién cuando Lesly unifique el código y el archivo se llame igual. No se inventan sinónimos ni se activa el gemelo.
- **Los precios SÍ se actualizan con ese Excel.** Antes la carga de fichas no tocaba precios; desde el 28-08 sí, porque el libro más nuevo de Lesly (`Modificacion de precio y capacidad secadora ut120 26.08.26.xlsx`) es el dato vigente. El precio anterior se cierra con `vigente_hasta`, nunca se borra. Ver [[fuente-de-precios-crm]].
- **El stock y la ubicación también salen de ese Excel** (28-08, tarde). La carga los dejaba pasar —solo conservaba lo que la ficha ya tuviera—, así que los seis coches entraron sin stock y el SECU752 se quedó en 1 cuando el maestro ya decía 2. Ahora viajan con el precio, en el mismo renglón; un renglón en blanco NO borra lo que el CRM ya sabe, porque el reporte no distingue «cero» de «Lesly no lo escribió».

**Why:** nacen del mismo problema — los cuatro Excels de Lesly se contradicen entre sí y el reporte de fichas no lo resuelve solo, lo manda a «REVISAR CON LESLY». Yo activé los 12 sin ficha (los di por buenos «al pie de la letra») y Darwin lo corrigió en el acto: *«solamente debiste subir los encontrados del excel que son como 120»*. El catálogo es lo cotizable, no el índice de códigos.

**How to apply:** `scripts/fichas-v-12-cargar.mjs` las tiene implementadas (catálogo = `conFicha`, precios del maestro). Correr siempre en seco primero. Ver [[reporte-fichas-por-codigo]] y [[fotos-de-ficha-desde-word]].
