<!--
  Copia literal del estándar que entregó Darwin el 27-08-2026 en tres carpetas de
  Descargas —«diagramacion lavadoras y secadoras», «diagramacion coches» y
  «diagramacion de prensa de planchado industrial»—. Las tres son la misma norma
  en versiones sucesivas; esta es la última y contiene a las otras dos.

  NO se edita para acomodar al CRM: si un documento no cumple, se corrige el
  documento. Lo propio del CRM va al final, en el apéndice.
-->

# Estándar de maquetación — Fichas de cotización EFAMEINSA

Especificación normativa para generar, migrar y auditar todas las fichas de producto
de las cotizaciones. Todo valor aquí es vinculante: si un documento no cumple, se corrige
el documento, no el estándar.

- **Formato destino:** A4 vertical, para impresión.
- **Origen del estándar:** medición del PDF `ejemplo_coti.pdf` (secadora UNIMAC UT055) y
  alineación forzada al membrete corporativo.
- **Referencia visual:** `ficha_estandar_ejemplo.pdf` (equipo) y `coche_estandar_ejemplo.pdf`
  (coche) son las implementaciones de referencia. Ante cualquier duda de interpretación, esos
  archivos mandan.

### Familias de ficha

Toda la geometría de página es común. Solo cambian el juego de columnas y las reglas de la
columna de imágenes.

| Familia | Qué incluye | Columna de imágenes |
|---|---|---|
| **EQUIPO** | Lavadoras, secadoras, calderas, planchadores | Logo + producto + panel, alineados arriba |
| **COCHE** | Coches de transporte, carros, accesorios sin marca ni panel | Solo producto, centrado vertical y horizontalmente |

---

## 1. Unidades

La unidad normativa es el **milímetro**. Se dan equivalencias en puntos (para Word y
reportlab) y en píxeles a 96 dpi (para HTML/CSS).

| Conversión | Factor |
|---|---|
| mm → pt | × 2.8346 |
| mm → px (96 dpi) | × 3.7795 |
| pt → px (96 dpi) | × 1.3333 |

A4 = 210 × 297 mm = 595.28 × 841.89 pt = 794 × 1123 px.

---

## 2. Geometría de página

| Parámetro | mm | pt | px |
|---|---|---|---|
| Margen izquierdo | **20.0** | 56.7 | 76 |
| Margen derecho | **20.0** | 56.7 | 76 |
| Borde superior de la tabla (desde el borde de hoja) | **29.4** | 83.4 | 111 |
| Límite inferior de contenido (desde el borde de hoja) | **268.0** | 759.7 | 1013 |
| Ancho útil / ancho de tabla | **170.0** | 481.9 | 642 |

**Regla crítica de alineación:** los 20 mm laterales no son arbitrarios. El membrete
corporativo (logo, línea de encabezado, pie de página) está construido a 20 mm del borde
izquierdo. El borde izquierdo de la tabla debe coincidir exactamente con el logo. Cualquier
otro valor produce una desalineación visible en impresión.

**Membrete por marca.** El membrete EFAMEINSA ya está construido a 20 mm. El membrete
OPEN INVESTMENTS S.A.C arranca a 17.5 mm, y debe corregirse: es una imagen anclada en el
encabezado de Word, así que basta desplazarla **+2.5 mm a la derecha** (`wp:positionH`
posOffset de `-291465` a `-201465` EMU). No se altera el margen del documento para acomodar
un membrete mal ubicado; se corrige el membrete. Un único juego de medidas debe servir para
las dos marcas.

**Regla crítica vertical:** ningún contenido puede bajar de los 268 mm. El pie del membrete
empieza en 273 mm; ese colchón de 5 mm es el mismo que existe entre el encabezado y el inicio
de la tabla, y es lo que da simetría a la hoja.

---

## 3. Estructura de la ficha

Cada ítem es una tabla única de 170 mm de ancho con cuatro filas:

```
┌──────────────────────────────────────────────────────────────┐
│ Fila 1  ITEM N.- NOMBRE DEL EQUIPO                            │  10.5 mm
├────────┬────────┬─────────┬──────────┬─────────┬─────────────┤
│ Fila 2  encabezado gris (6 columnas)                          │   9.5 mm
├────────┼────────┼─────────┼──────────┼─────────┼─────────────┤
│ Fila 3  valores (6 columnas)                                  │   9.5 mm
├──────────────────┬───────────────────────────────────────────┤
│ Fila 4           │                                            │
│ IMÁGENES  60 mm  │  DESCRIPCIÓN  110 mm                       │  variable
│                  │                                            │
└──────────────────┴───────────────────────────────────────────┘
```

### 3.1 Fila 1 — título del ítem

- Alto mínimo: **10.5 mm** (30 pt).
- Texto: Arial **Bold 11 pt**, negro, alineado a la izquierda con 2.8 mm (8 pt) de sangría,
  centrado verticalmente.
- Contenido: `ITEM {romano}.- {NOMBRE DEL EQUIPO EN MAYÚSCULAS}`.

### 3.2 Fila 2 — encabezado de especificaciones

- Alto mínimo: **9.5 mm** (27 pt). Relleno: **`#767171`**. Texto: Arial **Bold 9.5 pt**,
  blanco, centrado horizontal y verticalmente.
- Anchos de columna para la familia EQUIPO (6 columnas), de izquierda a derecha:

| # | Rótulo por defecto | mm | pt | px |
|---|---|---|---|---|
| 1 | Marca | **18** | 51.0 | 68 |
| 2 | Modelo | **22** | 62.4 | 83 |
| 3 | Capacidad | **27** | 76.5 | 102 |
| 4 | Calentamiento | **32** | 90.7 | 121 |
| 5 | Panel computarizado | **33** | 93.5 | 125 |
| 6 | Controles Automático | **38** | 107.7 | 144 |

Suma exacta = 170 mm. Los rótulos 5 y 6 se parten en dos líneas; es el comportamiento
esperado, no un error.

**Juego alternativo EQUIPO de 4 columnas** (productos sin panel computarizado, p. ej. prensas
de planchado):

| # | Rótulo por defecto | mm | pt | px |
|---|---|---|---|---|
| 1 | Marca | **41** | 116.2 | 155 |
| 2 | Modelo | **31** | 87.9 | 117 |
| 3 | Calentamiento | **51** | 144.6 | 193 |
| 4 | Controles Automático | **47** | 133.2 | 178 |

**Juego alternativo para familia COCHE** (4 columnas):

| # | Rótulo por defecto | mm | pt | px |
|---|---|---|---|---|
| 1 | Marca | **25** | 70.9 | 94 |
| 2 | Modelo | **29** | 82.2 | 110 |
| 3 | Volumen | **29** | 82.2 | 110 |
| 4 | Stock / Colores | **87** | 246.6 | 329 |

La columna de colores es ancha a propósito: está pensada para listar varios colores de stock.
El valor va como texto centrado en la celda, **nunca dentro de un recuadro anidado**.

Si un producto necesita otro juego de columnas, se conserva la suma de 170 mm y se reparte
proporcionalmente al largo del rótulo más largo de cada columna. Nunca se dejan columnas
por debajo de 18 mm.

### 3.3 Fila 3 — valores

- Alto mínimo: **9.5 mm** (27 pt). Fondo blanco.
- Texto: Arial **Bold 10 pt**, negro, centrado horizontal y verticalmente.
- Mismos anchos de columna que la fila 2.

### 3.4 Fila 4 — cuerpo

- Dos celdas: **60 mm** (imágenes) y **110 mm** (descripción). Suma 170 mm.
- Relación 35 / 65.
- Padding interno de celda: **1.9 mm** (0.19 cm, 5.4 pt) en los cuatro lados.
- Alto: se ajusta al contenido más alto de las dos celdas. **No se estira la fila hasta el
  final de la hoja.** Si el contenido no llega, la tabla termina antes y queda espacio en
  blanco; eso es correcto.

### 3.5 Tabla de condiciones comerciales

Va al final del ítem, pegada al borde inferior de la fila 4 (comparten borde).

| # | Rótulo | mm | pt | px |
|---|---|---|---|---|
| 1 | Precio | **48** | 136.1 | 181 |
| 2 | Tiempo de entrega | **28** | 79.4 | 106 |
| 3 | Garantía | **26** | 73.7 | 98 |
| 4 | Forma de pago | **29** | 82.2 | 110 |
| 5 | Saldo | **39** | 110.6 | 147 |

- Fila de encabezado: alto **12 mm**, relleno `#767171`, Arial Bold 9.5 pt blanco centrado.
- Fila de valores: alto **10 mm**, fondo blanco, Arial Bold 9.5 pt negro centrado.
- Estos anchos ya están calculados para que "Tiempo de entrega" ocupe dos líneas como máximo
  y "Antes del despacho" entre en una sola. No los alteres sin recalcular la suma a 170 mm.

**Juego alternativo para familia COCHE** (4 columnas, sin "Saldo"):

| # | Rótulo | mm | pt | px |
|---|---|---|---|---|
| 1 | Precio | **62** | 175.7 | 234 |
| 2 | Tiempo de entrega | **39** | 110.6 | 147 |
| 3 | Garantía | **29** | 82.2 | 110 |
| 4 | Forma de pago | **40** | 113.4 | 151 |

- **Prohibido el resaltado amarillo** de celdas pendientes de completar. Es una marca interna
  de trabajo que se imprime y llega al cliente. Las celdas sin dato se dejan vacías.

---

## 4. Columna de imágenes (60 mm)

Es la regla que más se incumple hoy. **Todo bloque va siempre centrado horizontalmente sobre
el eje de los 50 mm** de la hoja, en las dos familias.

### 4.1 Familia EQUIPO — tres bloques posibles

| Bloque | Obligatorio | Regla | Ancho | Caja máxima (ancho × alto) |
|---|---|---|---|---|
| Logo de marca | No | 50 % del ancho del producto | **27 mm** | 27 × 14 mm |
| Producto | **Sí** | 90 % del ancho de la columna | **54 mm** | 54 × 96 mm |
| Panel / detalle | No | 65 % del ancho del producto | **35 mm** | 35 × 32 mm |

### 4.2 Reglas de composición (familia EQUIPO)

1. **Orden fijo e inalterable:** logo arriba, producto al medio, panel abajo.
2. **El producto siempre está.** Logo y panel son opcionales y su ausencia solo elimina su
   bloque; los demás suben manteniendo el ritmo vertical.
3. **Ritmo vertical:** 4 mm de aire entre el borde superior de la celda y el primer bloque;
   **8 mm** entre bloques.
4. **Alineación superior**, nunca centrado vertical. La altura del bloque de imágenes no debe
   depender de cuán larga sea la descripción; así todas las fichas arrancan en la misma línea.
5. **Ajuste dentro de la caja:** la imagen se escala conservando su proporción hasta tocar el
   lado que primero llegue al límite de su caja. Nunca se deforma ni se recorta.
   El ancho de la tabla manda sobre el alto salvo que la imagen sea apaisada.
6. **Inserción en línea con el texto**, un bloque por párrafo centrado, con espaciado anterior
   y posterior en 0 y la separación resuelta con espaciado de párrafo. Prohibido usar imágenes
   flotantes o ancladas con posición libre.

### 4.3 Familia COCHE — un solo bloque

Los coches y accesorios **nunca llevan logo de marca ni panel de control**. La columna
contiene únicamente la foto del producto:

| Bloque | Regla | Ancho | Caja máxima |
|---|---|---|---|
| Producto | 90 % del ancho de la columna | **54 mm** | 54 × 96 mm |

- **Centrado horizontal y vertical** dentro de la celda. El eje horizontal es el de los 50 mm;
  el eje vertical es el centro de la fila 4, cuya altura la define la descripción.
- Fórmula de posición vertical: `y_imagen = borde_superior_fila + (alto_fila − alto_imagen) / 2`.
- Esta es la única excepción a la regla de alineación superior: con un solo bloque, la
  alineación arriba deja la celda visualmente vacía en sus dos tercios inferiores.
- Los coches suelen ser apaisados. A 54 mm de ancho, un coche de proporción 1.24 queda en
  43.5 mm de alto: **es correcto**, no se agranda para "llenar" la celda. La caja de 96 mm de
  alto solo entra en juego con productos verticales.

### 4.4 Resolución mínima de los archivos de imagen

Las cajas son medidas de impresión, no de pantalla. Para que la ficha imprima limpia, el
archivo original debe tener al menos **300 ppp al tamaño final**:

| Bloque | Tamaño impreso | Píxeles mínimos del archivo |
|---|---|---|
| Producto | 54 mm | **640 px** de ancho |
| Logo | 27 mm | **320 px** de ancho |
| Panel | 35 mm | **415 px** de ancho |

Las fotos que hoy circulan en las cotizaciones están por debajo de ese umbral (entre 150 y
200 ppp al tamaño final). No es un bloqueo para migrar la maquetación, pero conviene reponer
los archivos de producto cuando estén disponibles: al ampliar la foto a 54 mm el defecto se
nota más que antes.

### 4.5 Por qué existen las cajas máximas

Los logos de marca no comparten proporción entre sí. Definir solo el ancho hace que un logo
cuadrado escalado a 27 mm crezca al doble de alto que uno apaisado y desbalancee la columna.
La caja resuelve ese caso sin excepciones manuales.

Consecuencia práctica: **un bloque no siempre alcanza el ancho nominal de su regla.** El logo
UNIMAC (proporción 2.20) toca primero los 27 mm de ancho y queda en 27.0 × 12.3 mm; el logo
SIDI MONDIAL (proporción 1.46) toca primero los 14 mm de alto y queda en 20.4 × 14.0 mm. Los
dos son correctos. La validación no es "el ancho es 27 mm", sino **"la imagen cabe en su caja
y toca uno de sus dos límites"**.

---

## 5. Columna de descripción (110 mm)

| Elemento | Fuente | Tamaño | Interlineado | Espaciado | Alineación |
|---|---|---|---|---|---|
| Título de sección | Arial Bold + subrayado | 10 pt | 13 pt | 10 pt antes / 6 pt después | Izquierda |
| Subtítulo | Arial Bold | 9.5 pt | 12 pt | 8 pt antes / 4 pt después | Izquierda |
| Viñeta | Arial | 9 pt | 11.5 pt | 1.5 pt antes / 1.5 pt después | **Justificada** |

- Sangría de viñeta: marcador en **6.35 mm** (18 pt), texto en **12.7 mm** (36 pt).
- Los títulos de sección van en mayúsculas y subrayados (`AUTOMATIZACION, SEGURIDAD Y CONTROL`,
  `DISEÑO DE CONSTRUCCION`, `ESPECIFICACIONES TECNICAS`, `DIMENSIONES GENERALES`, etc.).
- **Listas de dato : valor** (especificaciones y dimensiones) van en una tabla invisible de
  dos columnas, con la columna de rótulo a 46.5 mm (132 pt) y los dos puntos alineados en
  vertical. Prohibido alinear con espacios o tabulaciones manuales.
- Ancho de texto resultante: 110 − 3.8 (padding) − 12.7 (sangría) = **93.5 mm**, que da
  entre 55 y 65 caracteres por línea a 9 pt. Es el rango correcto de lectura; no lo ensanches.

---

## 6. Bordes y color

| Uso | Valor |
|---|---|
| Bordes de tabla y rejilla | 0.5 pt, `#1A1A1A` |
| Relleno de filas de encabezado | `#767171` |
| Texto sobre encabezado gris | Blanco |
| Texto de contenido | Negro |

---

## 7. Paginación

- Un ítem puede ocupar varias páginas. Al continuar en la página siguiente se repite la
  estructura de dos columnas con la **celda de imágenes vacía** (el divisor vertical se
  mantiene), y la descripción sigue en la celda derecha.
- Las filas de título, encabezado gris y valores **no se repiten** en la continuación.
- La tabla de condiciones comerciales cierra el ítem, en la misma página donde termina la
  descripción.
- Nunca partir una fila de la tabla de condiciones entre dos páginas.

---

## 8. Tokens de implementación

```json
{
  "page": { "format": "A4", "width_mm": 210, "height_mm": 297 },
  "margins_mm": { "left": 20, "right": 20, "table_top": 29.4, "content_bottom_limit": 268 },
  "table": { "width_mm": 170, "cell_padding_mm": 1.9, "border_pt": 0.5, "border_color": "#1A1A1A" },
  "rows_mm": { "title": 10.5, "spec_header": 9.5, "spec_values": 9.5,
               "price_header": 12, "price_values": 10 },
  "columns_mm": { "image": 60, "description": 110 },
  "families": {
    "EQUIPO": {
      "spec_columns_mm": [18, 22, 27, 32, 33, 38],
      "price_columns_mm": [48, 28, 26, 29, 39],
      "image_blocks": ["logo", "product", "panel"],
      "image_valign": "top"
    },
    "COCHE": {
      "spec_columns_mm": [25, 29, 29, 87],
      "price_columns_mm": [62, 39, 29, 40],
      "image_blocks": ["product"],
      "image_valign": "center"
    }
  },
  "images_mm": {
    "logo":    { "width": 27, "max_height": 14, "rule": "50% del producto", "required": false },
    "product": { "width": 54, "max_height": 96, "rule": "90% de la columna", "required": true },
    "panel":   { "width": 35, "max_height": 32, "rule": "65% del producto", "required": false },
    "order": ["logo", "product", "panel"],
    "air_top_mm": 4, "gap_mm": 8, "h_align": "center", "center_axis_mm": 50
  },
  "type": {
    "family": "Arial",
    "section": { "size_pt": 10, "leading_pt": 13, "bold": true, "underline": true,
                 "space_before_pt": 10, "space_after_pt": 6 },
    "subsection": { "size_pt": 9.5, "leading_pt": 12, "bold": true,
                    "space_before_pt": 8, "space_after_pt": 4 },
    "body": { "size_pt": 9, "leading_pt": 11.5, "align": "justify",
              "bullet_indent_pt": 18, "text_indent_pt": 36 },
    "title_row": { "size_pt": 11, "bold": true, "align": "left", "indent_pt": 8 },
    "header_row": { "size_pt": 9.5, "bold": true, "color": "#FFFFFF", "fill": "#767171" },
    "value_row": { "size_pt": 10, "bold": true, "align": "center" }
  }
}
```

---

## 9. Notas por destino

### Word / `python-docx`
- `section.left_margin = section.right_margin = Mm(20)`, `top_margin = Mm(29.4)`,
  `bottom_margin = Mm(29)`.
- Fijar `table.autofit = False` y asignar el ancho a **cada celda**, no solo a la columna;
  Word ignora el ancho de columna si las celdas no lo declaran.
- Margen de celda: `w:tblCellMar` a 108 twips (1.9 mm) en los cuatro lados.
- Imágenes con `run.add_picture(path, width=Mm(54))` dentro de un párrafo con
  `alignment = CENTER`. No usar formas flotantes.

### HTML / CSS para impresión
- `@page { size: A4; margin: 29.4mm 20mm 29mm 20mm; }`
- `table { width: 170mm; table-layout: fixed; border-collapse: collapse; }`
- Todas las medidas en `mm`; nada en `%` ni en `px` dentro del documento imprimible.
- `img { display:block; margin:0 auto; }` con `width` fijo y `max-height` según la caja.

### reportlab
- Ver `build_ficha.py` de la implementación de referencia: dibuja el membrete como imagen de
  fondo a página completa, la rejilla con `canvas`, y la descripción con `Frame` + `Paragraph`.
- La altura de la fila 4 se calcula como `max(alto_bloque_imagenes, alto_texto) + 2 × padding`,
  midiendo el texto con `flowable.wrap()` y colapsando espaciados como lo hace Platypus
  (`max(space_after_anterior, space_before_actual)`), o el alto sale sobrestimado.

---

## 10. Checklist de migración

Al convertir una cotización existente, verificar en este orden:

- [ ] Márgenes laterales en 20 mm y borde de tabla alineado con el logo del membrete.
- [ ] Ancho total de tabla exactamente 170 mm.
- [ ] División de cuerpo en 60 / 110 mm.
- [ ] Suma de columnas de especificaciones = 170 mm.
- [ ] Suma de columnas de condiciones comerciales = 170 mm.
- [ ] Imagen de producto presente, a 54 mm, centrada en el eje de 50 mm.
- [ ] Familia EQUIPO: logo (si existe) arriba y a 27 mm; panel (si existe) abajo y a 35 mm;
      bloque alineado arriba con 4 mm de aire y 8 mm entre bloques.
- [ ] Familia COCHE: una sola imagen, centrada también en vertical dentro de la fila 4.
- [ ] Familia COCHE: sin logo ni panel; sin recuadro anidado en la celda de colores.
- [ ] Ninguna celda con resaltado amarillo ni marcas internas de trabajo.
- [ ] Membrete alineado a los 20 mm (corregir el de OPEN INVESTMENTS si aún está a 17.5 mm).
- [ ] Ninguna imagen flotante o anclada con posición libre.
- [ ] Ninguna imagen desbordando el padding de celda.
- [ ] Ningún contenido por debajo de los 268 mm.
- [ ] Listas de `dato : valor` alineadas por tabla invisible, no por espacios.
- [ ] Descripción justificada a 9 pt con sangría de viñeta de 12.7 mm.

---

## 11. Auditoría automática

El estándar trae un script en Python con `pdfplumber`. La máquina de trabajo no
tiene Python, así que en el repo vive el equivalente en Node, que hace las mismas
comprobaciones leyendo la lista de operadores del PDF:

```bash
node scripts/auditar-ficha-cotizacion.mjs scripts/data/*.pdf
```

Devuelve código distinto de cero si algo falla. Para generar el PDF de una
cotización real sin pasar por el navegador:

```bash
npx tsx scripts/render-cotizacion.tsx <id-de-la-cotizacion> scripts/data/revision.pdf
```

---

## 13. Apéndice: cómo se aplica en el CRM

La maquetación vive en `src/lib/pdf/cotizacion-pdf.tsx`. Lo que hay que saber
antes de tocarla:

- **Los milímetros son literales.** @react-pdf acepta unidades (`"60mm"`), así que
  los anchos del estándar están escritos tal cual. Nada en porcentajes: con
  porcentajes el ancho de la tabla cambiaba al cambiar el margen de la hoja.
- **La familia se decide sola.** Es COCHE cuando el producto es de categoría
  `coche` o cuando no tiene panel, controles ni calentamiento pero sí colores
  cargados. Todo lo demás es EQUIPO.
- **El juego de columnas depende de lo que el equipo tenga cargado.** Seis
  columnas con panel, cuatro sin panel (prensas y planchadores), cuatro para los
  coches. Cualquier otra combinación estira los anchos canónicos hasta volver a
  sumar 170 mm; solo si aparece un rótulo desconocido se reparte por largo de
  rótulo, como dice el §3.2.
- **Las imágenes se miden antes de dibujarlas** (`src/lib/pdf/medir-imagen.ts`)
  para escalarlas dentro de su caja sin deformarlas. Un logo apaisado toca los
  27 mm de ancho y uno cuadrado los 14 de alto: los dos son correctos.
- **Un valor que no entra en su columna se achica**, no se parte ni invade la
  celda vecina (`tamanoQueEntra`). El caso real es el modelo `LAVTMAX17` en los
  22 mm de «Modelo».
- **La tabla de condiciones sale de la cotización** (migración 0094:
  `tiempo_entrega`, `garantia`, `forma_pago`, `saldo`), y el precio, del ítem. Se
  cargan en el cotizador. Una celda sin dato sale vacía — el resaltado amarillo
  está prohibido.
- **La continuación de página la resuelve @react-pdf**: al partir la fila del
  cuerpo deja la celda de imágenes vacía y mantiene el divisor, que es
  exactamente lo que pide el §7.

### Lo que Darwin decidió cambiar del estándar (27-08)

Tres cosas se apartan a propósito de la norma escrita, y mandan sobre ella:

1. **La ficha NO lleva tabla de condiciones al pie** (precio, tiempo de entrega,
   garantía, forma de pago, saldo). Se probó y se sacó: esos datos ya van en las
   condiciones de la cotización y en la firma del comercial, en la última
   página, y repetir el precio por equipo duplicaba lo que el cliente ya vio en
   el resumen.
2. **El bloque de imágenes va centrado en vertical y en horizontal**, no
   alineado arriba. En una ficha larga, donde la fila llega hasta los 268 mm, el
   centro se calcula con el hueco que sobra; @react-pdf no sabe partir una celda
   centrada y hacerlo de otro modo se llevaba la descripción entera a la página
   siguiente.
3. **A la foto se le quita el margen blanco que trae el archivo** antes de
   meterla en su caja. La de la PRIMUS RX180 es de 800 × 800 px con el equipo
   ocupando poco más de la mitad: sin recortar ese aire, el equipo se imprime
   chico aunque la imagen mida los 54 mm de la norma.

**Y la regla que manda sobre todas:** toda la información —imágenes y texto—
sale de la ficha del equipo. No se sustituye el logo por el de otra ficha, no se
trae la foto del catálogo del CRM y no se corrige lo que dice el Word.

Lo que el estándar da por hecho y el CRM todavía no cumple:

- Las fotos de producto están por debajo de los 300 ppp al tamaño final (§4.4).
  Al ampliarlas a 54 mm el defecto se nota más que antes.
- El texto libre de «Condiciones comerciales» de la última página puede
  contradecir la tabla de cada ficha si la comercial escribe una cosa en un lado
  y otra en el otro.
