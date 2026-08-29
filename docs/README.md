# Documentación del CRM

## Empezar por acá

**[`19-estado-y-continuidad.md`](19-estado-y-continuidad.md)** — dónde está el
sistema, quién es quién, qué falta y las trampas conocidas.

## Lo que gobierna el sistema

Estos documentos no son historia: son las reglas con las que el CRM funciona
hoy. Si algo del código los contradice, el que está mal es el código.

| | |
|---|---|
| [`01-contexto-negocio.md`](01-contexto-negocio.md) | Qué hace la empresa y cómo vendía antes del CRM |
| [`02-modelo-datos.md`](02-modelo-datos.md) | Las tablas y por qué están así |
| [`03-reglas-negocio.md`](03-reglas-negocio.md) | Cartera, precios, aprobaciones, correlativos |
| [`06-feedback-gerencia-2026-08-14.md`](06-feedback-gerencia-2026-08-14.md) | Las decisiones de gerencia que fundaron el sistema |
| [`08-taxonomia-oficial-efameinsa.md`](08-taxonomia-oficial-efameinsa.md) | Rubros, motivos y resultados: el vocabulario oficial |
| [`10-plan-ajustes-reunion-21-08.md`](10-plan-ajustes-reunion-21-08.md) | Decisiones de la reunión del 21-08 |
| [`13-postventa-procedimiento.md`](13-postventa-procedimiento.md) | El procedimiento de postventa, tal como lo dictó gerencia |
| [`14-estandar-ficha-cotizacion.md`](14-estandar-ficha-cotizacion.md) | **La maquetación del PDF.** El código la sigue al milímetro |
| [`15-reglas-lectura-de-fichas.md`](15-reglas-lectura-de-fichas.md) | Cómo se leen las fichas del Word para cargar un equipo |
| [`16-postventa-ux-flujo.md`](16-postventa-ux-flujo.md) | El flujo de trabajo del área |
| [`18-flujo-de-negocio.md`](18-flujo-de-negocio.md) | Cómo viaja la información entre Central, comercial y postventa |
| [`respaldo-y-restauracion.md`](respaldo-y-restauracion.md) | Cómo se respalda y cómo se restaura |

## [`memoria/`](memoria/)

La memoria de trabajo, versionada para que viaje entre máquinas. Se instala con
`node scripts/instalar-memoria.mjs`.

## [`historial/`](historial/)

Los planes que ya se ejecutaron. Cuentan cómo se llegó hasta acá y por qué se
decidió cada cosa; no hace falta leerlos para trabajar, pero explican el porqué
cuando algo parece arbitrario.

## Lo que NO está acá

Los documentos de coordinación —Excel para que alguien los llene, informes que
se mandaron por WhatsApp— **no se versionan**: llevan nombres de clientes, RUC y
márgenes, y no hacen falta para que el sistema funcione. Se generan cuando se
necesitan:

| Para qué | Con qué |
|---|---|
| RUC a confirmar con gerencia | `scripts/lista-ruc-a-confirmar.mjs` |
| Asesores a identificar | `scripts/lista-asesores-cotizaciones.mjs` |
| Cierres de postventa dudosos | `scripts/importar-cierres-postventa.mjs` |
| Cotizaciones fuera del maestro | `scripts/fichas-v-14-reporte.mjs` y afines |
