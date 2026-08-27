// ============================================================
// CRM EFAMEINSA · Paso 6 · Dejar cada imagen lista para imprimir
// ============================================================
// Pedido de Darwin (27-08): «hay fotos pequeñas, amplíalas pero previamente
// mejora su calidad, solo en casos exagerados donde se vea mal su defecto».
//
// Lo que hace, en este orden:
//
//   1. EMF → PNG. Dos imágenes de la CALFCU500 son metarchivos de Windows:
//      ni el navegador ni @react-pdf los dibujan. Se pasan a PNG con GDI+.
//   2. Foto que falta → el recorte de la captura DE ESA MISMA FICHA (paso 7),
//      solo los cuatro que se miraron y quedaron bien. No se trae ninguna
//      imagen de otra ficha ni del catálogo del CRM.
//   3. Ampliación con mejora, SOLO donde se ve mal: por debajo de 200 ppp al
//      tamaño impreso. Se reescala con interpolación de alta calidad y se le
//      aplica una máscara de enfoque suave. No es un aumentador por IA: no
//      inventa detalle, endurece el que hay y evita que la impresora haga el
//      escalado ella misma, que es lo que más se nota.
//
// Deja todo en scripts/data/fichas-v/final/ y un manifiesto con lo que hizo.
// NO toca public/productos ni la base.
//
// Uso: node scripts/fichas-v-06-preparar-imagenes.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "canvas";

const CLASIFICACION = "scripts/data/fichas-v/clasificacion.json";
const DIR_FINAL = "scripts/data/fichas-v/final";
const SALIDA = "scripts/data/fichas-v/imagenes-listas.json";


/** Caja de impresión de cada rol, en mm, y píxeles que pide para 300 ppp. */
const CAJAS = { logo: [27, 14], producto: [54, 96], panel: [35, 32] };
const PPP_OBJETIVO = 300;
const PPP_MINIMO_ACEPTABLE = 200; // por debajo de esto se amplía; encima, no se toca
const AMPLIACION_MAXIMA = 3;

const { fichas } = JSON.parse(readFileSync(CLASIFICACION, "utf-8"));
mkdirSync(DIR_FINAL, { recursive: true });

/** Puntos por pulgada a los que se imprime una imagen dentro de su caja. */
function pppEn(caja, ancho, alto) {
  const escala = Math.min(caja[0] / ancho, caja[1] / alto);
  const mmImpresos = ancho * escala;
  return Math.round(ancho / (mmImpresos / 25.4));
}

/** EMF → PNG con GDI+, que es lo único que los lee en esta máquina. */
function convertirEmf(origen, destino) {
  const ps = `Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${resolve(origen)}')
$w = [Math]::Max($img.Width, 1200)
$h = [int]($img.Height * ($w / $img.Width))
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'
$g.InterpolationMode = 'HighQualityBicubic'
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($img, 0, 0, $w, $h)
$bmp.Save('${resolve(destino)}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "pipe", timeout: 60_000 });
}

/**
 * Le quita a la imagen el margen blanco que trae de fábrica.
 *
 * La foto de la PRIMUS RX180 es de 800 × 800 px pero la lavadora ocupa poco más
 * de la mitad: el resto es fondo blanco. Al meterla en su caja de 54 mm, lo que
 * se ve grande es el aire y el equipo sale chico. Recortar ese blanco no cambia
 * la información —la imagen es la misma— y hace que el equipo llene su caja,
 * que es lo que pidió Darwin el 27-08 mirando esa ficha.
 *
 * Solo se recorta lo que es blanco de verdad (o transparente) en TODA la fila o
 * columna, y se deja un 2 % de aire para que el equipo no quede pegado al
 * borde. Si la imagen no tiene margen, se devuelve igual.
 */
async function recortarMargenBlanco(origen, destino) {
  const img = await loadImage(resolve(origen));
  const lienzo = createCanvas(img.width, img.height);
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

  const vacio = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 12) return true; // transparente
    return data[i] > 246 && data[i + 1] > 246 && data[i + 2] > 246;
  };
  const filaVacia = (y) => {
    for (let x = 0; x < width; x++) if (!vacio(x, y)) return false;
    return true;
  };
  const columnaVacia = (x) => {
    for (let y = 0; y < height; y++) if (!vacio(x, y)) return false;
    return true;
  };

  let y0 = 0;
  let y1 = height - 1;
  let x0 = 0;
  let x1 = width - 1;
  while (y0 < y1 && filaVacia(y0)) y0++;
  while (y1 > y0 && filaVacia(y1)) y1--;
  while (x0 < x1 && columnaVacia(x0)) x0++;
  while (x1 > x0 && columnaVacia(x1)) x1--;

  const recortado = x0 > 0 || y0 > 0 || x1 < width - 1 || y1 < height - 1;
  if (!recortado) return { archivo: origen, ancho: width, alto: height, recortado: false };

  const aire = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - aire);
  y0 = Math.max(0, y0 - aire);
  x1 = Math.min(width - 1, x1 + aire);
  y1 = Math.min(height - 1, y1 + aire);

  const ancho = x1 - x0 + 1;
  const alto = y1 - y0 + 1;
  const salida = createCanvas(ancho, alto);
  const ctx2 = salida.getContext("2d");
  // Fondo blanco: si la imagen venía con transparencia, el PDF la pinta negra.
  ctx2.fillStyle = "#FFFFFF";
  ctx2.fillRect(0, 0, ancho, alto);
  ctx2.drawImage(lienzo, x0, y0, ancho, alto, 0, 0, ancho, alto);
  writeFileSync(destino, salida.toBuffer("image/png"));
  return { archivo: destino, ancho, alto, recortado: true, de: `${width}×${height}` };
}

/**
 * Separa el logo de la marca del equipo cuando vienen en la MISMA imagen.
 *
 * Las fotos de catálogo de Sailstar, Primus y GMP traen el wordmark de la marca
 * suelto en una esquina y la máquina al lado. Metida entera en la caja de
 * 54 mm, esa imagen desperdicia media caja en el hueco entre las dos cosas: el
 * equipo sale chico y descentrado, y el logo, diminuto. Reportado por Darwin el
 * 27-08 con la SS17-E: «el producto no toma casi todo el ancho y el logo lo
 * estorba».
 *
 * No se quita ni se agrega nada: las dos piezas ya están en la foto de la
 * ficha. Se recortan por separado y se maquetan como manda el estándar — logo
 * arriba a 27 mm, equipo debajo a 54 mm, los dos centrados.
 *
 * CÓMO SE DECIDE. Se etiquetan las manchas de contenido (lo que no es blanco) y
 * se mira si hay dos: una grande —el equipo— y otra chica, apartada y apaisada
 * —el wordmark—. Si la mancha chica toca a la grande, o es demasiado grande, o
 * no es apaisada, no se toca nada: puede ser una manguera, una sombra o parte
 * del propio equipo.
 */
async function separarLogoDelProducto(origen, destinoLogo, destinoProducto) {
  const img = await loadImage(resolve(origen));
  const lienzo = createCanvas(img.width, img.height);
  lienzo.getContext("2d").drawImage(img, 0, 0);
  const { data, width, height } = lienzo.getContext("2d").getImageData(0, 0, img.width, img.height);

  // Rejilla reducida: el etiquetado no necesita el detalle y así es instantáneo.
  const PASO = Math.max(1, Math.round(width / 260));
  const an = Math.ceil(width / PASO);
  const al = Math.ceil(height / PASO);
  const lleno = new Uint8Array(an * al);
  for (let gy = 0; gy < al; gy++) {
    for (let gx = 0; gx < an; gx++) {
      const x = Math.min(width - 1, gx * PASO);
      const y = Math.min(height - 1, gy * PASO);
      const i = (y * width + x) * 4;
      const vacio = data[i + 3] < 12 || (data[i] > 243 && data[i + 1] > 243 && data[i + 2] > 243);
      lleno[gy * an + gx] = vacio ? 0 : 1;
    }
  }

  // Manchas conexas (8 vecinos), con su caja y su tamaño.
  const etiqueta = new Int32Array(an * al).fill(-1);
  const manchas = [];
  const pila = [];
  for (let p = 0; p < lleno.length; p++) {
    if (!lleno[p] || etiqueta[p] !== -1) continue;
    const id = manchas.length;
    const m = { id, px: 0, x0: an, x1: 0, y0: al, y1: 0 };
    pila.push(p);
    etiqueta[p] = id;
    while (pila.length) {
      const q = pila.pop();
      const qx = q % an;
      const qy = (q - qx) / an;
      m.px++;
      if (qx < m.x0) m.x0 = qx;
      if (qx > m.x1) m.x1 = qx;
      if (qy < m.y0) m.y0 = qy;
      if (qy > m.y1) m.y1 = qy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx;
          const ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= an || ny >= al) continue;
          const n = ny * an + nx;
          if (lleno[n] && etiqueta[n] === -1) {
            etiqueta[n] = id;
            pila.push(n);
          }
        }
      }
    }
    manchas.push(m);
  }

  if (manchas.length < 2) return null;
  manchas.sort((a, b) => b.px - a.px);
  const equipo = manchas[0];
  const total = an * al;

  // El logo: TODAS las manchas que quedan fuera del equipo, juntas. Un wordmark
  // se parte en varios trozos —«sailstar» sale en tres— y quedarse con uno solo
  // recortaría media palabra.
  const fuera = manchas
    .slice(1)
    .filter(
      (m) => m.px >= 15 && (m.y1 < equipo.y0 || m.x0 > equipo.x1 || m.x1 < equipo.x0 || m.y0 > equipo.y1),
    );
  if (fuera.length === 0) return null;

  const logo = {
    px: fuera.reduce((s, m) => s + m.px, 0),
    x0: Math.min(...fuera.map((m) => m.x0)),
    x1: Math.max(...fuera.map((m) => m.x1)),
    y0: Math.min(...fuera.map((m) => m.y0)),
    y1: Math.max(...fuera.map((m) => m.y1)),
  };
  const proporcion = (logo.x1 - logo.x0 + 1) / (logo.y1 - logo.y0 + 1);
  // Tiene que ser chico, apaisado y no ocupar media imagen: si no, es parte del
  // equipo (una manguera, una tapa suelta) y no se toca nada.
  if (logo.px < total * 0.0015 || logo.px > equipo.px * 0.3 || proporcion < 1.6) return null;
  if ((logo.x1 - logo.x0 + 1) * (logo.y1 - logo.y0 + 1) > total * 0.2) return null;

  // Y tiene que tener TINTA. Un wordmark es texto oscuro o de color sobre
  // blanco; una franja de sombra clarita también forma su mancha y pasaba todos
  // los filtros anteriores (la SECFDEE sacaba de logo una raya gris). Se mira
  // la región a resolución completa y se exige que al menos un 6 % de sus
  // píxeles sean tinta de verdad.
  let tinta = 0;
  let mirados = 0;
  for (let y = logo.y0 * PASO; y <= Math.min(height - 1, logo.y1 * PASO); y += 2) {
    for (let x = logo.x0 * PASO; x <= Math.min(width - 1, logo.x1 * PASO); x += 2) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 12) continue;
      mirados++;
      const luz = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const color = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      if (luz < 205 || color > 40) tinta++;
    }
  }
  if (mirados === 0 || tinta / mirados < 0.06) return null;

  const recortar = (m, destino) => {
    const aire = Math.max(1, Math.round(Math.max(m.x1 - m.x0, m.y1 - m.y0) * 0.04));
    const x0 = Math.max(0, (m.x0 - aire) * PASO);
    const y0 = Math.max(0, (m.y0 - aire) * PASO);
    const x1 = Math.min(width - 1, (m.x1 + aire) * PASO);
    const y1 = Math.min(height - 1, (m.y1 + aire) * PASO);
    const ancho = x1 - x0 + 1;
    const alto = y1 - y0 + 1;
    const salida = createCanvas(ancho, alto);
    const ctx = salida.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(lienzo, x0, y0, ancho, alto, 0, 0, ancho, alto);
    writeFileSync(destino, salida.toBuffer("image/png"));
    return { ancho, alto };
  };

  return { logo: { archivo: destinoLogo, ...recortar(logo, destinoLogo) },
           producto: { archivo: destinoProducto, ...recortar(equipo, destinoProducto) } };
}

/**
 * Amplía con máscara de enfoque. El desenfoque es una media de caja de 3×3 —
 * suficiente para una máscara suave— y el resultado es `original + fuerza ×
 * (original − desenfocado)`, acotado. Sin esto, una foto de 200 px estirada a
 * 54 mm sale lechosa; con esto conserva los bordes del equipo.
 */
async function ampliarConEnfoque(origen, destino, escala, fuerza = 0.6) {
  const img = await loadImage(resolve(origen));
  const ancho = Math.round(img.width * escala);
  const alto = Math.round(img.height * escala);
  const lienzo = createCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, ancho, alto);

  const datos = ctx.getImageData(0, 0, ancho, alto);
  const px = datos.data;
  const copia = new Uint8ClampedArray(px);
  const en = (x, y, c) => copia[(y * ancho + x) * 4 + c];
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let suma = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) suma += en(x + dx, y + dy, c);
        const media = suma / 9;
        const original = en(x, y, c);
        px[(y * ancho + x) * 4 + c] = Math.max(0, Math.min(255, original + fuerza * (original - media)));
      }
    }
  }
  ctx.putImageData(datos, 0, 0);
  writeFileSync(destino, lienzo.toBuffer("image/png"));
  return { ancho, alto };
}

// Ni logo de otra ficha ni foto del catálogo: cada ficha se imprime con lo
// suyo. La regla la fijó Darwin el 27-08 — «toda la información es de la
// ficha, imágenes y texto; no hay que inferir ni cambiar».

const resultado = [];
const acciones = { emf: 0, recortadas: 0, recortadoBlanco: 0, separados: 0, ampliadas: 0, intactas: 0, sinFoto: [] };

/** Recortes del paso 7 que se miraron y quedaron bien. Los demás NO se usan: el
 *  recorte automático solo acierta cuando la captura es del visor de imágenes
 *  (barras negras y la máquina sobre blanco); con la captura de una página web
 *  devuelve la página entera. */
const RECORTES_APROBADOS = new Set([
  // Capturas del visor de imágenes: barras negras y la máquina sobre blanco.
  // El recorte deja la máquina sola y se miró una por una.
  "CALE160",
  "CALE2140",
  "CALE2160",
  "SECU30",
  "SECU301",
  "SECU303",
  "SECU502",
  "SECU553",
  "SECU75",
  "SECU75L",
  "SECU75E",
  "SECU75E2",
  "SECU75E3",
  "SECUT055V",
  "SECUT55E",
  // NO se aprueban —el recorte devuelve la página web o el visor de PDF, no el
  // equipo—: CALE2120, CALE2200, CO401, LAV135, LAVUS030, LAVUS050,
  // LAVUY2802, LAVUY4502, LAVW17, LAVW23, SECU1202. Esas once fichas no
  // tienen ninguna imagen aprovechable del equipo y hay que pedírselas a Lesly.
]);

for (const f of fichas) {
  const salida = { codigo: f.codigo, imagenes: [], notas: [] };

  // Si la ficha NO trae logo aparte y su foto lleva el wordmark de la marca
  // dentro, se separan las dos piezas antes de maquetar. Cuando la ficha ya
  // tiene su logo, la foto se deja como está: no hay nada que separar.
  const partido = { logo: null, producto: null };
  const fotoOriginal = f.imagenes.find((i) => i.rol === "producto");
  if (fotoOriginal && !f.imagenes.some((i) => i.rol === "logo") && !/\.emf$/i.test(fotoOriginal.archivo)) {
    try {
      const r = await separarLogoDelProducto(
        fotoOriginal.archivo,
        `${DIR_FINAL}/${f.codigo}-logo-separado.png`,
        `${DIR_FINAL}/${f.codigo}-producto-separado.png`,
      );
      if (r) {
        partido.logo = r.logo;
        partido.producto = r.producto;
        salida.notas.push(
          `la foto traía el logo de la marca adentro: se separaron (logo ${r.logo.ancho}×${r.logo.alto}, equipo ${r.producto.ancho}×${r.producto.alto})`,
        );
        acciones.separados++;
      }
    } catch {
      /* si no se puede separar, se sigue con la foto entera */
    }
  }

  for (const rol of ["logo", "producto", "panel"]) {
    let img = f.imagenes.find((i) => i.rol === rol);
    // Las piezas separadas de la propia foto mandan sobre lo que trajo la ficha.
    if (partido[rol]) img = { archivo: partido[rol].archivo, rol, px: { ancho: partido[rol].ancho, alto: partido[rol].alto } };

    // Producto que falta: el recorte del pantallazo DE ESA MISMA FICHA. No se
    // trae ninguna imagen de otro lado —ni del catálogo del CRM, ni de otra
    // ficha—: la regla es que todo sale de la ficha.
    if (rol === "producto" && !img) {
      const recorte = `scripts/data/fichas-v/recortes/${f.codigo}.png`;
      if (RECORTES_APROBADOS.has(f.codigo) && existsSync(recorte)) {
        salida.notas.push("foto recortada del pantallazo de la propia ficha (revisada a ojo)");
        acciones.recortadas++;
        img = { archivo: recorte, rol: "producto", px: null };
      } else {
        acciones.sinFoto.push(f.codigo);
        continue;
      }
    }
    if (!img) continue;

    let archivo = img.archivo;
    let px = img.px?.ancho ? img.px : null;

    // EMF ilegible → PNG.
    if (/\.emf$/i.test(archivo)) {
      const destino = `${DIR_FINAL}/${f.codigo}-${rol}.png`;
      try {
        convertirEmf(archivo, destino);
        archivo = destino;
        const img2 = await loadImage(resolve(destino));
        px = { ancho: img2.width, alto: img2.height };
        salida.notas.push("EMF convertido a PNG");
        acciones.emf++;
      } catch (e) {
        salida.notas.push(`EMF no se pudo convertir: ${String(e.message ?? e).slice(0, 60)}`);
        continue;
      }
    }

    if (!px) {
      const medida = await loadImage(resolve(archivo));
      px = { ancho: medida.width, alto: medida.height };
    }

    // Fuera el margen blanco del archivo, para que el equipo llene su caja.
    const sinMargen = await recortarMargenBlanco(archivo, `${DIR_FINAL}/${f.codigo}-${rol}-recortada.png`);
    if (sinMargen.recortado) {
      const antes = px.ancho * px.alto;
      archivo = sinMargen.archivo;
      px = { ancho: sinMargen.ancho, alto: sinMargen.alto };
      const ganancia = Math.round((1 - (px.ancho * px.alto) / antes) * 100);
      if (ganancia >= 5) {
        salida.notas.push(`${rol}: quitado el margen blanco (${sinMargen.de} → ${px.ancho}×${px.alto}, −${ganancia} % de aire)`);
        acciones.recortadoBlanco++;
      }
    }

    // Ampliación con enfoque solo donde se ve mal.
    const caja = CAJAS[rol];
    const pppActual = pppEn(caja, px.ancho, px.alto);
    if (pppActual < PPP_MINIMO_ACEPTABLE) {
      const escala = Math.min(AMPLIACION_MAXIMA, PPP_OBJETIVO / pppActual);
      const destino = `${DIR_FINAL}/${f.codigo}-${rol}.png`;
      const nuevo = await ampliarConEnfoque(archivo, destino, escala);
      salida.notas.push(`${rol}: ${px.ancho}×${px.alto} (${pppActual} ppp) → ${nuevo.ancho}×${nuevo.alto} (${pppEn(caja, nuevo.ancho, nuevo.alto)} ppp)`);
      archivo = destino;
      px = nuevo;
      acciones.ampliadas++;
    } else {
      acciones.intactas++;
    }

    salida.imagenes.push({ rol, archivo, px, ppp: pppEn(caja, px.ancho, px.alto) });
  }

  resultado.push(salida);
}

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), fichas: resultado }, null, 2));

console.log(`\nEMF convertidos: ${acciones.emf}`);
console.log(`Fotos recortadas del pantallazo: ${acciones.recortadas}`);
console.log(`Imágenes a las que se les quitó margen blanco: ${acciones.recortadoBlanco}`);
console.log(`Fotos en las que el logo venía dentro y se separó: ${acciones.separados}`);
console.log(`Imágenes ampliadas con enfoque: ${acciones.ampliadas}`);
console.log(`Imágenes que ya estaban bien: ${acciones.intactas}`);
console.log(`\nSIGUEN SIN FOTO (${acciones.sinFoto.length}): ${acciones.sinFoto.join(", ")}`);
console.log(`\n→ ${SALIDA}`);
