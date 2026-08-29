---
name: crm-cierres-postventa-importados
description: Los cierres de postventa 2024-2026 (informes .doc de R:\) se importaron al CRM el 28-08-2026; quedan 32 por confirmar a mano
metadata: 
  node_type: memory
  type: project
  originSessionId: 14334818-76e3-47a1-a6b6-8d93f2ef1bfe
  modified: 2026-08-28T14:15:33.087Z
---

**Los informes de cierre en Word de `R:\` son el único registro del trabajo de postventa**: el área nunca llevó un Excel maestro como el de los comerciales. Importados el 28-08-2026 con `scripts/importar-cierres-postventa.mjs` (lector compartido en `scripts/lib/cierres-postventa.mjs`, doc en `docs/17-cierres-postventa-importados.md`, migración 0099).

**Lo cargado:** 390 cierres de 537 informes → 145 mantenimientos a **Ariana (C4)** y 245 repuestos a **Hever (PV)**; 28 clientes nuevos, 389 ventas (US$ 226.730 + S/ 139.493) y **216 máquinas al parque instalado, que tenía 10**. Fuera quedaron las 109 ventas de EQUIPO (son del comercial que las hizo, no del área).

**Reglas que decidió Darwin el 28-08:** solo mantenimientos y repuestos; mantenimiento→Ariana, repuesto→Hever, y un servicio *con* repuestos va a Ariana; la cuenta NO cambia de dueño (solo se crean las que faltan).

**OJO — la carpeta «COPIA DE CIERRES POST VENTA BRENDA 2023» no es de 2023**: sus 80 archivos son byte a byte los de «CIERRES DE POST VENTA 2026» de Hever. Se ignora.

**Pendiente:** `docs/cierres-postventa-a-confirmar.xlsx` — 32 cierres que el lector no puede jurar (montos altos o ítem raro, incluidas ventas de equipo grandes como Hospital de Jaén S/ 287.500 y Sinohydro S/ 406.915). Hever o Ariana llenan la primera columna con equipo/mantenimiento/repuesto y se vuelve a correr el importador; lo confirmado manda y lo ya cargado no se duplica (`oportunidades.documento_origen`).

**Tampoco se generó el `informes_servicio` de esos 390 cierres**: la máquina muestra la fecha del último mantenimiento pero no el documento.

Relacionado: [[crm-postventa-procedimiento]], [[proyecto-crm-efameinsa]], [[entorno-windows-darwin]].
