---
name: crm-campo-codigo-autorizacion
description: "El código de 4 dígitos se teclea en cuatro casillas grandes (campo-codigo.tsx), y todo mínimo de caracteres se anuncia antes, no al fallar"
metadata: 
  node_type: memory
  type: project
  originSessionId: f45e7f8f-fea2-4caf-a65f-21983e184bfe
  modified: 2026-08-29T17:17:20.581Z
---

Pedido de gerencia el **29-08-2026** sobre el cuadro de corregir una cotización
numerada: «debe decir cuántos caracteres debe tener la razón por la que se
corrige» y «el estilo de letra de los códigos me parece muy delgado, mejora el
ui/ux que se note más moderno».

**`src/components/crm/campo-codigo.tsx`** es ahora el único campo de código de
autorización de la casa: cuatro casillas grandes en negrita, con la casilla
activa resaltada, y **un solo `<input>` transparente encima** — así pegar el
código, borrar y el teclado numérico del celular siguen funcionando sin manejar
foco entre cuatro cajas. Tiene `tono` granate/ámbar. Se usa en corregir
cotización, anular un cierre, asignar contacto y corregir una derivación.

**La regla que vale para toda la app:** si la base exige un mínimo, la pantalla
lo dice ANTES —contador vivo «13 de 15 caracteres mínimos» → «✓ 60 caracteres»—
y el pie del diálogo dice qué falta en vez de dejar el botón apagado y mudo. El
mínimo de 15 del motivo lo pone `abrir_correccion_cotizacion` (migración 0123).

Relacionado: [[crm-pin-supervisor]], [[crm-cotizador-pantalla-propia]].
