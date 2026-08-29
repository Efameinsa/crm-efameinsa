---
name: crm-cierre-expediente
description: El cierre de venta lleva adjuntos (voucher, OC, cotización) y avisa a quién se factura; el informe emitido acepta agregar documentos pero no quitarlos
metadata:
  type: project
---

Pedido de Brenda (C1) el 28-08-2026 —«una opción para poder adjuntar documentos, como fotos o PDFs de vouchers»— que es la misma pieza que el ing. Carlos había pedido el 27-08: «el cierre tiene que estar un poquito más robusto». **En producción desde el 28-08** (migración 0099, commit 3411355).

**Por qué hubo que tocar la inmutabilidad:** el informe emitido no se modifica (migración 0050), pero **el voucher no existe cuando se emite** — con crédito a 30 días llega un mes después de que Central facturó. La regla nueva: de un informe emitido se puede AGREGAR un documento y nada más; lo demás sigue congelado y lo ya adjuntado no se quita ni se reemplaza.

**Trampa al comparar la fila vieja contra la nueva en un trigger BEFORE de `informes_cierre`:** `codigo` es una columna GENERADA y llega SIEMPRE en NULL, así que hay que descontarla (junto con `updated_at`) o ningún update pasa. Costó un rato de depuración.

**El control de identidad** (la otra mitad del pedido de Carlos): la razón social y el RUC del cierre se comparan contra los de la ficha y se muestran arriba, no plegados. La regla está en `avisosDeIdentidad()` de `src/lib/informes.ts`, con pruebas. Motivo real: INVERSIONES NACIONALES DE TURISMO S.A. vive en tres fichas casi idénticas, en tres carteras distintas.

Ver [[crm-postventa-procedimiento]] y [[crm-filtro-origen-crm]].
