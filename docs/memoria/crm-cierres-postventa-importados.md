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

**29-08 — RESUELTO el problema de Ariana (migración 0124, commit 38ff3ce).** Carlos la vio con «tantas ventas» que no eran suyas (reunión 28-08 3pm): los 145 mantenimientos importados pasaron a Post Venta (PV); la campaña de llamadas (103 oportunidades) sigue siendo de ella. La llave `hace_postventa` (la reparte Lesly en /operaciones/permisos, 0116) ahora abre la **vista completa de servicios**: RLS de solo lectura sobre oportunidades/actividades/cotizaciones con `tipo_postventa`, parque instalado entero e informes de servicio. Ariana la tiene abierta en permanencia (es su oficio); a los demás comerciales se abre al pedir y se cierra al terminar — **ver no es contabilizar**. El **cierre N.º 10 de OPEN-2026 quedó reservado para su primera venta** (`correlativos_reservas`: el contador lo salta, `emitir_informe` se lo entrega y consume la reserva). OJO: sus 385 ventas de `historico_excel` sin `documento_origen` (del maestro) NO se tocaron — existían antes y no fueron el reclamo; decisión aparte si gerencia las cuestiona. Verificado con sesiones reales (Ariana ve 259 repuestos + 418 mantenimientos + 215 máquinas; Katerine sin llave, 0 ajenos).

**29-08 tarde — cargados los cierres de 2023 (commit ecd1168).** La carpeta «BRENDA 2023» de `R:\` dejó de ser la copia equivocada: la llenaron con los 272 informes de verdad (243 de 2023, 10 de fines de 2022), **pero la copia mala de Hever sigue pegada adentro** (subcarpetas EFAMEINSA/ y OPEN/) — por eso `leerTodos` ahora **deduplica por contenido (md5)**, no solo por ruta. Entraron 215 cierres más, **todos a PV**: `DUENO_POR_TIPO` ya no manda nada a Ariana (la regla murió con la decisión de Carlos del 28-08). Totales: 605 informes importados (366 repuestos + 239 mantenimientos, 2022→2026, US$ 336 mil + S/ 190 mil), 314 máquinas en el parque, y el Excel de confirmación va en **39 dudosos** (32 viejos + 7 de 2023).

**29-08 — el cierre 10 de Ariana, emitido.** Su informe a mano («INFORME Nº 0010», Descargas) se registró directo en la base con `scripts/_registrar-cierre-10-ariana.mjs` (no versionado): la oportunidad de su ruta sobre la Congregación de Religiosas Mercedarias Misioneras pasó a venta (US$ 680 sin IGV, 28-08), venta asentada como el flujo normal (`registrar_venta`: monto sin IGV, serie OPEN, origen crm), informe **OPEN 010-2026** emitido con su identidad (la reserva se consumió; el contador sigue en 5 y saltará el 10), y la máquina 804KWCF35059 anotó el mantenimiento. **Es su primera venta que contabiliza** («a partir de ahora ya suma» — Carlos 28-08); el tablero semanal ya la muestra. OJO para consultas: las oportunidades de su ruta son origen=`historico_excel` — filtrar por origen=crm las esconde.
