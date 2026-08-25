// ============================================================
// CRM EFAMEINSA · El catálogo completo del maestro de Lesly
// ============================================================
// Orden del 25-08, tras encontrar cotizaciones enviadas con precios que no
// eran de la empresa: «en el sistema solo pueden estar los productos que se
// encuentran en el Excel del maestro de Lesly, y solo con eso buscar en las
// carpetas V:\LESLY y V:\PROYECTO ASIGNADO - JEAN PAUL».
//
// Este script cierra la mitad que faltaba de esa regla. La primera mitad
// —nada FUERA del maestro— ya se cumplió hoy al desactivar el catálogo del
// piloto. La segunda es que TODO lo del maestro esté: faltaban 30 códigos, y
// cada equipo ausente es una tentación de cotizarlo «escrito a mano» o de
// resucitar un producto viejo con un precio que nadie autorizó — que es
// exactamente como se llegó al problema de hoy.
//
// DE DÓNDE SALE CADA COSA:
//   precio, stock, marca, modelo, capacidad, segmento → del maestro, y de
//     ningún otro lado. Un solo precio; máximos y mínimos serán una
//     funcionalidad futura.
//   características, panel, voltaje, foto → de la ficha .doc/.docx cuya
//     RUTA EMPIEZA CON EL CÓDIGO en esas dos carpetas. Lesly las tiene
//     nombradas así («LAVMA17-Lavadora Titan Max 17 kg...»), y eso hace el
//     cruce directo.
//
// LA LECCIÓN DE LA UT055 SE APLICA ACÁ: el nombre de un archivo puede mentir.
// Por eso, cuando el modelo del maestro se puede buscar dentro del texto de la
// ficha y NO aparece, el equipo se carga SIN esa ficha y se avisa — un equipo
// sin ficha técnica en el PDF es un aviso en pantalla; una ficha del equipo
// equivocado es un engaño al cliente.
//
// LOS .doc SE CONVIERTEN CON WORD. antiword los lee pero parte las viñetas en
// renglones de celda y reconstruirlas a ojo inventa o rompe frases. Word
// (instalado en esta máquina) los guarda como .docx y de ahí se extrae texto
// por párrafos y las fotos incrustadas, con el mismo código ya probado.
// La conversión la hace scripts/convertir-fichas-doc.ps1; este script avisa
// cuáles faltan por convertir.
//
// Un equipo cuyo código no tiene ficha en las carpetas se carga igual, con los
// datos del maestro y sin ficha: se puede buscar y cotizar al precio correcto,
// y su página de especificaciones simplemente no sale en el PDF (eso ya lo
// maneja la cotización). Que exista con el precio bueno es la solución al
// problema; la ficha se suma cuando Lesly la tenga.
//
// Uso:
//   node --env-file=.env.local scripts/cargar-maestro-completo.mjs            (informa)
//   node --env-file=.env.local scripts/cargar-maestro-completo.mjs --aplicar

import { Client } from "pg";
import XLSX from "xlsx";
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync, writeFileSync, renameSync } from "node:fs";
import { join, basename } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";
const CARPETAS = ["V:/LESLY", "V:/PROYECTO ASIGNADO - JEAN PAUL"];
const CONVERTIDAS = "scripts/data/fichas-convertidas";
const DESTINO_FOTOS = "public/productos";

// ── El maestro ──────────────────────────────────────────────────────────────
const filas = XLSX.utils
  .sheet_to_json(XLSX.readFile(EXCEL).Sheets["Hoja1"], { header: 1, defval: "" })
  .slice(3)
  .filter((r) => String(r[1] ?? "").trim());
const porCod = new Map();
for (const r of filas) {
  const cod = String(r[1]).trim().toUpperCase();
  if (!porCod.has(cod)) porCod.set(cod, []);
  porCod.get(cod).push({
    equipo: String(r[2]).trim().replace(/\s+/g, " "),
    stock: Number(r[3]) || 0,
    marca: String(r[4]).trim(),
    precio: Number(r[6]) || null,
  });
}

function leerDelMaestro(m) {
  const eq = m.equipo;
  return {
    tipo: eq.split(",")[0].trim().replace(/^(\w+)\s+C\./, "$1 COMERCIAL").replace(/\s{2,}/g, " "),
    modelo: eq.match(/MOD\.?:?\s*([^,]+)/i)?.[1]?.trim() ?? null,
    capacidad: eq.match(/CAP\.?:?\s*([\d.,]+)\s*KG/i)?.[1]?.replace(",", ".") ?? null,
    fabrica: eq.match(/COD\.?:?\s*([A-Z0-9]{6,})/i)?.[1] ?? null,
    // El maestro escribe el calentamiento de tres formas: «A GAS GLP»,
    // «SECADORA C., GAS, …» (a secas) y «CALEFACCION ELECTRICA». Es el dato
    // que hace que la búsqueda «secadora a gas» / «eléctrica» encuentre.
    calentamiento: /GAS\s*NATURAL|\bGN\b/i.test(eq) ? "GAS NATURAL"
      : /GAS\s*GLP|A\s+GAS|,\s*GAS\b|\bGAS\b/i.test(eq) ? "GAS GLP"
      : /ELECTRIC/i.test(eq) ? "ELÉCTRICO"
      : /VAPOR/i.test(eq) ? "VAPOR" : null,
    // «LAVADORA C.» / «SECADORA C.» es como el maestro abrevia la línea
    // COMERCIAL (las LG chicas), que en el CRM es el segmento semi-industrial —
    // igual que SECMAX15 y las demás ya cargadas.
    segmento: /SEMI\s*INDUSTRIAL|SEMI\s*IND/i.test(eq) || /^(LAVADORA|SECADORA)\s+C\./i.test(eq)
      ? "semi_industrial" : "industrial",
    categoria: /^LAVADORA\s*-?\s*SECADORA/i.test(eq) ? "lavadora-secadora"
      : /^LAVADORA/i.test(eq) ? "lavadora"
      : /^SECADORA/i.test(eq) ? "secadora"
      : /CALANDRIA|RODILLO|PLANCHAD/i.test(eq) ? "planchador" : null,
    // 1PH / 3PH / 1N / 3N: es lo que separa variantes de calandria.
    fase: eq.match(/\b([13])\s*(?:PH|N)\b/i)?.[1] ?? null,
  };
}

// ── Las fichas de las dos carpetas ──────────────────────────────────────────
function docsDe(dir) {
  const out = [];
  let entradas;
  try { entradas = readdirSync(dir); } catch { return out; }
  for (const e of entradas) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (!/anterior|no_considerar|antiguo/i.test(e)) out.push(...docsDe(p));
    } else if (/\.docx?$/i.test(e) && !e.startsWith("~$")) out.push(p);
  }
  return out;
}
const fichas = CARPETAS.flatMap(docsDe);

// ── Extracción (las reglas probadas del pipeline) ───────────────────────────
function textoConParrafos(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], { maxBuffer: 64e6, encoding: "latin1" });
  return Buffer.from(xml, "latin1")
    .toString("utf-8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
}
function unirDigitos(s) {
  let prev, out = s;
  do { prev = out; out = out.replace(/(\d) (\d)/g, "$1$2"); } while (out !== prev);
  return out;
}
const SECCIONES = [
  { clave: "dimensiones", re: /^DIMENSIONES\s+DE\s+LA\s+M[AÁ]QUINA/i },
  { clave: "dimensiones", re: /^ESPECIFICACIONES?\s+T[EÉ]CNICAS?/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  { clave: "medidas", re: /^DIMENSIONES\b/i },
  { clave: "caracteristicas", re: /^DISE[NÑ]O DE CONSTRUCCI[OÓ]N/i },
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: "caracteristicas", re: /^AUTOMATIZACI[OÓ]N|^PROGRAMADOR\b/i },
  { clave: "caracteristicas", re: /^MONITOREO Y CONTROL|^SEGURIDAD Y ALARMAS/i },
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];
function fichaDe(docx) {
  const lineas = textoConParrafos(docx);
  const bloques = { caracteristicas: [], dimensiones: [], medidas: [] };
  let actual = null;
  for (const linea of lineas) {
    const sec = SECCIONES.find((s) => s.re.test(linea));
    if (sec !== undefined) { actual = sec.clave; continue; }
    if (!actual) continue;
    const limpia = actual === "caracteristicas" ? linea : unirDigitos(linea);
    if (limpia.length < 6 || limpia.length > 320) continue;
    if (/^item\b/i.test(limpia)) continue;
    if (/^(marca|modelo|capacidad|panel|controles|autom[aá]tico)\b/i.test(limpia) && limpia !== limpia.toUpperCase() && limpia.length <= 60) continue;
    bloques[actual].push(limpia);
  }
  const parear = (xs) => xs.map((x) => x
    .replace(/\s*:\s*:\s*/, ": ").replace(/\s*:\s*/, ": ")
    .replace(/(\d)(litros|mm|kg|rpm|cm|m)\b/gi, "$1 $2").replace(/\s+/g, " ").trim());
  const cab = lineas.slice(0, 16).map(unirDigitos).join(" | ");
  const panel = cab.match(/\b(UNILI\w*\s*C?\s*TOUCH|DUAL\s*DIGITAL|QUANTUM[\w-]*|X\s*CONTROL(?:\s*(?:PLUS|FLEX|\+))?|M\s?30|M\s?0?9|DIGITAL[- ]?MULTIFUNCI[OÓ]N|MICROPROCES\w+|SHARP|PANEL\s+T[AÁ]CTIL)\b/i);
  const controles = cab.match(/(\d{3}\s*V?\s*\/\s*\d{2}\s*Hz?\s*\/\s*[\d-]+\s*(?:PH|N|Ph)?)/i);
  return {
    texto: lineas.join(" "),
    panel: panel ? panel[1].replace(/\s+/g, " ").trim().toUpperCase() : null,
    controles: controles ? controles[1].replace(/\s+/g, "") : null,
    caracteristicas: [...new Set(bloques.caracteristicas)],
    dimensiones: [...new Set(parear(bloques.dimensiones))],
    medidas: [...new Set(parear(bloques.medidas))],
  };
}
/** Medidas de monitor = pantallazo, no foto de producto. */
const PANTALLAS = new Set(["1440x900","1920x1080","1366x768","1536x864","1600x900","2560x1440","1280x720","1280x800","1680x1050","3840x2160"]);
function mejorFoto(docx) {
  let lista;
  try { lista = execFileSync("unzip", ["-Z1", docx], { encoding: "utf-8" }).split("\n"); } catch { return null; }
  const medias = lista.filter((l) => /^word\/media\/.*\.(png|jpe?g)$/i.test(l.trim())).map((l) => l.trim());
  let mejor = null;
  for (const m of medias) {
    let buf;
    try { buf = execFileSync("unzip", ["-p", docx, m], { maxBuffer: 64e6 }); } catch { continue; }
    if (buf.length < 3000) continue; // logos y pies de página
    let px = null;
    if (buf.slice(1, 4).toString() === "PNG") px = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
    if (px && PANTALLAS.has(px)) continue; // pantallazo: mejor sin foto que con navegador
    if (!mejor || buf.length > mejor.buf.length) mejor = { interno: m, buf };
  }
  return mejor;
}
const norm = (s) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// ── Qué falta y con qué ficha ───────────────────────────────────────────────
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const { rows: prods } = await bd.query(`select sku from productos where sku is not null`);
const enCrm = new Set(prods.map((p) => p.sku.toUpperCase()));

const plan = [];
const porConvertir = [];
for (const [cod, variantes] of porCod) {
  const cubierto = enCrm.has(cod) || (variantes.length > 1 && enCrm.has(cod + "-V1") && enCrm.has(cod + "-V2"));
  if (cubierto) continue;
  if (variantes.length > 1) {
    console.log(`⚠ ${cod}: ${variantes.length} filas en el maestro con el mismo código y ninguna cargada — resolver a mano como los -V1/-V2. Se salta.`);
    continue;
  }
  const m = { ...variantes[0], ...leerDelMaestro(variantes[0]) };
  const re = new RegExp(`(^|[\\\\/])${cod}[^A-Z0-9]`, "i");
  let cand = fichas.filter((f) => re.test(f));
  // Variantes de calandria: el mismo rodillo en 1PH y 3PH tiene dos fichas.
  // Se elige por la fase que dice el maestro; sin fase clara, ninguna.
  if (cand.length > 1 && m.fase) {
    const porFase = cand.filter((f) => new RegExp(`\\b${m.fase}\\s*(?:PH|N)\\b|\\b${m.fase}N\\b`, "i").test(basename(f)));
    if (porFase.length === 1) cand = porFase;
  }
  if (cand.length > 1) {
    console.log(`⚠ ${cod}: ${cand.length} fichas candidatas y no se puede elegir sin ambigüedad — se carga SIN ficha.`);
    for (const f of cand) console.log(`     ${basename(f)}`);
    cand = [];
  }
  const original = cand[0] ?? null;
  let usable = original;
  if (original && /\.doc$/i.test(original)) {
    const convertida = join(CONVERTIDAS, basename(original).replace(/\.doc$/i, ".docx"));
    if (existsSync(convertida)) usable = convertida;
    else { porConvertir.push(original); usable = null; }
  }
  plan.push({ cod, m, original, usable });
}

if (porConvertir.length) {
  writeFileSync(join(CONVERTIDAS, "..", "fichas-a-convertir.txt"), porConvertir.join("\n"));
  console.log(`\n⚠ ${porConvertir.length} fichas .doc sin convertir todavía. Correr primero:`);
  console.log(`   powershell -ExecutionPolicy Bypass -File scripts/convertir-fichas-doc.ps1`);
  console.log(`   (la lista quedó en scripts/data/fichas-a-convertir.txt)\n`);
}

console.log(`\nEquipos del maestro que faltan: ${plan.length}\n`);
const listos = [];
for (const { cod, m, original, usable } of plan) {
  let ficha = null, verificada = null, foto = null;
  if (usable) {
    try { ficha = fichaDe(usable); } catch { ficha = null; }
    if (ficha) {
      // La lección de la UT055, puesta donde está el riesgo real: en aquel
      // cruce lo que delataba el intercambio era el PANEL DE CONTROL (la ficha
      // decía DUAL DIGITAL y el maestro UNILINC TOUCH). Si los dos declaran
      // panel y no coinciden, la ficha es de otro equipo: fuera.
      const panelMaestro = m.equipo.match(/CONTROL:?\s*([^,]+)/i)?.[1]?.trim() ?? null;
      if (panelMaestro && ficha.panel && !norm(panelMaestro).includes(norm(ficha.panel).slice(0, 8)) && !norm(ficha.panel).includes(norm(panelMaestro).slice(0, 8))) {
        console.log(`⚠ ${cod}: panel cruzado — maestro «${panelMaestro}» vs ficha «${ficha.panel}». Se carga SIN ficha.`);
        ficha = null;
      } else {
        // El modelo se busca por partes, porque el maestro escribe
        // «GIANT-C MAX APILABLE» y la ficha «Giant C Max … Apilable» con
        // texto en medio. Con que UNA parte identificadora aparezca alcanza;
        // si ninguna, se carga igual pero queda avisado para Lesly.
        const t = norm(ficha.texto);
        const candidatos = [
          norm(m.modelo),
          norm(m.modelo?.match(/[A-Z]+[-.\s]?\d[\w.]*/i)?.[0] ?? ""),   // el código: UST030, SS17-E, G120.25
          norm((m.modelo ?? "").split(/\s+/).slice(0, 2).join("")),      // las dos primeras palabras: GIANTC, TITANMAX
        ].filter((x) => x.length >= 4);
        verificada = candidatos.length ? candidatos.some((x) => t.includes(x)) : null;
        if (verificada === false) {
          console.log(`⚠ ${cod}: la ficha «${basename(original)}» no menciona ${m.modelo} — se carga IGUAL, revisar con Lesly.`);
        }
        foto = mejorFoto(usable);
      }
    }
  }
  const estado = ficha
    ? `ficha ${ficha.caracteristicas.length}c/${ficha.dimensiones.length}d/${ficha.medidas.length}m${verificada === true ? " ✓modelo" : verificada === false ? " ⚠modelo no hallado" : " (modelo no verificable)"}${foto ? " · foto" : " · SIN foto"}`
    : original && !usable ? "esperando conversión"
    : original ? "ficha ilegible — solo maestro"
    : "sin ficha en las carpetas — solo maestro";
  console.log(`  ${cod.padEnd(11)} ${String(m.precio ?? "s/p").padStart(7)} ${m.segmento === "semi_industrial" ? "semi" : "ind."} ${String(m.modelo ?? "—").slice(0, 18).padEnd(19)} ${estado}`);
  listos.push({ cod, m, original, ficha, foto });
}

if (!APLICAR) {
  console.log("\nNada se ha modificado. Agregá --aplicar.\n");
  await bd.end();
  process.exit(0);
}

let cargados = 0;
for (const { cod, m, original, ficha, foto } of listos) {
  let fotoPath = null;
  if (foto) {
    const ext = foto.interno.match(/\.(png|jpe?g)$/i)[1].toLowerCase().replace("jpeg", "jpg");
    const nombreFoto = `${cod.toLowerCase()}.${ext}`;
    writeFileSync(join(DESTINO_FOTOS, nombreFoto), foto.buf);
    fotoPath = `/productos/${nombreFoto}`;
  }
  const { rows } = await bd.query(
    `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
     on conflict (sku) do update set
       marca = excluded.marca, modelo = excluded.modelo, nombre = excluded.nombre,
       categoria = excluded.categoria, segmento = excluded.segmento, capacidad = excluded.capacidad,
       foto_path = coalesce(excluded.foto_path, productos.foto_path),
       ficha = excluded.ficha, activo = true, updated_at = now()
     returning id`,
    [
      cod, m.marca || "—", m.modelo ?? cod, m.tipo, m.categoria, m.segmento,
      m.capacidad ? `${m.capacidad} kg` : null, fotoPath,
      JSON.stringify({
        caracteristicas: ficha?.caracteristicas ?? [],
        dimensiones: ficha?.dimensiones ?? [],
        medidas: ficha?.medidas ?? [],
        panel: ficha?.panel ?? null,
        controles: ficha?.controles ?? null,
        calentamiento: m.calentamiento,
        stock_referencia: m.stock,
        origen: {
          maestro: "CODIFICACION DE EQUIPOS PARA MARKETING.xlsx",
          ficha_tecnica: original ? original.split("/").join("\\") : null,
          confianza: ficha ? "nombre_archivo" : "sin_ficha",
          codigo_fabrica: m.fabrica,
          catalogos: [], foto_prestada_de: null, codigo_duplicado_en_maestro: false,
        },
      }),
    ],
  );
  if (m.precio) {
    // Mismo nivel que usa el resto del catálogo: 'base' en industrial,
    // 'optimo' en semi-industrial. Es un solo precio igual — los máximos y
    // mínimos serán una funcionalidad futura.
    const tier = m.segmento === "semi_industrial" ? "optimo" : "base";
    await bd.query(
      `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
       values ($1, $2, $3, 'USD', current_date)
       on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio, vigente_hasta = null`,
      [rows[0].id, tier, m.precio],
    );
  }
  cargados++;
}
console.log(`\n✓ ${cargados} equipos del maestro cargados.`);

// Cierre: el maestro y el catálogo tienen que quedar 1 a 1.
const { rows: fin } = await bd.query(`select sku from productos where activo and sku is not null`);
const finSet = new Set(fin.map((r) => r.sku.toUpperCase()));
let faltantes = 0;
for (const [cod, variantes] of porCod) {
  const ok = finSet.has(cod) || (variantes.length > 1 && finSet.has(cod + "-V1") && finSet.has(cod + "-V2"));
  if (!ok) { console.log(`  ✗ sigue faltando: ${cod}`); faltantes++; }
}
console.log(`códigos del maestro sin cargar: ${faltantes}`);
await bd.end();
