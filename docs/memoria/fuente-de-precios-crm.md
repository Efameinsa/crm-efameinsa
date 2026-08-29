---
name: fuente-de-precios-crm
description: "En el CRM de Efameinsa el precio válido sale del maestro de Lesly, no de las fichas .docx"
metadata: 
  node_type: memory
  type: project
  originSessionId: 724a9c4c-38bb-489f-8cd7-4ba5af128d0c
  modified: 2026-08-25T22:09:56.677Z
---

La única fuente de precio del catálogo del CRM es el maestro de Lesly, columna **«VALOR DE VENTA»**. Confirmado por gerencia el 2026-08-25: *«lo que vale es la codificación de equipos para marketing que dio Lesly, esos precios se respetan»*.

**Maestro vigente (desde 2026-08-25 tarde): `V:\LESLY\CODIFICACION DE EQUIPOS3.xlsx`** (sucede a `CODIFICACION DE EQUIPOS2.xlsx` y al original «PARA MARKETING»). Convención de Lesly: en cada versión nueva, **lo resaltado en amarillo (FFFF00) son los cambios** — solo eso se aplica (verificado: el diff E2→E3 coincidía exactamente con el amarillo). Scripts: `sincronizar-maestro2.mjs` (alineación completa) y `cargar-resaltados-maestro3.mjs` (patrón para deltas resaltados). Tras el E3 el catálogo quedó en 122 activos; sin precio solo las 3 mesas FENIX con calderín (CALM4/CALM231/CALM18) — cotizar esas pide aprobación de gerencia; SECNSEN sigue sin Word (pedirlo a Jean Paul).

Las fichas técnicas .docx de `V:\` **no** son lista de precios: de 65, solo 4 traen una cifra escrita y el resto son plantillas en blanco (`US$ + I.G.V.`, `00,000.00`). Caso que lo destapó: la **SECA758** (ADC ADG-758V) — su ficha de 2023 dice US$ 5,300 y el maestro dice 8,999. Manda el maestro.

**Why:** Darwin auditó una muestra y encontró la diferencia; la duda vuelve a aparecer cada vez que se compara una cotización contra un Word viejo.

**How to apply:** si aparece otra discrepancia entre ficha y maestro, se pregunta a Lesly o al ing. Carlos — nunca se elige la cifra más baja ni se "corrige" el maestro. Está también en el CLAUDE.md del repo. Ver [[proyecto-crm-efameinsa]].
