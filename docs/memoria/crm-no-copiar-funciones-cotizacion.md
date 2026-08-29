---
name: crm-no-copiar-funciones-cotizacion
description: En el CRM Efameinsa, crear_cotizacion/editar_cotizacion nunca se copian en una migración nueva; se parcha la definición viva con regexp
metadata:
  type: feedback
---

En `crm-efameinsa`, cuando una migración necesite tocar `crear_cotizacion` o
`editar_cotizacion`, NO pegar una copia de la función tomada de una migración
anterior. Hay que leer la definición viva (`pg_get_functiondef`) y parcharla con
`regexp_replace` dentro de un `do $$ ... $$`, levantando excepción si el bloque
buscado no aparece — la técnica que ya usan las migraciones 0074 y 0091.

**Por qué:** cada copia revive reglas ya revertidas. Pasó tres veces: rompió el
reporte diario el 24-08; la 0086 (26-08) y la 0088 (27-08) revivieron la
búsqueda de precio piso por tier (`deseado`/`base`) que la 0074 había reemplazado
por `precio_referencia_producto()`. Como ningún semi-industrial tiene `deseado`
vigente, `precio_lista` salía NULL: la base dejó de marcar los descuentos
(US$451 salieron al cliente sin pasar por gerencia) y el cotizador leía ese NULL
como «equipo sin precio cargado» y pedía aprobación por equipos que estaban a
precio de lista, dejando el borrador sin número.

**Cómo aplicarlo:** antes de escribir una migración que toque esas dos
funciones, volcar la definición viva desde la base y editar solo el bloque
necesario. Ver [[fuente-de-precios-crm]] y [[proyecto-crm-efameinsa]].
