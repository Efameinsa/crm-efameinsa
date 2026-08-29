---
name: reporte-fichas-por-codigo
description: "El reporte \"Fichas tecnicas por codigo\" de V:\\ se busca SOLO por codigo exacto y sale de los 4 Excels de V:\\LESLY"
metadata: 
  node_type: memory
  type: project
  originSessionId: bfb91e5a-f47e-45ba-a210-8230f25f9aac
  modified: 2026-08-28T13:24:16.614Z
---

`V:\Fichas tecnicas por codigo v2.xlsx` (28-08-2026) dice, de cada producto codificado por Lesly, dónde está su ficha Word/PDF. Lo generan `scripts/buscar-fichas-por-codigo-v2.mjs` + `.ps1` en el repo del CRM, y `auditar-fichas-por-codigo-v2.mjs` vuelve a comprobar el cruce con otra implementación.

**Why:** la regla que puso Darwin al crearlo es lo que lo hace auditable — **se busca SOLO por código y el código tiene que aparecer COMPLETO, con frontera a los dos lados**. CALE25 no cuenta como CALE251, CO402 no cuenta como CO402A, SECU75 no cuenta como SECU755: son máquinas distintas con precio distinto. La única excepción es el guion comido (`LAVUY2802LAVADORA…` sí es LAVUY2802). Nunca por nombre, modelo ni marca.

**How to apply:** los códigos salen de los 4 Excels de `V:\LESLY` (los 3 maestros CODIFICACION DE EQUIPOS… más el libro «Modificacion de precio y capacidad secadora ut120 26.08.26.xlsx»). Ese último libro **crece en hojas** —el 27-08 estrenó COCHE con 13 códigos y la v1 no la vio porque las declaraba una por una—, así que en la v2 se lee entero (`hojas: "*"`). Manda siempre el libro más nuevo. Los tres maestros se contradicen entre sí (mismo equipo con dos códigos, mismo código para dos equipos): eso no se corrige solo, va a la hoja REVISAR CON LESLY. Ver [[fuente-de-precios-crm]] y [[fotos-de-ficha-desde-word]].
