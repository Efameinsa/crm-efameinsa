---
name: crm-cuenta-soporte-y-reporte-diario
description: "Lesly ya no es comercial ni soporte — es el rol «operaciones» (autoriza, reparte permisos, mantiene el catálogo); y el reporte diario quedó grabado, así que ya no se manda por correo"
metadata: 
  node_type: memory
  type: project
  originSessionId: 14334818-76e3-47a1-a6b6-8d93f2ef1bfe
  modified: 2026-08-29T00:01:58.504Z
---

**El reporte diario queda grabado** (migración 0100, tabla `reportes_diarios`): una fila por persona y día que se pisa en cada generación —«la última, la del cierre del día, es la que queda»— y guarda `veces`, porque generarlo seis veces mirando el avance no es cerrar el día. Se guardan los DATOS, no el PDF: el documento se redibuja al abrirlo. Pantalla **Gerencia → «Cierre del día»** (`/gerencia/reportes`), que responde lo que el correo no respondía: **quién NO cerró**. Encargo de Carlos del 28-08-2026.

**Lesly = rol `operaciones`** (`lesly@efameinsa.com`, migraciones 0115 y 0116, del 28-08 por la noche). Empezó como cuenta de soporte (0101) y Darwin lo corrigió: *«ella no es una comercial, de ahora en adelante su cuenta será operaciones»*. Antes era `comercial` con marcas, y por eso su menú abría con ocho pantallas —«Mi cartera», «Mis oportunidades»…— que le salían **todas vacías**, y ahí aterrizaba al entrar.

Lo que el puesto hace, todo salido de las reuniones del 28-08:
- **Autoriza** con su código de diez minutos: anular un cierre y corregir una derivación (Carlos, textual: *«eso es justamente como administrador, lo tiene que tener también»*).
- **NO traspasa cartera** — eso es plata de alguien y sigue en gerencia. `validar_pin_supervisor` no la nombra.
- **Reparte permisos**: abre y cierra al comercial la vista para cotizar mantenimiento (`/operaciones/permisos`). La pantalla está escrita para CERRAR, que es lo que nadie pide.
- **Mantiene el catálogo**: productos y precios. Entra a `/admin/productos` y `/admin/catalogos`, no a usuarios.
- **No es gerencia**: `es_backoffice()` no la incluye, así que paneles, comisiones y números de la empresa siguen fuera.

Pendiente de las reuniones para ella: editar una cotización ya numerada conservando el número (caso leasing, 5-10 veces al año) y la cuenta maestra de contraseñas.

Relacionado: [[proyecto-crm-efameinsa]], [[informe-diario-santos]], [[crm-accesos-y-ubicacion]], [[crm-pin-supervisor]].
