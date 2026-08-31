// ============================================================
// CRM EFAMEINSA · Cargar la LAVADORA FX280 (LAVF280), que se quedó afuera
// ============================================================
// Santos, 31-08: «hay un producto que se olvidaron subir».
//
// POR QUÉ SE PERDIÓ. No fue un olvido de la carga: el maestro de Lesly usa el
// MISMO código `LAV280` para dos equipos distintos —la RX280 rígida (fila 11) y
// la FX280 flotante (fila 33)— y el reporte de fichas lo avisa con todas las
// letras en su hoja REVISAR CON LESLY: «El mismo codigo nombra a mas de un
// equipo dentro de la misma hoja. El reporte se queda con el ultimo y el otro
// equipo no sale». En el CRM quedó la RX280. La FX280 no tiene código propio en
// ningún Excel, así que su Word —que Lesly sí nombró `LAVF280-…`— cayó en la
// hoja ARCHIVOS SIN CODIGO y el pipeline nunca lo miró.
//
// El mismo problema tiene la FX180 (`LAVF180-LAVADORA FX 180-…docx`, también en
// ARCHIVOS SIN CODIGO): el código LAV180 nombra a la RX180 y a la FX180 a la
// vez. Ese queda pendiente y hay que preguntárselo a Lesly.
//
// QUEDA PENDIENTE PARA LESLY: darle código propio a la FX280 en la codificación
// de equipos. Mientras no lo tenga, una recarga completa del catálogo
// (`fichas-v-12-cargar.mjs`) la va a RETIRAR, porque retira todo lo que no
// figure en el Excel.
//
// DE DÓNDE SALE CADA DATO —las reglas de siempre, ninguna inventada acá—:
//   · descripción, capacidad, panel y datos técnicos → SU Word, leído con el
//     mismo lector del pipeline (`lib-ficha-docx.mjs`).
//   · foto y logo → las imágenes de ESE Word, con el recorte que declara el
//     propio Word, preparadas por el paso 6 del pipeline (nada a ojo, nada de
//     otra fuente).
//   · precio, stock y ubicación → `V:\LESLY\CODIFICACION DE EQUIPOS3.xlsx`,
//     la fila que describe «MOD. FX280»: USD 22,500 · stock 1 · PLANTA.
//     No se toma de la ficha: las fichas .docx no son lista de precios.
//
// CÓMO LO HACE. No copia el pipeline: lo usa. Mete la ficha en la lista de
// trabajo (`scripts/data/fichas-v/lista.json`, que no está versionada) y corre
// los pasos 3, 4 y 6 tal cual están —ninguno toca la base ni public/—; después
// carga SOLO este equipo. El paso 12 no se corre: reescribiría las 120 fichas y
// pisaría las correcciones a mano que se hicieron después.
//
// ENTRA APAGADO. `--aplicar` lo crea con `activo = false`: existe, se puede
// mirar en local, y ningún comercial lo ve en el cotizador. Se enciende aparte,
// en la ventana de despliegue, con `--activar`.
//
// Uso:
//   node --env-file=.env.local scripts/cargar-lavf280.mjs             (ensayo)
//   node --env-file=.env.local scripts/cargar-lavf280.mjs --aplicar
//   node --env-file=.env.local scripts/cargar-lavf280.mjs --activar

import { Client } from "pg";
import XLSX from "xlsx";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const ACTIVAR = process.argv.includes("--activar");

const SKU = "LAVF280";
const DOCX = "V:/LESLY/ALLIANCE ok/ESPECIFICACIONES TECNICAS/LAVF280-LAVADORA FX 280-CONTROL X-400G-220V.docx";
const MAESTRO = "V:/LESLY/CODIFICACION DE EQUIPOS3.xlsx";
// La fila del maestro que describe este equipo. Se busca por el texto porque
// no tiene código propio: vive bajo el `LAV280` repetido.
const RENGLON_MAESTRO = /MOD\.\s*FX\s*280\b/i;

const LISTA = "scripts/data/fichas-v/lista.json";
const FICHAS = "scripts/data/fichas-v/fichas.json";
const IMAGENES = "scripts/data/fichas-v/imagenes-listas.json";
const DESTINO_FOTOS = "public/productos";

// ---------- 1 · el renglón del maestro ----------

/** Precio, stock y ubicación de la FX280, leídos del maestro de Lesly. */
function renglonDelMaestro() {
  const wb = XLSX.readFile(MAESTRO);
  const hoja = wb.SheetNames.find((h) => h.trim() === "EQUIPOS CODIFICADOS");
  if (!hoja) throw new Error(`El maestro no tiene la hoja EQUIPOS CODIFICADOS: ${wb.SheetNames.join(", ")}`);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: "" });
  // Columnas del maestro: item · codigo · equipo · stock · marca · ubicacion · valor de venta · …
  const encontradas = filas.filter((f) => String(f[1]).trim().toUpperCase() === "LAV280" && RENGLON_MAESTRO.test(String(f[2])));
  if (encontradas.length !== 1) {
    throw new Error(
      `Se esperaba UNA fila «MOD. FX280» bajo el codigo LAV280 y hay ${encontradas.length}. ` +
        "El maestro cambió: hay que mirarlo con Lesly antes de cargar nada.",
    );
  }
  const [, , equipo, stock, marca, ubicacion, precio] = encontradas[0];
  const datos = {
    equipo: String(equipo).trim(),
    marca: String(marca).trim(),
    stock: Number(stock) || null,
    ubicacion: String(ubicacion).trim().toUpperCase() || null,
    precio: Number(precio) || null,
  };
  if (!datos.precio) throw new Error("La fila del maestro no trae «VALOR DE VENTA»: preguntar a Lesly, no inventar precio.");
  return datos;
}

const maestro = renglonDelMaestro();
console.log("Maestro (EQUIPOS3, fila «MOD. FX280»):");
console.log(`  equipo    ${maestro.equipo}`);
console.log(`  marca     ${maestro.marca}   stock ${maestro.stock}   ubicación ${maestro.ubicacion}`);
console.log(`  precio    USD ${maestro.precio.toLocaleString("en-US")}\n`);

if (!existsSync(DOCX)) throw new Error(`No está el Word: ${DOCX}`);

// ---------- 2 · el pipeline, tal cual ----------

if (!ACTIVAR) {
  const lista = JSON.parse(readFileSync(LISTA, "utf-8"));
  const entrada = {
    codigo: SKU,
    equipo: maestro.equipo,
    marca: maestro.marca,
    stock: maestro.stock,
    ubicacion: maestro.ubicacion,
    precio: maestro.precio,
    hoja: "ARCHIVOS SIN CODIGO",
    excels: "EQUIPOS3 / EQUIPOS CODIFICADOS, fila «MOD. FX280» del codigo repetido LAV280",
    vigenteSegun: "EQUIPOS3 / EQUIPOS CODIFICADOS",
    rutaExcel: DOCX.replace(/\//g, "\\"),
    archivo: DOCX,
    tipo: "DOCX",
    docx: DOCX,
  };
  const i = lista.productos.findIndex((p) => p.codigo.toUpperCase() === SKU);
  if (i >= 0) lista.productos[i] = entrada;
  else lista.productos.push(entrada);
  writeFileSync(LISTA, JSON.stringify(lista, null, 2));
  console.log(`${SKU} ${i >= 0 ? "actualizado en" : "agregado a"} la lista de trabajo (${lista.productos.length} fichas).\n`);

  // Los tres pasos escriben SOLO en scripts/data/fichas-v/: ni la base ni public/.
  for (const paso of ["fichas-v-03-extraer.mjs", "fichas-v-04-clasificar.mjs", "fichas-v-06-preparar-imagenes.mjs"]) {
    console.log(`— ${paso}`);
    execFileSync(process.execPath, [`scripts/${paso}`], { stdio: "inherit" });
  }
  console.log("");
}

// ---------- 3 · lo que quedó listo ----------

const ficha = JSON.parse(readFileSync(FICHAS, "utf-8")).fichas.find((f) => f.codigo.toUpperCase() === SKU);
if (!ficha) throw new Error(`El paso 3 no dejó ficha para ${SKU}`);
const preparadas = JSON.parse(readFileSync(IMAGENES, "utf-8")).fichas.find((f) => f.codigo === SKU);
const suyas = preparadas?.imagenes ?? [];

// Nombre, como lo arma la carga del catálogo: lo que el maestro dice hasta la
// primera coma, y el modelo detrás solo si el nombre no lo trae ya. Acá lo
// trae —«…MOD. FX280»—, así que no se le agrega nada. El modelo se guarda sin
// el espacio que le puso el Word («FX 280»): el maestro y el resto del catálogo
// lo escriben junto, y el buscador del cotizador compara contra eso.
const nombre = maestro.equipo.split(",")[0].trim();
const modelo = (ficha.cabecera.modelo ?? "").replace(/\s+/g, "");
if (!nombre.toUpperCase().replace(/\s+/g, "").includes(modelo.toUpperCase())) {
  throw new Error(`El nombre «${nombre}» no nombra al modelo «${modelo}»: revisar antes de cargar.`);
}

console.log("Ficha leída del Word:");
console.log(`  nombre      ${nombre}`);
console.log(`  marca       ${ficha.cabecera.marca}   modelo ${modelo}   capacidad ${ficha.cabecera.capacidad}`);
console.log(`  panel       ${ficha.cabecera.panel}   controles ${ficha.cabecera.controles}`);
console.log(`  bloques     ${ficha.bloques.length} (${ficha.bloques.filter((b) => b.t === "titulo").length} títulos, ${ficha.bloques.filter((b) => b.t === "vineta").length} viñetas, ${ficha.bloques.filter((b) => b.t === "dato").length} datos)`);
console.log("  imágenes    " + (suyas.map((i) => `${i.rol} ${i.px.ancho}×${i.px.alto} (${i.ppp} ppp)`).join(" · ") || "ninguna"));
for (const nota of preparadas?.notas ?? []) console.log(`              ${nota}`);
if (!suyas.some((i) => i.rol === "producto")) throw new Error("Sin foto del equipo: un producto sin foto no se cotiza.");

// Categoría y segmento, con el mismo criterio de la carga del catálogo.
const categoria = "lavadora";
const segmento = "industrial";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: previos } = await bd.query(
  `select p.id, p.activo, pp.precio
     from productos p
     left join precios_producto pp on pp.producto_id = p.id and pp.vigente_hasta is null
    where upper(p.sku) = $1`,
  [SKU],
);
const previo = previos[0] ?? null;

if (ACTIVAR) {
  if (!previo) throw new Error(`${SKU} todavía no existe: primero --aplicar.`);
  if (previo.activo) {
    console.log(`${SKU} ya estaba encendido. No se tocó nada.`);
  } else {
    await bd.query("update productos set activo = true, updated_at = now() where id = $1", [previo.id]);
    console.log(`✓ ${SKU} encendido: desde ahora sale en el buscador del cotizador.`);
  }
  await bd.end();
  process.exit(0);
}

console.log(`\nEn el CRM: ${previo ? `ya existe (${previo.activo ? "activo" : "apagado"}, precio ${previo.precio ?? "sin precio"})` : "no existe todavía"}`);
console.log(`Se va a ${previo ? "actualizar" : "crear"} apagado, con precio USD ${maestro.precio.toLocaleString("en-US")} (tier base).`);
console.log(`Fotos a copiar: ${suyas.map((i) => (i.rol === "producto" ? `${SKU.toLowerCase()}.png` : `${SKU.toLowerCase()}-${i.rol}.png`)).join(", ")}`);

if (!APLICAR) {
  console.log("\nEnsayo. Nada se escribió. Con --aplicar se ejecuta.");
  await bd.end();
  process.exit(0);
}

// ---------- 4 · la carga ----------

mkdirSync(DESTINO_FOTOS, { recursive: true });
await bd.query("begin");
try {
  let fotoPath = null;
  for (const img of suyas) {
    const archivo = img.rol === "producto" ? `${SKU.toLowerCase()}.png` : `${SKU.toLowerCase()}-${img.rol}.png`;
    copyFileSync(img.archivo, join(DESTINO_FOTOS, archivo));
    if (img.rol === "producto") fotoPath = `/productos/${archivo}`;
  }

  const contenido = {
    bloques: ficha.bloques,
    panel: ficha.cabecera.panel ?? null,
    controles: ficha.cabecera.controles ?? null,
    calentamiento: ficha.cabecera.calentamiento ?? null,
    origen_descripcion: "ficha word de Lesly",
    leida_at: new Date().toISOString().slice(0, 10),
    descripcion_maestro: maestro.equipo,
    nombre_ficha: DOCX.split("/").pop().replace(/\.docx?$/i, ""),
    montaje: null,
    stock_referencia: maestro.stock,
    ubicacion_maestro: maestro.ubicacion,
  };

  let id = previo?.id;
  if (id) {
    await bd.query(
      `update productos set marca = $2, modelo = $3, nombre = $4, capacidad = $5,
              ficha = $6, foto_path = coalesce($7, foto_path), updated_at = now()
         where id = $1`,
      [id, ficha.cabecera.marca ?? maestro.marca, modelo, nombre, ficha.cabecera.capacidad, contenido, fotoPath],
    );
  } else {
    const { rows } = await bd.query(
      `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) returning id`,
      [SKU, ficha.cabecera.marca ?? maestro.marca, modelo, nombre, categoria, segmento, ficha.cabecera.capacidad, fotoPath, contenido],
    );
    id = rows[0].id;
  }

  // El precio del maestro. El anterior, si lo hubiera, se cierra —no se borra—:
  // una cotización vieja tiene que poder explicar de dónde salió su número.
  if (Number(previo?.precio ?? 0) !== maestro.precio) {
    await bd.query("update precios_producto set vigente_hasta = current_date where producto_id = $1 and vigente_hasta is null", [id]);
    await bd.query(
      "insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde) values ($1, 'base', $2, 'USD', current_date)",
      [id, maestro.precio],
    );
  }

  await bd.query("commit");
  console.log(`\n✓ ${SKU} ${previo ? "actualizado" : "creado"} y APAGADO · id ${id}`);
  console.log(`   Para mirarlo en local:  npm run dev  →  http://localhost:3100/operaciones/catalogo`);
  console.log(`   Cómo saldría impreso:   http://localhost:3100/api/productos/${id}/vista-previa`);
  console.log(`   Para encenderlo:        node --env-file=.env.local scripts/cargar-lavf280.mjs --activar`);
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}

await bd.end();
