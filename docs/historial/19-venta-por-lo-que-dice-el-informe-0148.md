# La venta se registra por lo que dice el informe — 01-09-2026

Aviso de **Katerine Tello (C5)** a Santos: «acabo de hacer un cierre de 2.250 y
me salió 6.000, y en mi informe del día también sale 6.000». Cliente
**SIERRA TRAVEL S.R.L. - CASA SAMAYKUY** (RUC 20611555793).

## Qué pasó

| Hora (Lima) | Qué | Cifra |
|---|---|---|
| 26-08 16:38 | Cotiza **Presu_479-26** con dos lavadoras LG: Giant C Max 2.250 + Titan Max 3.750 | US$ 6.000 |
| 01-09 16:34 | Emite el **informe de cierre 011-2026** (OPEN) con una sola línea: la Giant C Max | US$ 2.250 (2.655 con IGV) |
| 01-09 16:38 | Registra la venta desde la cotización | **US$ 6.000** |

El cliente compró una de las dos máquinas. El informe de cierre lo decía bien.
La venta no, porque `registrar_venta` copiaba `cotizaciones.total` tal cual, y
la cotización traía las dos. El informe del día, la agenda y el cierre semanal
leen `ventas.monto_total`, así que en todos salía 6.000. La atadura automática
informe↔venta (0105) funcionó, pero no comparaba importes.

**No es un error de ella.** El CRM no tenía manera de cerrar una parte de una
cotización. La única salida era duplicar la cotización con una sola línea y
registrar la venta desde esa, y nadie se lo había explicado porque el caso no
se había dado.

## Qué se hizo

1. **Migración 0148** — *el informe manda*:
   - `registrar_venta` busca el informe de cierre emitido para ese cliente
     (misma regla conservadora de la 0105: un solo candidato en la misma
     semana o nada). Si lo hay, la venta nace con el importe del informe, sin
     IGV, y queda atada a él en el acto. Si difiere del cotizado, lo anota en
     `ventas.notas`.
   - En el orden inverso (venta primero, informe después) el trigger que ya
     los ataba corrige además el importe de la venta y deja la misma nota.
   - Sin informe emitido, todo sigue igual: la venta nace con el total cotizado.
   - Nueva función `importe_informe_sin_igv(items)`: la misma fórmula que usa
     la aplicación al emitir (excluye el bloque gratuito).
   - Ensayada con `scripts/_verificar-0148-en-transaccion.mjs` sobre el caso
     real, con rollback: 10 afirmaciones, los dos órdenes, otra semana, dos
     candidatos, otro comercial. Aplicada a producción a las 17:50.
2. **La venta de Sierra Travel corregida a 2.250** con
   `scripts/_corregir-venta-sierra-travel.mjs`, con la nota de por qué. El
   informe 011-2026 no se tocó: estaba bien.
3. **Aviso en pantalla**: al registrar la venta, si la cifra salió del informe
   y no de la cotización, el comercial ve un aviso con el número del informe y
   las dos cifras. Antes decía «Venta registrada» a secas.

## Qué queda

- Preguntarle a Katerine si la **Titan Max (3.750)** sigue en negociación o
  se descartó. Hoy la oportunidad quedó cerrada como venta con Presu_479-26
  «aceptada» completa; si el segundo equipo sigue vivo, corresponde una
  oportunidad nueva o reabrir esta.
- Decirles a los comerciales la forma limpia: cuando el cliente compra una
  parte, **duplicar la cotización dejando solo lo vendido** antes de registrar
  la venta. Con la 0148 el importe sale bien igual, pero la cotización
  «aceptada» seguirá diciendo lo que se cotizó, no lo que se vendió.
