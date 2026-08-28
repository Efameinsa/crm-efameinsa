# Plan 17 — Los cierres de postventa 2024-2026 entran al CRM

**Fuente:** las carpetas que Darwin dejó en `R:\` el 27-08-2026 y las decisiones que
tomó el 28-08. Ejecutado el 28-08 con `scripts/importar-cierres-postventa.mjs`.

---

## 1. Qué había en R:\

617 informes de cierre en Word (`.doc`), uno por servicio o repuesto vendido. **Son el
único registro de ese trabajo:** el área nunca tuvo un Excel maestro como el de los
comerciales, así que sin leer estos documentos el CRM no tenía forma de saber qué hizo
postventa en tres años.

| Carpeta | Informes | Qué es |
|---|---|---|
| `COPIA DE CIERRES DE POST VENTA 2026` | 80 | Los de Hever, marzo a agosto de este año |
| `COPIA DE CIERRES POST VENTA BRENDA 2024` | 281 | Año completo |
| `COPIA DE CIERRES POST VENTA BRENDA 2025` | 112 | Año completo |
| `COPIA DE CIERRES POST VENTA BRENDA ENERO - ABRIL 2026` | 64 | Hasta abril |
| ~~`COPIA DE CIERRES POST VENTA BRENDA 2023`~~ | ~~80~~ | **No existe: es una copia** |

**La carpeta «2023» no es de 2023.** Sus 80 archivos son byte a byte los de
«CIERRES DE POST VENTA 2026» —mismos nombres, mismos tamaños, y adentro dicen 2026—:
alguien copió la carpeta equivocada al renombrarla. Cargarla habría duplicado los
cierres de Hever con otro dueño y otro año. Decisión de Darwin: ignorarla y no
buscar más.

---

## 2. Las tres decisiones que ordenaron la carga

| # | Decisión | Por qué |
|---|---|---|
| **Qué entra** | Solo mantenimientos y repuestos. **Los cierres de EQUIPO no entran** | Esas ventas son del comercial que las hizo, no del área, y ya están en el histórico de su Excel |
| **De quién es** | Mantenimientos → **Ariana**; repuestos → **Hever** | Es el reparto de oficios del plan 16: ella vende el mantenimiento, él atiende el equipo. Un servicio CON repuestos va a Ariana: lo que se vendió es el servicio |
| **Qué se crea** | Cliente (si falta) + oportunidad cerrada + venta + máquina en el parque instalado | El rastro completo, para que la serie sirva de trazabilidad (D6) y la ruta de mantenimiento tenga historia real |

**La cuenta no cambia de dueño.** De los 217 clientes de estos informes, 188 ya estaban
en el CRM y la mayoría son de la cartera de otro comercial. Eso no se toca (regla 1 y
migración 0080): lo que se le asigna a Ariana o a Hever es la **oportunidad**, no el
cliente. Solo se crearon las 28 cuentas que no existían, en la cartera de quien atendió
el servicio, que es el único vínculo real que tienen.

---

## 3. Lo que quedó cargado (28-08-2026)

```
537 informes leídos (sin la carpeta duplicada)
109  ventas de EQUIPO           → fuera, son del comercial
  7  sin fecha o sin cliente     → fuera, no hay dónde ponerlos
 32  dudosos                     → fuera, esperan confirmación humana
───
390 cierres importados
     · 145 mantenimientos → Ariana Flores (C4)
     · 245 repuestos      → Post Venta (PV)

 28 clientes nuevos
389 ventas (1 informe no tenía monto legible)
216 máquinas al parque instalado — que tenía 10
```

Facturado importado: **US$ 226.730 y S/ 139.493**, de enero de 2024 a agosto de 2026.

---

## 4. Cómo se lee un informe, y dónde se equivocaba

El lector vive en `scripts/lib/cierres-postventa.mjs` y lo usan la importación y su
ensayo. Tres cosas costaron encontrarlas y están ahí escritas:

1. **El total.** Cada quien lo escribió a su manera —«MONTO TOTAL:», «TOTAL», «TOTAL,
   INCLUIDO IGV», «TOTAL incl. IGV»— y la cifra cae en la celda siguiente de la tabla,
   con tabulaciones en medio. Con la primera versión se leían 117 montos de 617; con la
   definitiva, 615.
2. **Qué se vendió está en el PRIMER ÍTEM de la tabla, no en el documento.** Buscando
   palabras sueltas, la venta de una lavadora de US$ 304.000 salía clasificada como
   «mantenimiento» solo porque el informe promete la instalación y la puesta en marcha.
3. **Hay que saltar la fila de títulos.** Leyendo desde «ÍTEM» lo que se clasificaba era
   el encabezado de la tabla. Y fragmentos como «SUB TOTAL + IGV» quedaban pegados al
   ítem y lo volvían ilegible.

Y una regla invertida a propósito: **en un cierre de postventa, lo que no es un servicio
ni una máquina es un repuesto.** Enumerar nombres de piezas no termina nunca —termistor,
faja, ensamblaje de rodillo, ducto, filtro de pelusa, variador, cable vulcanizado— y cada
nombre que faltaba dejaba el cierre «sin clasificar», que en la práctica significaba sin
importar.

---

## 5. Lo que falta: 32 cierres a confirmar

Están en **`docs/cierres-postventa-a-confirmar.xlsx`** y **no se importaron**. Son los
que el lector no puede jurar: montos altos para un servicio (más de US$ 3.000) o un
primer ítem raro. Entre ellos hay ventas de equipo grandes —Hospital de Jaén por
S/ 287.500, Sinohydro por S/ 406.915— que si se cargaran como repuesto ensuciarían las
cifras del área.

**Cómo se cierran:** alguien que conozca el trabajo (Hever o Ariana) llena la primera
columna con `equipo`, `mantenimiento` o `repuesto`, y se vuelve a correr

```
node --env-file=.env.local scripts/importar-cierres-postventa.mjs           # ensayo
node --env-file=.env.local scripts/importar-cierres-postventa.mjs --aplicar
```

Lo confirmado a mano manda sobre lo que el lector deduzca, y lo ya cargado no se
duplica: cada oportunidad guarda de qué archivo salió (`documento_origen`, migración
0099), que además es el camino de vuelta al papel cuando dentro de un año alguien
pregunte de dónde salió una venta de 2024.

---

## 6. Qué cambia en las pantallas

- **La ruta de mantenimiento de Ariana** deja de estar a ciegas: la columna «Últ.
  mantenimiento» ahora dice *hace cuántos meses* en vez de «no registrado», porque las
  216 máquinas entraron con la fecha de su último servicio y con el próximo preventivo
  agendado a los seis meses (el manual pide entre cuatro y seis).
- **El parque instalado** pasa de 10 a 226 máquinas, con su serie, su cliente y su
  historial — que es lo que hace que el registro guiado de casos por serie sirva de algo.
- **Hever** tiene sus 245 cierres de repuesto como historial propio, y Ariana sus 145
  mantenimientos en la pestaña «Cerrados» de su ruta.

**Pendiente conocido:** de estos 390 cierres no se generó el informe de servicio
(`informes_servicio`), así que el historial de cada máquina muestra la fecha del último
mantenimiento pero no el documento. El `.doc` original sigue en `R:\` y la oportunidad
sabe cuál es.
