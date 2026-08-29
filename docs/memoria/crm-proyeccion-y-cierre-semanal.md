---
name: crm-proyeccion-y-cierre-semanal
description: "Proyección semanal en agenda y reporte diario + cierre semanal (proyectado vs vendido) — en producción desde el 27-08"
metadata:
  type: project
---

Puntos 6 y 7 de la reunión del 27-08 con el ing. Carlos. **En producción**
(commits 5063e25 y f400d68).

**Una sola fuente para el número de la semana:** `resumirSemana()` en
`src/lib/potenciales-semana.ts`. Lo usan los TRES sitios — «Mis potenciales»,
el pie de «Mi agenda» y el PDF del reporte diario (sección 7) — y también el
cierre semanal. Tiene tests (`potenciales-semana.test.ts`) porque el sábado ese
total es contra el que se contrasta lo vendido: si dos pantallas no coinciden,
el cierre discute contra un número inventado.

**Bug que destaparon los tests:** «Por ubicar» recogía también oportunidades
CON fecha, solo que de otra semana — justo la columna de la que Carlos se
quejó. Ahora es sin fecha, literal.

**Cierre semanal:** `/api/reportes/semanal` + `src/lib/cierre-semanal.ts`.
Proyectado − vendido = debe, arriba y en grande; día por día con gestiones; lo
cerrado; lo pendiente. Botón en «Mi agenda» al lado del reporte del día.
Muestra: `npx tsx scripts/render-cierre-semanal.tsx`.

**Criterio que se repitió y conviene mantener:** los cálculos nuevos van en
TypeScript, NO dentro de `reporte_diario_comercial` ni de `supervision_diaria`.
Esas funciones ya se redefinieron una decena de veces y sostienen el informe
diario a gerencia; sumarles bloques es apostar el reporte entero. Ver
[[crm-no-copiar-funciones-cotizacion]].

**En esta máquina NO se puede ver un PDF renderizado** (sin poppler, sin
pdfjs-dist/canvas instalados): se puede generar y verificar que sea un PDF
válido, pero la revisión visual la hace Darwin abriendo el archivo.
