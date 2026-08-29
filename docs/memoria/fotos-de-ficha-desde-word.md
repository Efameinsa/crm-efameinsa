---
name: fotos-de-ficha-desde-word
description: "Las fotos de producto del CRM salen del .docx del equipo, y con el recorte que declara el propio Word (<a:srcRect>)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 309c8478-3b4c-4020-97ca-fdfd5d98499b
  modified: 2026-08-27T15:19:53.716Z
---

Cuando se carga o corrige la foto de un equipo en el CRM, la foto **sale del `.docx` de ese equipo** en `V:\`, no del catálogo PDF ni de ninguna otra fuente. Orden textual de Darwin el 2026-08-27: *«utilizar las fotos de los words, solo esas sirven, una por word (su producto), es obligatorio que sean de word, no lo busques de otra fuente»*.

**Los Word suelen traer pantallazos del navegador (Alibaba, 1440x900, con barra de tareas), no fotos sueltas — pero Word les aplica un recorte y ESE recorte es la foto elegida.** Vive en `word/document.xml` como `<a:srcRect l t r b>`, en milésimas de porcentaje, y dice cuánto se corta de cada lado (los lados sin recorte no aparecen). Hay que leerlo del XML y aplicarlo, nunca recortar por coordenadas puestas a mano: `scripts/cargar-coches-por-color.mjs` toma el dibujo más grande de la hoja (`<pic:pic>` con mayor `<a:ext cx cy>`) y recorta según su `srcRect`.

**Why:** recortando a ojo el 27-08 salió mal el HM-408 blanco — de una grilla de seis coches rotulados por medida elegí el rotulado `1100*790*840` (la medida del HM-408, criterio razonable) y el Word mostraba otro. Darwin lo vio en una cotización real: *«sí es blanco pero es medio gris; el del word es más blanco»*. El gris resultó ser el HM-402 GRIS.

**How to apply:** antes de cargar, **releer la carpeta** — Lesly la rehace seguido y renombra: el 27-08 pasó de 5 archivos a 6 con sufijo de color (`CO402A`/`CO402B`/`CO402G`, `CO408A`/`CO408B`) y reemplazó los pantallazos de los blancos por tomas de estudio. Un cargador que use nombres fijos queda leyendo archivos que ya no existen. Mirar siempre la foto recortada antes de aplicar (el script la genera también en seco). Ver [[fuente-de-precios-crm]] y [[proyecto-crm-efameinsa]].
