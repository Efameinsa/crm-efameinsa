---
name: crm-referencia-congelada-en-el-item
description: El precio de referencia se congela dentro del ítem al cotizar; si operaciones cambia el precio después, la vista de gerencia y el control de descuentos quedan al revés
metadata:
  type: project
---

`cotizacion_items.precio_lista` es una FOTO de `precio_referencia_producto()`
tomada al agregar el equipo. El buscador del cotizador, en cambio, lee el precio
VIGENTE. Cuando Lesly corrige un precio después de que el comercial armó el
borrador, /gerencia/aprobaciones muestra el precio viejo — y junto a él quedan
congelados `bajo_lista` y `requiere_aprobacion`, que son la decisión misma.

**Why:** el 29-08-2026 SECU502 (UT055) y SECU55 (UT055L) tenían los precios
cruzados (9.500 ↔ 7.350) y se corrigieron. El borrador de Brenda para MODAS
DIVERSAS DEL PERU SAC quedó pidiendo aprobación por un descuento inexistente y
dejando pasar sin aprobación una rebaja real de USD 501. Mismo circuito roto por
los dos extremos que describió la migración 0091, pero disparado por un cambio
de precio, no por una regresión de código.

**How to apply:** la migración 0128 (aplicada a producción el 29-08-2026) re-mide
los borradores NO enviados con el precio de hoy; las cotizaciones enviadas no se
tocan nunca — su referencia es la del día de emisión. **Queda pendiente y sin
decidir** el arreglo de fondo: que ese re-cálculo se dispare solo cuando
operaciones cambia un precio (trigger sobre `precios_producto`). Mientras no
exista, tras cada recarga del catálogo hay que revisar borradores desfasados con
`scripts/_diag-bug-referencia.mjs`. Ver también [[fuente-de-precios-crm]] y
[[crm-catalogo-maestro-v2]].

Aparte, de catálogo y no de código: SECU502 se llama «SECADORA INDUSTRIAL MOD.
UT055L» pero su modelo es UT055 — nombre idéntico al de SECU55, y por ahí se
cruzaron los precios. Hay 21 productos más llamados solo «SECADORA INDUSTRIAL».
Es para Lesly.
