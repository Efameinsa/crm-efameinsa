/**
 * «Al subir este producto con el Word no carga completo la imagen»
 * (operaciones, 09-09, con la SECU75E3 de UNIMAC).
 *
 * Se comprueba el camino ENTERO, no la puerta: que la pantalla de Lesly lea el
 * Word y devuelva las TRES imágenes de la hoja —logo del fabricante, foto del
 * equipo y vista del panel— con el recorte que declara el documento, que el
 * código y el nombre salgan del nombre del archivo aunque esté separado con
 * punto, y que un equipo con esas imágenes subidas SALGA IMPRESO con ellas en
 * la cotización, que es donde el cliente las ve.
 *
 * Uso (con el servidor levantado):
 *   node --env-file=.env.local scripts/_verificar-word-tres-imagenes.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createCanvas, loadImage } from "canvas";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

const BASE = process.env.BASE ?? "http://localhost:3000";
const WORD =
  process.env.WORD ??
  "C:/Users/diseno/Downloads/SECU75E3. SECADORA UT075-DUAL DIGITAL -GALVANIZADO-ELECTRICO-220V.docx";
const SALIDA = process.env.SALIDA ?? "scripts/data/_verificar-word";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let fallas = 0;
const ok = (b, t) => {
  console.log(`  ${b ? "✓" : "✗"} ${t}`);
  if (!b) fallas++;
};

async function entrar(email) {
  let link = null;
  for (let i = 0; i < 8 && !link; i++) {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (data?.properties) link = data;
    else await new Promise((r) => setTimeout(r, 4000));
  }
  const jar = new Map();
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })),
      setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

/** El recorte del Word aplicado, igual que lo hace el navegador. */
async function recortar(imagen, destino) {
  const bytes = Buffer.from(imagen.base64, "base64");
  const img = await loadImage(bytes);
  const { l, t, r, b } = imagen.recorte ?? { l: 0, t: 0, r: 0, b: 0 };
  const ancho = Math.max(1, Math.round(img.width * (1 - l - r)));
  const alto = Math.max(1, Math.round(img.height * (1 - t - b)));
  const lienzo = createCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(img, Math.round(img.width * l), Math.round(img.height * t), ancho, alto, 0, 0, ancho, alto);
  const png = lienzo.toBuffer("image/png");
  writeFileSync(destino, png);
  return { ancho, alto, png };
}

/**
 * De qué medida es cada imagen pegada en el PDF, y cuántas veces está.
 *
 * Se mira la MEDIDA y no la cantidad: la papelería de Efameinsa se repite en
 * cada página, así que contar imágenes no dice nada. Cada una de las tres del
 * Word entra con su tamaño exacto, y eso sí la identifica.
 */
async function imagenesDelPdf(bytes) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const medidas = new Map();
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    const clave = `${obj.dict.get(PDFName.of("Width"))}×${obj.dict.get(PDFName.of("Height"))}`;
    medidas.set(clave, (medidas.get(clave) ?? 0) + 1);
  }
  return medidas;
}

mkdirSync(SALIDA, { recursive: true });
const cookie = await entrar("lesly@efameinsa.com");

console.log("\n1 · LA PANTALLA LEE EL WORD");
const cuerpo = new FormData();
cuerpo.append("ficha", new Blob([readFileSync(WORD)]), WORD.split("/").pop());
const r = await fetch(`${BASE}/api/fichas/leer-word`, { method: "POST", body: cuerpo, headers: { cookie } });
const datos = await r.json();
ok(r.ok, `la ruta contesta ${r.status}`);
if (!r.ok) {
  console.error(datos);
  process.exit(1);
}
ok(datos.sku === "SECU75E3", `el código sale del nombre del archivo: ${JSON.stringify(datos.sku)}`);
ok(datos.nombre === "SECADORA UT075", `y el nombre limpio: ${JSON.stringify(datos.nombre)}`);
ok(datos.cabecera.marca === "UNIMAC", `marca ${datos.cabecera.marca}`);
ok(datos.bloques > 40, `${datos.bloques} líneas de descripción`);

console.log("\n2 · VUELVEN LAS TRES IMÁGENES DE LA HOJA");
ok(Boolean(datos.logo), "el logo del fabricante");
ok(Boolean(datos.foto), "la foto del equipo");
ok(Boolean(datos.panel), "la vista del panel");
const recortadas = {};
for (const rol of ["logo", "foto", "panel"]) {
  if (!datos[rol]) continue;
  const rec = await recortar(datos[rol], `${SALIDA}/${rol}.png`);
  recortadas[rol] = rec;
  console.log(
    `    ${rol}: ${rec.ancho}×${rec.alto} px, recorte ${JSON.stringify(datos[rol].recorte)} → ${SALIDA}/${rol}.png`,
  );
}
ok(
  recortadas.foto && recortadas.foto.ancho * recortadas.foto.alto > (recortadas.logo?.ancho ?? 0) * (recortadas.logo?.alto ?? 0),
  "la del equipo es la grande, no el logo",
);

console.log("\n3 · UN EQUIPO CON ESAS IMÁGENES SALE IMPRESO CON ELLAS");
// Equipo de prueba, apagado y con código propio: no entra al catálogo del
// comercial y se borra al final junto con sus imágenes.
const { data: creado, error: eCrear } = await admin
  .from("productos")
  .insert({
    nombre: "PRUEBA IMÁGENES DE LA HOJA",
    marca: "UNIMAC",
    modelo: "UT075",
    sku: "PRUEBA_IMG",
    categoria: "secadora",
    segmento: "industrial",
    activo: false,
    ficha: { bloques: [{ t: "titulo", texto: "CARACTERÍSTICAS" }, { t: "vineta", texto: "Equipo de prueba" }] },
  })
  .select("id")
  .single();
if (eCrear) {
  console.error("no se pudo crear el equipo de prueba:", eCrear.message);
  process.exit(1);
}

const subidas = [];
async function subir(rol, png) {
  const ruta = `${creado.id}${rol === "foto" ? "" : `-${rol}`}-${Date.now()}.png`;
  const { error } = await admin.storage.from("productos").upload(ruta, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`${rol}: ${error.message}`);
  subidas.push(ruta);
  return `storage:${ruta}`;
}

const sinImagenes = await fetch(`${BASE}/api/productos/${creado.id}/vista-previa`, { headers: { cookie } });
const pdfPelado = Buffer.from(await sinImagenes.arrayBuffer());
const antes = await imagenesDelPdf(pdfPelado);
console.log(`    sin imágenes cargadas, el PDF solo lleva la papelería: ${[...antes].map(([m, n]) => `${m} ×${n}`).join(", ")}`);

await admin
  .from("productos")
  .update({
    foto_path: await subir("foto", recortadas.foto.png),
    logo_path: await subir("logo", recortadas.logo.png),
    panel_path: await subir("panel", recortadas.panel.png),
  })
  .eq("id", creado.id);

const conImagenes = await fetch(`${BASE}/api/productos/${creado.id}/vista-previa`, { headers: { cookie } });
const pdfCompleto = Buffer.from(await conImagenes.arrayBuffer());
const despues = await imagenesDelPdf(pdfCompleto);
writeFileSync(`${SALIDA}/vista-previa.pdf`, pdfCompleto);

console.log(`    con las tres cargadas: ${[...despues].map(([m, n]) => `${m} ×${n}`).join(", ")}`);
for (const rol of ["logo", "foto", "panel"]) {
  const medida = `${recortadas[rol].ancho}×${recortadas[rol].alto}`;
  ok(despues.has(medida) && !antes.has(medida), `la del ${rol} llega a la hoja impresa (${medida})`);
}
ok(pdfCompleto.length > pdfPelado.length, "y el documento pesa más porque las lleva adentro");
console.log(`    el PDF quedó en ${SALIDA}/vista-previa.pdf`);

// Se limpia todo: el equipo de prueba y sus imágenes.
await admin.from("productos").delete().eq("id", creado.id);
if (subidas.length > 0) await admin.storage.from("productos").remove(subidas);

console.log(fallas === 0 ? "\n✓ todo bien\n" : `\n✗ ${fallas} fallas\n`);
process.exit(fallas === 0 ? 0 : 1);
