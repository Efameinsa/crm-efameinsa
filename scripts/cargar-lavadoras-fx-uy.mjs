// ============================================================
// CRM EFAMEINSA · Las lavadoras del libro «LAVADORA FX Y UY PARA AGREGAR»
// ============================================================
// Santos, 31-08: «me dio esta nueva información: LAVADORA FX Y UY PARA AGREGAR
// de V:\LESLY … busca por código hasta encontrar su ficha técnica en el scope
// de carpetas que ya tienes configurado (Lesly o Jean Paul, no otras)».
//
// Este script sustituye a `cargar-lavf280.mjs`, que hacía lo mismo para un solo
// código escrito a mano. Ahora manda el libro de Lesly: se cargan los códigos
// cuyo dato vigente sale de él, sean uno o diez.
//
// QUÉ TRAJO EL LIBRO (31-08)
//   · LAVF280 — la FX280, que el código repetido LAV280 había dejado afuera:
//     el maestro usaba el MISMO código para la RX280 rígida y para la FX280
//     flotante, y el reporte «se queda con el último». Ahora tiene código
//     propio, que era justo lo que había quedado pendiente para Lesly.
//   · LAVUY2802 — NO es un alta: es una CORRECCIÓN. Ese código ya existía en el
//     CRM pero con la ficha equivocada. El maestro siempre dijo «MOD. UY280» y
//     el único Word que empezaba con ese código era el de la UY240
//     (`LAVUY2802LAVADORA UY240…`, sin guión), así que el CRM quedó vendiendo
//     un UY240 bajo el código —y al precio— del UY280. Lesly acaba de dejar el
//     Word que faltaba (`LAVUY2802-LAVADORA UY280-…`, 31-08 16:21) y con él la
//     ficha se endereza.
//
// CÓMO SE BUSCA LA FICHA. No se busca acá: se usa el reporte de fichas
// (`buscar-fichas-por-codigo-v2.mjs`), que ya recorre las DOS raíces
// autorizadas —`V:\LESLY` y `V:\PROYECTO ASIGNADO - JEAN PAUL`— y busca por
// CÓDIGO EXACTO. Este script lee su JSON. Correr el reporte primero.
//
// CUANDO UN CÓDIGO TIENE DOS WORD. Le pasa a LAVUY2802: el de la UY280 y el
// viejo de la UY240 empiezan los dos con el código. No se adivina por fecha ni
// por nombre: se abre cada Word y se compara SU modelo con el que nombra la
// descripción del maestro («MOD. UY280»). Si no queda exactamente uno, el
// script para y lo dice — el que decide el código es Lesly.
//
// QUÉ SE ESCRIBE Y QUÉ NO
//   · Un código NUEVO entra APAGADO: su foto todavía no está en producción, y
//     un equipo activo con la foto rota es peor que un equipo que no está. Se
//     enciende con `--activar`, en la ventana de despliegue.
//   · Un código que YA ESTABA ACTIVO se corrige en vivo y sigue activo:
//     dejarlo como está sería seguir vendiendo el equipo equivocado. Su estado
//     anterior se guarda antes de tocarlo, en scripts/data/, por si hay que
//     volver atrás.
//
// Uso:
//   node scripts/buscar-fichas-por-codigo-v2.mjs          (primero, siempre)
//   node --env-file=.env.local scripts/cargar-lavadoras-fx-uy.mjs            (ensayo)
//   node --env-file=.env.local scripts/cargar-lavadoras-fx-uy.mjs --aplicar
//   node --env-file=.env.local scripts/cargar-lavadoras-fx-uy.mjs --activar

import { Client } from "pg";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { leerZip, textoDeZip } from "./lib-zip.mjs";
import { leerFichaDeXml } from "./lib-ficha-docx.mjs";

const APLICAR = process.argv.includes("--aplicar");
const ACTIVAR = process.argv.includes("--activar");

/** El libro de Lesly que manda esta carga. Los códigos que se cargan son los
 *  que el reporte marca como vigentes según él. */
const LIBRO = "FX Y UY 31-08";

const REPORTE = "scripts/data/fichas-por-codigo-v2.json";
const LISTA = "scripts/data/fichas-v/lista.json";
const FICHAS = "scripts/data/fichas-v/fichas.json";
const IMAGENES = "scripts/data/fichas-v/imagenes-listas.json";
const RESPALDO = "scripts/data/respaldo-antes-de-fx-uy.json";
const DESTINO_FOTOS = "public/productos";

const reporte = JSON.parse(readFileSync(REPORTE, "utf-8"));
if (!reporte.libros.some((l) => l.corto === LIBRO)) {
  throw new Error(`El reporte no leyó el libro «${LIBRO}». Corre primero: node scripts/buscar-fichas-por-codigo-v2.mjs`);
}

const pedidos = reporte.filas.filter((f) => f.manda === LIBRO);
if (pedidos.length === 0) throw new Error(`El reporte no trae ninguna fila vigente según «${LIBRO}».`);

/** El modelo que nombra la descripción del maestro: «…, MOD. UY280, …». */
function modeloDelMaestro(equipo) {
  const m = String(equipo).match(/\bMOD[.:]?\s*([A-Z0-9][A-Z0-9 .\-]*?)\s*,/i);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
}

/** La cabecera del Word: marca, modelo, capacidad, panel, controles. */
function cabeceraDe(ruta) {
  return leerFichaDeXml(textoDeZip(leerZip(ruta), "word/document.xml")).cabecera;
}

/**
 * Cuál de los Word que empiezan con el código es el de este equipo.
 *
 * Con uno solo no hay nada que decidir. Con varios —LAVUY2802 tiene el de la
 * UY280 y el viejo de la UY240— se abre cada uno y se compara SU modelo contra
 * el que nombra el maestro. Ni la fecha ni el nombre del archivo deciden: el
 * Word de la UY240 es el más viejo pero también el que estaba cargado, y así
 * fue como el CRM terminó vendiendo un UY240 como UY280.
 */
function elegirWord(fila) {
  const words = fila.archivos.filter((a) => /^DOCX?$/i.test(a.tipo));
  if (words.length === 0) throw new Error(`${fila.codigo}: no hay Word en las carpetas autorizadas.`);
  if (words.some((w) => /\.doc$/i.test(w.nombre))) {
    throw new Error(`${fila.codigo}: la ficha es .doc y hay que convertirla antes (scripts/fichas-v-02-convertir.mjs).`);
  }
  if (words.length === 1) return { ...words[0], porque: "es el único Word con ese código" };

  const esperado = modeloDelMaestro(fila.equipo);
  if (!esperado) {
    throw new Error(`${fila.codigo}: hay ${words.length} Word y la descripción del maestro no nombra el modelo. Es para Lesly.`);
  }
  const candidatos = words
    .map((w) => ({ ...w, modelo: (cabeceraDe(w.ruta.replace(/\\/g, "/")).modelo ?? "").replace(/\s+/g, "").toUpperCase() }))
    .filter((w) => w.modelo === esperado);
  if (candidatos.length !== 1) {
    throw new Error(
      `${fila.codigo}: hay ${words.length} Word y ${candidatos.length} dicen ser «${esperado}». ` +
        `No se adivina: ${words.map((w) => w.nombre).join(" | ")}. Es para Lesly.`,
    );
  }
  return { ...candidatos[0], porque: `de los ${words.length} Word con ese código, es el que dice ser ${esperado}` };
}

console.log(`Libro que manda: ${LIBRO}  ·  ${pedidos.length} código(s)\n`);
const trabajo = [];
for (const fila of pedidos) {
  const word = elegirWord(fila);
  const ruta = word.ruta.replace(/\\/g, "/");
  trabajo.push({ fila, ruta, word });
  console.log(`${fila.codigo}`);
  console.log(`   maestro   ${fila.equipo}`);
  console.log(`   marca ${fila.marca} · stock ${fila.stock} · ubicación ${fila.ubicacion ?? "(no lo dice)"} · USD ${Number(fila.precio).toLocaleString("en-US")}`);
  console.log(`   ficha     ${word.nombre}`);
  console.log(`   elegida   ${word.porque}\n`);
}

// ---------- el pipeline, tal cual ----------
//
// Los pasos 3, 4 y 6 escriben SOLO en scripts/data/fichas-v/: ni la base ni
// public/. El paso 12 NO se corre: reescribiría las 122 fichas y pisaría las
// correcciones a mano que se hicieron después.

if (!ACTIVAR) {
  const lista = JSON.parse(readFileSync(LISTA, "utf-8"));
  for (const { fila, ruta } of trabajo) {
    if (!existsSync(ruta)) throw new Error(`No está el Word: ${ruta}`);
    const entrada = {
      codigo: fila.codigo,
      equipo: fila.equipo,
      marca: fila.marca,
      stock: fila.stock,
      ubicacion: fila.ubicacion,
      precio: fila.precio,
      hoja: LIBRO,
      excels: fila.libros.join(" + "),
      vigenteSegun: `${fila.manda} / ${fila.mandaHoja}`,
      rutaExcel: ruta.replace(/\//g, "\\"),
      archivo: ruta,
      tipo: "DOCX",
      docx: ruta,
    };
    const i = lista.productos.findIndex((p) => p.codigo.toUpperCase() === fila.codigo);
    if (i >= 0) lista.productos[i] = entrada;
    else lista.productos.push(entrada);
  }
  writeFileSync(LISTA, JSON.stringify(lista, null, 2));
  console.log(`Lista de trabajo: ${lista.productos.length} fichas.\n`);

  for (const paso of ["fichas-v-03-extraer.mjs", "fichas-v-04-clasificar.mjs", "fichas-v-06-preparar-imagenes.mjs"]) {
    console.log(`— ${paso}`);
    execFileSync(process.execPath, [`scripts/${paso}`], { stdio: "inherit" });
  }
  console.log("");
}

const todasLasFichas = JSON.parse(readFileSync(FICHAS, "utf-8")).fichas;
const todasLasImagenes = JSON.parse(readFileSync(IMAGENES, "utf-8")).fichas;

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: existentes } = await bd.query(
  `select p.id, upper(p.sku) as sku, p.activo, p.nombre, p.modelo, p.capacidad, p.foto_path, p.ficha,
          pp.precio
     from productos p
     left join precios_producto pp on pp.producto_id = p.id and pp.vigente_hasta is null
    where upper(p.sku) = any($1)`,
  [trabajo.map((t) => t.fila.codigo)],
);
const previo = new Map(existentes.map((p) => [p.sku, p]));

// ---------- encender lo que entró apagado ----------

if (ACTIVAR) {
  for (const { fila } of trabajo) {
    const p = previo.get(fila.codigo);
    if (!p) {
      console.log(`  · ${fila.codigo}: todavía no existe. Primero --aplicar.`);
      continue;
    }
    if (p.activo) {
      console.log(`  · ${fila.codigo}: ya estaba encendido.`);
      continue;
    }
    await bd.query("update productos set activo = true, updated_at = now() where id = $1", [p.id]);
    console.log(`  ✓ ${fila.codigo} encendido: desde ahora sale en el buscador del cotizador.`);
  }
  await bd.end();
  process.exit(0);
}

// ---------- el plan ----------

const plan = [];
for (const { fila, word } of trabajo) {
  const ficha = todasLasFichas.find((f) => f.codigo.toUpperCase() === fila.codigo);
  if (!ficha) throw new Error(`${fila.codigo}: el paso 3 no dejó ficha.`);
  const imagenes = todasLasImagenes.find((f) => f.codigo === fila.codigo);
  const suyas = imagenes?.imagenes ?? [];
  if (!suyas.some((i) => i.rol === "producto")) throw new Error(`${fila.codigo}: sin foto del equipo, no se puede cotizar.`);

  // El nombre, como lo arma la carga del catálogo: lo que el maestro dice hasta
  // la primera coma. El modelo se guarda sin espacios («FX 280» → FX280): el
  // maestro y el resto del catálogo lo escriben junto y el buscador del
  // cotizador compara contra eso.
  const nombre = fila.equipo.split(",")[0].trim();
  const modelo = (ficha.cabecera.modelo ?? "").replace(/\s+/g, "");
  const p = previo.get(fila.codigo);

  plan.push({ fila, word, ficha, suyas, nombre, modelo, p, notas: imagenes?.notas ?? [] });

  const que = !p ? "CREAR apagado" : p.activo ? "CORREGIR en vivo (ya está activo)" : "ACTUALIZAR (sigue apagado)";
  console.log(`${fila.codigo} — ${que}`);
  console.log(`   nombre      ${p && p.nombre !== nombre ? `${p.nombre}  →  ${nombre}` : nombre}`);
  console.log(`   modelo      ${p && p.modelo !== modelo ? `${p.modelo}  →  ${modelo}` : modelo}   capacidad ${p && p.capacidad !== ficha.cabecera.capacidad ? `${p.capacidad}  →  ${ficha.cabecera.capacidad}` : ficha.cabecera.capacidad}`);
  console.log(`   marca       ${ficha.cabecera.marca}   panel ${ficha.cabecera.panel}   controles ${ficha.cabecera.controles}`);
  console.log(`   precio      ${p?.precio != null && Number(p.precio) !== Number(fila.precio) ? `USD ${Number(p.precio).toLocaleString("en-US")}  →  ` : ""}USD ${Number(fila.precio).toLocaleString("en-US")}`);
  console.log(`   ficha       ${ficha.bloques.length} bloques  ·  ${p ? `antes ${p.ficha?.bloques?.length ?? 0}` : "nueva"}`);
  console.log(`   imágenes    ${suyas.map((i) => `${i.rol} ${i.px.ancho}×${i.px.alto} (${i.ppp} ppp)`).join(" · ")}`);
  for (const n of imagenes?.notas ?? []) console.log(`               ${n}`);
  console.log("");
}

if (!APLICAR) {
  console.log("Ensayo. Nada se escribió. Con --aplicar se ejecuta.");
  await bd.end();
  process.exit(0);
}

// ---------- la carga ----------

// Antes de pisar nada: lo que había. Una corrección en vivo tiene que poder
// deshacerse sin ir a buscar un respaldo de la base entera.
writeFileSync(RESPALDO, JSON.stringify({ guardado: new Date().toISOString(), productos: existentes }, null, 1));
console.log(`Estado anterior guardado en ${RESPALDO}\n`);

mkdirSync(DESTINO_FOTOS, { recursive: true });
await bd.query("begin");
try {
  for (const { fila, word, ficha, suyas, nombre, modelo, p } of plan) {
    let fotoPath = null;
    for (const img of suyas) {
      const archivo = img.rol === "producto" ? `${fila.codigo.toLowerCase()}.png` : `${fila.codigo.toLowerCase()}-${img.rol}.png`;
      copyFileSync(img.archivo, join(DESTINO_FOTOS, archivo));
      if (img.rol === "producto") fotoPath = `/productos/${archivo}`;
    }

    // La ficha conserva lo que el CRM ya sabía y reemplaza descripción y datos
    // técnicos. Stock y ubicación viajan con el precio, en el mismo renglón: un
    // renglón en blanco NO borra lo que había —el reporte no distingue «cero»
    // de «Lesly no lo escribió»—, pero un cero escrito sí es un cero.
    const contenido = {
      ...(p?.ficha ?? {}),
      bloques: ficha.bloques,
      panel: ficha.cabecera.panel ?? null,
      controles: ficha.cabecera.controles ?? null,
      calentamiento: ficha.cabecera.calentamiento ?? null,
      origen_descripcion: "ficha word de Lesly",
      leida_at: new Date().toISOString().slice(0, 10),
      descripcion_maestro: fila.equipo,
      nombre_ficha: word.nombre.replace(/\.docx?$/i, ""),
      montaje: null,
    };
    if (fila.stock != null && fila.stock !== "") contenido.stock_referencia = fila.stock;
    if (fila.ubicacion) contenido.ubicacion_maestro = String(fila.ubicacion).toUpperCase();

    let id = p?.id;
    if (id) {
      await bd.query(
        `update productos set marca = $2, modelo = $3, nombre = $4, capacidad = $5,
                ficha = $6, foto_path = coalesce($7, foto_path), updated_at = now()
           where id = $1`,
        [id, ficha.cabecera.marca ?? fila.marca, modelo, nombre, ficha.cabecera.capacidad, contenido, fotoPath],
      );
    } else {
      const { rows } = await bd.query(
        `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
         values ($1,$2,$3,$4,'lavadora','industrial',$5,$6,$7,false) returning id`,
        [fila.codigo, ficha.cabecera.marca ?? fila.marca, modelo, nombre, ficha.cabecera.capacidad, fotoPath, contenido],
      );
      id = rows[0].id;
    }

    // El precio del maestro. El anterior no se borra: se cierra. Si mañana
    // gerencia pregunta de dónde salió el número de una cotización vieja, tiene
    // que poder verlo.
    if (Number(p?.precio ?? 0) !== Number(fila.precio)) {
      await bd.query("update precios_producto set vigente_hasta = current_date where producto_id = $1 and vigente_hasta is null", [id]);
      await bd.query(
        "insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde) values ($1, 'base', $2, 'USD', current_date)",
        [id, fila.precio],
      );
    }

    console.log(`✓ ${fila.codigo} ${p ? (p.activo ? "corregido (sigue ACTIVO)" : "actualizado (sigue APAGADO)") : "creado APAGADO"} · id ${id}`);
    console.log(`   local: http://localhost:3000/api/productos/${id}/vista-previa`);
  }

  await bd.query("commit");
  console.log(`\nPara encender lo apagado, en la ventana de despliegue:`);
  console.log(`   node --env-file=.env.local scripts/cargar-lavadoras-fx-uy.mjs --activar`);
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}

await bd.end();
