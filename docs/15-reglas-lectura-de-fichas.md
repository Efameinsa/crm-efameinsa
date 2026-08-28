# Cómo se lee una ficha técnica para llevarla a la cotización

Reglas consolidadas el 27-08-2026 mientras se procesaban las 116 fichas del
Excel `V:\Fichas tecnicas por codigo.xlsx`. **Rigen de acá en adelante para
todo producto nuevo**, y cada una está escrita porque algo salió mal antes de
existir: al lado de cada regla va el caso que la obligó.

El estándar de maquetación —dónde va cada cosa en la hoja— está en
`docs/14-estandar-ficha-cotizacion.md`. Este documento es el otro lado: de
dónde sale lo que se maqueta.

---

## 0. La regla que manda sobre todas

> **Toda la información sale de la ficha del equipo: imágenes y texto. No se
> infiere ni se cambia.** (Darwin, 27-08)

En concreto, y por si queda duda:

- No se sustituye el logo de una ficha por el de otra, aunque el otro tenga
  mejor resolución.
- No se trae la foto del catálogo del CRM cuando la ficha no tiene una buena.
- No se corrige lo que dice el Word aunque contradiga al Excel: la ficha de la
  UY450 dice PRIMUS en el Excel y lleva logo de UniMac; se imprime lo que
  muestra la ficha.
- Si la ficha no tiene foto del equipo, la cotización sale sin foto y se pide
  la foto. No se rellena con nada.

Lo único que sí se hace sobre una imagen es **presentarla mejor sin cambiarla**:
recortar el aire blanco, ampliarla con enfoque cuando está por debajo de
200 ppp, y separar las piezas que la propia imagen ya contiene.

---

## 1. Siempre se MIRA la ficha antes de decidir

> «Siempre haz una vista para analizar lo que tienes y ver de dónde a dónde es
> la imagen y de dónde a dónde es otro elemento como logo.» (Darwin, 27-08)

`node scripts/fichas-v-11-vista.mjs [CODIGO]` exporta la ficha a PDF con Word y
la dibuja como PNG en `scripts/data/fichas-v/vista/`. **Esa vista es la
verdad**, no los archivos sueltos del .docx:

- Los nombres no dicen nada útil (`image3.png`) y a veces engañan: el título
  del `<v:imagedata>` de la CAL1835 dice «calandria-industrial-gmp1200» en la
  imagen que en la hoja se ve como el logo.
- El orden de los archivos dentro del zip no siempre es el de la página.
- Sin mirar la hoja no hay forma de saber que la tercera imagen de la CALE160
  es la botonera del equipo y no un adorno.

---

## 2. El recorte del Word manda

Word **no guarda la imagen recortada**: guarda el archivo entero más un
rectángulo que dice qué parte se ve. Extraer el archivo tal cual devuelve
justo lo que Lesly escondió.

- **DrawingML** (fichas .docx nuevas): `<a:srcRect l t r b>`, en cienmilésimas.
- **VML** (las 45 fichas que vienen de un .doc viejo): `cropleft`, `croptop`,
  `cropright`, `cropbottom` dentro del `<v:imagedata>`, en unidades «f»
  (fracciones de 65536) o en decimal.

Casos que lo obligaron: la **CALE160** traía dos franjas rojas del catálogo y el
logo pegado al equipo; la **CAL1835** devolvía la foto entera del rodillo donde
la ficha muestra SOLO el logo GMP recortado de una esquina. Con el recorte
aplicado, las 116 fichas pasaron de 11 sin foto a **ninguna sin foto**.

---

## 3. Qué es cada imagen

El orden de la ficha es el del estándar y basta para repartir los papeles:

| Posición | Papel | Caja |
|---|---|---|
| Arriba | logo de la marca | 27 × 14 mm |
| Al medio, la más grande | el equipo | 54 × 96 mm |
| Abajo | vista de complemento (panel, botonera) | 35 × 32 mm |

- El **equipo** es el que la ficha muestra más grande.
- Lo que va **antes** y es chico y apaisado (≤ 35 mm de ancho, proporción ≥ 1.3)
  es el **logo**.
- Lo que va **después** del equipo es el **panel**.
- Los logos de marca conocidos van por huella en
  `scripts/data/fichas-v/correcciones.json`, con la marca que se ve en el logo
  —no la del Excel—.
- Solo se descarta una **captura de pantalla ENTERA y sin recortar**, con tamaño
  exacto de pantalla (1440×900, 1920×1080…). Si está recortada, es lo que la
  ficha quiere mostrar.

---

## 4. Cuando el logo viene DENTRO de la foto

Las fotos de catálogo de Sailstar, Primus y LG traen el wordmark de la marca
suelto en una esquina, sobre el mismo fondo blanco que el equipo. Metida entera
en la caja, esa imagen desperdicia media caja en el hueco entre las dos cosas.

Se separan las dos piezas de esa misma foto —no se trae nada de fuera— y se
maquetan como manda el estándar. Cómo se reconoce el wordmark: es una mancha de
contenido **apartada** de la del equipo, **chica** (≤ 30 % de su tamaño),
**apaisada** (proporción ≥ 0.9) y **con tinta** — texto oscuro o de color.

Dos afinaciones que costaron un caso cada una:

- El wordmark **se parte en varios trozos** («sailstar» sale en tres manchas):
  se juntan todas las piezas sueltas en un solo recorte.
- La **SECFDEE** sacaba de logo una raya gris que era la sombra del equipo: por
  eso se exige tinta de verdad antes de dar algo por logo.

---

## 5. La descripción, tal como está

Se lee en el orden del Word y con sus propios rótulos, no en cajones fijos:

- **título** — el rótulo subrayado que abre una sección.
- **subtítulo** — el rótulo en negrita de adentro (TAMBOR, PUERTA…).
- **viñeta** — cada ítem de la lista.
- **dato** — «Largo : 1100 mm», que se maqueta en dos columnas con los dos
  puntos alineados.

Cuando una ficha no subraya nada, manda la negrita en mayúsculas. Tomar toda
mayúscula en negrita como título convertía TAMBOR y PUERTA en secciones, al
mismo nivel que DISEÑO DE CONSTRUCCIÓN.

**Las mayúsculas llevan tilde.** Las fichas están tecleadas sin tilde en
mayúscula —«ESPECIFICACIONES TECNICAS», «CARACTERISTICAS», «CALEFACCION DE
SECADO»—, que es costumbre de teclado y no forma correcta de escribir; el
documento va a un cliente. Se corrige con un diccionario cerrado
(`acentuarMayusculas` en el paso 3), solo palabra completa y solo cuando viene
toda en mayúsculas, para no tocar un modelo como UT120L ni una palabra que ya
venía bien. Cuando aparezca una palabra nueva sin tilde, se agrega al
diccionario — no se adivina con reglas de acentuación.

**Qué NO se trae:**

- Las tablas del pie de la ficha (precio, tiempo de entrega, garantía, forma de
  pago). Eso lo pone el sistema con las condiciones de la cotización y la firma
  del comercial, en la última página.
- La tabla técnica de la cabecera: se lee, pero como datos de las columnas
  (Marca, Modelo, Capacidad, Calentamiento, Panel, Controles), no como
  descripción.
- Los números de parte y códigos de barras sueltos que la plantilla de UniMac
  pone antes del primer título («-24130-381000»): no son descripción y al
  cliente le aparecían como dos viñetas sin explicación.

---

## 6. Calidad de imagen

- Se quita el **margen blanco** del archivo antes de meter la imagen en su caja.
  La foto de la PRIMUS RX180 es de 800 × 800 px con el equipo ocupando poco más
  de la mitad: sin recortar ese aire, el equipo se imprime chico aunque la
  imagen mida los 54 mm de la norma.
- Por debajo de **200 ppp** al tamaño impreso se **amplía con máscara de
  enfoque** hasta ~300. No es un aumentador por IA: no inventa detalle, endurece
  el que hay y evita que la impresora haga el escalado ella misma.
- Los **EMF** (metarchivos de Windows) se convierten a PNG con GDI+: ni el
  navegador ni el generador de PDF los dibujan.

---

## 7. El orden de trabajo

```bash
node  scripts/fichas-v-01-lista.mjs              # qué productos manda el Excel
node  scripts/fichas-v-02-convertir.mjs          # los .doc viejos a .docx
node  scripts/fichas-v-03-extraer.mjs            # texto e imágenes, con el recorte del Word
node  scripts/fichas-v-04-clasificar.mjs         # qué es cada imagen
node  scripts/fichas-v-05-hojas-de-contacto.mjs  # MIRARLAS
node  scripts/fichas-v-06-preparar-imagenes.mjs  # recorte de aire, separación y ampliación
node  scripts/fichas-v-07-recortar-pantallazos.mjs   # rescatar el equipo de una captura
node  scripts/fichas-v-11-vista.mjs              # la ficha como la ve Lesly
npx tsx scripts/fichas-v-09-todas.tsx            # una cotización de prueba por ficha
node  scripts/fichas-v-10-servidor.mjs           # http://localhost:4173 para revisarlas
node  scripts/auditar-ficha-cotizacion.mjs scripts/data/fichas-v/pdf/*.pdf
```

Los pasos 1 a 11 no tocan la base ni el catálogo: todo queda en
`scripts/data/fichas-v/`. El paso 12 es el que carga, y **no se corre hasta que
la auditoría de los 120 PDF diga OK en todos**.

---

## 9. Lo que NUNCA puede llegar a una cotización

Estas dos las tiene que cazar `auditar-ficha-cotizacion.mjs`, sobre los PDF de
prueba del paso 9, ANTES de cargar. Las dos llegaron al cliente el 28-08 y por
eso son regla y no criterio.

**Ningún resto de código de Word.** Word guarda las imágenes vinculadas como un
campo —`INCLUDEPICTURE "C:\Users\COMERC~3\AppData\…\wps1.png" \* MERGEFORMATINET`—
y las fichas hechas con WPS traen unos cuantos. Leído como texto, eso se imprime
arriba de las características. En el paso 3 se descartan `<w:instrText>` y
`<w:delText>`; el auditor rechaza el PDF si aparece `INCLUDEPICTURE`,
`MERGEFORMAT`, `HYPERLINK "` o una ruta de `AppData\Local\Temp`.

**Ningún texto fuera de su casilla.** Las palabras no se parten con guion
(24-08), así que un modelo sin espacios más ancho que su columna se dibuja
encima de la de al lado: pasó con `GIANT C MAX(CWG27MDCRSCDG27MUCPS)`. Hay dos
defensas y hacen falta las dos:

- El valor se corta en un renglón nuevo —sin guion— por el paréntesis o la
  barra, y si aun así no entra, a lo ancho de la casilla (`partirLoQueNoEntra`).
- El auditor mide cada texto y falla si su caja cruza una raya vertical de la
  tabla.

Y de raíz: **cada párrafo de una celda es un renglón**. Pegados uno tras otro
salían modelos que no existen —«TITAN MAXTITAN LIGHT»—; en la ficha son dos
líneas porque son dos máquinas, la lavadora y la secadora de la torre.

**Un título numerado sigue siendo un título.** Las fichas de torre abren cada
máquina con «I. LAVADORA» y «II. SECADORA» como lista numerada en negrita:
tratarlas como viñeta dejaba un «• LAVADORA» suelto arriba de las
características.

---

## 8. Lo que hay que pedirle a Lesly

- **CO401**: el Word cambió de nombre mientras se trabajaba —ahora es
  `CO401A-…HM 401 AZUL.docx`, por color— y la ruta del Excel ya no existe. El
  Excel se generó a las 09:51 y los archivos se renombraron a las 09:29-09:45.
  Los coches se están separando por color, como ya hace el CRM.
- Las fichas **CALE2120** y **CALE2200** cierran con un cartel publicitario
  («e²line — DISEÑADA ALREDEDOR DE USTED») donde las demás traen la botonera.
  Se imprime porque está en la ficha; conviene decidir si va o si se reemplaza
  por la vista del panel.
